import { logErr } from "../functions/logs.js";

export const SettingsMixin = (Base) => class extends Base {
    #settingsHandlers;

    constructor({ ...args } = {}) {
        super({ ...args });

        this.#settingsHandlers = [];
    }

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

    // Disconnect any settings signals
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

    destroy() {
        this._disconnectAllSettings();
        this.#settingsHandlers = null;
        
        if (super.destroy) super.destroy();
    }
};
