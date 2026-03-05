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

/**
 * Applies a series of mixins to a base class.
 *
 * @param {Class} base - The base class to which mixins will be applied.
 * @param {...Class} mixins - The mixin functions to apply.
 * @returns {Class} A new class with all mixins applied.
 */
export function composeMixins(base, ...mixins) {
    return mixins.reduce((cls, mixin) => mixin(cls), base);
}

/**
 * Creates a Gio.FileIcon from an icon file name.
 *
 * @param {object} state - The extension state object.
 * @param {string} iconFileName - The name of the icon file in the 'icons' directory.
 * @returns {Gio.FileIcon} A new file icon.
 */
export function getGIcon(state, iconFileName) {
    const iconFile = Gio.File.new_for_path(state.getExtensionObject().dir.get_child("icons").get_path() + "/" + iconFileName);
    return Gio.FileIcon.new(iconFile);
}

/**
 * Recursively merges properties of one or more source objects into a target object.
 * If a key exists in both objects and the values are objects, it will recursively merge them.
 * Otherwise, the value from the source object will overwrite the value in the target object.
 * Arrays are treated as values, meaning a source array will completely overwrite a target array, not merge with it.
 *
 * Note: This function mutates the target object.
 *
 * @param {object} target - The object to merge properties into.
 * @param {...object} sources - The source objects to merge properties from.
 * @returns {object} The modified target object.
 */
export function deepMerge(target, ...sources) {
  // If no sources left to merge, return the target
  if (!sources.length) return target;
 
  // Take the first source to merge into the target
  const source = sources.shift();
 
  // Only merge if both target and source are objects
  if (isObject(target) && isObject(source)) {
    // Iterate over each key in the source
    for (const key in source) {
      // Skip inherited properties (avoid prototype pollution)
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
 
      // If the source value is an object, recursively merge
      if (isObject(source[key])) {
        // If target doesn't have the key, initialize it as an empty object
        if (!target[key]) Object.assign(target, { [key]: {} });
        // Recursively merge the nested objects
        deepMerge(target[key], source[key]);
      } else {
        // Otherwise, overwrite the target value with the source value
        Object.assign(target, { [key]: source[key] });
      }
    }
  }
 
  // Merge the remaining sources
  return deepMerge(target, ...sources);
}

/**
 * Checks if a value is a plain object (and not an array or null).
 *
 * @private
 * @param {*} value - The value to check.
 * @returns {boolean} True if the value is a plain object, false otherwise.
 */
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Executes a command asynchronously and returns its stdout as an array of strings.
 * This function spawns a subprocess and waits for it to complete.
 *
 * @param {string[]} argv - A list of string arguments for the command.
 * @param {string|null} [input=null] - Optional string to write to the process's `stdin`.
 * @param {Gio.Cancellable|null} [cancellable=null] - Optional cancellable to terminate the process.
 * @throws {Error} Throws an error if the subprocess fails to spawn or exits with a non-zero status.
 * @returns {Promise<string[]>} A promise that resolves with an array of
 *   strings from stdout (or an empty array if no output).
 */
export async function asyncExecCommandAndReadOutput(argv, input = null, cancellable = null) {
    let cancelId = 0;
    let flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;

    if (input !== null) flags |= Gio.SubprocessFlags.STDIN_PIPE;

    // 1. Setup the Launcher
    const launcher = new Gio.SubprocessLauncher({ flags });
    launcher.setenv("LC_ALL", "C", true);

    let subprocess;
    try {
        // 2. Spawn the actual subprocess
        subprocess = launcher.spawnv(argv);
    } catch (err) {
        throw new Error(err);
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
        throw new Error(err); // TODO - Does this need to be thrown as a Gio.IOErrorEnum all the way?  How do we avoid the "unhandled promise errors caused when the executed cli command fails?"
    } finally {
        if (cancelId > 0) cancellable.disconnect(cancelId);
    }
}

/**
 * Executes a command and monitors its stdout stream for continuous output.
 * This is intended for long-running processes.
 * See: https://gjs.guide/guides/gio/subprocesses.html#communicating-with-processes
 *
 * @param {object} state - The extension state object, used to track the process.
 * @param {Gio.Subprocess|null} subproc - An existing subprocess to use, or null to spawn a new one.
 * @param {string[]} argv - The command and arguments to execute.
 * @param {function(string): void} outCallback - Callback invoked for each line of output from stdout.
 * @param {function(Gio.OutputStream): void|null} [inCallback=null] - Optional callback to write to the process's stdin pipe.
 * @param {Gio.Cancellable|null} [cancellable=null] - Optional cancellable to terminate the process.
 * @throws {Error} Throws an error if the subprocess fails to spawn.
 */
export function execCommandAndMonitor(state, subproc, argv, outCallback, inCallback = null, cancellable = null) {
    let cancelId = 0;
    let flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;

    if (inCallback !== null) flags |= Gio.SubprocessFlags.STDIN_PIPE;

    // 1. Create the Launcher and configure environment
    const launcher = new Gio.SubprocessLauncher({ flags });
    launcher.setenv("LC_ALL", "C", true); // Third param 'true' allows overwriting

    let subprocess;
    try {
        // 2. Spawn the actual subprocess using the launcher
        subprocess = subproc ? subproc : launcher.spawnv(argv);
        state.addProcess(subprocess);
    } catch (err) {
        throw new Error(err);
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
        _readOutput(stdoutStream, stdinStream, outCallback, inCallback);
    } catch (err) {
        throw new Error(err);
    } finally {
        if (cancelId > 0) cancellable.disconnect(cancelId);
    }
}

/**
 * Recursively reads lines from a stream and invokes a callback for each line.
 * This is a helper for `execCommandAndMonitor` to continuously process stdout.
 *
 * @private
 * @param {Gio.DataInputStream} stdout - The input stream to read from (process stdout).
 * @param {Gio.OutputStream|null} stdin - The output stream to write to (process stdin).
 * @param {function(string): void} outCallback - Callback for each line read from stdout.
 * @param {function(Gio.OutputStream): void|null} inCallback - Callback to write to stdin.
 * @throws {Error} Throws an error if reading from the stream fails.
 */
function _readOutput(stdout, stdin, outCallback, inCallback) {
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
                    _readOutput(stdout, stdin, outCallback, inCallback);
                }
            } catch (err) {
                throw new Error(err);
            }
        }
    );
}

/**
 * Detects if PipeWire or PulseAudio is the active sound server.
 *
 * @throws {Error} Throws an error if the underlying `pactl info` command fails.
 * @returns {Promise<string|null>} A promise that resolves to "pipewire", "pulseaudio", or null if neither is found.
 */
export async function detectAudioServer() {
    try {
        const commandArray = [
            "pactl", 
            "info"
        ];
        const output = await asyncExecCommandAndReadOutput(
            commandArray,
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
        throw new Error(err);
    }
}