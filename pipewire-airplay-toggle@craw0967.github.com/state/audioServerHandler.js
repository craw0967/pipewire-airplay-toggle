import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

import { logErr } from "../functions/logs.js";
import { asyncExecCommandAndReadOutput, execCommandAndMonitor, deepMerge } from "../functions/utils.js";

import { 
    PW_MISSING_TITLE,
    PW_MISSING_BODY,
    COMBINED_SINK_NAME
} from "../constants/config.js";

/**
 * A base class for handling audio server interactions.
 * This class provides common functionality for both PipeWire and PulseAudio,
 * such as monitoring events, managing modules, and updating sink information.
 * Specific implementations for each server should extend this class.
 *
 * @class AudioServerHandler
 */
export class AudioServerHandler {
    _moduleMonitorTimeout;
    _sinkMonitorTimeout;
    _createSinksTimeout;
    _toggleRAOPModuleInProgress;
    _blockSinksNotify = false;
    _blockModulesNotify = false;

    /**
     * @constructor
     * @param {AirPlayToggleExtensionState} state - The extension's state object.
     */
    constructor(state) {
        this.state = state;
    }

    /**
     * Sets the initial state of the handler by fetching module and sink lists,
     * and starts monitoring for audio server events.
     */
    initialize() {
        this._updateModulesList();
        this._updateSinksList();
        this._monitorAudioServerEvents();
    }

    /**
     * Cleans up and destroys the class.
     */
    destroy() {
        this._moduleMonitorTimeout = null;
        this._sinkMonitorTimeout = null;
        this._createSinksTimeout = null;
        this._blockSinksNotify = null;
        this._blockModulesNotify = null;
    }

    /**
     * Sets up a process to monitor pactl events to detect when modules or sinks change.
     * @private
     */
    _monitorAudioServerEvents() {
        try {
            const commandArray = [
                "pactl", 
                "subscribe"
            ];
            
            execCommandAndMonitor(this.state, null, commandArray, (line) => {
                this._processAudioServerEvents(line);
            }, null, null);
        } catch (err) {
            logErr(this.state, err);
        }
    }

    /**
     * Processes a line of output from the pactl event monitoring process.
     * Schedules updates for modules or sinks based on the event content.
     * @private
     * @param {string} line - The line of output from the pactl subscribe process.
     */
    async _processAudioServerEvents(line) {
        // TODO - consider storing and updating the UI state on it's own (volume and mute done)
        // TODO - mostly done, but need to update diagram
        // Sync to the audio server state if they get out of sync
        // Reacting to the audio server state for UI updates is easy, but "laggy"
        // User takes action -> update state -> trigger pactl updates -> monitor and process updates -> compare updates to state -> update state again only if different (sort and json.stringify to compare strings? easiest solution by far)
        // Fire events on  state change -> update UI
        // Would have to figure out what to do if "there's no current state to update"
        if (line.includes("module")) {
            if (this._moduleMonitorTimeout) {
                clearTimeout(this._moduleMonitorTimeout);
            }

            this._moduleMonitorTimeout =  setTimeout(() => {
                this._updateModulesList();
                this._moduleMonitorTimeout = null;
            }, 200);
        }

        if (line.includes("sink")) {
            if (this._sinkMonitorTimeout) {
                clearTimeout(this._sinkMonitorTimeout);
            }

            this._sinkMonitorTimeout =  setTimeout(() => {
                this._updateSinksList();
                this._sinkMonitorTimeout = null;
            }, 200);
        }
    }

    _notifyMissingDependencies() {
        Main.notify(
            _(PW_MISSING_TITLE),
            _(PW_MISSING_BODY)
        );
    }

    /************************************
     *                                  *
     *   Functions for Module Updates   *
     *                                  *
     ************************************/

    /**
     * Updates the list of loaded PulseAudio/PipeWire modules in the state.
     * @private
     */
    async _updateModulesList() {
        try {
            const output = await this._getModulesList(true);

            if (output && output.length > 0) {
                let modules = [];
                output.forEach((line) => {
                    modules.push(line.split("\t")[1]);
                });

                console.log('system updating modules now');
                this.state.updateStateKey("modulesList", modules, !this._blockModulesNotify);

                const filtered = output.filter((line) =>
                    line.includes("module-combine-sink") && line.includes(_(COMBINED_SINK_NAME))
                );

                if (filtered?.length > 0 && filtered[0]) {
                    this.state.updateStateKey("currentCombineModuleId", filtered[0].split("\t")[0]);
                } else {
                    this.state.updateStateKey("currentCombineModuleId", null);
                }
            } else {
                this.state.updateStateKey("modulesList", []);
                this.state.updateStateKey("currentCombineModuleId", null);
            }
            
            this._blockModulesNotify = false;

        } catch (err) {
            logErr(this.state, err);
        }
    }

