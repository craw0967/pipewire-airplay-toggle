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
            this._loggingEnabled = this._extensionObject.settings?.get_boolean("show-debug");
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
                    this._loggingEnabled,
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
                        this._setAudioServer();
                    }
                }

                return supportedAudioServerInstalled;
            } catch (err) {
                logErr(err, this._loggingEnabled);

                return false;
            }
        }

        /***
         * Sets the current audio server.
         * 
         * If no supported audio server installed, default settings to pipewire.
         */
        _setAudioServer() {
            if(this._currentAudioServer && this._extensionObject.settings.get_string("audio-server") !== this._currentAudioServer) {
                this._extensionObject.settings.set_string("audio-server", this._currentAudioServer);
                
            } else if (!this._supportedAudioServerInstalled || !this._currentAudioServer) {
                this._extensionObject.settings.set_string("audio-server", "pipewire");

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
                    this._loggingEnabled,
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
                logErr(err, this._loggingEnabled);

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
                let output = await asyncExecCommandAndReadOutput(
                    commandArray,
                    this._loggingEnabled,
                    null,
                    null
                );
                
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
                    case "pulseaudio": // TODO - Add documentation around pulseaudio use - pulseaudio support requires avahi, pulseaudio-zeroconf (might be pulseaudio-module-raop on ubuntu), and pulseaudio-rtp
                        this._raopModuleId =
                            output &&
                            output.length > 0 &&
                            output[0].length > 0
                                ? output
                                : this._raopModuleId;
                        break;
                    default:
                        break;
                }
                
            } catch (err) {
                logErr(err, this.loggingEnabled);
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
                                if(this.checked) {
                                    this._removeDuplicateRaopSinks();
                                }
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
         * 
         * @param {string} line - The line of output from the PipeWire and/or PulseAudio module event monitoring process.
         */
        _processModuleEvent(line) {
            if(this._raopModuleId &&
                line.includes(this._raopModuleId)
            ) {
                if(line.includes("remove")) {
                    this.checked = false;
                }
                if(line.includes("new")){
                    this.checked = true;
                }
            }
        }

        /***
         * This method is for PulseAudio and shouldn't be necessary for PipeWire
         * Removes duplicate RAOP sink visibility by unloading the duplicate module IDs.
         * 
         * This method can possibly cause a very temporary slowdown in UI responsiveness while unloading raop sink modules if there are a lot of duplicate raop outputs/sinks or the computer is slow.
         * Instead of unloading duplicate sinks, Users can prevent duplicates by using PipeWire, by disabling ipv6 networking, or by disabling ipv6 in avahi.
         */
        async _removeDuplicateRaopSinks() {
            // TODO - finish adding this user setting
            if(!this._extensionObject.settings?.get_boolean("hide-duplicate-raop-sinks")) {
                return;
            }
            
            const command = [
                "pactl",
                "list",
                "sinks"
            ];
            
            try {
                const output = await asyncExecCommandAndReadOutput(
                    command,
                    this._loggingEnabled,
                    null,
                    null
                );
                if(output && output.length > 0) {
                    let ownerMap = this._mapRaopOwnerModuleIds(output);
                    let duplicateModuleIds = this._determineDuplicateOwnerModuleIds(ownerMap);
                    
                    if(duplicateModuleIds?.length > 0) {
                        for(let moduleId of duplicateModuleIds) {
                            this._asyncExecCommandAndUnloadModule(moduleId);
                        }
                    }
                    
                }
            } catch (error) {
                logErr(error, this._loggingEnabled);
            }
        }

        /***
         * This method takes the output of 'pactl list sinks' and maps the owner module IDs of any RAOP sinks/outputs to their corresponding names.
         * 
         * @param {string[]} output - The output of 'pactl list sinks'
         * @returns {Map<string, Set<string>>} A map of sink/output names to their corresponding module IDs.
         */
        _mapRaopOwnerModuleIds(output) {
            let name = null;
            let ownerModuleId = null;
            let ownerMap = {};

            for(let line of output) {
                // Reset if we reach a new Sink
                if(line.startsWith('Sink #')) {
                    name = null;
                    ownerModuleId = null;
                }
                
                if(line.includes('Name:')) {
                    name = line.split(': ')[1];
                }
                if(line.includes('Owner Module:')) {
                    ownerModuleId = line.split(': ')[1];
                }
                
                if(name && name.includes('raop') && ownerModuleId) {
                    if(!ownerMap[name]) {
                        // The output is frequently returned multiple times (TODO - determine if this is normal and fix if it isn't)
                        // Store data in a Set so we can easily ensure each ID is always unique
                        ownerMap[name] = new Set([ownerModuleId]);
                    } else {
                        ownerMap[name].add(ownerModuleId);
                    }
                    
                    //Stop processing module ids until we reach the next sink/output
                    name = null;
                    ownerModuleId = null;
                }
            }

            return ownerMap;
        }

        /**
         * Determines the owner module IDs of duplicated RAOP sinks/outputs from the given ownerMap.
         * 
         * @param {Map<string, Set<string>>} ownerMap - A map of RAOP sink/output names to their corresponding owner module IDs.
         * @returns {string[]} An array of duplicate RAOP sinks/outputs owner module IDs.
         */
        _determineDuplicateOwnerModuleIds(ownerMap) {
            let duplicateModuleIds = [];

            // I was using ownerMap.size here and checking if it was equal to 0, however for unknown reasons, 
            // it was outputting 'undefined' even though ownerMap is in scope and can be read. 
            // This would lead to false positives, so I changed to checking if the length of the keyset array is greater than 0
            if(ownerMap && Object.keys(ownerMap).length > 0) { 
                let dedupOwnerMap = {};
                const sortedArray = Object.keys(ownerMap).sort((a, b) => {
                    return a.localeCompare(b);
                });
                
                for(let i = 0; i < sortedArray.length; i++) {
                    let name = sortedArray[i];
                    let nextIndex = i + 1;
                    
                    if(!dedupOwnerMap[name]) {
                        dedupOwnerMap[name] = ownerMap[name];
                    }
                    
                    if(sortedArray[nextIndex] && sortedArray[nextIndex].startsWith(name)) {
                        dedupOwnerMap[name].add(...ownerMap[sortedArray[nextIndex]]);
                        sortedArray.splice(nextIndex, 1);
                        i--;
                    }
                }
                
                for (let key of Object.keys(dedupOwnerMap)) {
                    if(ownerMap[key].size > 1) {
                        // Convert Set to an Array for easier manipulation
                        ownerMap[key] = [...ownerMap[key]];
                        ownerMap[key].shift();
                        duplicateModuleIds.push(...ownerMap[key]);
                    }
                }
            }

            return duplicateModuleIds;
        }

        /***
         * Asynchronously executes a command to unload a PipeWire module.
         * 
         * @param {string} moduleId - The ID of the module to unload
         */
        async _asyncExecCommandAndUnloadModule(moduleId) {
            const command = [
                'pactl',
                'unload-module',
                moduleId
            ];
            asyncExecCommandAndReadOutput(
                command,
                this._loggingEnabled,
                null,
                null
            );
        }
    }
);