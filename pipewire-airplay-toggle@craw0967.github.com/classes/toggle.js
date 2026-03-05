import GObject from "gi://GObject";

import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

import { logErr } from "../functions/logs.js";
import { composeMixins } from "../functions/utils.js";
import { INDICATOR_TEXT } from "../constants/config.js";

import { AirPlayToggleMenu } from "./toggleMenu.js";

/**
 * Class representing a QuickSettings Quick Toggle for AirPlay.
 * 
 * @class AirPlayToggleBase
 * @extends QuickSettings.QuickMenuToggle
 */
export const AirPlayToggleBase = GObject.registerClass(
    class AirPlayToggleBase extends QuickSettings.QuickMenuToggle {
        /**
         * @constructor
         * @param {object} args - The constructor arguments.
         * @param {AirPlayToggleExtensionState} args.state - The extension state object.
         */
        constructor({ ...args } = {}) {
            const { state, ...addArgs } = args;
            super({ 
                ...addArgs,
                title: _(INDICATOR_TEXT),
                toggleMode: false,
            });

            this.state = state;
            
            this.checked = this.state.getStateKey("modulesList").includes("module-raop-discover");
            this._setIndicatorIcon();
            this._connectToggleSignals();
        }

        /**
         * Cleans up and destroys the toggle and any resources and events used or monitored by the class.
         * This should be called when the extension is being disabled or unloaded.
         */
        destroy() {
            super.destroy();
        }

        /**
         * Sets the icon for the toggle button and its menu header.
         * @private
         */
        _setIndicatorIcon() {
            this.gicon = this.state.getStateKey("indicatorGIcon");
            this._setMenuHeader(this.gicon); // The _setMenuHeader() function is in toggleMenu.js
        }

        /**
         * Connects the toggle button to its required event signals.
         * @private
         */
        _connectToggleSignals() {
            this.state.connectSignal(this, "clicked", () => {
                if (this.state.getStateKey("audioServerInstalled")) {
                    this._toggleAirPlay();
                }
            });

            this.state.connectSignal(this.state, "pipewire-airplay-toggle-state-changed", async (obj, key) => {
                if (key === "modulesList") {
                    // If the checked state of the toggle gets out of sync, resync it
                    // This is primarily for if the user manually enables/disables module-raop-discover
                    if(this.checked !== this.state.getStateKey("modulesList").includes("module-raop-discover")) {
                        this.checked = this.state.getStateKey("modulesList").includes("module-raop-discover");
                    }
                }
            });

            this.state.connectSignal(
                this.state, 
                "pipewire-airplay-toggle-state-changed", 
                (obj, key) => {
                    if (key === "indicatorGIcon") {
                        this._setIndicatorIcon();
                    }
                }
            );
        }

        /**
         * Toggles the state of the RAOP (AirPlay) module by loading or unloading it.
         * @private
         */
        async _toggleAirPlay() {
            try {
                await this.state.toggleAirPlay();
                // Update "checked" after we toggle the RAOP module
                // This ensures the state is updated before we trigger the "notify::checked" signal handler
                // Update here instead of waiting on the emission from this.state 
                // so the user doesn't notice the latency in the UI
                this.checked = !this.checked;
            } catch (err) {
                logErr(this.state, err);
            }
        }
    }
);

/**
 * The final AirPlayToggle class, composed of AirPlayToggleBase and the AirPlayToggleMenu mixin.
 * This class represents the complete Quick Settings toggle with its associated menu.
 *
 * @extends AirPlayToggleBase
 */
export const AirPlayToggle = GObject.registerClass(class AirPlayToggle extends composeMixins(
    AirPlayToggleBase,
    AirPlayToggleMenu
) {
    /**
     * @constructor
     * @param {object} args - The constructor arguments, passed to the parent classes.
     * @param {AirPlayToggleExtensionState} args.state - The extension state object.
     */
    constructor({ ...args } = {}) {
        super({ ...args });
    }
});