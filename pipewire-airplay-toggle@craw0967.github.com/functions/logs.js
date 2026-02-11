/**
 * Logs the given error message to the console if 'show-debug' setting is enabled.
 * 
 * @param {Error} err - The error to be logged.
 * @param {boolean} [enabled=true] - Whether or not to log the error.
 */
export const logErr = function logErr(state, err) {
    if (state.getSettingsKey("get_boolean", "show-debug")) {
        console.error(err);
    }
};

/**
 * Logs the given warning message to the console if 'show-debug' setting is enabled.
 * 
 * @param {string} msg - The message to be logged.
 * @param {boolean} [enabled=true] - Whether or not to log the message.
 */
export const logWarn = function logWarn(state, msg) {
    if (state.getSettingsKey("get_boolean", "show-debug")) {
        console.warn(msg);
    }
};

/**
 * Logs the given message to the console if 'show-debug' setting is enabled.
 * 
 * @param {string} msg - The message to be logged.
 * @param {boolean} [enabled=true] - Whether or not to log the message.
 */
export const logMsg = function logMsg(state, msg) {
    if (state.getSettingsKey("get_boolean", "show-debug")) {
        console.log(msg);
    }
};