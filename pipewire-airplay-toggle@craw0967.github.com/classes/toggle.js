import GObject from "gi://GObject";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

import { logErr } from "../functions/logs.js";
import { asyncExecCommandAndReadOutput, execCommandAndMonitor} from "../functions/utils.js";
import { 
    INDICATOR_TEXT,
    PW_MISSING_TITLE,
    PW_MISSING_BODY
} from "../constants/config.js";

/** Class representing a QuickSettings Quick Toggle */
export const AirPlayToggle = GObject.registerClass(
    class AirPlayToggle extends QuickSettings.QuickToggle {
        _supportedAudioServerInstalled;
        _currentAudioServer;
        _raopModuleId;
        _monitorProcess;

        /**
         * Initialize the AirPlayToggle class.
         * 
         * @param {Extension} extensionObject - An instance of the default extension class.
         */
        constructor(extensionObject) {
            super({
                title: _(INDICATOR_TEXT),
                toggleMode: false,
            });
            
            this._extensionObject = extensionObject;
            this._setInitialState();
            this._connectToggle();
        }

        /***
         * Initialize the state of the toggle by checking if dependencies are available and setting up event monitoring. 
         */ 
        async _setInitialState() {
            this._supportedAudioServerInstalled = await this._confirmsupportedAudioServerInstalled();

            if (this._supportedAudioServerInstalled) {
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

        /***
         * Connects the toggle button to its click event handler.
         * When clicked, the toggle button will attempt to toggle the RAOP (AirPlay) module.
         */
        _connectToggle() {
            this.connect("clicked", () => {
                if (this._supportedAudioServerInstalled && this._raopModuleId) {
                    this._toggleAirPlay();
                } else {
                    Main.notify(
                        _(PW_MISSING_TITLE),
                        _(PW_MISSING_BODY)
                    );
                }
            });
        }
        
        /***
         * Checks if PipeWire or PulseAudio is installed.
         * 
         * @returns {Promise<boolean>} A promise that resolves to true if PipeWire or PulseAudio is installed, false otherwise.
         */
        async _confirmsupportedAudioServerInstalled() {
            try {
                let supportedAudioServerInstalled = false;

                const commandArray = ["pactl", "info"];
                const output = await asyncExecCommandAndReadOutput(
                    commandArray,
                    null,
                    null
                );

                if (output && output.length > 0) {
                    const filtered = output.filter((line) => {
                        return line.toLowerCase().includes("pipewire") || line.toLowerCase().includes("pulseaudio");
                    });
                    supportedAudioServerInstalled = filtered.length > 0;

                    if(supportedAudioServerInstalled) {
                        this._currentAudioServer = filtered[0].toLowerCase().includes("pipewire") ? "pipewire" : "pulseaudio";
                    }
                }

                return supportedAudioServerInstalled;
            } catch (err) {
                logErr(err, this._extensionObject.settings?.get_boolean("show-debug"));

                return false;
            }
        }

        /***
         * Tries to get the ID of the RAOP (AirPlay) module and stores it if available.
         * 
         * @returns {Promise<boolean>} A boolean indicating whether the module ID was found.
         */
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

                return false;
            }
        }

        /***
         * Toggles the state of the RAOP (AirPlay) module by loading or unloading it.
         */
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

                    switch (this._currentAudioServer) {
                        case "pipewire":
                            this._raopModuleId =
                                !this._raopModuleId &&
                                output &&
                                output.length > 0 &&
                                output[0].length > 0
                                    ? output[0]
                                    : this._raopModuleId;
                            break;
                        case "pulseaudio":
                            this._raopModuleId =
                                output &&
                                output.length > 0
                                    ? output
                                    : this._raopModuleId;
                            break;
                        default:
                            break;
                    }
                    
                }
            } catch (err) {
                logErr(err, this._extensionObject.settings?.get_boolean("show-debug"));
            }
        }

        /***
         * Sets up a process to monitor PipeWire and/or PulseAudio module events and reads the output of the process to 
         * determine when the RAOP module is loaded or unloaded.
         */
        _monitorModuleEvents() {
            const command = ["pactl", "subscribe"];
            
            execCommandAndMonitor(this._monitorProcess, command, true, (line) => {
                // Process the output to determine when a module is loaded or unloaded
                if (
                    line.includes('module')
                ) {
                    switch (this._currentAudioServer) {
                        case "pipewire":
                            this._processModuleEvent(line);
                            break;
                        case "pulseaudio":
                            this._getRaopModuleId().then(() => {
                                this._processModuleEvent(line);
                            })
                            break;
                        default:
                            break;
                    }
                }
            }, null, null);
        }

        /***
         * Processes a line of output from the PipeWire and/or PulseAudio module event monitoring process.
         * Determines when the RAOP module is loaded or unloaded by checking for the presence of the module ID in the line.
         * If the module ID is present, sets the 'checked' property to true if the line indicates the module is loaded and false if unloaded.
         * @param {string} line - The line of output from the PipeWire and/or PulseAudio module event monitoring process.
         */
        _processModuleEvent(line) {
            if(this._raopModuleId &&
                line.includes(this._raopModuleId)
            ) {
                if(line.includes("removed")) {
                    this.checked = false;
                } else if(line.includes("new")){
                    this.checked = true;
                }
            }
        }
    }
);