    /**
     * Toggles the state of the RAOP (AirPlay) module by loading or unloading it.
     */
    async toggleRAOPModule() {
        if(!this.state.getStateKey("audioServerInstalled")) {
            this._notifyMissingDependencies();
            return;
        }

        const currentModulesList = this.state.getStateKey("modulesList");
        
        let modulesList = this.state.getStateKey("modulesList");
        const index = modulesList.indexOf("module-raop-discover");

        if (index === -1) {
            modulesList.push("module-raop-discover");
        } else if (modulesList.length > 0) {
            modulesList.splice(index, 1);
        }

        console.log('toggle updating modules now');
        this.state.updateStateKey("modulesList", modulesList);

        try {
            this._blockModulesNotify = true; //gets reset to false by _updateModulesList()
            await this._loadUnloadModule(modulesList.includes("module-raop-discover"), "module-raop-discover");
            // It's not likely, but this could still lead to a timing issue where this second module load triggers a state updated event.
            // We might want to combine the module loads into one command to remove all possibility
            this._blockModulesNotify = true; //gets reset to false by _updateModulesList()
            await this.toggleCombinedSinkModule();

        } catch (err) {
            this.state.updateStateKey("modulesList", currentModulesList);
            
            logErr(this.state, err);
            
            const errMessage = err?.message ? err.message : err;
            if (errMessage?.includes("Module initialization failed") || (errMessage?.includes("Failed to open module") && errMessage?.includes("module-raop-discover"))) {
                this._notifyMissingDependencies();
            }

            this._blockModulesNotify = false;
        }

        this._toggleRAOPModuleInProgress = null;
    }

    /**
     * Creates a combined sink module with selected RAOP speakers.
     * @private
     * @param {boolean} [setAsDefaultSink=false] - Whether to set the new combined sink as the default.
     */
    async _createCombinedSinkModule(setAsDefaultSink = false) {
        // The combined sink was not aways getting created after the raop module was toggled even when the combined-speakers setting is enabled.
        // The issue is that the notify::checked event handler in toggleMenu.js is firing and completing before the "clicked" event handler 
        // In toggle.js. There is latency between the time the module is toggled by the "clicked" event handler and the time
        // the subsequent pactl subscribe event handler updates the "modulesList". To work around this, just force an update here before proceeding
        // All attempts to block the click handler have not worked 100%. This resolves the issue in the easiest manner.

        // After updating the toggle/checked logic this seems to be fixed, however need to test in pulse/x11 where this issue was most obvious

        // Spam creating and destroying this module and sink can create some "odd" issues - description not getting applied, possibly other arguments not getting applied, etc. 
        // Should we rate limit this operation?
        if(!this.state.getSettingsKey("get_boolean", "combined-speakers") || !this.state.getStateKey("modulesList").includes("module-raop-discover")) {
            return;
        }

        const sinkName = _(COMBINED_SINK_NAME);
        const combinedSinks = this.state.getSettingsKey("get_string", "combined-sinks") ? this.state.getSettingsKey("get_string", "combined-sinks") : "";

        console.log('combined sink args - ' + JSON.stringify(this._getCombinedSinkModuleArguments(sinkName, combinedSinks)));
        
        try {
            let output = await this._loadUnloadModule(true, "module-combine-sink", this._getCombinedSinkModuleArguments(sinkName, combinedSinks));

            if (output &&
                output.length > 0 &&
                output[0].length > 0
            ) {
                // This whole process is very much a pulseaudio workaround.
                // With the refactor to classes, we can now more easily use pw-link for pipewire.
                // Having separate pulse/pw classes makes this even easier.
                if(!this.state.getStateKey("currentCombineModuleId")) {
                    this.state.updateStateKey("currentCombineModuleId", output[0]);
                } else {
                    this.state.updateStateKey("newcurrentCombineModuleId", output[0]);
                    await this._destroyCombinedSpeakersSink(this.state.getStateKey("currentCombineModuleId"));
                }
            }

            if(this.state.getStateKey("currentCombineModuleId") && setAsDefaultSink) { // TODO - If there are no sinks selected, we should probably return the default sink back to the previous default sink
                this._setDefaultSink(await this._getCombinedSinkId(this.state.getStateKey("currentCombineModuleId")));
            }

        } catch (err) {
            logErr(this.state, err);
        }
    }

