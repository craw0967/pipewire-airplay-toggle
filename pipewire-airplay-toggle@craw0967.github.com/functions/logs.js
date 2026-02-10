import { AirPlayToggleExtensionState as State } from "../state/state.js";

/**
 * Logs the given error message to the console if 'show-debug' setting is enabled.
 * 
 * @param {Error} err - The error to be logged.
 * @param {boolean} [enabled=true] - Whether or not to log the error.
 */
export const logErr = function logErr(err) {
    if (State.getSettingsKey("get_boolean", "show-debug")) {
        console.error(err);
    }
};

/**
 * Logs the given warning message to the console if 'show-debug' setting is enabled.
 * 
 * @param {string} msg - The message to be logged.
 * @param {boolean} [enabled=true] - Whether or not to log the message.
 */
export const logWarn = function logWarn(msg) {
    if (State.getSettingsKey("get_boolean", "show-debug")) {
        console.warn(msg);
    }
};

/**
 * Logs the given message to the console if 'show-debug' setting is enabled.
 * 
 * @param {string} msg - The message to be logged.
 * @param {boolean} [enabled=true] - Whether or not to log the message.
 */
export const logMsg = function logMsg(msg) {
    if (State.getSettingsKey("get_boolean", "show-debug")) {
        console.log(msg);
    }
};