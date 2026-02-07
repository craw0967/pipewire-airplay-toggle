import GLib from "gi://GLib";
import Gio from "gi://Gio";
Gio._promisify(
    Gio.Subprocess.prototype,
    "communicate_utf8_async"
);
Gio._promisify(
    Gio.DataInputStream.prototype,
    "read_line_async",
    "read_line_finish_utf8"
);

import { logErr } from "./logs.js";

/**
 * Detects if PipeWire or PulseAudio is installed and returns which one.
 * 
 * @param {boolean} loggingEnabled - Whether to enable debug logging
 * @returns {Promise<string|null>} "pipewire", "pulseaudio", or null if neither found
 */
export async function detectAudioServer(loggingEnabled = false) {
    try {
        const commandArray = [
            "pactl", 
            "info"
        ];
        const output = await asyncExecCommandAndReadOutput(
            commandArray,
            loggingEnabled,
            null,
            null
        );

        if (output && output.length > 0) {
            const filtered = output.filter((line) => {
                return line.toLowerCase().includes("pipewire") || 
                       line.toLowerCase().includes("pulseaudio");
            });
            
            if (filtered.length > 0) {
                return filtered[0].toLowerCase().includes("pipewire") 
                    ? "pipewire" 
                    : "pulseaudio";
            }
        }

        return null;
    } catch (err) {
        logErr(err, loggingEnabled);
        return null;
    }
}

/**
 * Connects child classes and components to the extension's settings.
 * 
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
 * Disconnects the extension's settings event handlers from the given settings object.
 * This should be called when the extension is disabled or unloaded.
 * 
 * @param {Extension} extensionObject - An instance of the default extension class.
 * @param {Gio.Settings} settings - The settings object that contains the extension's configuration.
 */
export function disconnectSettings(extensionObject, settings) {
    settings.disconnect(
        "changed::indicator-icon",
        () => {
            extensionObject.indicator.setIndicatorIcon();
        }
    );

    settings.disconnect(
        "changed::show-indicator",
        () => {
            extensionObject.indicator.setIndicatorIconVisibility();
        }
    );
}

/**
 * Executes a command asynchronously.
 * On success, returns the output from `stdout` as an array of strings.
 * On failure, it logs the error (if `logErrors` is true) and returns `null`.
 *
 * If given, @input will be passed to `stdin` and @cancellable can be used to
 * stop the process before it finishes.
 *
 * @param {string[]} argv - A list of string arguments for the command.
 * @param {boolean} logErrors - Whether to log errors to the console.
 * @param {string | null} [input=null] - Input to write to `stdin` or `null` to ignore.
 * @param {Gio.Cancellable | null} [cancellable=null] - Optional cancellable object to stop the process.
 * @returns {Promise<string[] | null>} A promise that resolves with an array of strings (lines from stdout), or `null` on error.
 */
export async function asyncExecCommandAndReadOutput(argv, logErrors, input = null, cancellable = null) {
    let cancelId = 0;
    let flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;

    if (input !== null) flags |= Gio.SubprocessFlags.STDIN_PIPE;

    // 1. Setup the Launcher
    const launcher = new Gio.SubprocessLauncher({ flags });
    launcher.setenv('LC_ALL', 'C', true);

    let subprocess;
    try {
        // 2. Spawn the actual subprocess
        subprocess = launcher.spawnv(argv);
    } catch (err) {
        logErr(err, logErrors);
        return null;
    }

    // 3. Connect cancellation to the subprocess, not the launcher
    if (cancellable instanceof Gio.Cancellable) {
        cancelId = cancellable.connect(() => subprocess.force_exit());
    }

    try {
        // 4. Call communicate on the subprocess instance
        const [stdout, stderr] = await subprocess.communicate_utf8_async(
            input,
            cancellable // Pass the cancellable directly to the async call
        );
        
        const status = subprocess.get_exit_status();

        if (status !== 0) {
            throw new Gio.IOErrorEnum({
                code: Gio.IOErrorEnum.FAILED,
                message: stderr
                    ? stderr.trim()
                    : `Command '${argv.join(' ')}' failed with exit code ${status}`,
            });
        }

        if (!stdout) return [];

        // communicate_utf8_async returns a string, so TextDecoder is unnecessary
        return stdout.trim().split("\n");
        
    } catch (err) {
        logErr(err, logErrors);
        return null;
    } finally {
        if (cancelId > 0) cancellable.disconnect(cancelId);
    }
}