    /**
     * Toggles the combined sink module based on the 'enabled' parameter.
     */
    async toggleCombinedSinkModule() {
        try {
            const enabled = this.state.getSettingsKey("get_boolean", "combined-speakers") && this.state.getStateKey("modulesList").includes("module-raop-discover")
            if(enabled) {
                await this._createCombinedSinkModule();
            } else if(!enabled && this.state.getStateKey("currentCombineModuleId")) {
                await this._destroyCombinedSpeakersSink(this.state.getStateKey("currentCombineModuleId"));
            }

        } catch (err) {
            logErr(this.state, err);
        }
    }

    /************************************
     *                                  *
     *    Functions for Sink Updates    *
     *                                  *
     ************************************/

    /**
     * Updates the list of available RAOP sinks from the audio server.
     * @private
     */
    async _updateSinksList() {
        try {
            const output = await this._getSinksList(false, true);

            const parsedOutput = output?.length > 0 ? JSON.parse(output) : null;
            const filteredSinks = parsedOutput ? parsedOutput.filter((sink) => {
                return sink?.name?.includes("raop_output") || sink?.name?.includes("raop_sink")
            }) : null;

            if (filteredSinks?.length > 0) {
                this.state.updateStateKey("raopSinksList", filteredSinks);

                this._handleRaopSinks(filteredSinks);
            } else {
                this.state.updateStateKey("raopSinksList", []);
                this.state.updateStateKey("raopSinksMap", {});
            }

        } catch (err) {
            logErr(this.state, err);
        }
    }

    /**
     * A hook for subclasses to process RAOP sinks.
     * The base implementation just parses them. Subclasses can override this
     * to add extra logic, like removing duplicates.
     * @private
     * @param {Array<object>} sinks - An array of RAOP sink objects.
     */
    _handleRaopSinks(sinks) {
        this._parseRaopSinks(sinks);
    }

    /**
     * Parses raw sink data into a structured map and updates the state.
     * @private
     * @param {Array<object>} sinks - An array of raw sink objects to parse.
     */
    _parseRaopSinks(sinks) {
        let parsedSinks = {};
        const combinedSinks = this.state.getSettingsKey("get_string", "combined-sinks") ? this.state.getSettingsKey("get_string", "combined-sinks").split(",") : [];

        sinks.forEach((sink) => {
            parsedSinks[sink.index.toString()] = {
                "name": sink.name,
                "id": sink.index.toString(),
                "description": sink.description,
                // The front-left and front-right channels will not vary for RAOP speakers in pulse, we should verify in pw
                // The slider wants volume in decimal percents, like 0.5. it's easiest to work with this number in pactl via integer percents, like 50% (see man pactl), so let's use the volume_percent
                "volume": sink.volume?.["front-left"]?.value_percent,
                // pactl list sinks output sets mute to true/false, but pactl set-mute-sink wants 1|0|toggle
                "muted": sink.mute ? 1 : 0,
                "channels": sink.channel_map,
                "ownerModule": sink.owner_module,
                //If a speaker has been split into channels via "module-remap-sink", store the parent speaker details here.
                "parent": { 
                    "name": "",
                    "id": ""
                },
                "combined": combinedSinks.includes(sink.name) ? true : false
            }
        });

        let currentSinks = this.state.getStateKey("raopSinksMap");
        const currentSinksKeys = Object.keys(currentSinks);
        
        for (let i = 0; i < currentSinksKeys.length; i++) {
            if (!parsedSinks[currentSinksKeys[i]]) {
                delete currentSinks[currentSinksKeys[i]];
            }
        }

        const mergedSinks = Object.keys(parsedSinks).length > 0 ? deepMerge({}, true, currentSinks, parsedSinks) : {};

        // There is a very, very minor risk that an external process updates a sink while we have the notify emission blocked
        // State will still get updated, but the UI won't until another update triggers it
        this.state.updateStateKey("raopSinksMap", mergedSinks, !this._blockSinksNotify);
        this._blockSinksNotify = false;
    }

    /**
     * Updates the volume for a specific sink.
     * @param {string} sinkId - The ID of the sink to update.
     * @param {number} volume - The new volume level (e.g., 50 for 50%).
     */
    async updateSinkVolume(sinkId, volume) {
        const volumePercent = `${volume.toString()}%`;
        const muted = this.state.getStateKey("raopSinksMap", sinkId, "muted");

        if(muted) {
            this.state.updateStateKey(["raopSinksMap", sinkId, "muted"], 0);
        }
        this.state.updateStateKey(["raopSinksMap", sinkId, "volume"], volumePercent);
        
        try {
            this._blockSinksNotify = true; //gets reset to false by _parseRaopSinks()
            if(muted === 1) {
                this.updateSinkMute(sinkId, 0);
            }
            await this._setSinkVolume(sinkId, volumePercent);
        } catch (err) {
            logErr(this.state, err);
            this._blockSinksNotify = false;
        }
    }

