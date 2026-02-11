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

import { AirPlayToggleMenu } from "./toggleMenu.js";

/**
 * Class representing a QuickSettings Quick Toggle for AirPlay.
 * @extends QuickSettings.QuickToggle
 */
export const AirPlayToggle = GObject.registerClass(
    class AirPlayToggle extends QuickSettings.QuickToggle {
        _duplicateRemovalTimeout;
        _getRaopModuleIdPromise;

        /**
         * @constructor
         */
        constructor(state) {
            super({
                title: _(INDICATOR_TEXT),
                toggleMode: false,
            });

            this.state = state;

            this._setInitialState();
            this._connectToggle();

            this._menu = new AirPlayToggleMenu(this.state, this);
        }

        /**
         * Cleans up and destroys the toggle and any resources and events used or monitored by the class.
         * This should be called when the extension is being disabled or unloaded.
         */
        destroy() {
            this._menu?.destroy();

            this._duplicateRemovalTimeout = null;
            this._getRaopModuleIdPromise = null;

            super.destroy();
        }

        setIndicatorIcon(icon) {
            this.gicon = icon;
            this._menu.setMenuHeader(icon);
        }

        /**
         * Initializes the state of the toggle by checking if a supported audio server is available and setting up event monitoring.
         * @private
         */ 
        async _setInitialState() {
            this.state.updateStateKey("audioServerInstalled", await this._detectAndSetAudioServer());

            if (this.state.getStateKey("audioServerInstalled")) {
                await this._getRaopModuleId();
                this.checked =  this.state.getStateKey("raopModuleId") ? true : false;
                
                if(this.checked) {
                    this.state.updateStateKey("raopModuleInstalled", true);
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
            this.state.connectSignal(this, "clicked", () => {
                if (this.state.getStateKey("audioServerInstalled")) {
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
            if(this.state.getStateKey("raopModuleId")) {
                this.state.updateStateKey("raopModuleInstalled", true);
            }

            if (!this.state.getStateKey("audioServerInstalled") || !this.state.getStateKey("raopModuleInstalled")) {
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
                logErr(this.state, err);
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
                if(this.state.getSettingsKey("get_string", "audio-server") !== audioServer) {
                    this.state.updateSettingsKey("set_string", "audio-server", audioServer);
                }
                return true;
            } else {
                this.state.updateSettingsKey("set_string", "audio-server", "pipewire");
                return false;
            } 
        }

        /**
         * Tries to get the ID of the RAOP (AirPlay) module and stores it in the state.
         * This method uses a promise-based guard (`_getRaopModuleIdPromise`) to prevent race conditions and multiple instances of the promise.
         * If called while a request is already in flight, it returns the existing promise instead of starting a new request.
         * @private
         * @returns {Promise<void>} A promise that resolves when the operation is complete.
         */
        async _getRaopModuleId() {
            if (!this._getRaopModuleIdPromise) {
                this._getRaopModuleIdPromise = this._raopModuleIdPromise();
            } 

            return this._getRaopModuleIdPromise;
        }

        /**
         * The core logic for retrieving the RAOP module ID.
         * It executes a `pactl` command to list modules, finds the `module-raop-discover` module,
         * and updates the application state with the found module ID.
         * The `_getRaopModuleIdPromise` is reset to `null` in the `finally` block to allow subsequent calls.
         * @private
         * @returns {Promise<void>} A promise that resolves when the module ID has been retrieved and state updated.
         */
        async _raopModuleIdPromise() {
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

                    if (filtered?.length > 0 && filtered[0]) {
                        this.state.updateStateKey("raopModuleId", filtered[0].split("\t")[0]);
                    } else {
                        this.state.updateStateKey("raopModuleId", null);
                    }
                }

            } catch (err) {
                logErr(this.state, err);
            } finally {
                this._getRaopModuleIdPromise = null;
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
                const output = await asyncExecCommandAndReadOutput(
                    commandArray,
                    null,
                    null
                );
                
                if (!this.state.getStateKey("raopModuleId") &&
                    output &&
                    output.length > 0 &&
                    output[0].length > 0
                ) {
                    this.state.updateStateKey("raopModuleId", output[0]);
                }
                
                this._notifyMissingDependencies();

            } catch (err) {
                logErr(this.state, err);
            }
        }

        /**
         * Sets up a process to monitor pactl events to detect when the RAOP module is loaded or unloaded.
         * @private
         */
        _monitorModuleEvents() {
            try {
                const command = [
                    "pactl", 
                    "subscribe"
                ];
                
                execCommandAndMonitor(this.state, null, command, (line) => {
                    // Process the output to determine when a module is loaded or unloaded
                    this._processModuleEvent(line);
                    
                }, null, null);
            } catch (err) {
                logErr(this.state, err);
            }
            
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
                if (this.state.getStateKey("raopModuleId") && line.includes(this.state.getStateKey("raopModuleId")) && line.includes("remove")) {
                    this.state.updateStateKey("raopModuleId", null);
                    this.checked = false;
                
                // State 2: New module loaded, check if it's the one we want
                } else {
                    // Module ID not known - check to see if it loaded. Sometimes _toggleAirplay sets the module ID before we get here, sometimes not.
                    if(!this.state.getStateKey("raopModuleId") && line.includes("new")) {
                        await this._getRaopModuleId();
                    }

                    // Module ID is known
                    if(this.state.getStateKey("raopModuleId") &&
                        line.includes(this.state.getStateKey("raopModuleId")) 
                    ){
                        this.checked = true;
                    }
                }
            }

            if(this.state.getSettingsKey("get_string", "audio-server") === "pulseaudio") {
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
            if(!this.state.getSettingsKey("get_boolean", "hide-duplicate-raop-sinks")) {
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
                logErr(this.state, err);
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
            try {
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
            } catch (err) {
                logErr(this.state, err);
            }
        }
    }
);