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
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import {QuickToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';

const ENVIRON = GLib.environ_setenv(GLib.get_environ(), "LANG", "C", true);

const INDICATOR_ICON = 'audio-x-generic-symbolic'; //'waves-and-screen-symbolic';
const INDICATOR_TEXT = 'Airplay Speakers';

let raopModuleId = null;
let raopModuleLoaded = false;
let monitorProcess;

const runCommandAndConfirmOutput = function runCommandAndConfirmOutput(commandArray, expectedOutput, callback) {
    let [result, out, err, exit_code] = GLib.spawn_sync(null, commandArray, ENVIRON, GLib.SpawnFlags.SEARCH_PATH, null);

    if (expectedOutput && (!err || err.length === 0) && out && out.length > 0) {
        let lines = out instanceof Uint8Array ? new TextDecoder().decode(out).split("\n") : out.toString().split("\n");
        lines = lines.filter(line => line.includes(expectedOutput));

        if(lines && lines.length > 0 && callback) {
            callback(lines);
        }
        return lines.length > 0;
    }

    if (!expectedOutput && (!err || err.length === 0)) {
        let lines = out instanceof Uint8Array ? new TextDecoder().decode(out).split("\n") : out.toString().split("\n");
        if(lines && lines.length > 0 && callback) {
            callback(lines);
        }
        return true;
    }

    if (err && err.length > 0) {
        console.error('Error running command \'' + commandArray.join(' ') + '\': ' + err);
        Main.notify('Error', 'Error running command \'' + commandArray.join(' ') + '\': ' + err);
        return false;
    }
}

const confirmPipewireInstalled = function confirmPipewireInstalled() {
    const pipewireInstalled = runCommandAndConfirmOutput(['pactl', 'info'], 'PipeWire');

    if (!pipewireInstalled) {
        console.error('PipeWire is not installed.');
        Main.notify('Error', 'PipeWire is not installed.');
        return false;
    }

    return true;
}

const getModuleStatus = function getModuleStatus() {
    return runCommandAndConfirmOutput(['pactl', 'list', 'modules', 'short'], 'module-raop-discover', function(lines) {
        raopModuleId = lines[0].split('\t')[0];
    });
}

const toggleAirplay = function toggleAirplay(initialize) {
    const commandArray = ['pactl', raopModuleLoaded ? 'unload-module' : 'load-module', 'module-raop-discover'];
    const success = runCommandAndConfirmOutput(commandArray, null, function(lines) {
        raopModuleId = !raopModuleId && lines && lines.length > 0 && lines[0].length > 0 ? lines[0]: raopModuleId;
        if(initialize) {
            raopModuleLoaded = true;
            toggleAirplay(false);
            raopModuleLoaded = false;
        }
    });
}

const AirplayToggle = GObject.registerClass(
class AirplayToggle extends QuickToggle {
    constructor() {
        super({
            title: _(INDICATOR_TEXT),
            iconName: INDICATOR_ICON,
            toggleMode: false,
            checked: raopModuleId !== null ? true : false
        });
    }
});

const AirplayIndicator = GObject.registerClass(
class AirplayIndicator extends SystemIndicator {
    constructor() {
        super();

        this._indicator = this._addIndicator();
        this._indicator.iconName = INDICATOR_ICON;

        const toggle = new AirplayToggle();
        toggle.bind_property('checked',
            this._indicator, 'visible',
            GObject.BindingFlags.SYNC_CREATE);
        this.quickSettingsItems.push(toggle);

        toggle.connect('clicked', () => {
            toggleAirplay(false);
        });

        if(!raopModuleId) {
            //toggle the module on and off to get the module id
            toggleAirplay(true);
            toggle.checked = false;
        }

        this.monitorModuleEvents(function() {
            toggle.checked = raopModuleLoaded;
        });
    }
    
    monitorModuleEvents(callback) {
      const command = ['pactl', 'subscribe', 'events=module'];
      monitorProcess = Gio.Subprocess.new(command, Gio.SubprocessFlags.STDOUT_PIPE);
    
      const stdout = monitorProcess.get_stdout_pipe();
      const stdoutStream = new Gio.DataInputStream({
        base_stream: stdout,
        close_base_stream: true,
      });
    
      this.readOutput(stdoutStream, callback);
    }

    readOutput(stdout, callback) {
        stdout.read_line_async(GLib.PRIORITY_LOW, null, (stream, result) => {
            try {
              const [line] = stream.read_line_finish_utf8(result);
        
              if (line !== null) {
                
                // Process the output to determine when a module is loaded or unloaded
                if (raopModuleId && line.includes(raopModuleId)) {
                    console.log(`Module event: ${line}`);
                    if(line.includes('remove')) {
                        raopModuleLoaded = false;
                    }
                    if(line.includes('new')) {
                        raopModuleLoaded = true;
                    }
                    callback();
                }
                
                // Continue reading from the stream
                this.readOutput(stdout, callback);
              }
            } catch (e) {
              logError(e);
            }
        });
    }
});

export default class QuickSettingsExampleExtension extends Extension {
    enable() {
        if(!confirmPipewireInstalled()) {
            return;
        }
        raopModuleLoaded = getModuleStatus();

        this._indicator = new AirplayIndicator();
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        raopModuleId = null;
        raopModuleLoaded = false;
        monitorProcess.force_exit();
        this._indicator.quickSettingsItems.forEach(item => item.destroy());
        this._indicator.destroy();
    }
}
