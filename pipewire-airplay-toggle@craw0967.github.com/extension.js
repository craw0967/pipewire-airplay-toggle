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
import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";

import {
    Extension,
    gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";

import { logErr } from "./functions/logging.js";
import {
    INDICATOR_TEXT,
    INDICATOR_ICON_MAP
} from "./constants/config.js";

const AirPlayToggle = GObject.registerClass(
    class AirPlayToggle extends QuickSettings.QuickToggle {
        _pipewireInstalled;
        _raopModuleId;
        _monitorProcess;

        _init(extensionObject) {
            this._settings = extensionObject.getSettings();

            super._init({
                title: _(INDICATOR_TEXT),
                toggleMode: false,
            });

            this._setInitialState();

            this.connect("clicked", () => {
                if (this._pipewireInstalled && this._raopModuleId) {
                    this._toggleAirPlay();
                } else {
                    Main.notify(
                        _("PipeWire or pipewire-zeroconf package not found"),
                        _(
                            "PipeWire and pipewire-zeroconf are required by this extension. " +
                                "Please review the implications of installing these packages and install them to use this extension. " +
                                "If you do not want to install these packages, you may wish to uninstall this extension."
                        )
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
        async _confirmPipeWireInstalled() {
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

                return pipewireInstalled;
            } catch (err) {
                logErr(err, this._settings?.get_boolean("show-debug"));
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

                    if (filtered && filtered.length > 0) {
                        this._raopModuleId = filtered[0]
                            ? filtered[0].split("\t")[0]
                            : null;
                        moduleLoaded = true;
                    }
                }

                return moduleLoaded;
            } catch (err) {
                logErr(err, this._settings?.get_boolean("show-debug"));
            }
        }

        async _toggleAirPlay() {
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
                logErr(err, this._settings?.get_boolean("show-debug"));
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
                        logErr(err, this._settings?.get_boolean("show-debug"));
                    }
                }
            );
        }
    }
);

const AirPlayIndicator = GObject.registerClass(
    class AirPlayIndicator extends QuickSettings.SystemIndicator {
        _init(extensionObject) {
            super._init();

            this._indicator = this._addIndicator();
            this._toggle = new AirPlayToggle(extensionObject);

            this._extensionObject = extensionObject;
            this._settings = this._extensionObject.getSettings();
            
            this._setIndicatorIcon();
            this._setIndicatorIconVisibility()
            this._connectSettings();

            this.quickSettingsItems.push(this._toggle);
        }

        _getIcon(iconName) {
            const iconFile = Gio.File.new_for_path(this._extensionObject.dir.get_child("icons").get_path() + "/" +iconName);
            const icon = Gio.FileIcon.new(iconFile);
            
            return icon;
        };

        _setIndicatorIcon() {
            this._iconName = this._settings?.get_string("indicator-icon")?.length > 0 ? INDICATOR_ICON_MAP[this._settings.get_string("indicator-icon")] : INDICATOR_ICON_MAP["option0"];
            this._indicator.gicon = this._getIcon(this._iconName);
            this._toggle.gicon = this._getIcon(this._iconName);
        }

        _setIndicatorIconVisibility() {
            const showIndicator = this._settings.get_boolean("show-indicator");
            if (showIndicator === true) {
                if (!this._binding) {
                    this._binding = this._toggle.bind_property(
                        "checked",
                        this._indicator,
                        "visible",
                        GObject.BindingFlags.SYNC_CREATE
                    );
                }
            } else {
                if (this._binding) {
                    this._binding.unbind();
                    this._binding = null;
                }
                this._indicator.visible = false;
            }
        }

        _connectSettings() {
            this._settings.connect(
                "changed::indicator-icon",
                () => {
                    this._setIndicatorIcon();
                }
            );

            this._settings.connect(
                "changed::show-indicator",
                () => {
                    this._setIndicatorIconVisibility();
                }
            );
        }
    }
);

export default class PipeWireAirPlayToggleExtension extends Extension {
    enable() {
        this._indicator = new AirPlayIndicator(this);
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
        this._indicator?.destroy();
        delete this._indicator;
        this._settings = null;
    }
}