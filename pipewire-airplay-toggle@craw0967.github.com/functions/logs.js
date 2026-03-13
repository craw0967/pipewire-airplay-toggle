/**
 * Logs the given error message to the console if "show-debug" setting is enabled.
 * 
 * @param {object} state - The extension state object.
 * @param {Error} err - The error to be logged.
 * @param {boolean} [enabled=false] - Whether or not to force log the error.
 */
export const logErr = function logErr(state, err, enabled = false) {
    if (state?.getSettingsKey("get_boolean", "show-debug") || enabled) {
        console.error(err);
    }
};

/**
 * Logs the given warning message to the console if "show-debug" setting is enabled.
 * 
 * @param {object} state - The extension state object.
 * @param {string} msg - The message to be logged.
 * @param {boolean} [enabled=false] - Whether or not to force log the message.
 */
export const logWarn = function logWarn(state, msg, enabled = false) {
    if (state?.getSettingsKey("get_boolean", "show-debug") || enabled) {
        console.warn(msg);
    }
};

/**
 * Logs the given message to the console if "show-debug" setting is enabled.
 * 
 * @param {object} state - The extension state object.
 * @param {string} msg - The message to be logged.
 * @param {boolean} [enabled=false] - Whether or not to force log the message.
 */
export const logMsg = function logMsg(state, msg, enabled = false) {
    if (state?.getSettingsKey("get_boolean", "show-debug") || enabled) {
        console.log(msg);
    }
};