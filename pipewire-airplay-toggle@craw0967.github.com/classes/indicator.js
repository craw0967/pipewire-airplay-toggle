import * as Main from "resource:///org/gnome/shell/ui/main.js";

import GObject from "gi://GObject";
import Gio from "gi://Gio";

import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

import { INDICATOR_ICON_MAP } from "../constants/config.js";

import { AirPlayToggle } from "./toggle.js";

/**
 * Class representing the AirPlay QuickSettings System Indicator.
 * @extends QuickSettings.SystemIndicator
 */
export const AirPlayIndicator = GObject.registerClass(
    class AirPlayIndicator extends QuickSettings.SystemIndicator {
        /**
         * @constructor
         */
        constructor(state) {
            super();
            
            this.state = state;
            this._indicator = this._addIndicator();

            this._toggle = new AirPlayToggle(this.state);

            this._setIndicatorIcon();
            this._setIndicatorIconVisibility();

            this._connectSettings();

            this.quickSettingsItems.push(this._toggle);

            Main.panel.statusArea.quickSettings.addExternalIndicator(
                this
            );
        }

        /**
         * Clean up and destroy the indicator and any child QuickSettingsItems.
         * This should be called when the extension is being disabled or unloaded.
         */
        destroy() {
            if (this._binding) {
                this._binding.unbind();
                this._binding = null;
            }

            // This will destroy this._toggle
            this.quickSettingsItems?.forEach((item) => {
                item.destroy();
                item = null;
            });

            this._indicator = null;

            super.destroy();
        }

        /**
         * Connects to settings changes for the indicator icon and visibility.
         * @private
         */
        _connectSettings() {
            this.state.connectSetting("indicator-icon", () => {
                    this._setIndicatorIcon();
                }
            );
            
            this.state.connectSetting("show-indicator", () => {
                    this._setIndicatorIconVisibility();
                }
            );
        }

        /**
         * Gets the currently selected icon for the indicator and toggle switch.
         * @private
         * @returns {Gio.FileIcon} - The icon that should be used for the indicator and toggle switch.
         */
        _getIcon() {
            const iconName = this.state.getSettingsKey("get_string", "indicator-icon")?.length > 0 ? INDICATOR_ICON_MAP[this.state.getSettingsKey("get_string", "indicator-icon")] : INDICATOR_ICON_MAP["option0"];
            const iconFile = Gio.File.new_for_path(this.state.getExtensionObject().dir.get_child("icons").get_path() + "/" + iconName);
            const icon = Gio.FileIcon.new(iconFile);
            
            return icon;
        };

        /**
         * Updates the icon of the indicator and the toggle switch.
         * @private
         */
        _setIndicatorIcon() {
            this._indicator.gicon = this._getIcon();
            this._toggle.gicon = this._getIcon();
        }

        /**
         * Sets the visibility of the indicator icon based on extension settings.
         * @private
         */
        _setIndicatorIconVisibility() {
            if (this.state.getSettingsKey("get_boolean", "show-indicator") === true) {
                if (!this._binding) {
                    this._binding = this._toggle.bind_property(
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