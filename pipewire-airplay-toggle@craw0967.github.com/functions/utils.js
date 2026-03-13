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
 * Recursively creates a "stable" version of an object by sorting its keys
 * at all levels. This is used to create a consistent string representation
 * for comparison, regardless of key order. For arrays, the order of elements
 * is preserved, but each element is stabilized recursively.
 * @param {*} obj - The object, array, or primitive to stabilize.
 * @returns {*} A new object/array with sorted keys, or the original primitive.
 */
export function getStableObject(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    // For arrays, we stabilize each element but preserve the order,
    // as order is significant (e.g., for audio channels).
    if (Array.isArray(obj)) {
        return obj.map(getStableObject);
    }

    const stableObj = {};
    const sortedKeys = Object.keys(obj).sort();
    
    for (const key of sortedKeys) {
        stableObj[key] = getStableObject(obj[key]);
    }
    
    return stableObj;
}

/**
 * Executes a command asynchronously and returns its stdout as an array of strings.
 * This function spawns a subprocess and waits for it to complete.
 *
 * @param {string[]} argv - A list of string arguments for the command.
 * @param {string|null} [input=null] - Optional string to write to the process's `stdin`.
 * @param {Gio.Cancellable|null} [cancellable=null] - Optional cancellable to terminate the process.
 * @throws {Error} Throws an error if the subprocess fails to spawn or exits with a non-zero status.
 * @returns {Promise<string[]>} A promise that resolves with an array of strings (lines)
 *   from stdout (or an empty array if no output).
 */
export async function asyncExecCommandAndReadOutput(argv, input = null, cancellable = null) {
    let cancelId = 0;
    let flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;

    if (input !== null) flags |= Gio.SubprocessFlags.STDIN_PIPE;

    // 1. Setup the Launcher
    const launcher = new Gio.SubprocessLauncher({ flags });
    launcher.setenv("LC_ALL", "C", true);

    // 2. Spawn the actual subprocess
    const subprocess = launcher.spawnv(argv);

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
        
    } finally {
        if (cancelId > 0) cancellable.disconnect(cancelId);
    }
}

/**
 * Executes a command and monitors its stdout stream for continuous output.
 * This is intended for long-running processes.
 * See: https://gjs.guide/guides/gio/subprocesses.html#communicating-with-processes
 * Note: This function prepares a stdin stream but currently provides no mechanism
 * to write to it. It is reserved for future implementation.
 *
 * @param {object} state - The extension state object, used to track the process.
 * @param {Gio.Subprocess|null} subproc - An existing subprocess to use, or null to spawn a new one.
 * @param {string[]} argv - The command and arguments to execute.
 * @param {function(string): void} callback - Callback invoked for each line of output from stdout.
 * @param {Gio.Cancellable|null} [cancellable=null] - Optional cancellable to terminate the process.
 * @throws {Error} Throws an error if the subprocess fails to spawn.
 */
