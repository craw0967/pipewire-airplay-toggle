/**
 * A mixin for managing subprocesses.
 * @mixin
 * @param {class} Base - The class to extend.
 * @returns {class} - A class that extends the Base class with process handling functionality.
 */
export const ProcessHandlerMixin = (Base) => class extends Base {
    #processHandlers;

    /**
     * @constructor
     * @param {object} args - The arguments for the constructor.
     */
    constructor({ ...args } = {}) {
        super({ ...args });
        
        this.#processHandlers = [];
    }

    /**
     * Adds a process to the list of managed processes.
     * @param {object} proc - The process to add.
     */
    addProcess(proc) {
        if (!this.#processHandlers.includes(proc)) {
            this.#processHandlers.push(proc);
        }
    }

    /**
     * Disconnects all managed processes.
     * @private
     */
    _disconnectAllProcesses() {
        for (const proc of this.#processHandlers) {
            proc.force_exit();
        }
    }

    /**
     * Cleans up by disconnecting all managed processes.
     */
    destroy() {
        this._disconnectAllProcesses();
        this.#processHandlers = null;

        if (super.destroy) super.destroy();
    }
};