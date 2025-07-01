import Gio from "gi://Gio";
Gio._promisify(
    Gio.Subprocess.prototype, 
    "communicate_utf8_async"
);

import { logErr } from "./logs.js";

/**
 * Connects child classes and components to the extension's settings.
 * Child classes should be designed in such a way that the function containing the connection logic can be called from here.
 * Child classes should be initialized before this method is called so that their functions can be referenced from the extensionObject.
 *
 * @param {Extension} extensionObject - An instance of the default extension class.
 * @param {Gio.Settings} settings - The settings object that contains the extension's configuration.
 */
export function connectSettings(extensionObject, settings) {
    settings.connect(
        "changed::indicator-icon",
        () => {
            extensionObject.indicator.setIndicatorIcon();
        }
    );

    settings.connect(
        "changed::show-indicator",
        () => {
            extensionObject.indicator.setIndicatorIconVisibility();
        }
    );
}

/**
 * Asynchronously executes a command and reads the output.
 * 
 * @param {string[]} argv - A list of string arguments
 * @param {string | null} [input=null] - Input data, or null
 * @param {Gio.Cancellable | null} [cancellable=null] - Optional cancellable object
 * @returns {Promise<string[]>} A promise that resolves with an array of strings, each string representing a line in the output.
 */
export async function asyncExecCommandAndReadOutput(argv, input = null, cancellable = null) {
    let cancelId = 0;
    let flags =
        Gio.SubprocessFlags.STDOUT_PIPE |
        Gio.SubprocessFlags.STDERR_PIPE;

    if (input !== null) flags |= Gio.SubprocessFlags.STDIN_PIPE;

    const proc = new Gio.Subprocess({ argv, flags });
    proc.init(cancellable);

    if (cancellable instanceof Gio.Cancellable)
        cancelId = cancellable.connect(() => proc.force_exit());

    try {
        const [stdout, stderr] = await proc.communicate_utf8_async(
            input,
            null
        );
        const status = proc.get_exit_status();

        if (status !== 0) {
            throw new Gio.IOErrorEnum({
                code: Gio.IOErrorEnum.FAILED,
                message: stderr
                    ? stderr.trim()
                    : `Command '${argv}' failed with exit code ${status}`,
            });
        }

        const out = stdout ? stdout.trim() : stdout;

        const output =
            out && out instanceof Uint8Array
                ? new TextDecoder().decode(out).split("\n")
                : out.toString().split("\n");

        return output;
    } catch (err) {
        logErr(err, this._settings?.get_boolean("show-debug"));
    } finally {
        if (cancelId > 0) cancellable.disconnect(cancelId);
    }
}