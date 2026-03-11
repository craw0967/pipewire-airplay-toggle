import { AudioServerHandler } from './audioServerHandler.js';

/**
 * A handler for PipeWire-specific audio server interactions.
 * @class PipeWireHandler
 * @extends AudioServerHandler
 */
export class PipeWireHandler extends AudioServerHandler {
    /**
     * @constructor
     * @param {AirPlayToggleExtensionState} state - The extension's state object.
     */
    constructor(state) {
        super(state);
    }

    /**
     * Gets the PipeWire-specific arguments for creating a combined sink.
     * Uses `latency_compensate=true` and the `sinks` property.
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
            "latency_compensate=true", // This only works for PipeWire. Pulseaudio fails to load the module if it's used.
            `sinks="${combinedSinks}"`
        ];
    }

    // Don't use pw-link. Keeping for now because I may want to replicate the volume setting feature
    /* // We really need to sort out volume on add. 
    async _addRemoveCombinedSinks(sinkId) {
        let combinedSinks = this.state.getSettingsKey("get_string", "combined-sinks");
        let raopSinksMap = this.state.getStateKey("raopSinksMap");
        const sinkName = raopSinksMap[sinkId].name;
        const addSink = combinedSinks.includes(sinkName)
        try {
            // TODO - Add a setting to allow users to set if they want to auto adjust volume?
            // Automatically adjusting the volume down is to help safeguard against immediately playing audio at high volume levels
            // And to help prevent leaving speakers at high volume levels if they're enabled and disabled.
            // Speakers may retain the volume levels they were last set to
            if(addSink) {
                const sinkVolume = Number(raopSinksMap[sinkId].volume.replace("%", ""));
                let combinedSinkVolume = await this._getSinkVolume(await this._getCombinedSinkId(this.state.getStateKey("currentCombineModuleId")));
                combinedSinkVolume = combinedSinkVolume.length > 0 ? combinedSinkVolume[0]?.split("front-left:") : null;
                combinedSinkVolume = combinedSinkVolume.length > 0 ? combinedSinkVolume[1].split("/") : null;
                combinedSinkVolume = combinedSinkVolume.length > 0 ? Number(combinedSinkVolume[1].trim().replace("%", "")) : null;

                // This isn't working. Probably not parsing correctly.
                if (sinkVolume && combinedSinkVolume) {
                    if(sinkVolume > combinedSinkVolume) {
                        await this.updateSinkVolume(sinkId, combinedSinkVolume);
                    }
                }
            }
            this._toggleLinkSinkToCombinedSink(sinkName, addSink);
        } catch (err) {
            logErr(this.state, err);
        }
    }

    _toggleLinkSinkToCombinedSink(sinkName, add) {
        const commandArray = [
            "pw-link"
        ];

        if (!add) {
            commandArray.push(
                "-d"
            );
        }

        commandArray.push(
            "pat.craw0967.airplay.enabled.speakers",
            sinkName
        );

        try {
            asyncExecCommandAndReadOutput(commandArray);
        } catch (err) {
            throw new Error(err);
        }
    } */
}