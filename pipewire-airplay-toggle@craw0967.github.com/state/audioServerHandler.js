import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

import { logErr } from "../functions/logs.js";
import { asyncExecCommandAndReadOutput, execCommandAndMonitor, getStableObject } from "../functions/utils.js";

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

    /**
     * Notifies the user if PipeWire or PulseAudio are not detected.
     * @private
     */
    _notifyMissingDependencies() {
        Main.notify(
            _(PW_MISSING_TITLE),
            _(PW_MISSING_BODY)
        );
    }

    // =====================================================================
    // Public API
    // =====================================================================

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

        this.state.updateStateKey("modulesList", modulesList);

        try {
            let loadRaopModule = modulesList.includes("module-raop-discover");
            if(!loadRaopModule) {
                const fallbackSinkId = await this._determineFallbackSink();
                if(fallbackSinkId) {
                    await this._moveActiveStreams(this.state.getStateKey("currentCombineModuleId"), fallbackSinkId, true);
                }
            }
            await this._loadUnloadModule(loadRaopModule, "module-raop-discover");

            // After loading/unloading the RAOP discovery module, we must immediately
            // check the state of the combined sink.
            // - If RAOP was just enabled, a combined sink might need to be created.
            // - If RAOP was just disabled, the existing combined sink (which depends
            //   on RAOP sinks) must be destroyed.
            await this.toggleCombinedSinkModule();

        } catch (err) {
            this.state.updateStateKey("modulesList", currentModulesList);
            
            logErr(this.state, err);
            
            const errMessage = err?.message ? err.message : err;
            if (errMessage?.includes("Module initialization failed") || (errMessage?.includes("Failed to open module") && errMessage?.includes("module-raop-discover"))) {
                this._notifyMissingDependencies();
            }
        }
    }

    /**
     * Toggles the combined sink module if both the combined sink setting and the raop module are enabled
     */
    async toggleCombinedSinkModule() {
        try {
            const enabled = this.state.getSettingsKey("get_boolean", "combined-speakers") && this.state.getStateKey("modulesList").includes("module-raop-discover")
            if(enabled) {
                await this._createCombinedSinkModule(true);
            } else if(!enabled && this.state.getStateKey("currentCombineModuleId")) {
                await this._destroyCombinedSpeakersSink(this.state.getStateKey("currentCombineModuleId"));
            }

        } catch (err) {
            logErr(this.state, err);
        }
    }

    /**
     * Updates the list of sinks included in the combined sink.
     * @param {string} sinkId - The ID of the sink to add or remove from the combined group.
     */
    async updateCombinedSinks(sinkId) {
        // TODO - Should we disable the output sliders if the user switches to a sink other than the combined sink? What is a good method of handling this scenario?
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

        // Debounce the creation of the combined sink. If the user clicks multiple
        // speakers in quick succession, we don't want to rebuild the sink each time.
        // This batches the changes into a single operation.
        this._createSinksTimeout = setTimeout(async () => {
            this._createCombinedSinkModule(true);
            this._createSinksTimeout = null;
        }, 2000);
    }

    /**
     * Updates the volume for a specific sink.
     * @param {string} sinkId - The ID of the sink to update.
     * @param {number} volume - The new volume level (e.g., 50 for 50%).
     */
    async updateSinkVolume(sinkId, volume) {
        const volumePercent = `${Math.round(volume).toString()}%`;
        const muted = this.state.getStateKey("raopSinksMap", sinkId, "muted");

        if(muted) {
            this.state.updateStateKey(["raopSinksMap", sinkId, "muted"], 0);
        }
        this.state.updateStateKey(["raopSinksMap", sinkId, "volume"], volumePercent);
        
        try {
            if(muted === 1) {
                this.updateSinkMute(sinkId, 0);
            }
            await this._setSinkVolume(sinkId, volumePercent);
        } catch (err) {
            logErr(this.state, err);
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
            this._setSinkMute(sinkId, mute);
        } catch (err) {
            logErr(this.state, err);
        }
    }

    // =====================================================================
    // Internal State Sync & Graph Management
    // =====================================================================

    /************************************
     *          Module State            *
     ************************************/

    /**
     * Updates the list of loaded modules from the audio server.
     * @private
     */
    async _updateModulesList() {
        try {
            const output = await this._getModulesList(true);

            if (output && output.length > 0) {
                // Parse and deduplicate module names from the output.
                const modules = [...new Set(
                    output
                        .map(line => line.startsWith('\t') ? null : line.split('\t')[1])
                        .filter(name => name) // Filters out null, undefined, and empty strings
                )];

                const currentModules = this.state.getStateKey("modulesList") || [];
                
                // Sort both arrays to compare content regardless of order
                const sortedCurrent = [...currentModules].sort();
                const sortedNew = [...modules].sort();
                const modulesChanged = JSON.stringify(sortedCurrent) !== JSON.stringify(sortedNew);
                
                this.state.updateStateKey("modulesList", modules, modulesChanged);

                const filtered = output.filter((line) =>
                    line.includes("module-combine-sink") && line.includes(_(COMBINED_SINK_NAME))
                );

                if (filtered?.length > 0 && filtered[0]) {
                    const newCombinedModuledId = filtered[0].split("\t")[0];
                    this.state.updateStateKey("currentCombineModuleId", newCombinedModuledId, newCombinedModuledId !== this.state.getStateKey("currentCombineModuleId"));
                } else {
                    this.state.updateStateKey("currentCombineModuleId", null, this.state.getStateKey("currentCombineModuleId") !== null);
                }
            } else {
                const currentModules = this.state.getStateKey("modulesList") || [];
                this.state.updateStateKey("modulesList", [], currentModules.length > 0);

                const currentCombinedModuleId = this.state.getStateKey("currentCombineModuleId");
                this.state.updateStateKey("currentCombineModuleId", null, currentCombinedModuleId !== null);
            }

        } catch (err) {
            logErr(this.state, err);
        }
    }

    /************************************
     *            Sink State            *
     ************************************/

    /**
     * Updates the list of available RAOP sinks from the audio server.
     * @private
     */
    async _updateSinksList() {
        try {
            const output = await this._getSinksList(false, true); // TODO - would like to parse this without --format=json so that we can always get the correct sink description

            const parsedOutput = output?.length > 0 ? JSON.parse(output) : null;
            const filteredSinks = parsedOutput ? parsedOutput.filter((sink) => {
                return sink?.name?.includes("raop_output") || sink?.name?.includes("raop_sink")
            }) : null;

            if (filteredSinks?.length > 0) {
                this._handleRaopSinks(filteredSinks);
            } else {
                const sinksChanged = Object.keys(this.state.getStateKey("raopSinksMap")).length > 0;
                this.state.updateStateKey("raopSinksMap", {}, sinksChanged);
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
        const combinedSinks = this.state.getSettingsKey("get_string", "combined-sinks")?.split(",") || [];

        sinks.forEach((sink) => {
            parsedSinks[sink.index.toString()] = {
                "name": sink.name,
                "id": sink.index.toString(),
                "description": sink.description,
                // The front-left and front-right channels will not vary for RAOP speakers in pulse, we should verify in pw
                // The slider wants volume in decimal percents, like 0.5. it's easiest to work with this number in pactl via integer percents, like 50% (see man pactl), so let's use the volume_percent
                "volume": sink.volume?.["front-left"]?.value_percent,
                "muted": sink.mute ? 1 : 0, // pactl list sinks output sets mute to true/false, but pactl set-mute-sink wants 1|0|toggle
                "channels": sink.channel_map,
                "ownerModule": sink.owner_module,
                "combined": combinedSinks.includes(sink.name) ? true : false
            }
        });

        const currentSinks = this.state.getStateKey("raopSinksMap");

        const sinksChanged = JSON.stringify(getStableObject(currentSinks)) !== JSON.stringify(getStableObject(parsedSinks));

        this.state.updateStateKey("raopSinksMap", parsedSinks, sinksChanged);
    }

    /**
     * Retrieves the sink ID from the `raopSinksMap` based on the sink name.
     * @private
     * @param {string} sinkName - The name of the sink to find.
     * @returns {string|null} The sink ID, or null if not found.
     */
    _getRaopSinksMapIdBySinkName(sinkName) {
        const raopSinksMap = this.state.getStateKey("raopSinksMap");
        return Object.keys(raopSinksMap).find(key => raopSinksMap[key].name === sinkName) || null;
    }

    /************************************
     *      Combined Sink Logic         *
     ************************************/

    /**
     * Creates a combined sink module with selected RAOP speakers.
     * @private
     * @param {boolean} [setAsDefaultSink=false] - Whether to set the new combined sink as the default.
     */
    // TODO - When we toggle on the raop module, formerly combined sinks are not getting restored. (should they?)
    async _createCombinedSinkModule(setAsDefaultSink = false) {
        if(!this.state.getSettingsKey("get_boolean", "combined-speakers") || !this.state.getStateKey("modulesList").includes("module-raop-discover")) {
            return;
        }

        console.log('the sinks map before starting validation - ', this.state.getStateKey("raopSinksMap"));
        // TODO - test this in pulseaudio and confirm it works
        // Before validating and building, explicitly refresh our sink list from the
        // audio server. This ensures we have the most up-to-date information,
        // resolving the race condition where a new RAOP sink might not have been
        // detected yet.
        await this._updateSinksList();

        console.log('the sinks map after starting validation - ', this.state.getStateKey("raopSinksMap"));
        
        console.log('the combined sinks before validation - ', this.state.getSettingsKey("get_string", "combined-sinks"));

        const combinedSinkName = _(COMBINED_SINK_NAME);

        // We must validate the list of combined sinks before passing it to `pactl`.
        // If the list contains a sink name that no longer exists (e.g., a speaker
        // was turned off), the `load-module` command will fail. This function
        // ensures we only use sinks that are currently available.
        let combinedSinks = this._getValidCombinedSinks(); // If this is triggered repeatedly too quickly, then we can lose the correct state.

        console.log('the combined sinks after validation - ', combinedSinks);

        if (combinedSinks !== this.state.getSettingsKey("get_string", "combined-sinks")) {
            this.state.updateSettingsKey("set_string", "combined-sinks", combinedSinks);
        }
        
        try {
            let output;

            // If there are sinks in the combinedSinks list, load a new combined sink module
            if(combinedSinks.length > 0) {
                output = await this._loadUnloadModule(true, "module-combine-sink", this._getCombinedSinkModuleArguments(combinedSinkName, combinedSinks))
            
            // Otherwise, if there are no sinks to combine, destroy the combined sink module so that the audio can fall back to the system default sink
            } else if (this.state.getStateKey("currentCombineModuleId")) {
                const fallbackSinkId = await this._determineFallbackSink();
                if(fallbackSinkId) {
                    await this._moveActiveStreams(this.state.getStateKey("currentCombineModuleId"), fallbackSinkId, true);
                }
                await this._destroyCombinedSpeakersSink(this.state.getStateKey("currentCombineModuleId"));
            }

            if (output?.length > 0 && output[0].length > 0) {
                const newModuleId = output[0];
                const newSinkId = await this._getCombinedSinkId(newModuleId);

                if (newSinkId) {
                    const oldModuleId = this.state.getStateKey("currentCombineModuleId");
                    if (!oldModuleId) {
                        await this._initializeCombinedSink(newModuleId, newSinkId, setAsDefaultSink);
                    } else {
                        await this._rebuildCombinedSink(oldModuleId, newModuleId, newSinkId, setAsDefaultSink);
                    }
                }
            }
        } catch (err) {
            logErr(this.state, err);
        }
    }
    
    /**
     * Handles the initial creation of a combined sink.
     * Moves active streams from the default system sink to the new combined sink.
     * @private
     * @param {string} newModuleId - The module ID of the newly created combined sink.
     * @param {string} newSinkId - The sink ID of the newly created combined sink.
     * @param {boolean} setAsDefaultSink - Whether to set the new sink as the system default.
     */
    async _initializeCombinedSink(newModuleId, newSinkId, setAsDefaultSink) {
        const defaultSinkId = await this._getDefaultSinkId();
        
        if(defaultSinkId && newSinkId) {
            await this._moveActiveStreams(defaultSinkId, newSinkId, setAsDefaultSink);
        }
    
        this.state.updateStateKey("currentCombineModuleId", newModuleId);
    }
    
    /**
     * Handles rebuilding the combined sink when its members change.
     * It creates a new sink, moves streams from the old one, and then destroys the old one.
     * @private
     * @param {string} oldModuleId - The module ID of the combined sink being replaced.
     * @param {string} newModuleId - The module ID of the newly created combined sink.
     * @param {string} newSinkId - The sink ID of the newly created combined sink.
     * @param {boolean} setAsDefaultSink - Whether to set the new sink as the system default.
     */
    async _rebuildCombinedSink(oldModuleId, newModuleId, newSinkId, setAsDefaultSink) {
        // "Softly" migrate streams to the new sink
        const oldSinkId = await this._getCombinedSinkId(oldModuleId);
        if (oldSinkId && newSinkId) {
            await this._moveActiveStreams(oldSinkId, newSinkId, setAsDefaultSink);
        }
    
        // Temporarily store the new module ID. The old one will be destroyed,
        // which will trigger an event. The destruction handler will then
        // promote the new ID to be the current one.
        this.state.updateStateKey("newcurrentCombineModuleId", newModuleId);
        await this._destroyCombinedSpeakersSink(oldModuleId);
    }

    /**
     * Destroys the combined speakers sink by unloading its module.
     * @private
     * @param {string} moduleId - The ID of the combined sink module to unload.
     */
    async _destroyCombinedSpeakersSink(moduleId) {
        try {
            await this._loadUnloadModule(false, moduleId); // DO NOT unload module-combine-sink by name. User may have other combined sinks loaded.

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
     * Moves all active audio streams from an old sink to a new sink.
     * This is a key part of a "soft" or "glitch-free" rebuild.
     * @private
     * @param {string} oldSinkId - The ID of the source sink.
     * @param {string} newSinkId - The ID of the destination sink.
     * @param {boolean} [setAsDefaultSink=false] - Whether to set the new combined sink as the default.
     */
    async _moveActiveStreams(oldSinkId, newSinkId, setAsDefaultSink = false) {
        try {
            // pactl list short sink-inputs
            // Output format:
            // <input_id>\t<client_id>\t<sink_id>\t...
            const sinkInputs = await this._getSinkInputsList(true);

            for (const inputLine of sinkInputs) {
                const parts = inputLine.split('\t');
                if (parts.length >= 3) {
                    const inputId = parts[0];
                    const currentSinkId = parts[2];

                    if (currentSinkId === oldSinkId) {
                        this._moveSinkInput(inputId, newSinkId);
                    }
                }
            }

            if (setAsDefaultSink && newSinkId) {
                await this._setDefaultSink(newSinkId);
            }

        } catch (err) {
            // Log the error but don't re-throw. The sink switch should still proceed.
            logErr(this.state, `Failed to move audio streams: ${err.message}`);
        }
    }

    /**
     * Determines a suitable non-AirPlay sink to fall back to.
     * It prioritizes sinks based on their `priority.session` property.
     * @private
     * @returns {Promise<string|null>} The ID of the fallback sink, or null.
     */
    async _determineFallbackSink() {
        try {
            const output = await this._getSinksList(false, true);
            const sinksList = output?.length > 0 ? JSON.parse(output) : [];

            if (!sinksList?.length) {
                return null;
            }

            const candidateSinks = sinksList.filter(sink =>
                !sink?.name?.includes("raop_output") &&
                !sink?.name?.includes("raop_sink") &&
                sink?.properties?.["priority.session"]
            );

            if (!candidateSinks.length) {
                return null;
            }

            // Find the sink with the highest 'priority.session' value.
            const fallbackSink = candidateSinks.reduce((highest, current) => {
                const highestPriority = Number(highest.properties["priority.session"]);
                const currentPriority = Number(current.properties["priority.session"]);
                return currentPriority > highestPriority ? current : highest;
            });

            return fallbackSink.index.toString();

        } catch (err) {
            logErr(this.state, err);
            return null;
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

    /**
     * Retrieves the ID of the current default sink.
     * @private
     * @returns {Promise<string|null>} The ID of the default sink, or null.
     */
    async _getDefaultSinkId() {
        const defaultSinkName = await this._getDefaultSink();
        const sinksList = defaultSinkName?.length > 0 ? await this._getSinksList(true) : null;

        if(sinksList?.length > 0) {
            const defaultSink = sinksList.filter((sink) => {
                return sink.includes(defaultSinkName);
            });

            return defaultSink?.length > 0 ? defaultSink[0].split("\t")[0] : null;
        } else {
            return null;
        }
    }

    /**
     * Filters the `combined-sinks` setting to ensure all sink names are valid and currently available.
     * This prevents errors when loading the `module-combine-sink`.
     * @private
     * @returns {string} A comma-separated string of valid sink names.
     */
    _getValidCombinedSinks() {
        const raopSinksMap = this.state.getStateKey("raopSinksMap");
        let combinedSinks = this.state.getSettingsKey("get_string", "combined-sinks") ? this.state.getSettingsKey("get_string", "combined-sinks") : "";
        
        const currentSinkNamesList = Object.keys(raopSinksMap).map((sinkId) => {
            return raopSinksMap[sinkId].name.trim();
        });

        // If a sink in the combined-sinks setting no longer exists, or didn't get synced when it was disabled, remove it
        // Invalid sink names will cause pactl to throw errors when loading the module-combine-sink module
        let combinedSinksList = combinedSinks.split(",");
        for (let i = 0; i < combinedSinksList.length; i++) {
            const raopSinksMapId = this._getRaopSinksMapIdBySinkName(combinedSinksList[i]);
            
            if(!currentSinkNamesList.includes(combinedSinksList[i].trim()) || (
                raopSinksMapId && 
                currentSinkNamesList.includes(combinedSinksList[i].trim()) && 
                raopSinksMap[raopSinksMapId].combined !== true
            )) {
                combinedSinksList.splice(i, 1);
                i--;
            }
        }
        combinedSinks = combinedSinksList.join(",");

        return combinedSinks;
    }

    // =====================================================================
    // Low-Level Audio Server Commands (CLI Wrappers)
    // =====================================================================

    /**
     * Retrieves the list of modules from the audio server (`pactl list modules`).
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
     * Loads or unloads an audio server module (`pactl load/unload-module`).
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
     * Retrieves the list of sinks from the audio server (`pactl list sinks`).
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
     * Retrieves the volume for a specific sink (`pactl get-sink-volume`).
     * @private
     * @param {string} sinkId - The ID of the sink.
     * @returns {Promise<string[]>} A promise that resolves with the command output.
     */
    async _getSinkVolume(sinkId) {
        // This command won't return json even with --format=json
        const commandArray = [
            "pactl", 
            "get-sink-volume", 
            sinkId
        ];

        try {
            return await asyncExecCommandAndReadOutput(commandArray);
        } catch (err) {
            throw new Error(err);
        }
    }

    /**
     * Sets the volume for a specific sink (`pactl set-sink-volume`).
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
     * Sets the mute state of a sink (`pactl set-sink-mute`).
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
     * Retrieves the name of the default sink (`pactl get-default-sink`).
     * @private
     * @returns {Promise<string[]>} A promise that resolves with the command output.
     */
    async _getDefaultSink() {
        const commandArray = [
            "pactl", 
            "get-default-sink"
        ]

        try {
            return await asyncExecCommandAndReadOutput(commandArray);
        } catch (err) {
            throw new Error(err);
        }
    }

    /**
     * Sets the default audio sink (`pactl set-default-sink`).
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
     * Retrieves the list of sink inputs from the audio server (`pactl list sink-inputs`).
     * @private
     * @param {boolean} [short=false] - Whether to use the short format.
     * @param {boolean} [json=false] - Whether to format the output as JSON.
     * @returns {Promise<string[]>} A promise that resolves with the command output.
     */
    async _getSinkInputsList(short = false, json = false) {
        try {
            const commandArray = [
                "pactl"
            ];

            if (json) {
                commandArray.push("--format=json");
            }

            commandArray.push(
                "list",
                "sink-inputs"
            );

            if (short) {
                commandArray.push("short");
            }

            return await asyncExecCommandAndReadOutput(commandArray);
        } catch (err) {
            throw new Error(err);
        }
    }

    /**
     * Moves a sink input to a different sink (`pactl move-sink-input`).
     * @private
     * @param {string} inputId - The ID of the sink input to move.
     * @param {string} sinkId - The ID of the destination sink.
     * @returns {Promise<string[]>} A promise that resolves with the command output.
     */
    async _moveSinkInput(inputId, sinkId) {
        const commandArray = [
            "pactl",
            "move-sink-input",
            inputId,
            sinkId
        ];

        try {
            return await asyncExecCommandAndReadOutput(commandArray);
        } catch (err) {
            throw new Error(err);
        }
    }

    /************************************
     *         Abstract Methods         *
     ************************************/

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