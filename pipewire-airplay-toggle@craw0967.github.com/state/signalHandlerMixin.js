import { logErr } from "../functions/logs.js";

export const SignalHandlerMixin = (Base) => class extends Base {
    #signalHandlers;
    
    constructor({ ...args } = {}) {
        super({ ...args });
    
        this.#signalHandlers = [];
    }

    connectSignal(obj, signalName, callback) {
        try {
            const id = obj.connect(signalName, callback);
            this.#signalHandlers.push([obj, id]);

            return id;
        } catch (err) {
            logErr(err);
        }

        return null;
    }

    disconnectAllSignals() {
        for (const [obj, id] of this.#signalHandlers) {
            try {
                obj.disconnect(id);
            } catch (err) {
                logErr(err);
            }
        }
    }

    destroy() {
        this._disconnectAllSignals();
        this.#signalHandlers = null;

        if (super.destroy) super.destroy();
    }
};