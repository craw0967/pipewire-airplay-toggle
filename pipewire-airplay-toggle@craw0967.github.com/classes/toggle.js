import GObject from "gi://GObject";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

import { logErr } from "../functions/logs.js";
import { asyncExecCommandAndReadOutput, execCommandAndMonitor, detectAudioServer } from "../functions/utils.js";
import { 
    INDICATOR_TEXT,
    PW_MISSING_TITLE,
    PW_MISSING_BODY
} from "../constants/config.js";

/** Class representing a QuickSettings Quick Toggle */
export const AirPlayToggle = GObject.registerClass(
    class AirPlayToggle extends QuickSettings.QuickToggle {
        _pipewireInstalled;
        _raopModuleId;
        _raopModuleInstalled;
        _monitorProcess;
        _duplicateRemovalTimeout;

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
            this._supportedAudioServerInstalled = await this._detectAndSetAudioServer();

            if (this._supportedAudioServerInstalled) {
                this._raopModuleInstalled = await this._getRaopModuleId();

                if (this._raopModuleInstalled) {
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

                    // The _toggleAirPlay method will always set a _raopModuleId value if the module exists.
                    // However, for PulseAudio we want a null vaue when it's unloaded, so set it to null as an initial value
                    this._raopModuleId = this._currentAudioServer === "pulseaudio" ? null : this._raopModuleId;
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
                if (this._supportedAudioServerInstalled && this._raopModuleInstalled) {
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
         * Checks if PipeWire is installed.
         * 
         * @returns {Promise<boolean>} A promise that resolves to true if PipeWire is installed, false otherwise.
         */
        async _detectAndSetAudioServer() {
            try {
                const audioServer = await detectAudioServer(this._loggingEnabled);
                if (audioServer) {
                    this._currentAudioServer = audioServer;
                    this._setAudioServer();

                    return true;
                }

                return false;
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
                
            } else if (!this._currentAudioServer) {
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
                
                this._raopModuleId =
                    !this._raopModuleId &&
                    output &&
                    output.length > 0 &&
                    output[0].length > 0
                        ? output[0]
                        : this._raopModuleId;
                
                this._raopModuleInstalled = !this._raopModuleInstalled && this._raopModuleId ? true : this._raopModuleInstalled;

            } catch (err) {
                logErr(err, this._loggingEnabled);
            }
        }

        /***
         * Sets up a process to monitor PipeWire module events and reads the output of the process to 
         * determine when the RAOP module is loaded or unloaded.
         */
        _monitorModuleEvents() {
            const command = ["pactl", "subscribe"];
            
            execCommandAndMonitor(this._monitorProcess, command, true, (line) => {
                // Process the output to determine when a module is loaded or unloaded
                this._processModuleEvent(line);
                
            }, null, null);
        }

        /***
         * Processes a line of output from the PipeWire and/or PulseAudio module event monitoring process.
         * Determines when the RAOP module is loaded or unloaded by checking for the presence of the module ID in the line.
         * If the module ID is present, sets the 'checked' property to true if the line indicates the module is loaded and false if unloaded.
         * 
         * @param {string} line - The line of output from the PipeWire and/or PulseAudio module event monitoring process.
         */
        async _processModuleEvent(line) {
            switch (this._currentAudioServer) {
                case "pipewire":
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
                    break;
                case "pulseaudio":
                    if(line.includes("module")) {
                        // State 1: We know the module ID, watch for its removal
                        if (this._raopModuleId && line.includes(this._raopModuleId) && line.includes("remove")) {
                            this._raopModuleId = null;
                            this.checked = false;
                        
                        // State 2: New module loaded, check if it's the one we want
                        } else {
                            // Module ID not known - check to see if it loaded. Sometimes _toggleAirplay sets the module ID before we get here, sometimes not.
                            if(!this._raopModuleId && line.includes("new")) {
                                await this._getRaopModuleId();
                            }

                            // Module ID is known
                            if(this._raopModuleId &&
                                line.includes(this._raopModuleId) 
                            ){
                                this.checked = true;
                            }
                        }
                    }

                    // Handle sink events - debounce duplicate removal
                    // Since these events are all async and we don't know when the new AirPlay sinks finish loading
                    // we need to wait a short period of time after the last event to ensure they have finished loading
                    if (this.checked && line.includes("sink") && line.includes("new")) {
                        // Clear existing timeout and restart the timer
                        if (this._duplicateRemovalTimeout) {
                            clearTimeout(this._duplicateRemovalTimeout);
                        }
                        
                        // Wait for sink events to settle (200ms after the LAST sink event)
                        this._duplicateRemovalTimeout = setTimeout(() => {
                            this._removeDuplicateRaopSinks();
                            this._duplicateRemovalTimeout = null;
                        }, 200);
                    }
                    
                    break;
                default:
                    break;
            }
            
        }

        /***
         * This method is for PulseAudio and shouldn't be necessary for PipeWire
         * Removes duplicate RAOP sink visibility by unloading the duplicate module IDs.
         * 
         * Instead of unloading duplicate sinks, Users can prevent duplicates by using PipeWire, by disabling ipv6 networking, or by disabling ipv6 in avahi.
         */
        async _removeDuplicateRaopSinks() {
            if(!this._extensionObject.settings?.get_boolean("hide-duplicate-raop-sinks")) {
                return;
            }
            
            // We could possibly request JSON output here using the `--format=json` option
            // However I've noticed some issues with JSON output being malformed due to invalid characters
            // Is it better to have possible parsing errors if the text output changes or risk possible JSON parsing errors if it arrives malformed?
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
                if(line.startsWith("Sink #")) {
                    name = null;
                    ownerModuleId = null;
                }
                
                if(line.includes("Name:")) {
                    name = line.split(": ")[1];
                }
                if(line.includes("Owner Module:")) {
                    ownerModuleId = line.split(": ")[1];
                }
                
                if(name && name.includes("raop") && ownerModuleId) {
                    if(!ownerMap[name]) {
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
                "pactl",
                "unload-module",
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