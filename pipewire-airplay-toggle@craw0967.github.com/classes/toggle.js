import GObject from "gi://GObject";

import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

import { logErr } from "../functions/logs.js";
import { composeMixins } from "../functions/utils.js";
import { INDICATOR_TEXT } from "../constants/config.js";

import { AirPlayToggleMenu } from "./toggleMenu.js";

/**
 * Class representing a QuickSettings Quick Toggle for AirPlay.
 * @extends QuickSettings.QuickMenuToggle
 */
export const AirPlayToggleBase = GObject.registerClass(
    class AirPlayToggleBase extends QuickSettings.QuickMenuToggle {
        /**
         * @constructor
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

        _setIndicatorIcon() {
            this.gicon = this.state.getStateKey("indicatorGIcon");
            this._setMenuHeader(this.gicon);
        }

        /**
         * Connects the toggle button to its required event signals.
         * @private
         */
        _connectToggleSignals() {
            // The signals connected by this.state.connectSignal() are cleaned up via the this.state.destroy() method that gets called in extension.js
            this.state.connectSignal(this, "clicked", () => {
                if (this.state.getStateKey("audioServerInstalled")) {
                    this._toggleAirPlay();
                    this.checked = !this.checked;
                } else {
                    this._notifyMissingDependencies();
                }
            });

            this.state.connectSignal(this.state, "pipewire-airplay-toggle-state-changed", (obj, key) => {
                if (key === "modulesList") {
                    // If the checked state of the toggle gets out of sync, resync it
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
                this.state.toggleAirPlay();

            } catch (err) {
                logErr(this.state, err);
            }
        }
    }
);

export const AirPlayToggle = GObject.registerClass(class AirPlayToggle extends composeMixins(
    AirPlayToggleBase,
    AirPlayToggleMenu
) {
    constructor({ ...args } = {}) {
        super({ ...args });
    }
});