// TODO - Cleanup 'proc' object reference and functions that call this function
// I can't fully recall when I implemented that feature. It was clearly intended to be a way to reference processes for cleanup when the extension is unloaded
// But it doesn't appear to have been properly implemented by calling functions.
// Future state should consider how to do the proper cleanup before release. May just get rejected in code review if process is not cleaned up.
// For now I renamed proc -> subprocess
// TODO - Update JSDoc comment to reflect updated function
/**
 * Execute a command and monitor the process's stdout streams.
 * 
 * This function is intended to be used with external processes that run continuously and output data
 * https://gjs.guide/guides/gio/subprocesses.html#communicating-with-processes
 * 
 * @param {Gio.Subprocess} proc - Object used to store an instance of Gio.Subprocess. Will be initialized if not done in advance
 * @param {string[]} argv - The command line arguments
 * @param {boolean} logErrors - Whether or not to log errors
 * @param {function} outCallback - The callback function to call with each line read from stdout
 * @param {function | null} [inCallback=null] - Optional callback function to write to the process's stdin pipe
 * @param {Gio.Cancellable | null} [cancellable=null] - Optional cancellable object
 */
export function execCommandAndMonitor(subprocess, argv, logErrors, outCallback, inCallback = null, cancellable = null) {
    let cancelId = 0;
    let flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;

    if (inCallback !== null) flags |= Gio.SubprocessFlags.STDIN_PIPE;

    // 1. Create the Launcher and configure environment
    const launcher = new Gio.SubprocessLauncher({ flags });
    launcher.setenv('LC_ALL', 'C', true); // Third param 'true' allows overwriting

    //let subprocess;
    try {
        // 2. Spawn the actual subprocess using the launcher
        subprocess = subprocess ? subprocess : launcher.spawnv(argv);
    } catch (err) {
        logErr(err, logErrors);
        return;
    }

    // 3. Connect cancellation to the actual subprocess
    if (cancellable instanceof Gio.Cancellable) {
        cancelId = cancellable.connect(() => subprocess.force_exit());
    }

    // 4. Get pipes from the SUBPROCESS, not the launcher
    const stdout = subprocess.get_stdout_pipe();
    const stdoutStream = new Gio.DataInputStream({
        base_stream: stdout,
        close_base_stream: true,
    });
    
    const stdinStream = inCallback ? subprocess.get_stdin_pipe() : null;

    try {
        readOutput(stdoutStream, stdinStream, logErrors, outCallback, inCallback);
    } catch (err) {
        logErr(err, logErrors);
    } finally {
        if (cancelId > 0) cancellable.disconnect(cancelId);
    }
}

/***
 * Recursively reads from a Gio.DataInputStream and calls the provided callback function with each line.
 * 
 * @param {Gio.DataInputStream} stdout - The stream to read from
 * @param {Gio.SubprocessStdinPipe | null} stdin - The stream to write to if provided
 * @param {boolean} logErrors - Whether or not to log errors
 * @param {function} outCallback - The callback function to call with each line read from stdout
 * @param {function | null} [inCallback=null] - Optional callback function to write to the process's stdin pipe
 */
function readOutput(stdout, stdin, logErrors, outCallback, inCallback) {
    stdout.read_line_async(
        GLib.PRIORITY_LOW,
        null,
        (stream, result) => {
            try {
                const [line] = stream.read_line_finish_utf8(result);

                if (line !== null) {
                    outCallback(line);

                    // Execute stdin write operation defined by input callback function
                    if (stdin && inCallback) {
                        inCallback(stdin);
                    }

                    // Continue reading from the stream
                    readOutput(stdout, stdin, logErrors, outCallback, inCallback);
                }
            } catch (err) {
                logErr(err, logErrors);
            }
        }
    );
}