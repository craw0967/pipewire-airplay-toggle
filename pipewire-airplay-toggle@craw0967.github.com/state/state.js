import GObject from "gi://GObject";

import { SignalHandlerMixin } from "./signalHandlerMixin.js";
import { SettingsMixin } from "./settingsMixin.js";
import { ProcessHandlerMixin } from "./processHandlerMixin.js";
import { AudioServerMixin } from "./audioServerMixin.js";

import { composeMixins, getGIcon } from "../functions/utils.js";

// Set state defaults
const StateData = {
    //Icons
    indicatorGIcon: null,
    speakerEnabledGIcon: null,
    speakerDisabledGIcon: null,
    multiStreamGIcon: null,
    volume0GIcon: null,
    volume1GIcon: null,
    volume2GIcon: null,
    volume3GIcon: null,
    volume4GIcon: null,

    //PipeWire/PulseAudio Variables
    audioServerInstalled: false,
    raopModuleInstalled: false,
    raopModuleId: null,
    modulesList: [],

    //Sinks Variables
    currentCombineModuleId: null,
    newCombineModuleId: null,
    combinedSinks: [],
    raopSinksList: [],
    raopSinksMap: {}
};

/**
 * Class representing and managing the state of the extension.
 * This class is a singleton.
 * @class State
 * @extends GObject.Object
 * @-side-effect-free
 * @-signals "pipewire-airplay-toggle-state-changed"
 */
const State = GObject.registerClass({
    Signals: {
        "pipewire-airplay-toggle-state-changed": {
            param_types: [GObject.TYPE_STRING], // The key of the state that changed
        },
    }
}, class State extends GObject.Object {
    // Private Variables
    #data;
    #settings;
    #extensionObject;

    /**
     * @constructor
     * Instantiates a new State object.
     * @param {object} args - The arguments for the constructor.
     */
    constructor({ ...args } = {}) {
        super({ ...args });
        // Simple "deep clone". Won't handle non JSON-safe data types
        // structuredClone() not yet supported and custom deep clone function not necessary at this time
        this.#data = JSON.parse(JSON.stringify(StateData));
        this.#settings = null;
    }

    /**
     * Cleans up and destroys the state object.
     */
    destroy() {
        this.#data = null;
        this.#settings = null;
 
        if (super.destroy) super.destroy();
    }

    // The state and settings functions could be handled via getters and setters
    // But the idea is that no other component should be modifying the state directly
    // It should be managed in this class only

    /* *******
     * State Functions
     * *******/

    /**
     * Updates a key in the state data.
     * @private
     * @param {string} key - The key to update.
     * @param {*} value - The new value.
     */
    #updateStateKey(key, value) {
        this.#data[key] = value;
    }

    /**
     * Emits a signal to notify that the state has changed.
     * @private
     * @param {string} key - The key of the state that changed.
     */
    #fireStateUpdateNotifyEvent(key) {
        // Emit an event signal with the updated key name
        this.emit("pipewire-airplay-toggle-state-changed", key);
    }

    /**
     * This is for the state management classes only. Do not modify the state directly.
     * @type {object}
     * @readonly
     */
    get _State() {
        return this.#data;
    }

    /**
     * Gets a value from the state.
     * @param {string} key - The key of the value to get.
     * @returns {*} The value from the state.
     */
    getStateKey(key) {
        return this.#data[key];
    }

    /**
     * Method to update the state and notify listeners.
     * @param {string} key - The key to update.
     * @param {*} value - The new value.
     */
    updateStateKey(key, value, notify = true) {
        this.#updateStateKey(key, value);
        // Notify child components that the state has been updated
        if (notify) {
            this.#fireStateUpdateNotifyEvent(key);
        }
    }

    /* *******
     * Settings Functions
     * *******/

    /**
     * Sets the settings object. This should only be done once.
     * @private
     * @param {Gio.Settings} settings - The settings object.
     */
    #setSettings(settings) {
        // Set the initial value of the settings object only once
        if(!this.#settings) {
            this.#settings = settings;
        }
    }

    /**
     * This is for the SettingsMixin only. Do not modify the settings directly.
     * @type {Gio.Settings}
     * @readonly
     */
    get _Settings() {
        return this.#settings;
    }

    /**
     * Calls a method on the settings object to update a value.
     * @param {string} method - The settings method to call (e.g., "set_boolean").
     * @param  {...any} args - The arguments for the settings method.
     */
    updateSettingsKey(method, ...args) {
        if (this.#settings && typeof this.#settings[method] === "function") {
            this.#settings[method](...args);
        }
    }

    /**
     * Calls a method on the settings object to get a value.
     * @param {string} method - The settings method to call (e.g., "get_boolean").
     * @param  {...any} args - The arguments for the settings method.
     * @returns {*} The value from the settings, or null if an error occurs.
     */
    getSettingsKey(method, ...args) {
        if (this.#settings && typeof this.#settings[method] === "function") {
            return this.#settings[method](...args);
        }

        return null;
    }

    /* *******
     * Extension Object Functions (PipeWireAirPlayToggleExtension class)
     * *******/

    /**
     * Sets the extension object and initializes settings. This should only be done once.
     * @param {Extension} obj - The extension object.
     */
    setExtensionObject(obj) {
        if (!this.#extensionObject) {
            this.#extensionObject = obj;
            this.#setSettings(this.#extensionObject.getSettings());
        }
    }

    /**
     * Gets the extension object.
     * @returns {Extension} The extension object.
     */
    getExtensionObject() {
        return this.#extensionObject;
    }

    /* *******
     * UI Functions
     * *******/
    updateGIcon(key, filename) {
        this.updateStateKey(key, getGIcon(this, filename));
    }
});

export const AirPlayToggleExtensionState = GObject.registerClass(class AirPlayToggleExtensionState extends composeMixins(
    State,
    SignalHandlerMixin,
    SettingsMixin,
    ProcessHandlerMixin,
    AudioServerMixin
) {});