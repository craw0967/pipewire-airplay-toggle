import GObject from "gi://GObject";
import Gio from "gi://Gio";

import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

import { INDICATOR_ICON_MAP } from "../constants/config.js";

/** Class representing a QuickSettings System Indicator */
export const AirPlayIndicator = GObject.registerClass(
    class AirPlayIndicator extends QuickSettings.SystemIndicator {
        /**
         * Initialize the AirPlayIndicator class.
         * 
         * @param {Extension} extensionObject - An instance of the default extension class.
         */
        _init(extensionObject) {
            super._init();

            this._indicator = this._addIndicator();
            this._extensionObject = extensionObject;

            this.setIndicatorIcon();
            this.setIndicatorIconVisibility();
        }

        /***
         * Get the currently selected icon for the indicator and toggle switch.
         * 
         * @returns {Gio.FileIcon} - The icon that should be used for the indicator and toggle switch.
         */
        _getIcon() {
            const iconName = this._extensionObject.settings?.get_string("indicator-icon")?.length > 0 ? INDICATOR_ICON_MAP[this._extensionObject.settings.get_string("indicator-icon")] : INDICATOR_ICON_MAP["option0"];
            const iconFile = Gio.File.new_for_path(this._extensionObject.dir.get_child("icons").get_path() + "/" +iconName);
            const icon = Gio.FileIcon.new(iconFile);
            
            return icon;
        };

        /**
         * Updates the icon of the indicator and the toggle switch.
         */
        setIndicatorIcon() {
            this._indicator.gicon = this._getIcon();
            this._extensionObject.toggle.gicon = this._getIcon();
        }

        /**
         * Sets the visibility of the indicator icon based on extension settings.
         */
        setIndicatorIconVisibility() {
            const showIndicator = this._extensionObject.settings.get_boolean("show-indicator");
            if (showIndicator === true) {
                if (!this._binding) {
                    this._binding = this._extensionObject.toggle.bind_property(
                        "checked",
                        this._indicator,
                        "visible",
                        GObject.BindingFlags.SYNC_CREATE
                    );
                }
            } else {
                if (this._binding) {
                    this._binding.unbind();
                    this._binding = null;
                }
                this._indicator.visible = false;
            }
        }
    }
);