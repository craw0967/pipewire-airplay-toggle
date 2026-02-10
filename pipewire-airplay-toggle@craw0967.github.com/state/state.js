import GObject from "gi://GObject";

import { SignalHandlerMixin } from "./signalHandlerMixin.js";
import { SettingsMixin } from "./settingsMixin.js";
import { ProcessHandlerMixin } from "./processHandlerMixin.js";

import { composeMixins } from "../functions/utils.js";

// Set state defaults
const StateData = {
    extensionObject: null,
    loggingEnabled: false,
    toggleChecked: false,
    audioServerInstalled: false,
    raopModuleInstalled: false,
    raopModuleId: null,
    combineModuleId: null,
    airplaySpeakers: []
};

/* Class representing and managing the State of the Extension */
const State = GObject.registerClass({
    Signals: {
        'pipwire-airplay-toggle-state-changed': {
            param_types: [GObject.TYPE_BOOLEAN], // Define the argument types
        },
    }
}, class State extends GObject.Object {
    // Private Variables
    static #instance = null;
    #data;
    #settings;
    #extensionObject;

    /**
     * Instantiates a new State object.
     * Throws an error if the State object has already been instantiated.
     * State is a singleton and can only be instantiated once.
     */
    constructor({ ...args } = {}) {
        super({ ...args });
        // Simple "deep clone". Won't handle non JSON-safe data types
        // structuredClone() not yet supported and custom deep clone function not necessary at this time
        this.#data = JSON.parse(JSON.stringify(StateData));
        this.#settings = null;
        
        if (State.#instance !== null) {
            throw new Error('State is a singleton and cannot be instantiated more than once');
        }

        State.#instance = this;

    }

    destroy() {
        this.#data = null;
        this.#settings = null;

        State.#instance = null;
 
        super.destroy();
    }

    // Method to access the single instance
    static getInstance() {
        if (State.#instance === null) {
            new this();
        }
        return State.#instance;
    }

    // The state and settings functions could be handled via getters and setters
    // But the idea is that no other component should be modifying the state directly
    // It should be managed in this class only

    #updateStateKey(key, value) {
        this.#data[key] = value;
    }

    // Private method to notify child components
    #fireStateUpdateNotifyEvent() {
        // Emit the signal with the updated state data
        this.emit('pipwire-airplay-toggle-state-changed', true);
    }

    // This is for the state management classes only.  We shouldn't be modifying the state directly
    get State() {
        return this.#data;
    }

    getStateKey(key) {
        return this.#data[key];
    }

    // Method to update the state
    updateStateKey(key, value) {
        this.#updateStateKey(key, value);
        // Notify child components that the state has been updated
        this.#fireStateUpdateNotifyEvent();
    }

    #setSettings(settings) {
        // Set the initial value of the settings object only once
        if(!this.#settings) {
            this.#settings = settings;
        }
    }

    // This is for the SettingsMixin only. We shouldn't be modifying the settings directly.
    get Settings() {
        return this.#settings;
    }

    updateSettingsKey(method, ...args) {
        if (this.#settings && typeof this.#settings[method] === 'function') {
            this.#settings[method](...args);
        }
    }

    getSettingsKey(method, ...args) {
        if (this.#settings && typeof this.#settings[method] === 'function') {
            return this.#settings[method](...args);
        }

        return null;
    }

    setExtensionObject(obj) {
        if (!this.#extensionObject) {
            this.#extensionObject = obj;
            this.#setSettings(this.#extensionObject.getSettings());
        }
    }

    getExtensionObject() {
        return this.#extensionObject;
    }
});

const ComposedState = composeMixins(
    State,
    SignalHandlerMixin,
    SettingsMixin,
    ProcessHandlerMixin,
);

const FinalState = GObject.registerClass(class AirPlayToggleExtensionState extends ComposedState {});

export const AirPlayToggleExtensionState = FinalState.getInstance();