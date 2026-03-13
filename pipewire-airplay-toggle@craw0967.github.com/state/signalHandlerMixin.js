import { logErr } from "../functions/logs.js";

/**
 * A mixin for managing signals.
 * @mixin
 * @param {class} Base - The class to extend.
 * @returns {class} A class that extends the Base class with signal handling functionality.
 * @property {Array<[GObject.Object, number]>} #signalHandlers - Stores managed signal handlers as [object, id] pairs.
 */
export const SignalHandlerMixin = (Base) => class extends Base {
    #signalHandlers;
    
    /**
     * @constructor
     * @param {object} args - The arguments for the constructor.
     */
    constructor({ ...args } = {}) {
        super({ ...args });
    
        this.#signalHandlers = [];
    }

    /**
     * Connects a callback to a signal event and adds it to the list of managed signals.
     * @param {GObject.Object} obj - The object to connect to the signal.
     * @param {string} signalName - The name of the signal to connect to.
     * @param {Function} callback - The function to execute when the signal event is triggered.
     * @throws {Error} Throws an error if the signal connection fails.
     * @returns {number} The ID of the signal handler.
     */
    connectSignal(obj, signalName, callback) {
        try {
            const id = obj.connect(signalName, callback);
            this.#signalHandlers.push([obj, id]);

            return id;
        } catch (err) {
            throw new Error(err);
        }
    }

    /**
     * Disconnects a signal and removes it from the list of managed signals.
     * @param {GObject.Object} obj - The object to disconnect the signal from.
     * @param {number} id - The ID of the signal handler to disconnect.
     */
    disconnectSignal(obj, id) {
        try {
            const index = this.#signalHandlers.findIndex((signal) => {
                return signal[1].toString() === id.toString();
            });
            if (index > -1) {
                obj.disconnect(id);
                this.#signalHandlers.splice(index, 1);
            }
        } catch (err) {
            logErr(this, err);
        }
    }

    /**
     * Disconnects all managed signals.
     * @private
     */
    _disconnectAllSignals() {
        for (const [obj, id] of this.#signalHandlers) {
            obj.disconnect(id);
        }
    }

    /**
     * Cleans up by disconnecting all managed signals.
     */
    destroy() {
        this._disconnectAllSignals();
        this.#signalHandlers = null;

        if (super.destroy) super.destroy();
    }
};