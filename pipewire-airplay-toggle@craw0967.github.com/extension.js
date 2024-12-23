/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Gio from "gi://Gio";

/* Gio.Subprocess */
Gio._promisify(Gio.Subprocess.prototype, "communicate_utf8_async");

/* Ancillary Methods */
Gio._promisify(
    Gio.DataInputStream.prototype,
    "read_line_async",
    "read_line_finish_utf8"
);

import * as Main from "resource:///org/gnome/shell/ui/main.js";

import {
    Extension,
    gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";
import {
    QuickToggle,
    SystemIndicator,
} from "resource:///org/gnome/shell/ui/quickSettings.js";

const INDICATOR_ICON = "audio-x-generic-symbolic"; //'waves-and-screen-symbolic';
const INDICATOR_TEXT = "Airplay Speakers";

const AirplayToggle = GObject.registerClass(
    class AirplayToggle extends QuickToggle {
        _pipewireInstalled;
        _raopModuleId;
        _monitorProcess;

        constructor() {
            super({
                title: _(INDICATOR_TEXT),
                iconName: INDICATOR_ICON,
                toggleMode: false,
            });

            this._confirmPipeWireInstalledAndInitialize();

            this.connect("clicked", () => {
                if(this._pipewireInstalled && this._raopModuleId) {
                    this._toggleAirplay();
                } else {
                    Main.notify(
                        _("PipeWire or pipewire-zeroconf package not found"),
                        _("PipeWire and pipewire-zeroconf are required by this extension.") +
                            _("Please review the implications of installing these packages and install them to use this extension.") +
                            _("If you do not want to install these packages, you can uninstall this extension.")
                    );
                }
            });
        }

        async execCommandAndReadOutput(argv, input = null, cancellable = null) {
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
                            : `Command '${argv}' failed with exit code ${status}`
                    });
                }

                const out = stdout ? stdout.trim() : stdout;

                const output =
                    out && out instanceof Uint8Array
                        ? new TextDecoder().decode(out).split("\n")
                        : out.toString().split("\n");

                return output;
            } catch (e) {
                console.error(e);
            } finally {
                if (cancelId > 0) cancellable.disconnect(cancelId);
            }
        }

        async _confirmPipeWireInstalledAndInitialize() {
            try {
                let pipewireInstalled = false;

                const commandArray = ["pactl", "info"];
                const output = await this.execCommandAndReadOutput(
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

                if (pipewireInstalled) {
                    this._pipewireInstalled = true;
                    this._getRaopModuleId();
                }
            } catch (err) {
                console.error("Error reading output: " + err);
            }
        }

        async _getRaopModuleId() {
            try {
                let moduleLoaded = false;

                const commandArray = ["pactl", "list", "modules", "short"];
                const output = await this.execCommandAndReadOutput(
                    commandArray,
                    null,
                    null
                );

                if (output && output.length > 0) {
                    const filtered = output.filter((line) =>
                        line.includes("module-raop-discover")
                    );

                    this._raopModuleId =
                        filtered && filtered.length > 0
                            ? filtered[0].split("\t")[0]
                            : null;
                    moduleLoaded = filtered.length > 0;
                }

                if (moduleLoaded) {
                    this.checked = true;
                } else {
                    // We need the module ID to monitor events related to the module
                    // If the module wasn't loaded when the extension was initialized, we won't have the module ID
                    // Toggle the module on and off to get the module ID. Do this before we start monitoring events

                    // Ensure the 'checked' property is set to false so that _toggleAirplay() will load the module
                    this.checked = false;
                    await this._toggleAirplay();

                    // Set the 'checked' property to true so that _toggleAirplay() will unload the module
                    this.checked = true;
                    await this._toggleAirplay();

                    // Set the 'checked' property back to false
                    this.checked = false;
                }

                this._monitorModuleEvents();
            } catch (err) {
                console.error("Error reading output: " + err);
            }
        }

        async _toggleAirplay() {
            try {
                const commandArray = [
                    "pactl",
                    this.checked ? "unload-module" : "load-module",
                    "module-raop-discover",
                ];
                const output = await this.execCommandAndReadOutput(
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
                console.error("Error reading output: " + err);
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
                        console.error("Error reading output: " + err);
                    }
                }
            );
        }
    }
);

const AirplayIndicator = GObject.registerClass(
    class AirplayIndicator extends SystemIndicator {
        constructor() {
            super();

            this._indicator = this._addIndicator();
            this._indicator.iconName = INDICATOR_ICON;

            const toggle = new AirplayToggle();
            toggle.bind_property(
                "checked",
                this._indicator,
                "visible",
                GObject.BindingFlags.SYNC_CREATE
            );
            this.quickSettingsItems.push(toggle);
        }
    }
);

export default class PipeWireAirplayToggleExtension extends Extension {
    enable() {
        this._indicator = new AirplayIndicator();
        Main.panel.statusArea.quickSettings.addExternalIndicator(
            this._indicator
        );
    }

    disable() {
        this._indicator.quickSettingsItems.forEach((item) => {
            if (item._monitorProcess) {
                item._monitorProcess.force_exit();
            }

            item._monitorProcess = null;
            item._raopModuleId = null;

            item.destroy();
        });
        this._indicator.destroy();
        delete this._indicator;
    }
}