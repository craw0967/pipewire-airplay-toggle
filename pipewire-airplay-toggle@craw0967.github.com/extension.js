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

import * as Main from "resource:///org/gnome/shell/ui/main.js";

import {
    Extension,
    gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";
import {
    QuickToggle,
    SystemIndicator,
} from "resource:///org/gnome/shell/ui/quickSettings.js";

const ENVIRON = GLib.environ_setenv(GLib.get_environ(), "LANG", "C", true);
const INDICATOR_ICON = "audio-x-generic-symbolic"; //'waves-and-screen-symbolic';
const INDICATOR_TEXT = "Airplay Speakers";

const AirplayToggle = GObject.registerClass(
    class AirplayToggle extends QuickToggle {
        _raopModuleId;
        _monitorProcess;

        constructor() {
            super({
                title: _(INDICATOR_TEXT),
                iconName: INDICATOR_ICON,
                toggleMode: false,
            });

            const pipewireInstalled = this._confirmPipewireInstalled();

            if (pipewireInstalled) {
                this.checked = this._isModuleLoaded();

                // We need the module ID to monitor events related to the module
                // If the module wasn't loaded when the extension was initialized, we won't have the module ID
                // Toggle the module on and off to get the module ID. Do this before we start monitoring events
                if (!this._raopModuleId) {
                    // Ensure the 'checked' property is set to false so that _toggleAirplay() will load the module
                    this.checked = false;
                    this._toggleAirplay();

                    // Set the 'checked' property to true so that _toggleAirplay() will unload the module
                    this.checked = true;
                    this._toggleAirplay();

                    // Set the 'checked' property back to false
                    this.checked = false;
                }

                this._monitorModuleEvents();

                this.connect("clicked", () => {
                    this._toggleAirplay();
                });
            }
        }

        runCommandAndConfirmOutput(commandArray) {
            let [result, out, err, exit_code] = GLib.spawn_sync(
                null,
                commandArray,
                ENVIRON,
                GLib.SpawnFlags.SEARCH_PATH,
                null
            );

            if ((!err || err.length === 0) && out) {
                let lines =
                    out instanceof Uint8Array
                        ? new TextDecoder().decode(out).split("\n")
                        : out.toString().split("\n");

                return lines;
            }

            if (err && err.length > 0) {
                console.error(
                    "Error running command '" +
                        commandArray.join(" ") +
                        "': " +
                        err
                );
                return false;
            }

            return null;
        }

        _confirmPipewireInstalled() {
            let pipewireInstalled = false;
            let output = this.runCommandAndConfirmOutput(["pactl", "info"]);

            if (output && output.length > 0) {
                output = output.filter((output) => output.includes("PipeWire"));

                pipewireInstalled = output.length > 0;
            }

            // If output is false, the command failed and an error message was previously presented to user.
            // Only show error message if PipeWire is not installed and command did not fail.
            if (!pipewireInstalled && output !== false) {
                Main.notify(
                    "Error",
                    "PipeWire is not installed. The pipewire-airplay-toggle extension will not work."
                );
            }

            return pipewireInstalled;
        }

        _isModuleLoaded() {
            let moduleLoaded = false;
            let output = this.runCommandAndConfirmOutput([
                "pactl",
                "list",
                "modules",
                "short",
            ]);

            if (output && output.length > 0) {
                output = output.filter((output) =>
                    output.includes("module-raop-discover")
                );

                this._raopModuleId =
                    output && output.length > 0
                        ? output[0].split("\t")[0]
                        : null;
                moduleLoaded = output.length > 0;
            }

            return moduleLoaded;
        }

        _toggleAirplay() {
            const commandArray = [
                "pactl",
                this.checked ? "unload-module" : "load-module",
                "module-raop-discover",
            ];
            const output = this.runCommandAndConfirmOutput(commandArray);

            if (output && output.length > 0) {
                this._raopModuleId =
                    !this._raopModuleId &&
                    output &&
                    output.length > 0 &&
                    output[0].length > 0
                        ? output[0]
                        : this._raopModuleId;
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

export default class QuickSettingsExampleExtension extends Extension {
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