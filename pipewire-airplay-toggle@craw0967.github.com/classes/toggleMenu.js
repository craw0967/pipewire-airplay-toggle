import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import { logErr } from "../functions/logs.js";
import { asyncExecCommandAndReadOutput } from "../functions/utils.js";
import { INDICATOR_TEXT } from "../constants/config.js";

//import { AirPlayToggleExtensionState } from "./state.js";

export const AirPlayToggleMenu = (Base) => class extends Base {
    _combinedSpeakersMenuItem;

    constructor({ ...args } = {}) {
        super({ ...args });

        this._extensionObject = this.state ? this.state.getExtensionObject() : null;

        this._createMenuItems();
        this._createSettingsItems();

        this._connectToggleMenuSignals();
        this._connectToggleMenuSettings();
    }

    destroy() {
        this._combinedSpeakersMenuItem?.disconnect();
        this._combinedSpeakersMenuItem?.destroy();
        this._combinedSpeakersMenuItem = null;

        if(super.destroy) super.destroy();
    }

    _setMenuHeader(icon) {
        this.menu.setHeader(
            icon, 
            _(INDICATOR_TEXT)
        );
    }

    _createMenuItems() {
        this._combinedSpeakersMenuItem = new PopupMenu.PopupImageMenuItem('Enable Streaming to Multiple Speakers', null);
        //this._combinedSpeakersMenuItem?.setIcon(icon); //This works but I need to add an icon file
        this.state.connectSignal(this._combinedSpeakersMenuItem, "activate", () => {
            // Update the setting to trigger the setting change event. Setting change event is connected in this._connectSettings()
            this.state.updateSettingsKey("set_boolean", "combined-speakers", !this.state.getSettingsKey("get_boolean", "combined-speakers"));
        });

        this._setMenuItemOrnament(this._combinedSpeakersMenuItem, this.state.getSettingsKey("get_boolean", "combined-speakers"));

        this.menu.addMenuItem(this._combinedSpeakersMenuItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }

    _createSettingsItems() {
        const settingsItem = this.menu.addAction('Extension Settings',
            () => this._extensionObject.openPreferences());

        // Ensure the settings are unavailable when the screen is locked
        settingsItem.visible = Main.sessionMode.allowSettings;
        this.menu._settingsActions[this._extensionObject.uuid] = settingsItem;
    }

    _connectToggleMenuSignals() {
        this.state.connectSignal(this, "notify::checked", () => {
            this.state.updateStateKey("toggleIsChecked", this.checked);
            this._toggleCombinedSpeakers();
        });
    }

    _connectToggleMenuSettings() {
        this.state.connectSetting('combined-speakers', () => {
            this._toggleCombinedSpeakers();
        });
    }

    async _toggleCombinedSpeakers() {
        const combinedSpeakersEnabled = (this.state.getSettingsKey("get_boolean", "combined-speakers") && this.checked) ? true : false;
        
        this._setMenuItemOrnament(this._combinedSpeakersMenuItem, this.state.getSettingsKey("get_boolean", "combined-speakers"));
        
        await this._checkForCombinedSpeakersModule();
        await this._toggleMultiSpeakers(combinedSpeakersEnabled);
    }

    _setMenuItemOrnament(menuItem, enabled) {
        menuItem.setOrnament(enabled ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
    }

    async _toggleMultiSpeakers(enabled) {
        try {
            const commandArray = enabled && !this.state.getStateKey("combineModuleId") ? [
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
                `${this.state.getStateKey("combineModuleId")}` // DO NOT unload 'module-combine-sink'. The user may have loaded more than one combined sink.
            ];

            let output = await asyncExecCommandAndReadOutput(
                commandArray,
                null,
                null
            );

            if (!this.state.getStateKey("combineModuleId") &&
                output &&
                output.length > 0 &&
                output[0].length > 0
            ) {
                this.state.updateStateKey("combineModuleId", output[0]);
            } // The combineModuleId var gets nullifed in the toggle.js _processModuleEvent function

            console.log('the combine module id is - ' + this.state.getStateKey("combineModuleId"));

        } catch (err) {
            logErr(this.state, err);
        }
    }

    async _checkForCombinedSpeakersModule() {
        try {
            const commandArray = [
                "pactl", 
                "list", 
                "modules", 
                "short"
            ];
            const output = await asyncExecCommandAndReadOutput(
                commandArray,
                null,
                null
            );

            if (output && output.length > 0) {
                const filtered = output.filter((line) => {
                   return line.includes("module-combine-sink") && line.includes("AirPlay Combined Speakers")
                });

                if (filtered?.length > 0 && filtered[0]) {
                    this.state.updateStateKey("combineModuleId", filtered[0].split("\t")[0]);
                } else {
                    this.state.updateStateKey("combineModuleId", null);
                }
            }

        } catch (err) {
            logErr(this.state, err);
        } finally {
            this._getRaopModuleIdPromise = null;
        }
    }
}