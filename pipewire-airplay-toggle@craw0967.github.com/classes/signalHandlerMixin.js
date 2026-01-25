import { logErr } from "../functions/logs.js";
import { AirPlayToggleExtensionState } from "./state.js";

export const SignalHandlerMixin = (Base) => class extends Base {
    get _AirPlayToggleExtensionState() {
        return AirPlayToggleExtensionState.getState();
    }
    
    constructor({ ...args } = {}) {
        super({ ...args });
        this._signalHandlers = [];
    }

    _connectSignal(obj, signalName, callback) {
        const id = obj.connect(signalName, callback);
        this._signalHandlers.push([obj, id]);
        return id;
    }

    _disconnectAllSignals() {
        for (const [obj, id] of this._signalHandlers) {
            try {
                obj.disconnect(id);
            } catch (e) {
                logErr(e);
            }
        }
        this._signalHandlers = [];
    }

    destroy() {
        this._disconnectAllSignals();
        if (super.destroy) super.destroy();
    }
};