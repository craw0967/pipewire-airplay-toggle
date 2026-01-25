import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import { logErr } from "../functions/logs.js";
import { asyncExecCommandAndReadOutput } from "../functions/utils.js";
import { INDICATOR_TEXT } from "../constants/config.js";

//import { AirPlayToggleExtensionState } from "./state.js";

export const AirPlayToggleMenu = class AirPlayToggleMenu {
    _combineModuleId;

    constructor(extensionObject, toggleObject) {
        this._extensionObject = extensionObject;

        this._menu = toggleObject.menu;

        this._createMenuItems();
        this._createSettingsItems();
    }

    destroy() {
        this._combinedSpeakersMenuItem?.disconnect();
        this._combinedSpeakersMenuItem?.destroy();
        this._combinedSpeakersMenuItem = null;
    }

    setMenuHeader(icon) {
        this._menu.setHeader(
            icon, 
            _(INDICATOR_TEXT)
        );
    }

    _createMenuItems() {
        this._combinedSpeakersMenuItem = new PopupMenu.PopupImageMenuItem('Enable Streaming to Multiple Speakers', null);
        //this._combinedSpeakersMenuItem?.setIcon(icon); //This works but I need to add an icon file
        this._combinedSpeakersMenuItem.connect('activate', () => this._toggleCombinedSpeakers());

        this._setMenuItemOrnament(this._combinedSpeakersMenuItem, this._extensionObject.settings.get_boolean("combined-speakers"));

        this._menu.addMenuItem(this._combinedSpeakersMenuItem);
        this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }

    _createSettingsItems() {
        const settingsItem = this._menu.addAction('Extension Settings',
            () => this._extensionObject.openPreferences());

        // Ensure the settings are unavailable when the screen is locked
        settingsItem.visible = Main.sessionMode.allowSettings;
        this._menu._settingsActions[this._extensionObject.uuid] = settingsItem;
    }

    _toggleCombinedSpeakers() {
        const combinedSpeakersEnabled = !this._extensionObject.settings.get_boolean("combined-speakers");
        this._extensionObject.settings.set_boolean("combined-speakers", combinedSpeakersEnabled);

        this._setMenuItemOrnament(this._combinedSpeakersMenuItem, combinedSpeakersEnabled);

        this._toggleMultiSpeakers(combinedSpeakersEnabled);
    }

    _setMenuItemOrnament(menuItem, enabled) {
        menuItem.setOrnament(enabled ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
    }

    async _toggleMultiSpeakers(enabled) {
        try {
            const commandArray = enabled ? [
                'pactl', 
                'load-module', 
                'module-combine-sink', 
                'sink_name="AirPlay Combined Speakers"', //TODO - Move this name to constants and use to label menu(s) too
                'rate=44100', 
                'channels=2', 
                'channel_map=stereo', 
                'latency_compensate=true', 
                'sinks=""'
            ] : [
                'pactl', 
                'unload-module', 
                'module-combine-sink'
            ];

            let output = await asyncExecCommandAndReadOutput(
                commandArray,
                null,
                null
            );
            
            this._combineModuleId =
                !this._combineModuleId &&
                output &&
                output.length > 0 &&
                output[0].length > 0
                    ? output[0]
                    : this._combineModuleId;

        } catch (err) {
            logErr(err);
        }
    }
}