    /**
     * Updates the mute state of a sink, toggling it or setting it explicitly.
     * @param {string} sinkId - The ID of the sink to update.
     * @param {0|1|null} [mute=null] - The mute state to set (1 for mute, 0 for unmute). Toggles if null.
     */
    async updateSinkMute(sinkId, mute = null) {
        let newMuteState = mute;

        if(newMuteState === null) {
            newMuteState = this.state.getStateKey("raopSinksMap", sinkId, "muted") === 1 ? 0 : 1;
        }

        this.state.updateStateKey(["raopSinksMap", sinkId, "muted"], newMuteState);

        try {
            this._blockSinksNotify = true; //gets reset to false by _parseRaopSinks()
            this._setSinkMute(sinkId, mute);
        } catch (err) {
            logErr(this.state, err);
            this._blockSinksNotify = false;
        }
    }

    /**
     * Updates the list of sinks included in the combined sink.
     * @param {string} sinkId - The ID of the sink to add or remove from the combined group.
     */
    async updateCombinedSinks(sinkId) {
        // TODO - We should disable the output sliders if the user switches to a sink other than the combined sink
        // TODO - Build the soft transfer function - build the sink, move the default sink, delete the old sink, update the state
        // TODO - Store the original non-combined default sink. If no sinks are combined, consider switching back to that sink
        // TODO - Review requirements list (they're in multiple places) and ensure we've met the requirements for this first multi-speaker build
        let raopSinksMap = this.state.getStateKey("raopSinksMap");
        raopSinksMap[sinkId].combined = raopSinksMap[sinkId].combined === true ? false : true;
        this.state.updateStateKey("raopSinksMap", raopSinksMap, false);

        let combinedSinks = Object.values(raopSinksMap).filter((sink) => {
            return sink.combined;
        }).map((sink) => {
            return sink.name;
        });

        this.state.updateSettingsKey("set_string", "combined-sinks", combinedSinks?.length > 0 ? combinedSinks.join(",") : "");

        if (this._createSinksTimeout) {
            clearTimeout(this._createSinksTimeout);
        }

        this._createSinksTimeout = setTimeout(() => {
            this._createCombinedSinkModule(true);
            this._createSinksTimeout = null;
        }, 3000);
    }

    /**
     * Destroys the combined speakers sink by unloading its module.
     * @private
     * @param {string} moduleId - The ID of the combined sink module to unload.
     */
    async _destroyCombinedSpeakersSink(moduleId) {
        try {
            await this._loadUnloadModule(false, moduleId);

            if (this.state.getStateKey("currentCombineModuleId") === moduleId) {
                this.state.updateStateKey("currentCombineModuleId", null);

                if (this.state.getStateKey("newcurrentCombineModuleId") !== null) {
                    this.state.updateStateKey("currentCombineModuleId", this.state.getStateKey("newcurrentCombineModuleId"));
                    this.state.updateStateKey("newcurrentCombineModuleId", null);
                }
            }

            if (this.state.getStateKey("newcurrentCombineModuleId") === moduleId) {
                this.state.updateStateKey("newcurrentCombineModuleId", null);
            }

        } catch (err) {
            logErr(this.state, err);
        }
    }

    /**
     * Retrieves the sink ID for a given module ID.
     * @private
     * @param {string} moduleId - The module ID to find the corresponding sink for.
     * @returns {Promise<string|null>} A promise that resolves to the sink ID, or null if not found.
     */
    async _getCombinedSinkId(moduleId) {
        try {
            const output = await this._getSinksList(false, true);

            const parsedOutput = output?.length > 0 ? JSON.parse(output) : null;
            let combineSinkModule = [];

            if(parsedOutput && parsedOutput.length > 0) {
                combineSinkModule = parsedOutput.filter((sink) => {
                    return sink.owner_module.toString() === moduleId.toString();
                });
            }

            return combineSinkModule?.length > 0 ? combineSinkModule[0].index.toString() : null;

        } catch (err) {
            logErr(this.state, err);
            return null;
        }
    }

    /************************************
     *                                  *
     *      Audio Server Commands       *
     *                                  *
     ************************************/

