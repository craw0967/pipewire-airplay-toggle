/**
 * Logs the given error message to the console if 'enabled' is true.
 * 
 * @param {Error} err - The error to be logged.
 * @param {boolean} [enabled=true] - Whether or not to log the error.
 */
export const logErr = function logErr(err, enabled = true) {
    if (enabled) {
        console.error(err);
    }
};

/**
 * Logs the given warning message to the console if 'enabled' is true.
 * 
 * @param {string} msg - The message to be logged.
 * @param {boolean} [enabled=true] - Whether or not to log the message.
 */
export const logWarn = function logWarn(msg, enabled = true) {
    if (enabled) {
        console.warn(msg);
    }
};

/**
 * Logs the given message to the console if 'enabled' is true.
 * 
 * @param {string} msg - The message to be logged.
 * @param {boolean} [enabled=true] - Whether or not to log the message.
 */
export const logMsg = function logMsg(msg, enabled = true) {
    if (enabled) {
        console.log(msg);
    }
};