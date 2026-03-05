import * as Main from "resource:///org/gnome/shell/ui/main.js";

import GObject from "gi://GObject";

import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

import { AirPlayToggle } from "./toggle.js";

/**
 * Class representing the AirPlay QuickSettings System Indicator.
 * This indicator adds a toggle to the Quick Settings menu and an optional
 * status icon to the top panel.
 *
 * @class AirPlayIndicator
 * @extends QuickSettings.SystemIndicator
 */
export const AirPlayIndicator = GObject.registerClass(
    class AirPlayIndicator extends QuickSettings.SystemIndicator {
        /**
         * @constructor
         * @param {object} args - The constructor arguments.
         * @param {AirPlayToggleExtensionState} args.state - The extension state object.
         */
        constructor({ ...args }) {
            const { state, ...addArgs } = args;
            super({ ...addArgs });
            
            this.state = state;

            this._indicator = this._addIndicator();
            this._indicator.gicon = this.state.getGIconFile("indicatorGIcon");

            this._toggle = new AirPlayToggle({ state: this.state });
            
            this.quickSettingsItems.push(this._toggle);
            Main.panel.statusArea.quickSettings.addExternalIndicator(
                this
            );

            this._setIndicatorIconVisibility();
            this._connectIndicatorSignals();
            this._connectIndicatorSettings();
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
         * Connects to necessary signals for the indicator.
         * @private
         */
        _connectIndicatorSignals() {
            this.state.connectSignal(
                this.state, 
                "pipewire-airplay-toggle-state-changed", 
                (obj, key) => {
                    if (key === "indicatorGIcon") {
                        this._indicator.gicon = this.state.getGIconFile("indicatorGIcon");
                    }
                }
            );
        }

        /**
         * Connects to settings changes for the indicator.
         * @private
         */
        _connectIndicatorSettings() {
            this.state.connectSetting("show-indicator", () => {
                    this._setIndicatorIconVisibility();
                }
            );
        }

        /**
         * Sets the visibility of the panel indicator icon based on extension settings.
         * When enabled, the icon's visibility is bound to the toggle's checked state.
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