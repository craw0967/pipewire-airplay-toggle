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
}