    /**
     * Retrieves the list of modules from the audio server.
     * @private
     * @param {boolean} [short=false] - Whether to use the short format.
     * @param {boolean} [json=false] - Whether to format the output as JSON.
     * @returns {Promise<string[]>} A promise that resolves with the command output.
     */
    async _getModulesList(short = false, json = false) {
        try {
            const commandArray = [
                "pactl"
            ];
            
            if (json) {
                commandArray.push(
                    "--format=json"
                );
            }
            
            commandArray.push(
                "list", 
                "modules"
            );
            
            if (short) {
                commandArray.push(
                    "short"
                );
            }

            return await asyncExecCommandAndReadOutput(commandArray);
        } catch (err) {
            throw new Error(err);
        }
    }

    /**
     * Asynchronously executes a command to load or unload a module.
     * @private
     * @param {boolean} load - Whether to load or unload the module. True to load, false to unload.
     * @param {string | number} module - The name or ID of the module.
     * @param {string|string[]|null} [addArgs=null] - Additional arguments for the command.
     * @returns {Promise<string[]>} A promise that resolves with the command output.
     */
    async _loadUnloadModule(load, module, addArgs = null) {
        try {
            const commandArray = [
                "pactl", 
                load ? "load-module" : "unload-module", 
                module.toString()
            ];

            if (addArgs) {
                if (typeof addArgs === "string") {
                    commandArray.push(addArgs);
                } else if (Array.isArray(addArgs)) {
                    commandArray.push(...addArgs);
                }
            }

            return await asyncExecCommandAndReadOutput(commandArray);
        } catch (err) {
            throw new Error(err);
        }
    }

    /**
     * Retrieves the list of sinks from the audio server.
     * @private
     * @param {boolean} [short=false] - Whether to use the short format.
     * @param {boolean} [json=false] - Whether to format the output as JSON.
     * @returns {Promise<string[]>} A promise that resolves with the command output.
     */
    async _getSinksList(short = false, json = false) {
        // You may not want to return JSON. pactl has some oddities when returning JSON
        // For example, there may be unsupported characters, or sometimes the JSON output 
        // returns with sink descriptions set as "(null)" instead of the actual description
        try {
            const commandArray = [
                "pactl"
            ];
            
            if (json) {
                commandArray.push(
                    "--format=json"
                );
            }
            
            commandArray.push(
                "list", 
                "sinks"
            );
            
            if (short) {
                commandArray.push(
                    "short"
                );
            }

            return await asyncExecCommandAndReadOutput(commandArray);
        } catch (err) {
            throw new Error(err);
        }
    }

    /**
     * Sets the volume for a specific sink.
     * @private
     * @param {string} sinkId - The ID of the sink.
     * @param {string} volumePercent - The volume in percentage format (e.g., "50%").
     * @returns {Promise<string[]>} A promise that resolves with the command output.
     */
    async _setSinkVolume(sinkId, volumePercent) {
        const commandArray = [
            "pactl", 
            "set-sink-volume", 
            sinkId, 
            volumePercent
        ];

        try {
            return await asyncExecCommandAndReadOutput(commandArray);
        } catch (err) {
            throw new Error(err);
        }
    }
    
    /**
     * Set the mute state of a sink.
     * @private
     * @param {string} sinkId - The ID of the sink to update.
     * @param {0|1|null} [mute=null] - The mute state to set (1 for mute, 0 for unmute). Toggles if null.
     */
    async _setSinkMute(sinkId, mute = null) {
        const commandArray = [
            "pactl", 
            "set-sink-mute", 
            sinkId, 
            mute === null ? "toggle" : mute.toString()
        ];

        try {
            return await asyncExecCommandAndReadOutput(commandArray);
        } catch (err) {
            throw new Error(err);
        }
    }

    /**
     * Sets the default audio sink.
     * @private
     * @param {string} sinkId - The ID of the sink to set as default.
     */
    async _setDefaultSink(sinkId) {
        const commandArray = [
            "pactl", 
            "set-default-sink", 
            sinkId
        ];

        try {
            if(sinkId) {
                return await asyncExecCommandAndReadOutput(commandArray);
            } else {
                throw new Error("Unable to set default sink. No sink ID provided");
            }
        } catch (err) {
            throw new Error(err);
        }
    }

    /**
     * Gets the command-line arguments for creating a combined sink module.
     * This method must be implemented by subclasses.
     * @private
     * @param {string} sinkName - The desired name for the sink.
     * @param {string} combinedSinks - A string of sink names to combine.
     * @throws {Error} If not implemented by a subclass.
     * @returns {string[]} An array of command-line arguments.
     */
    _getCombinedSinkModuleArguments(sinkName, combinedSinks) {
        throw new Error(`Method '_getCombinedSinkModuleArguments' must be implemented by a subclass - ${sinkName} | ${combinedSinks}`);
    }
}