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
            this.gicon = this.state.getGIconFile("indicatorGIcon");
            this._setMenuHeader(this.gicon); // The _setMenuHeader() function is in toggleMenu.js
        }

        /**
         * Connects the toggle button to its required event signals.
         * @private
         */
        _connectToggleSignals() {
            this.state.connectSignal(this, "clicked", () => {
                this._toggleRAOPModule();
            });

            this.state.connectSignal(this.state, "pipewire-airplay-toggle-state-changed", (obj, key, data) => {               
                if (key === "modulesList") {
                    // Update the super class's checked state. This is updated by the this.state.toggleRAOPModule() function
                    this.checked = data.new.includes("module-raop-discover");
                }
                if (key === "indicatorGIcon") {
                    this._setIndicatorIcon();
                }
            });
        }

        /**
         * Toggles the state of the RAOP (AirPlay) module by loading or unloading it.
         * @private
         */
        async _toggleRAOPModule() {
            try {
                this.checked = !this.checked; // TODO - test this
                await this.state.toggleRAOPModule();
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