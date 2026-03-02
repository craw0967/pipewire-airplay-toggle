// This mixin is for all functions related to audio server state and state management.
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";

import { logErr } from "../functions/logs.js";
import { asyncExecCommandAndReadOutput, execCommandAndMonitor, deepMerge, detectAudioServer } from "../functions/utils.js";

import { 
    PW_MISSING_TITLE,
    PW_MISSING_BODY,
    COMBINED_SINK_NAME
} from "../constants/config.js";

export const AudioServerMixin = (Base) => class extends Base {
    _moduleMonitorTimeout;
    _sinkMonitorTimeout;
    _createSinksTimeout;

    /**
     * @constructor
     * @param {object} args - The arguments for the constructor.
     */
    constructor({ ...args } = {}) {
        super({ ...args });

        this._setInitialState();
    }

    async _setInitialState() {
        this.updateStateKey("audioServerInstalled", await this._detectAndSetAudioServer());

        if(this.getStateKey("audioServerInstalled")) {
            this._updateModulesList();
            this._updateSinksList();

            this._monitorAudioServerEvents();
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
            logErr(this, err);
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
            if(this.getSettingsKey("get_string", "audio-server") !== audioServer) {
                this.updateSettingsKey("set_string", "audio-server", audioServer);
            }
            return true;
        } else {
            this.updateSettingsKey("set_string", "audio-server", "pipewire");
            return false;
        } 
    }

    destroy() {
        this._moduleMonitorTimeout = null;
        this._sinkMonitorTimeout = null;
        this._createSinksTimeout = null;

        if (super.destroy) super.destroy();
    }

    /**
     * Sets up a process to monitor pactl events to detect when the RAOP module is loaded or unloaded.
     * @private
     */
    _monitorAudioServerEvents() {
        try {
            const command = [
                "pactl", 
                "subscribe"
            ];
            
            execCommandAndMonitor(this, null, command, (line) => {
                // Process the output to determine when a module is loaded or unloaded
                this._processAudioServerEvents(line);
                
            }, null, null);
        } catch (err) {
            logErr(this, err);
        }
    }

    /**
     * Processes a line of output from the pactl event monitoring process.
     * Determines when the RAOP module is loaded or unloaded and updates the toggle state.
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
            }, 5); // Is 20 ms too short of a time?  Works great on my computer, but maybe not on lower performance machines?
        }

        if (line.includes("sink")) {

            if (this._sinkMonitorTimeout) {
                clearTimeout(this._sinkMonitorTimeout);
            }

            this._sinkMonitorTimeout =  setTimeout(() => {
                this._updateSinksList();
                this._sinkMonitorTimeout = null;
            }, 5); // Is 20 ms too short of a time?  Works great on my computer, but maybe not on lower performance machines?
        }
    }

    /**
     * Toggles the state of the RAOP (AirPlay) module by loading or unloading it.
     */
    async toggleAirPlay() {
        if(!this.getStateKey("audioServerInstalled")) {
            this._notifyMissingDependencies();
            return;
        }

        try {
            const commandArray = [
                "pactl",
                this.getStateKey("modulesList").includes("module-raop-discover") ? "unload-module" : "load-module",
                "module-raop-discover",
            ];
            
            await asyncExecCommandAndReadOutput(
                commandArray,
                null,
                null
            );

        } catch (err) {
            logErr(this, err);

            const errMessage = err?.message ? err.message : err;
            // TODO - this needs testing with Pulse and Pipewire
            if (errMessage?.includes("Module initialization failed") || (errMessage?.includes("Failed to open module") && errMessage?.includes("module-raop-discover"))) {
                this._notifyMissingDependencies();
            }
        }
    }

    /**
     * Notifies the user if the required audio server dependencies are missing.
     * @private
     */
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
    async _updateModulesList() {
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
                let modules = [];
                output.forEach((line) => {
                    modules.push(line.split("\t")[1]);
                });

                this.updateStateKey("modulesList", modules);

                const filtered = output.filter((line) =>
                    line.includes("module-combine-sink") && line.includes(_(COMBINED_SINK_NAME))
                );

                if (filtered?.length > 0 && filtered[0]) {
                    this.updateStateKey("currentCombineModuleId", filtered[0].split("\t")[0]);
                } else {
                    this.updateStateKey("currentCombineModuleId", null);
                }
            } else {
                this.updateStateKey("modulesList", []);
                this.updateStateKey("currentCombineModuleId", null);
            }

            /* const parsedOutput = output?.length > 0 ? JSON.parse(output) : null;

            if (parsedOutput?.length > 0) {
                this.updateStateKey("modulesList", parsedOutput.map((module) => {return module.name}));
                
            } else {
                this.updateStateKey("modulesList", []);
            } */

        } catch (err) {
            logErr(this, err);
        }
    }

    /**
     * Asynchronously executes a command to unload a PipeWire/PulseAudio module.
     * @private
     * @param {string} moduleId - The ID of the module to unload
     */
    async _unloadModule(moduleId) {
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
            logErr(this, err);
        }
    }        

    async _createCombinedSinkModule(setAsDefaultSink = false) {
        if(!this.getSettingsKey("get_boolean", "combined-speakers") || !this.getStateKey("modulesList").includes("module-raop-discover")) {
            return;
        }

        const sinkName = _(COMBINED_SINK_NAME);
        const combinedSinks = this.getSettingsKey("get_string", "combined-sinks") ? this.getSettingsKey("get_string", "combined-sinks") : "";

        console.log('the combined sinks are: ' + combinedSinks);

        // We don't use --format=json here because the json doesn't include the module ID
        const commandArray = [
            "pactl", 
            "load-module", 
            "module-combine-sink", 
            `sink_name="${sinkName}"`,
            "rate=44100", 
            "channels=2", 
            "channel_map=stereo", 
            "latency_compensate=true", 
            `sinks="${combinedSinks}"`
        ];

        try {
            let output = await asyncExecCommandAndReadOutput(
                commandArray,
                null,
                null
            );

            if (output &&
                output.length > 0 &&
                output[0].length > 0
            ) {
                if(!this.getStateKey("currentCombineModuleId")) {
                    this.updateStateKey("currentCombineModuleId", output[0]);
                } else {
                    this.updateStateKey("newcurrentCombineModuleId", output[0]);
                    await this._destroyCombinedSpeakersSink(this.getStateKey("currentCombineModuleId"));
                }
            }

            if(this.getStateKey("currentCombineModuleId") && setAsDefaultSink) {
                this._setDefaultSink(await this._getCombinedSinkId(this.getStateKey("currentCombineModuleId")));
            }

        } catch (err) {
            logErr(this, err);
        }
    }

    async toggleCombinedSinkModule(enabled) {
        try {
            if(enabled) {
                await this._createCombinedSinkModule();
            } else if(!enabled && this.getStateKey("currentCombineModuleId")) {
                await this._destroyCombinedSpeakersSink(this.getStateKey("currentCombineModuleId"));
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

    async _updateSinksList() {
        try {
            const commandArray = [
                "pactl", 
                "--format=json",
                "list", 
                "sinks"
            ];
            const output = await asyncExecCommandAndReadOutput(
                commandArray,
                null,
                null
            );

            const parsedOutput = output?.length > 0 ? JSON.parse(output) : null;
            const filteredSinks = parsedOutput ? parsedOutput.filter((sink) => {
                return sink?.properties?.["sess.media"]?.toString() === "raop"
            }) : null;

            if (filteredSinks?.length > 0) {
                this.updateStateKey("raopSinksList", filteredSinks);

                if(this.getSettingsKey("get_string", "audio-server") === "pulseaudio") {
                    this._removeDuplicateRaopSinks(filteredSinks);
                } else {
                    this._parseRaopSinks(filteredSinks);
                }
            } else {
                this.updateStateKey("raopSinksList", []);
                this.updateStateKey("raopSinksMap", {});
            }

        } catch (err) {
            logErr(this, err);
        }
    }

    // Only use with pulseaudio. Pulse loads a module for each raop sink, while the owner module under pipewire is just the module-raop-discover
    _removeDuplicateRaopSinks(sinks) {
        if(!this.getSettingsKey("get_boolean", "hide-duplicate-raop-sinks")) {
            this._parseRaopSinks(sinks);
        }

        try {
            const dupSinksOwnerModules = this._determineDuplicateSinks(sinks);
                    
            if(dupSinksOwnerModules?.length > 0) {
                for(let moduleId of dupSinksOwnerModules) {
                    this._unloadModule(moduleId); // Unload the owner modules of the dup sinks. This will trigger new events in `pactl subscribe` and start this process over
                }
            } else { // If there are no duplicates remaining, we can parse the sinks now
                this._parseRaopSinks(sinks);
            }

        } catch (err) {
            logErr(this, err);
        }
    }

    /**
     * Determines the owner module IDs of duplicated RAOP sinks/outputs from the given sinks array.
     * @private
     * @param {Array<Object>} sinks - An array of RAOP sinks
     * @returns {string[]} An array of duplicate RAOP sinks/outputs owner module IDs.
     */
    _determineDuplicateSinks(sinks) {
        let duplicateModuleIds = [];

        if(sinks && sinks.length > 0) { 
            let sortedSinksArray = sinks.sort((a, b) => {
                return a.name.localeCompare(b.name);
            });
            
            for(let i = 0; i < sortedSinksArray.length; i++) {
                let name = sortedSinksArray[i].name;
                let nextIndex = i + 1;
                
                if(sortedSinksArray[nextIndex] && sortedSinksArray[nextIndex].name.startsWith(name)) {
                    duplicateModuleIds.push(sortedSinksArray[nextIndex].owner_module);
                    sortedSinksArray.splice(nextIndex, 1);
                    i--;
                }
            }
        }

        return duplicateModuleIds;
    }

    _parseRaopSinks(sinks) {
        let parsedSinks = {};
        const combinedSinks = this.getSettingsKey("get_string", "combined-sinks") ? this.getSettingsKey("get_string", "combined-sinks").split(",") : [];

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
                combined: combinedSinks.includes(sink.name) ? true : false
            }
        });

        let currentSinks = this.getStateKey("raopSinksMap");
        const currentSinksKeys = Object.keys(currentSinks);
        
        for (let i = 0; i < currentSinksKeys.length; i++) {
            if (!parsedSinks[currentSinksKeys[i]]) {
                delete currentSinks[currentSinksKeys[i]];
            }
        }

        const mergedSinks = Object.keys(parsedSinks).length > 0 ? deepMerge({}, true, currentSinks, parsedSinks) : {};
        this.updateStateKey("raopSinksMap", mergedSinks);
    }

    async updateSinkVolume(sinkId, volume) {
        const raopSinksMap = this.getStateKey("raopSinksMap");
        const volumePercent = `${volume.toString()}%`;
        let commandString = "";

        // If the sink is muted, we need to unmute it before we can adjust the volume
        // pactl set-sink-volume command doesn't unmute automatically
        if (raopSinksMap[sinkId].muted === 1) {
            commandString = `pactl set-sink-mute ${sinkId} 0 && ` + commandString;
        }

        commandString += `pactl set-sink-volume ${sinkId} ${volumePercent}`;

        try {
            await asyncExecCommandAndReadOutput(
                ["sh", "-c", commandString],
                null,
                null
            );
        } catch (err) {
            logErr(this, err);
        }
    }

    async toggleSinkMute(sinkId, mute = null) {
        const commandArray = [
            "pactl",
            "set-sink-mute",
            sinkId,
            mute === null ? "toggle" : mute.toString()
        ];
        try {
            await asyncExecCommandAndReadOutput(
                commandArray,
                null,
                null
            );
        } catch (err) {
            logErr(this, err);
        }
    }

    async updateCombinedSinks(sinkId) {
        let raopSinksMap = this.getStateKey("raopSinksMap");
        raopSinksMap[sinkId].combined = raopSinksMap[sinkId].combined === true ? false : true;
        this.updateStateKey("raopSinksMap", raopSinksMap, false);

        let combinedSinks = Object.values(raopSinksMap).filter((sink) => {
            return sink.combined;
        }).map((sink) => {
            return sink.name;
        });

        this.updateSettingsKey("set_string", "combined-sinks", combinedSinks?.length > 0 ? combinedSinks.join(",") : "");

        console.log('the combined sinks are: ', JSON.stringify(this.getSettingsKey("get_string", "combined-sinks")));

        if (this._createSinksTimeout) {
            clearTimeout(this._createSinksTimeout);
        }

        this._createSinksTimeout = setTimeout(() => {
            this._createCombinedSinkModule(true);
            this._createSinksTimeout = null;
        }, 3000);
    }

    async _setDefaultSink(sinkId) {
        const commandArray = [
            "pactl", 
            "set-default-sink", 
            sinkId
        ];
        console.log("Setting default sink to: " + sinkId);
        try {
            if(sinkId) {
                await asyncExecCommandAndReadOutput(
                    commandArray,
                    null,
                    null
                );
            } else {
                throw new Error("Unable to set default sink. No sink ID provided");
            }
        } catch (err) {
            logErr(this, err);
        }
    }

    async _destroyCombinedSpeakersSink(moduleId) {
        const commandArray = [
            "pactl", 
            "unload-module", 
            moduleId
        ];

        try {
            await asyncExecCommandAndReadOutput(
                commandArray,
                null,
                null
            );

            if (this.getStateKey("currentCombineModuleId") === moduleId) {
                this.updateStateKey("currentCombineModuleId", null);

                if (this.getStateKey("newcurrentCombineModuleId") !== null) {
                    this.updateStateKey("currentCombineModuleId", this.getStateKey("newcurrentCombineModuleId"));
                    this.updateStateKey("newcurrentCombineModuleId", null);
                }
            }

            if (this.getStateKey("newcurrentCombineModuleId") === moduleId) {
                this.updateStateKey("newcurrentCombineModuleId", null);
            }

        } catch (err) {
            logErr(this, err);
        }
    }

    async _getCombinedSinkId(moduleId) {
        try {
            const commandArray = [
                "pactl", 
                "--format=json",
                "list", 
                "sinks"
            ];

            const output = await asyncExecCommandAndReadOutput(
                commandArray,
                null,
                null
            );

            const parsedOutput = output?.length > 0 ? JSON.parse(output) : null;
            let combineSinkModule = [];

            if(parsedOutput && parsedOutput.length > 0) {
                combineSinkModule = parsedOutput.filter((sink) => {
                    return sink.owner_module.toString() === moduleId.toString();
                });
            }

            return combineSinkModule?.length > 0 ? combineSinkModule[0].index.toString() : null;

        } catch (err) {
            logErr(this, err);
            return null;
        }
    }
}