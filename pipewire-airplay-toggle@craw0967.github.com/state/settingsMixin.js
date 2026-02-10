import { logErr } from "../functions/logs.js";

/**
 * A mixin for managing extension settings.
 * @mixin
 * @param {class} Base - The class to extend.
 * @returns {class} - A class that extends the Base class with settings handling functionality.
 */
export const SettingsMixin = (Base) => class extends Base {
    #settingsHandlers;

    /**
     * @constructor
     * @param {object} args - The arguments for the constructor.
     */
    constructor({ ...args } = {}) {
        super({ ...args });

        this.#settingsHandlers = [];
    }

    /**
     * Connects a callback to a setting change.
     * @param {string} key - The key of the setting.
     * @param {function} callback - The callback to execute when the setting changes.
     * @returns {number | null} - The ID of the handler, or null on error.
     */
    connectSetting(key, callback) {
        if (!this._Settings) {
            throw new Error("Extension settings not defined");
        };

        try {
            const id = this._Settings.connect(`changed::${key}`, callback);
            this.#settingsHandlers.push(id);

            return id;
        } catch (e) {
            logErr(e);
        }

        return null;
        
    }

    /**
     * Binds a setting to an object property.
     * @param {string} key - The key of the setting.
     * @param {object} obj - The object to bind the setting to.
     * @param {string} property - The property of the object to bind to.
     * @param {Gio.SettingsBindFlags} flags - The flags for the binding.
     * @returns {number | null} - The ID of the handler, or null on error.
     */
    bindSetting(key, obj, property, flags) {
        if (!this._Settings) {
            throw new Error("Extension settings not defined");
        };

        try {
            const id = this._Settings.bind(key, obj, property, flags);
            this.#settingsHandlers.push(id);

            return id;
        } catch (e) {
            logErr(e);
        }

        return null;
    }

    /**
     * Disconnects all managed settings signals.
     * @private
     */
    _disconnectAllSettings() {
        if (this._Settings) {
            try {
                for (const id of this.#settingsHandlers) {
                    this._Settings.disconnect(id);
                } 
            } catch (e) {
                logErr(e);
            }
        }
    }

    /**
     * Cleans up by disconnecting all managed settings.
     */
    destroy() {
        this._disconnectAllSettings();
        this.#settingsHandlers = null;
        
        if (super.destroy) super.destroy();
    }
};
