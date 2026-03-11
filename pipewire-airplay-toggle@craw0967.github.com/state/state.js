import GObject from "gi://GObject";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

import { SignalHandlerMixin } from "./signalHandlerMixin.js";
import { SettingsMixin } from "./settingsMixin.js";
import { ProcessMixin } from "./processMixin.js";
import { PipeWireHandler } from "./pipewireHandler.js";
import { PulseAudioHandler } from "./pulseaudioHandler.js";

import { composeMixins, getGIcon, detectAudioServer } from "../functions/utils.js";
import { STATE_DEFAULTS, G_ICON_MAP, INDICATOR_ICON_MAP, PW_MISSING_TITLE, PW_MISSING_BODY } from "../constants/config.js";

/**
 * Class representing and managing the state of the extension.
 * @class State
 * @extends GObject.Object
 * @event State#pipewire-airplay-toggle-state-changed
 */
const State = GObject.registerClass({
    Signals: {
        "pipewire-airplay-toggle-state-changed": {
            // Parameters: key, payload { old: any, new: any }
            param_types: [GObject.TYPE_STRING, GObject.TYPE_JSOBJECT],
        },
    }
}, class State extends GObject.Object {
    /**
     * The state data.
     * @private
     * @type {object}
     */
    #data;

    /**
     * The settings object.
     * @private
     * @type {Gio.Settings}
     */
    #settings;

    /**
     * The extension object.
     * @private
     * @type {Extension}
     */
    #extensionObject;

    /**
     * The audio server handler.
     * @private
     * @type {AudioServerHandler}
     */
    #audioHandler;

    /**
     * @constructor
     * Instantiates a new State object.
     * @param {object} args - The arguments for the constructor.
     */
    constructor({ ...args } = {}) {
        super({ ...args });
        // Simple "deep clone". Won't handle non JSON-safe data types
        // structuredClone() not yet supported and custom deep clone function not necessary at this time
        this.#data = JSON.parse(JSON.stringify(STATE_DEFAULTS));
        this.#settings = null;

        this._initializeAudioHandler();
    }

    /**
     * Cleans up and destroys the state object.
     */
    destroy() {
        this.#data = null;
        this.#settings = null;
        this.#audioHandler?.destroy();
 
        if (super.destroy) super.destroy();
    }

    // The state and settings functions could be handled via getters and setters
    // But the idea is that no other component should be modifying the state directly
    // It should be managed in this class only

    /************************************
     *                                  *
     *         State Functions          *
     *                                  *
     ************************************/

    /**
     * Emits a signal to notify that the state has changed.
     * @private
     * @param {string} key - The key of the state that changed.
     * @param {*} oldValue - The value before the change.
     * @param {*} newValue - The value after the change.
     * @fires State#pipewire-airplay-toggle-state-changed
     */
    #fireStateUpdateNotifyEvent(key, oldValue, newValue) {
        // Emit an event signal with the updated key, old value, and new value
        try {
            const payload = { old: oldValue, new: newValue };
            this.emit("pipewire-airplay-toggle-state-changed", key, payload);
        } catch (err) {
            console.error(err);
        }
    }

    /**
     * Gets a value from the state, with support for nested objects.
     *
     * @example
     * // Get a top-level value
     * const value = this.getStateKey('myKey');
     *
     * @example
     * // Get a nested value
     * const nestedValue = this.getStateKey('parentKey', 'childKey');
     *
     * @param {...string} keys - A sequence of keys to access the value.
     * @returns {*} The value from the state, or undefined if the path is invalid.
     */
    getStateKey(...keys) {
        // Traverse the state object to find the requested value.
        const value = keys.reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : undefined), this.#data);

        // If the retrieved value is an object or array, it's important to return a
        // deep copy to prevent consumers from accidentally mutating the internal state.
        // This enforces the pattern that all state modifications must go through `updateStateKey`.
        if (typeof value === 'object' && value !== null) {
            // Using JSON.parse/stringify for a simple deep clone as structuredClone is not available.
            // This is safe for the JSON-compatible data stored in the state.
            return JSON.parse(JSON.stringify(value));
        }

        // Primitives are returned by value, so no copy is needed.
        return value;
    }

    /**
     * Method to update a value in the state, with support for nested objects, and notify listeners.
     *
     * @example
     * // Update a nested key
     * this.updateStateKey(['parentKey', 'childKey'], 'myNestedValue');
     *
     * @example
     * // Update without notifying listeners
     * this.updateStateKey('myKey', 'myValue', false);
     *
     * @param {string|string[]} keys - A single key or a sequence of keys to access the value.
     * @param {*} value - The new value to set.
     * @param {boolean} [notify=true] - Whether to emit a state change signal.
     */
    updateStateKey(keys, value, notify = true) {
        const keyPath = Array.isArray(keys) ? keys : [keys];

        if (keyPath.length === 0) {
            return;
        }

        const oldValue = this.getStateKey(...keyPath);

        // Create a shallow copy of the data to start the immutable update
        const newData = { ...this.#data };
        let current = newData;

        // Traverse the path, creating shallow copies of objects at each level
        for (let i = 0; i < keyPath.length - 1; i++) {
            const key = keyPath[i];
            const next = current[key];

            // If the next level is not an object, or is null, create a new one.
            // Otherwise, create a shallow copy to avoid mutating the original state tree.
            current[key] = (typeof next === 'object' && next !== null) ? { ...next } : {};
            current = current[key];
        }

        // Set the new value at the final key in the new data structure
        const finalKey = keyPath[keyPath.length - 1];
        current[finalKey] = value; // Set new value

        // Replace the old state object with the newly constructed one
        this.#data = newData;

        // Get the new value from the now-updated state
        const newValue = this.getStateKey(...keyPath);

        if (notify) {
            this.#fireStateUpdateNotifyEvent(keyPath[0], oldValue, newValue);
        }
    }

    /************************************
     *                                  *
     *        Settings Functions        *
     *                                  *
     ************************************/

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

    /************************************
     *                                  *
     *    Extension Object Functions    *
     *                                  *
     ************************************/

    /**
     * Sets the extension object and initializes settings. This should only be done once.
     * @param {Extension} obj - The extension object.
     */
    setExtensionObject(obj) {
        if (!this.#extensionObject) {
            this.#extensionObject = obj;
            this.#setSettings(this.#extensionObject.getSettings());

            // Some icons are dependent on the settings, so initialize here
            this._setupStateGIcons();
        }
    }

    /**
     * Gets the extension object.
     * @returns {Extension} The extension object.
     */
    getExtensionObject() {
        return this.#extensionObject;
    }

    /************************************
     *                                  *
     *           UI Functions           *
     *                                  *
     ************************************/

    /**
     * Initializes the icon file names in the state and sets up listeners for icon-related settings.
     * @private
     */
    _setupStateGIcons() {
        // Add static key/value pairs for icons to the state
        for (const key in G_ICON_MAP) {
            this.updateStateKey(key, G_ICON_MAP[key]);
        }

        // Add dynamically updated key/value pairs to the state
        this._setIndicatorGIcon();
        this.connectSetting("indicator-icon", () => this._setIndicatorGIcon());
    }

    /**
     * Sets the indicator icon file name based on the current extension settings.
     * Retrieves the icon preference and updates the 'indicatorGIcon' state key.
     * @private
     */
    _setIndicatorGIcon() {
        let iconKey = this.getSettingsKey("get_string", "indicator-icon")?.length > 0 ? 
                INDICATOR_ICON_MAP[this.getSettingsKey("get_string", "indicator-icon")] : 
                INDICATOR_ICON_MAP["option0"];
        this.updateStateKey("indicatorGIcon", G_ICON_MAP[iconKey]);
    
    }

    /**
     * Retrieves a Gio.FileIcon based on an icon key or filename.
     * @param {string} icon - The icon key or filename.
     * @returns {Gio.FileIcon} The corresponding file icon.
     */
    getGIconFile(icon) {    
        return getGIcon(this, 
            this.getStateKey(icon) ? 
            this.getStateKey(icon) : 
            G_ICON_MAP[icon] ? 
            G_ICON_MAP[icon] : 
            icon
        );
    }

    /************************************
     *                                  *
     *      Audio Server Functions      *
     *                                  *
     ************************************/

    /**
     * Detects the audio server and initializes the appropriate handler.
     * @private
     */
    async _initializeAudioHandler() {
        const server = await detectAudioServer();
        this.updateStateKey("audioServerInstalled", !!server);

        if (server === "pipewire") {
            this.#audioHandler = new PipeWireHandler(this);
        } else if (server === "pulseaudio") {
            this.#audioHandler = new PulseAudioHandler(this);
        } else {
            this.notifyMissingDependencies();
            this.updateSettingsKey("set_string", "audio-server", "pipewire");
            return;
        }

        if (server) {
            if(this.getSettingsKey("get_string", "audio-server") !== server) {
                this.updateSettingsKey("set_string", "audio-server", server);
            }
            this.#audioHandler.initialize();
        }
    }

    /**
     * Notifies the user if the required audio server dependencies are missing.
     * @private
     */
    notifyMissingDependencies() {
        Main.notify(
            _(PW_MISSING_TITLE),
            _(PW_MISSING_BODY)
        );
    }

    /**
     * Toggles the state of the RAOP (AirPlay) module.
     * Delegates to the active audio handler.
     */
    async toggleRAOPModule() {
        if (!this.getStateKey("audioServerInstalled") || !this.#audioHandler) {
            this.notifyMissingDependencies();
            return;
        }

        await this.#audioHandler.toggleRAOPModule();
    }

    /**
     * Updates the volume of a specific sink.
     * Delegates to the active audio handler.
     * @param {string} sinkId - The ID of the sink.
     * @param {number} volume - The volume level.
     */
    async updateSinkVolume(sinkId, volume) {
        this.#audioHandler?.updateSinkVolume(sinkId, volume);
    }

    /**
     * Updates the mute state of a specific sink.
     * Delegates to the active audio handler.
     * @param {string} sinkId - The ID of the sink.
     * @param {boolean} mute - The mute state.
     */
    async updateSinkMute(sinkId, mute) {
        this.#audioHandler?.updateSinkMute(sinkId, mute);
    }

    /**
     * Toggles the combined sink module.
     * Delegates to the active audio handler.
     * @param {boolean} enabled - Whether to enable or disable the combined sink.
     */
    async toggleCombinedSinkModule() {
        this.#audioHandler?.toggleCombinedSinkModule();
    }

    /**
     * Updates the combined sinks with a new sink ID.
     * Delegates to the active audio handler.
     * @param {string} sinkId - The ID of the sink to toggle in the combined sink.
     */
    async updateCombinedSinks(sinkId) {
        this.#audioHandler?.updateCombinedSinks(sinkId);
    }
});

/**
 * The final, composed state class for the extension.
 * This class is a GObject-registered class that composes the base State class with 
 * various mixins for handling signals, settings, processes, and the audio server.
 * @class AirPlayToggleExtensionState
 * @extends State
 */
export const AirPlayToggleExtensionState = GObject.registerClass(class AirPlayToggleExtensionState extends composeMixins(
    State,
    SignalHandlerMixin,
    SettingsMixin,
    ProcessMixin
) {});