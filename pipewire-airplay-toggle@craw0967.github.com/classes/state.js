import GObject from "gi://GObject";

// Set state defaults
const stateData = {
    loggingEnabled: true,
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

    /**
     * Instantiates a new State object.
     * Throws an error if the State object has already been instantiated.
     * State is a singleton and can only be instantiated once.
     */
    constructor() {
        super();
        // Simple "deep clone". Won't handle non JSON-safe data types
        // structuredClone() not yet supported and custom deep clone function not necessary at this time
        this.#data = JSON.parse(JSON.stringify(stateData));
        this.#settings = null;

        if (State.#instance !== null) {
            throw new Error('State is a singleton and cannot be instantiated more than once');
        }

        State.#instance = this;
    }

    destroy() {
        this.#data = null;
        State.#instance = null;

        super.destroy();
    }
    
    // Method to access the single instance
    static getInstance() {
        if (State.#instance === null) {
            new State();
        }
        return State.#instance;
    }

    #updateState(key, value) {
        this.#data[key] = value;
    }

    // Method to update the state
    updateState(key, value) {
        this.#updateState(key, value);
        // Notify child components that the state has been updated
        this.#notifyChildComponents();
    }

    getState() {
        return this.#data;
    }

    setSettings(settings) {
        this.#settings = settings;
    }

    getSettings() {
        return this.#settings;
    }

     // Private method to notify child components
    #notifyChildComponents() {
        // Emit the signal with the updated state data
        this.emit('pipwire-airplay-toggle-state-changed', true);
    }

});

export const AirPlayToggleExtensionState = State.getInstance();