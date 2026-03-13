import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

import { INDICATOR_TEXT, MULTI_SPEAKER_LABEL, SETTINGS_LABEL } from "../constants/config.js";

/**
 * A mixin that adds a menu to the AirPlay toggle.
 * This menu includes options for multi-speaker streaming and accessing extension settings.
 *
 * @mixin
 * @param {class} Base - The class to extend, expected to be a QuickSettings.QuickMenuToggle.
 * @returns {class} - A class that extends the Base class with menu functionality.
 * @property {PopupMenu.PopupImageMenuItem} _combinedSpeakersMenuItem - The menu item for toggling combined speakers.
 */
export const AirPlayToggleMenu = (Base) => class extends Base {
    _combinedSpeakersMenuItem;

    /**
     * @constructor
     * @param {object} args - The constructor arguments, passed to the superclass.
     */
    constructor({ ...args } = {}) {
        super({ ...args });

        // this.state inherited from AirPlayToggleBase
        
        this._extensionObject = this.state ? this.state.getExtensionObject() : null;

        this._createMenuItems();
        this._createSettingsItems();

        this._connectToggleMenuSignals();
        this._connectToggleMenuSettings();
    }

    /**
     * Cleans up resources used by the menu.
     * Disconnects signals and destroys menu items.
     */
    destroy() {
        this._combinedSpeakersMenuItem?.destroy();
        this._combinedSpeakersMenuItem = null;

        if(super.destroy) super.destroy();
    }

    /**
     * Sets the header of the toggle menu with an icon and text.
     *
     * @private
     * @param {Gio.Icon} icon - The icon to display in the header.
     */
    _setMenuHeader(icon) {
        this.menu.setHeader(
            icon, 
            _(INDICATOR_TEXT)
        );
    }

    /**
     * Creates and adds the primary menu items to the toggle menu.
     * This includes the "Enable Streaming to Multiple Speakers" option and a separator.
     *
     * @private
     */
    _createMenuItems() {
        this._combinedSpeakersMenuItem = new PopupMenu.PopupImageMenuItem(_(MULTI_SPEAKER_LABEL), this.state.getGIconFile("multiStreamGIcon"));

        this._setMenuItemOrnament(this._combinedSpeakersMenuItem, this.state.getSettingsKey("get_boolean", "combined-speakers"));

        this.menu.addMenuItem(this._combinedSpeakersMenuItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }

    /**
     * Sets the ornament for a menu item, typically a checkmark.
     *
     * @private
     * @param {PopupMenu.PopupImageMenuItem} menuItem - The menu item to modify.
     * @param {boolean} enabled - If true, a checkmark is shown; otherwise, no ornament is shown.
     */
    _setMenuItemOrnament(menuItem, enabled) {
        menuItem.setOrnament(enabled ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
    }

    /**
     * Creates and adds the "Extension Settings" action item to the menu.
     *
     * @private
     */
    _createSettingsItems() {
        const settingsItem = this.menu.addAction(_(SETTINGS_LABEL),
            () => this._extensionObject.openPreferences());

        // Ensure the settings are unavailable when the screen is locked
        settingsItem.visible = Main.sessionMode.allowSettings;
        this.menu._settingsActions[this._extensionObject.uuid] = settingsItem;
    }

    /**
     * Connects signals for the menu items.
     * - Handles the check/uncheck of the main toggle to enable/disable the combined sink.
     * - Handles clicks on the "Multiple Speakers" menu item to update the corresponding setting.
     *
     * @private
     */
    _connectToggleMenuSignals() {
        this.state.connectSignal(this._combinedSpeakersMenuItem, "activate", () => {
            // Update the "combined-speakers" gsetting. Resulting setting change event is connected in this._connectToggleMenuSettings()
            this.state.updateSettingsKey("set_boolean", "combined-speakers", !this.state.getSettingsKey("get_boolean", "combined-speakers"));
        });
    }

    /**
     * Connects to GSettings changes.
     * - Listens for changes to the "combined-speakers" setting to toggle the feature.
     *
     * @private
     */
    _connectToggleMenuSettings() {
        // Toggle the combined sink module, if enabled
        this.state.connectSetting("combined-speakers", () => {
            this.state.toggleCombinedSinkModule(true);
            this._setMenuItemOrnament(this._combinedSpeakersMenuItem, this.state.getSettingsKey("get_boolean", "combined-speakers"));
        });
    }
}