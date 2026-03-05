import GObject from "gi://GObject";

import { SignalHandlerMixin } from "./signalHandlerMixin.js";
import { SettingsMixin } from "./settingsMixin.js";
import { ProcessHandlerMixin } from "./processHandlerMixin.js";
import { AudioServerMixin } from "./audioServerMixin.js";

import { composeMixins, getGIcon } from "../functions/utils.js";
import { STATE_DEFAULTS, G_ICON_MAP, INDICATOR_ICON_MAP } from "../constants/config.js";

/**
 * Class representing and managing the state of the extension.
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

    /************************************
     *                                  *
     *         State Functions          *
     *                                  *
     ************************************/

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
     * @param {boolean} [notify=true] - Whether to emit a state change signal.
     */
    updateStateKey(key, value, notify = true) {
        this.#updateStateKey(key, value);
        // Notify child components that the state has been updated
        if (notify) {
            this.#fireStateUpdateNotifyEvent(key);
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
     * Initializes the state icons and sets up listeners for icon-related settings.
     * @private
     */
    _setupStateGIcons() {
        /* for (const key in Object.keys(G_ICON_MAP)) {
            this.updateGIcon(key, G_ICON_MAP[key]);
        } */

        this._setIndicatorGIcon();
        this.connectSetting("indicator-icon", () => this._setIndicatorGIcon());
    }

    /**
     * Sets the indicator icon based on the current extension settings.
     * Retrieves the icon preference and updates the 'indicatorGIcon' state key.
     * @private
     */
    _setIndicatorGIcon() {
        let iconKey = this.getSettingsKey("get_string", "indicator-icon")?.length > 0 ? 
                INDICATOR_ICON_MAP[this.getSettingsKey("get_string", "indicator-icon")] : 
                INDICATOR_ICON_MAP["option0"];
        this.updateGIcon("indicatorGIcon", G_ICON_MAP[iconKey]);
    }

    /**
     * Updates a Gio.FileIcon in the state.
     * @param {string} key - The state key for the GIcon.
     * @param {string} filename - The filename of the icon.
     */
    updateGIcon(key, filename) {
        this.updateStateKey(key, getGIcon(this, filename));
    }

    /**
     * Retrieves a Gio.FileIcon based on an icon key or filename.
     * @param {string} icon - The icon key or filename.
     * @returns {Gio.FileIcon} The corresponding file icon.
     */
    getGIconFile(icon) {
        if (this.getStateKey(icon)) {
            return this.getStateKey(icon);
        }

        const filename = G_ICON_MAP[icon] ? 
            G_ICON_MAP[icon] : 
            icon;
            
        return getGIcon(this, filename);
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
    ProcessHandlerMixin,
    AudioServerMixin
) {});