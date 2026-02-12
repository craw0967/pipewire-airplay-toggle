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
        constructor({ ...args }) {
            const { state, ...addArgs } = args;
            super({ ...addArgs });
            
            this.state = state;
            this._addIndicatorIconToState();

            this._indicator = this._addIndicator();
            this._indicator.gicon = this.state.getStateKey("indicatorGIcon");

            this._toggle = new AirPlayToggle({ state: this.state });
            
            this.quickSettingsItems.push(this._toggle);
            Main.panel.statusArea.quickSettings.addExternalIndicator(
                this
            );

            this._setIndicatorIconVisibility();
            this._connectSettings();
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
         * Gets the currently selected icon for the indicator and toggle switch.
         * @private
         * @returns {Gio.FileIcon} - The icon that should be used for the indicator and toggle switch.
         */
        _addIndicatorIconToState() {
            const iconName = this.state.getSettingsKey("get_string", "indicator-icon")?.length > 0 ? INDICATOR_ICON_MAP[this.state.getSettingsKey("get_string", "indicator-icon")] : INDICATOR_ICON_MAP["option0"];
            const iconFile = Gio.File.new_for_path(this.state.getExtensionObject().dir.get_child("icons").get_path() + "/" + iconName);

            this.state.updateStateKey('indicatorGIcon', Gio.FileIcon.new(iconFile));
        };

        /**
         * Connects to settings changes for the indicator icon and visibility.
         * @private
         */
        _connectSettings() {

            //TODO - In the original multi_speaker build I connected the changing of the logging enabled setting to a state variable. This seems unnecessary, but adding a note in case I want to double check that pattern.
            // If we update the state variable, it will trigger an event and we can run logic based on that event, but we could just connect a function to the setting change or read the setting directly, which is what I'm doing in the most recent version

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
                this._binding?.unbind();
                this._binding = null;
                this._indicator.visible = false;
            }
        }
    }
);