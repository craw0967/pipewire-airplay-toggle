export const SettingsMixin = (Base) => class extends Base {
    constructor({ extensionSettings, ...args } = {}) {
        super({ ...args });
        this._settings = extensionSettings;
        this._settingsHandlers = [];

    }

    connectSetting(key, callback) {
        const id = this._settings.connect(`changed::${key}`, callback);
        this._settingsHandlers.push(id);
        return id;
    }

    bindSetting(key, obj, property, flags) {
        const id = this._settings.bind(key, obj, property, flags);
        this._settingsHandlers.push(id);
        return id;
    }

    destroy() {
        // Disconnect any settings signals
        if (this._settings) {
            for (const id of this._settingsHandlers)
                this._settings.disconnect(id);
            this._settingsHandlers = [];
        }
        if (super.destroy) super.destroy();
    }
};
