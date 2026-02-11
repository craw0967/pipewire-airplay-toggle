/**
 * A mixin for managing signals.
 * @mixin
 * @param {class} Base - The class to extend.
 * @returns {class} - A class that extends the Base class with process handling functionality.
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
     * @param {object} obj - The object to connect to the signal
     * @param {string} signalName - The name of the signal to connect to the object
     * @param {function} callback - The function to execute when the signal event is triggered
     * @throws {Error} Throws an error if the signal connect fails
     * @returns {number | null} - The ID of the handler, or null on error.
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