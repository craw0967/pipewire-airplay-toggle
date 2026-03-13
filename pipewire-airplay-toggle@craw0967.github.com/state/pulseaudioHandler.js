import { logErr } from "../functions/logs.js";
import { AudioServerHandler } from './audioServerHandler.js';

/**
 * A handler for PulseAudio-specific audio server interactions.
 * This class handles logic unique to PulseAudio, such as removing duplicate
 * RAOP sinks.
 * @class PulseAudioHandler
 * @extends AudioServerHandler
 */
export class PulseAudioHandler extends AudioServerHandler {
    /**
     * @constructor
     * @param {AirPlayToggleExtensionState} state - The extension's state object.
     */
    constructor(state) {
        super(state);
    }

    /**
     * Overrides the base handler to add logic for removing duplicate sinks,
     * a common issue with PulseAudio's RAOP implementation.
     * @private
     * @override
     * @param {Array<object>} sinks - An array of RAOP sink objects.
     */
    _handleRaopSinks(sinks) {
        this._removeDuplicateRaopSinks(sinks);
    }

    /**
     * Removes duplicate RAOP sinks, a behavior specific to PulseAudio.
     * @private
     * @param {Array<object>} sinks - An array of RAOP sink objects.
     */
    _removeDuplicateRaopSinks(sinks) {
        // This function removes duplicates even when the extension is "off" (but not disabled)
        // due to the continuous monitoring of `pactl subscribe`.
        if(!this.state.getSettingsKey("get_boolean", "hide-duplicate-raop-sinks")) {
            this._parseRaopSinks(sinks);
            return;
        }

        try {
            const dupSinkOwnerModules = this._determineDuplicateSinks(sinks);
                    
            if(dupSinkOwnerModules?.length > 0) {
                dupSinkOwnerModules.forEach((moduleId) => {
                    this._loadUnloadModule(false, moduleId); // Unload the owner modules of the dup sinks. This will trigger new events and restart this process.
                });
            } else { // If there are no duplicates remaining, we can parse the sinks.
                this._parseRaopSinks(sinks);
            }

        } catch (err) {
            logErr(this.state, err);
        }
    }

    /**
     * Determines the owner module IDs of duplicated RAOP sinks from the given sinks array.
     * @private
     * @param {Array<Object>} sinks - An array of RAOP sinks.
     * @returns {string[]} An array of duplicate RAOP sink owner module IDs.
     */
    _determineDuplicateSinks(sinks) {
        let dupSinkOwnerModules = [];

        if(sinks && sinks.length > 0) { 
            let sortedSinksArray = sinks.sort((a, b) => {
                return a.name.localeCompare(b.name);
            });
            
            for(let i = 0; i < sortedSinksArray.length; i++) {
                let name = sortedSinksArray[i].name;
                let nextIndex = i + 1;
                
                // Check if the next sink is a duplicate of the current sink.
                // PulseAudio duplicates RAOP sinks by appending a dot and a number (e.g., "sink_name.2").
                // We use a regex to ensure we only match this specific pattern and avoid false positives
                // where one sink name is a prefix of another (e.g. "Living Room" vs "Living Room TV").
                const duplicateRegex = new RegExp(`^${name}\\.\\d+$`);
                if(sortedSinksArray[nextIndex] && duplicateRegex.test(sortedSinksArray[nextIndex].name)) {
                //if(sortedSinksArray[nextIndex] && sortedSinksArray[nextIndex].name.startsWith(name)) {
                    dupSinkOwnerModules.push(sortedSinksArray[nextIndex].owner_module);
                    sortedSinksArray.splice(nextIndex, 1);
                    i--;
                }
            }
        }

        return dupSinkOwnerModules;
    }

    /**
     * Gets the PulseAudio-specific arguments for creating a combined sink.
     * Uses the `slaves` property, as `sinks` is not supported by PulseAudio
     * for this module.
     * @private
     * @override
     * @param {string} sinkName - The desired name for the sink.
     * @param {string} combinedSinks - A string of sink names to combine.
     * @returns {string[]} An array of command-line arguments for `pactl load-module module-combine-sink`.
     */
    _getCombinedSinkModuleArguments(sinkName, combinedSinks) {
        return [
            "sink_name=pat.craw0967.airplay.enabled.speakers",
            "rate=44100", 
            "channels=2", 
            "channel_map=stereo",
            `sink_properties="device.description='${sinkName}'"`,
            `slaves="${combinedSinks}"` // PulseAudio requires 'slaves' instead of 'sinks'.
        ];
    }
}