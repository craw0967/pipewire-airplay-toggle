import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import { AirPlayOutputControl } from "./outputControl.js";

/**
 * A menu section that contains individual volume controls for each detected AirPlay speaker.
 * This section is dynamically populated based on the available RAOP sinks.
 *
 * @class AirPlayMultiSpeakerControls
 * @extends PopupMenu.PopupMenuSection
 */
export const AirPlayMultiSpeakerControls = class AirPlayMultiSpeakerControl extends PopupMenu.PopupMenuSection { 
    _controls;

    /**
     * @constructor
     * @param {object} args - The constructor arguments.
     * @param {AirPlayToggleExtensionState} args.state - The extension state object.
     */
    constructor({ ...args }) {
        const { state, ...addArgs } = args;
        super({
            ...addArgs,
        });

        this.state = state;

        this._controls = {};

        this._loadIcons();
        this._setupControls();
        this._connectControlsSignals();

        this.actor.hide();
    }

    /**
     * Loads the necessary icons into the extension state.
     *
     * @private
     */
    _loadIcons() {
        // TODO - determine a preferred location for loading icons into the state object
        // They occasionally need to be dynamic, but I like the idea of loading the defaults all in one method
        // Maybe in the state class itself?
        this.state.updateGIcon("speakerEnabledGIcon", "selection-mode-symbolic.svg");
        this.state.updateGIcon("speakerDisabledGIcon", "radio-symbolic.svg");
        this.state.updateGIcon("volume0GIcon", "volume-0-symbolic.svg");
        this.state.updateGIcon("volume1GIcon", "volume-1-symbolic.svg");
        this.state.updateGIcon("volume2GIcon", "volume-2-symbolic.svg");
        this.state.updateGIcon("volume3GIcon", "volume-3-symbolic.svg");
        this.state.updateGIcon("volume4GIcon", "volume-4-symbolic.svg");
    }

    /**
     * Connects signals to update the controls when the list of RAOP sinks changes.
     *
     * @private
     */
    _connectControlsSignals() {
        //Update button visibility if the toggle button is checked
        this.state.connectSignal(this.state, "pipewire-airplay-toggle-state-changed", (obj, key) => {
            if (key === "raopSinksMap") {
                this._setupControls();
            }
        });
    }
    
    /**
     * Sets up or updates the individual speaker controls.
     * It creates new controls for new sinks and destroys controls for sinks that are no longer available.
     *
     * @private
     */
    _setupControls() {
        const sinks = this.state.getStateKey("raopSinksMap");

        if (Object.keys(sinks).length < 1 && Object.keys(this._controls).length > 0) {
            this._destroyControls(false);
            return;
        }

        Object.keys(this._controls).forEach((key) => {
            if(!sinks[key]) {
                this._destroyControl(key);
            }
        });

        Object.keys(sinks).forEach((key) => {
            if(!this._controls[key]) {
                this._controls[key] = new AirPlayOutputControl({state: this.state, sink: sinks[key]});
                this.addMenuItem(this._controls[key]);
            }
        });
    }

    /**
     * Destroys all individual speaker controls within this menu section.
     *
     * @private
     * @param {boolean} [disconnect=true] - If true, nullifies the internal controls object.
     */
    _destroyControls(disconnect = true) {
        Object.keys(this._controls).forEach((key) => {
            this._destroyControl(key);
        });
        this._controls = disconnect ? null : {};
    }

    /**
     * Destroys a single speaker control by its key (sink ID).
     *
     * @private
     * @param {string} key - The key (sink ID) of the control to destroy.
     */
    _destroyControl(key) {
        this._controls[key].destroy();
        this._controls[key] = null;
        delete this._controls[key];
    }

    /**
     * Cleans up all resources used by this class, including all child controls.
     */
    destroy() {
        this._destroyControls(true);

        super.destroy();
    }
}