export function execCommandAndMonitor(state, subproc, argv, callback, cancellable = null) {
    let cancelId = 0;
    let flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;

    // 1. Create the Launcher and configure environment
    const launcher = new Gio.SubprocessLauncher({ flags });
    launcher.setenv("LC_ALL", "C", true); // Third param 'true' allows overwriting

    // 2. Spawn the actual subprocess using the launcher
    const subprocess = subproc ? subproc : launcher.spawnv(argv);
    state.addProcess(subprocess);

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
    
    const stdinStream = subprocess.get_stdin_pipe();

    try {
        _readOutput(stdoutStream, stdinStream, callback);
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
 * @param {Gio.OutputStream|null} stdin - The output stream to write to (process stdin). Currently unused.
 * @param {function(string): void} callback - Callback for each line read from stdout.
 * @throws {Error} Throws an error if reading from the stream fails.
 */
function _readOutput(stdout, stdin, callback) {
    stdout.read_line_async(
        GLib.PRIORITY_LOW,
        null,
        (stream, result) => {
            const [line] = stream.read_line_finish_utf8(result);

            if (line !== null) {
                callback(line);

                // Continue reading from the stream
                _readOutput(stdout, stdin, callback);
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
    const commandArray = [
        "pactl", 
        "info"
    ];
    const output = await asyncExecCommandAndReadOutput(commandArray);

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
}

/**
 * Parses the output of `pactl list sinks` (text format) into a JSON-like object structure.
 * This avoids issues where `pactl --format=json` returns null/invalid data for RAOP sinks.
 * @private
 * @param {string[]} lines - The raw text output from `pactl list sinks` as an array of strings.
 * @returns {Array<object>} An array of sink objects.
 */
export function parsePactlListOutput(lines) {
    const sinks = [];
    let currentSink = null;
    let lastKey = null;

    for (const line of lines) {
        const sinkHeaderMatch = line.match(/^Sink #(\d+)$/);
        if (sinkHeaderMatch) {
            if (currentSink) {
                sinks.push(currentSink);
            }
            currentSink = _initializeNewSink(parseInt(sinkHeaderMatch[1], 10));
            lastKey = null;
            continue;
        }

        if (!currentSink) continue;

        const newKey = _parseSinkPropertyLine(line, currentSink, lastKey);
        if (newKey) {
            lastKey = newKey;
        }
    }

    if (currentSink) {
        sinks.push(currentSink);
    }

    return sinks;
}

/**
 * Initializes a new sink object.
 * @private
 * @param {number} index - The sink index.
 * @returns {object} A new sink object.
 */
function _initializeNewSink(index) {
    return {
        index: index,
        volume: {},
        properties: {},
    };
}

/**
 * Parses a single line of a sink's properties by dispatching to level-specific parsers.
 * @private
 * @param {string} line - The line to parse.
 * @param {object} sink - The current sink object being built.
 * @param {string} lastKey - The last parsed level-1 key, used for context.
 * @returns {string|null} The new `lastKey` if a level-1 property was parsed, otherwise null.
 */
function _parseSinkPropertyLine(line, sink, lastKey) {
    const whitespaceMatch = line.match(/^(\s*)(.*)/);
    if (!whitespaceMatch || !whitespaceMatch[2]) {
        return null; // Not a content line
    }

    const indent = whitespaceMatch[1];
    const content = whitespaceMatch[2];
    const level = _getIndentationLevel(indent);

    if (level === 1) {
        return _parseLevel1Property(content, sink);
    } else if (level >= 2 && lastKey) {
        _parseLevel2Property(content, sink, lastKey);
    }

    return null;
}

/**
 * Determines the indentation level of a line based on leading whitespace.
 * @private
 * @param {string} indent - The leading whitespace of a line.
 * @returns {number} The indentation level (0 for no indent, 1 for first level, etc.).
 */
function _getIndentationLevel(indent) {
    // Normalize indentation by replacing tabs with 8 spaces
    // Normalize indentation by replacing tabs with 8 spaces, which is a common
    // terminal default. This makes parsing robust for both space and tab indentation.
    const normalizedIndent = indent.replace(/\t/g, ' '.repeat(8));
    const level = Math.floor(normalizedIndent.length / 8);
    // A non-zero indent that is less than a full level should still count as level 1.
    return (level === 0 && normalizedIndent.length > 0) ? 1 : level;
}

/**
 * Parses a level-1 property (e.g., "Name: My Sink").
 * @private
 * @param {string} content - The line content after indentation.
 * @param {object} sink - The sink object to populate.
 * @returns {string|null} The parsed key, or null if not a valid property line.
 */
function _parseLevel1Property(content, sink) {
    const separatorIndex = content.indexOf(':');
    if (separatorIndex === -1) return null;

    const rawKey = content.substring(0, separatorIndex).trim();
    const value = content.substring(separatorIndex + 1).trim();
    const key = rawKey.toLowerCase().replace(/\s+/g, '_');

    switch (key) {
        case 'volume':
            _parseVolumeFromText(value, sink);
            break;
        case 'base_volume':
            sink.base_volume = _parseSingleVolume(value);
            break;
        case 'mute':
            sink.mute = (value === 'yes');
            break;
        case 'owner_module':
            sink.owner_module = parseInt(value, 10);
            break;
        default:
            if (value) {
                sink[key] = value;
            } else {
                // Prepare for nested properties (e.g., Properties:, Formats:)
                if (key === 'formats') sink[key] = [];
                else if (!sink[key]) sink[key] = {};
            }
    }
    return key;
}

/**
 * Parses a level-2 property (e.g., a line inside "Properties:").
 * @private
 * @param {string} content - The line content after indentation.
 * @param {object} sink - The sink object to populate.
 * @param {string} lastKey - The parent key (e.g., "properties").
 */
function _parseLevel2Property(content, sink, lastKey) {
    // Parse balance
    if (lastKey === 'volume') {
        const balanceMatch = content.match(/^balance\s+([\d.]+)$/);
        if (balanceMatch) {
            // In the text output, 'balance' is indented under 'Volume'.
            // However, in the JSON output, 'balance' is a top-level property
            // on the sink object, so we assign it there to maintain consistency.
            sink.balance = parseFloat(balanceMatch[1]);
        }
    } else if (lastKey === 'properties') {
        const propMatch = content.match(/^([a-z0-9._-]+)\s=\s"(.*)"$/);
        if (propMatch) {
            sink.properties[propMatch[1]] = propMatch[2];
        }
    } else if (lastKey === 'formats') {
        if (Array.isArray(sink.formats)) {
            sink.formats.push(content);
        }
    }
}

/**
 * Helper to parse a single-value volume string (e.g., from Base Volume).
 * @private
 * @param {string} valueString - The volume string to parse.
 * @returns {object|string} A volume object or the original string if parsing fails.
 */
function _parseSingleVolume(valueString) {
    // Parse volume string
    // Format: 65536 / 100% / 0.00 dB (dB part is optional)
    // Also handles pulseaudio: 65536 / 100%
    const vMatch = valueString.match(/^(\d+)\s+\/\s+(\d+%)(?:\s+\/\s+(.*))?$/);
    if (vMatch) {
        return {
            value: parseInt(vMatch[1], 10),
            value_percent: vMatch[2],
            db: vMatch[3] || null
        };
    }
    return valueString; // Fallback to original string
}


/**
 * Helper to parse the text volume string into the sink object.
 * @private
 * @param {string} volumeString - The value part of the Volume line.
 * @param {object} sink - The sink object to populate.
 */
function _parseVolumeFromText(volumeString, sink) {
    const channels = volumeString.split(',').map(s => s.trim());
    for (const channelStr of channels) {
        const vMatch = channelStr.match(/^([^:]+):\s+(\d+)\s+\/\s+(\d+%)(?:\s+\/\s+(.*))?$/);
        if (vMatch) {
            sink.volume[vMatch[1]] = {
                value: parseInt(vMatch[2], 10),
                value_percent: vMatch[3],
                db: vMatch[4] || null
            };
        }
    }
}