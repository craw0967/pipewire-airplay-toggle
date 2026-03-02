import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import { INDICATOR_TEXT } from "../constants/config.js";

export const AirPlayToggleMenu = (Base) => class extends Base {
    _combinedSpeakersMenuItem;

    constructor({ ...args } = {}) {
        super({ ...args });

        // this.state inherited from AirPlayToggleBase
        
        this._extensionObject = this.state ? this.state.getExtensionObject() : null;
        this.state.updateGIcon("multiStreamGIcon", "media-podcast-symbolic.svg");

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
        this._combinedSpeakersMenuItem = new PopupMenu.PopupImageMenuItem("Enable Streaming to Multiple Speakers", this.state.getStateKey("multiStreamGIcon"));

        this._setMenuItemOrnament(this._combinedSpeakersMenuItem, this.state.getSettingsKey("get_boolean", "combined-speakers"));

        this.menu.addMenuItem(this._combinedSpeakersMenuItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }

    _createSettingsItems() {
        const settingsItem = this.menu.addAction("Extension Settings", // TODO - Add text to constants and prep for translation
            () => this._extensionObject.openPreferences());

        // Ensure the settings are unavailable when the screen is locked
        settingsItem.visible = Main.sessionMode.allowSettings;
        this.menu._settingsActions[this._extensionObject.uuid] = settingsItem;
    }

    _connectToggleMenuSignals() {
        this.state.connectSignal(this, "notify::checked", () => {
            this._toggleCombinedSpeakers();
        });

        this.state.connectSignal(this._combinedSpeakersMenuItem, "activate", () => {
            // Update the setting to trigger the setting change event. Setting change event is connected in this._connectSettings()
            this.state.updateSettingsKey("set_boolean", "combined-speakers", !this.state.getSettingsKey("get_boolean", "combined-speakers"));
        });
    }

    _connectToggleMenuSettings() {
        this.state.connectSetting("combined-speakers", () => {
            this._toggleCombinedSpeakers();
        });
    }

    async _toggleCombinedSpeakers() {
        const combinedSpeakersEnabled = (this.state.getSettingsKey("get_boolean", "combined-speakers") && this.checked) ? true : false;
        
        this._setMenuItemOrnament(this._combinedSpeakersMenuItem, this.state.getSettingsKey("get_boolean", "combined-speakers"));
        
        await this.state.toggleCombinedSinkModule(combinedSpeakersEnabled);
    }

    _setMenuItemOrnament(menuItem, enabled) {
        menuItem.setOrnament(enabled ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
    }

}