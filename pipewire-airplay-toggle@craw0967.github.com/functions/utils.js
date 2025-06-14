import Gio from "gi://Gio";
Gio._promisify(
    Gio.Subprocess.prototype, 
    "communicate_utf8_async"
);

import { logErr } from "./logs.js";

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