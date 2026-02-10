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

import { AirPlayToggleExtensionState as State } from "../state/state.js";

/**
 * Class representing a QuickSettings Quick Toggle for AirPlay.
 * @extends QuickSettings.QuickToggle
 */
export const AirPlayToggle = GObject.registerClass(
    class AirPlayToggle extends QuickSettings.QuickToggle {
        _duplicateRemovalTimeout;

        /**
         * @constructor
         */
        constructor() {
            super({
                title: _(INDICATOR_TEXT),
                toggleMode: false,
            });

            this._setInitialState();
            this._connectToggle();
        }

        /**
         * Cleans up and destroys the toggle and any resources and events used or monitored by the class.
         * This should be called when the extension is being disabled or unloaded.
         */
        destroy() {
            this._duplicateRemovalTimeout = null;

            super.destroy();
        }

        /**
         * Initializes the state of the toggle by checking if a supported audio server is available and setting up event monitoring.
         * @private
         */ 
        async _setInitialState() {
            State.updateStateKey("audioServerInstalled", await this._detectAndSetAudioServer());

            if (State.getStateKey("audioServerInstalled")) {
                await this._getRaopModuleId();
                this.checked =  State.getStateKey("raopModuleId") ? true : false;
                
                if(this.checked) {
                    State.updateStateKey("raopModuleInstalled", true);
                }

                this._monitorModuleEvents();
            } else {
                this._notifyMissingDependencies();
            }

        }

        /**
         * Connects the toggle button to its click event handler.
         * When clicked, the toggle button will attempt to toggle the RAOP (AirPlay) module.
         * @private
         */
        _connectToggle() {
            State.connectSignal(this, "clicked", () => {
                if (State.getStateKey("audioServerInstalled")) {
                    this._toggleAirPlay();
                } else {
                    this._notifyMissingDependencies();
                }
            });
        }
        
        /**
         * Notifies the user if the required audio server dependencies are missing.
         * @private
         */
        _notifyMissingDependencies() {
            if(State.getStateKey("raopModuleId")) {
                State.updateStateKey("raopModuleInstalled", true);
            }

            if (!State.getStateKey("audioServerInstalled") || !State.getStateKey("raopModuleInstalled")) {
                Main.notify(
                    _(PW_MISSING_TITLE),
                    _(PW_MISSING_BODY)
                );
            }
        }

        /**
         * Checks if PipeWire or PulseAudio is installed.
         * @private
         * @returns {Promise<boolean>} A promise that resolves to true if a supported audio server is installed, false otherwise.
         */
        async _detectAndSetAudioServer() {
            try {
                return this._setAudioServer(await detectAudioServer());

            } catch (err) {
                logErr(err);
                return false;
            }
        }

        /**
         * Sets the current audio server in the extension's state.
         * If no supported audio server is installed, it defaults to pipewire.
         * @private
         * @param {string | null} audioServer - The name of the audio server found.
         * @returns {boolean} - True if a supported server is set, false otherwise.
         */
        _setAudioServer(audioServer) {
            if(audioServer) {
                if(State.getSettingsKey("get_string", "audio-server") !== audioServer) {
                    State.updateSettingsKey("set_string", "audio-server", audioServer);
                }
                return true;
            } else {
                State.updateSettingsKey("set_string", "audio-server", "pipewire");
                return false;
            } 
        }

        /**
         * Tries to get the ID of the RAOP (AirPlay) module and stores it in the state.
         * @private
         */
        async _getRaopModuleId() {
            try {
                const commandArray = [
                    "pactl", 
                    "list", 
                    "modules", 
                    "short"
                ];
                const output = await asyncExecCommandAndReadOutput(
                    commandArray,
                    null,
                    null
                );

                if (output && output.length > 0) {
                    const filtered = output.filter((line) =>
                        line.includes("module-raop-discover")
                    );

                    if (filtered && filtered.length > 0 && filtered[0]) {
                        State.updateStateKey("raopModuleId", filtered[0].split("\t")[0]);
                    } else {
                        State.updateStateKey("raopModuleId", null);
                    }
                }

            } catch (err) {
                logErr(err);
            }
        }

        /**
         * Toggles the state of the RAOP (AirPlay) module by loading or unloading it.
         * @private
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
                    null,
                    null
                );
                
                if (!State.getStateKey("raopModuleId") &&
                    output &&
                    output.length > 0 &&
                    output[0].length > 0
                ) {
                    State.updateStateKey("raopModuleId", output[0]);
                }
                
                this._notifyMissingDependencies();

            } catch (err) {
                logErr(err);
            }
        }

        /**
         * Sets up a process to monitor pactl events to detect when the RAOP module is loaded or unloaded.
         * @private
         */
        _monitorModuleEvents() {
            const command = [
                "pactl", 
                "subscribe"
            ];
            
            execCommandAndMonitor(null, command, (line) => {
                // Process the output to determine when a module is loaded or unloaded
                this._processModuleEvent(line);
                
            }, null, null);
        }

        /**
         * Processes a line of output from the pactl event monitoring process.
         * Determines when the RAOP module is loaded or unloaded and updates the toggle state.
         * @private
         * @param {string} line - The line of output from the pactl subscribe process.
         */
        async _processModuleEvent(line) {
            if(line.includes("module")) {
                // State 1: We know the module ID, watch for its removal
                if (State.getStateKey("raopModuleId") && line.includes(State.getStateKey("raopModuleId")) && line.includes("remove")) {
                    State.updateStateKey("raopModuleId", null);
                    this.checked = false;
                
                // State 2: New module loaded, check if it's the one we want
                } else {
                    // Module ID not known - check to see if it loaded. Sometimes _toggleAirplay sets the module ID before we get here, sometimes not.
                    if(!State.getStateKey("raopModuleId") && line.includes("new")) {
                        await this._getRaopModuleId();
                    }

                    // Module ID is known
                    if(State.getStateKey("raopModuleId") &&
                        line.includes(State.getStateKey("raopModuleId")) 
                    ){
                        this.checked = true;
                    }
                }
            }

            if(State.getSettingsKey("get_string", "audio-server") === "pulseaudio") {
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
            }
        }

        /**
         * This method is for PulseAudio and shouldn't be necessary for PipeWire.
         * Removes duplicate RAOP sink visibility by unloading the duplicate module IDs.
         * Users can prevent duplicates by using PipeWire, by disabling ipv6 networking, or by disabling ipv6 in avahi.
         * @private
         */
        // TODO - Need to run this based on settings event if user toggles remove duplicates setting on
        async _removeDuplicateRaopSinks() {
            if(!State.getSettingsKey("get_boolean", "hide-duplicate-raop-sinks")) {
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
            } catch (err) {
                logErr(err);
            }
        }

        /**
         * This method takes the output of 'pactl list sinks' and maps the owner module IDs of any RAOP sinks/outputs to their corresponding names.
         * @private
         * @param {string[]} output - The output of 'pactl list sinks'
         * @returns {Object<string, Set<string>>} A map of sink/output names to their corresponding module IDs.
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
         * @private
         * @param {Object<string, Set<string>>} ownerMap - A map of RAOP sink/output names to their corresponding owner module IDs.
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

        /**
         * Asynchronously executes a command to unload a PipeWire/PulseAudio module.
         * @private
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
                null,
                null
            );
        }
    }
);