export const logErr = function logErr(err, enabled = true) {
    if (enabled) {
        console.error(err);
    }
};
export const logWarn = function logWarn(msg, enabled = true) {
    if (enabled) {
        console.warn(msg);
    }
};
export const logMsg = function logMsg(msg, enabled = true) {
    if (enabled) {
        console.log(msg);
    }
};