import { logErr } from "../functions/logs.js";

export const ProcessHandlerMixin = (Base) => class extends Base {
    #processHandlers;

    constructor({ ...args } = {}) {
        super({ ...args });
        
        this.#processHandlers = [];
    }

    addProcess(proc) {
        try {
            if (!this.#processHandlers.includes(proc)) {
                this.#processHandlers.push(proc);
            }
        } catch (err) {
            logErr(err);
        }
        
        return proc;
    }

    _disconnectAllProcesses() {
        for (const proc of this.#processHandlers) {
            try {
                proc.force_exit();
            } catch (err) {
                logErr(err);
            }
        }
    }

    destroy() {
        this._disconnectAllProcesses();
        this.#processHandlers = null;

        if (super.destroy) super.destroy();
    }
};