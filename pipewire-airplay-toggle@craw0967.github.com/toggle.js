import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
Gio._promisify(
    Gio.DataInputStream.prototype,
    "read_line_async",
    "read_line_finish_utf8"
);

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

import { logErr } from "./functions/logs.js";
import { asyncExecCommandAndReadOutput } from "./functions/utils.js";
import { 
    INDICATOR_TEXT,
    PW_MISSING_TITLE,
    PW_MISSING_BODY
} from "./constants/config.js";

export const AirPlayToggle = GObject.registerClass(
    class AirPlayToggle extends QuickSettings.QuickToggle {
        _pipewireInstalled;
        _raopModuleId;
        _monitorProcess;

        _init(extensionObject) {
            super._init({
                title: _(INDICATOR_TEXT),
                toggleMode: false,
            });
            
            this._extensionObject = extensionObject;
            this._setInitialState();
            this._connectToggle();
        }

        async _setInitialState() {
            this._pipewireInstalled = await this._confirmPipeWireInstalled();

            if (this._pipewireInstalled) {
                let moduleLoaded = await this._getRaopModuleId();

                if (moduleLoaded) {
                    this.checked = true;
                } else {
                    // We need the module ID to monitor events related to the module
                    // If the module wasn't loaded when the extension was initialized, we won't have the module ID
                    // Toggle the module on and off to get the module ID. Do this before we start monitoring events

                    // Ensure the 'checked' property is set to false so that _toggleAirPlay() will load the module
                    this.checked = false;
                    await this._toggleAirPlay();

                    // Set the 'checked' property to true so that _toggleAirPlay() will unload the module
                    this.checked = true;
                    await this._toggleAirPlay();

                    // Set the 'checked' property back to false
                    this.checked = false;
                }

                this._monitorModuleEvents();
            }
        }

        _connectToggle() {
            this.connect("clicked", () => {
                if (this._pipewireInstalled && this._raopModuleId) {
                    this._toggleAirPlay();
                } else {
                    Main.notify(
                        _(PW_MISSING_TITLE),
                        _(PW_MISSING_BODY)
                    );
                }
            });
        }
        
        async _confirmPipeWireInstalled() {
            try {
                let pipewireInstalled = false;

                const commandArray = ["pactl", "info"];
                const output = await asyncExecCommandAndReadOutput(
                    commandArray,
                    null,
                    null
                );

                if (output && output.length > 0) {
                    const filtered = output.filter((line) =>
                        line.includes("PipeWire")
                    );
                    pipewireInstalled = filtered.length > 0;
                }

                return pipewireInstalled;
            } catch (err) {
                logErr(err, this._extensionObject.settings?.get_boolean("show-debug"));
            }
        }

        async _getRaopModuleId() {
            try {
                let moduleLoaded = false;

                const commandArray = ["pactl", "list", "modules", "short"];
                const output = await asyncExecCommandAndReadOutput(
                    commandArray,
                    null,
                    null
                );

                if (output && output.length > 0) {
                    const filtered = output.filter((line) =>
                        line.includes("module-raop-discover")
                    );

                    if (filtered && filtered.length > 0) {
                        this._raopModuleId = filtered[0]
                            ? filtered[0].split("\t")[0]
                            : null;
                        moduleLoaded = true;
                    }
                }

                return moduleLoaded;
            } catch (err) {
                logErr(err, this._extensionObject.settings?.get_boolean("show-debug"));
            }
        }

        async _toggleAirPlay() {
            try {
                const commandArray = [
                    "pactl",
                    this.checked ? "unload-module" : "load-module",
                    "module-raop-discover",
                ];
                const output = await asyncExecCommandAndReadOutput(
                    commandArray,
                    null,
                    null
                );

                if (output && output.length > 0) {
                    this._raopModuleId =
                        !this._raopModuleId &&
                        output &&
                        output.length > 0 &&
                        output[0].length > 0
                            ? output[0]
                            : this._raopModuleId;
                }
            } catch (err) {
                logErr(err, this._extensionObject.settings?.get_boolean("show-debug"));
            }
        }

        _monitorModuleEvents() {
            const command = ["pactl", "subscribe", "events=module"];
            this._monitorProcess = Gio.Subprocess.new(
                command,
                Gio.SubprocessFlags.STDOUT_PIPE
            );

            const stdout = this._monitorProcess.get_stdout_pipe();
            const stdoutStream = new Gio.DataInputStream({
                base_stream: stdout,
                close_base_stream: true,
            });

            this._readOutput(stdoutStream);
        }

        _readOutput(stdout) {
            stdout.read_line_async(
                GLib.PRIORITY_LOW,
                null,
                (stream, result) => {
                    try {
                        const [line] = stream.read_line_finish_utf8(result);

                        if (line !== null) {
                            // Process the output to determine when a module is loaded or unloaded
                            if (
                                this._raopModuleId &&
                                line.includes(this._raopModuleId)
                            ) {
                                if (line.includes("remove")) {
                                    this.checked = false;
                                }
                                if (line.includes("new")) {
                                    this.checked = true;
                                }
                            }

                            // Continue reading from the stream
                            this._readOutput(stdout);
                        }
                    } catch (err) {
                        logErr(err, this._extensionObject.settings?.get_boolean("show-debug"));
                    }
                }
            );
        }
    }
);