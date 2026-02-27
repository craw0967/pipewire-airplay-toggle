// This mixin is for all functions related to audio server state and state management.
import { logErr } from "../functions/logs.js";
import { asyncExecCommandAndReadOutput } from "../functions/utils.js";


export const AudioServerMixin = (Base) => class extends Base {
    /**
     * @constructor
     * @param {object} args - The arguments for the constructor.
     */
    constructor({ ...args } = {}) {
        super({ ...args });
        
    }

    destroy() {
        if (super.destroy) super.destroy();
    }

    getSinkState() {

    }

    updateSinkState() {

    }

    getSinksList() {


    }

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

            if (output && output.length > 0) {
                const parsedOutput = JSON.parse(output);
                const filteredSinks = parsedOutput.filter((sink) => {
                    return sink?.properties?.["sess.media"]?.toString() === "raop"
                });

                if (filteredSinks?.length > 0) {
                    this.updateStateKey("raopSinksList", filteredSinks);
                    this._parseRaopSinks(filteredSinks);
                } else {
                    this.updateStateKey("raopSinksList", []);
                    this.updateStateKey("raopSinksMap", {});
                }
            } else {
                this.updateStateKey("raopSinksList", []);
                this.updateStateKey("raopSinksMap", {});
            }

            //console.log('the list of sinks is -', JSON.stringify(this.getStateKey("raopSinksList"), null, 2));

        } catch (err) {
            logErr(this.state, err);
        }
    }

    _parseRaopSinks(sinks) {
        let parsedSinks = {};

        sinks.forEach((sink) => {
            parsedSinks[sink.index] = {
                "name": sink.name,
                "description": sink.description,
                // The front-left and front-right channels will not vary for RAOP speakers in pulse, we should verify in pw
                // The slider wants volume in decimal percents, like 0.5. it's easiest to work with this number in pactl via integer percents, like 50% (see man pactl), so let's use the volume_percent
                "volume": sink.volume?.["front-left"]?.value_percent,
                // pactl list sinks output sets mute to true/false, but pactl set-mute-sink wants 1|0|toggle
                "muted": sink.mute ? 1 : 0,
                "channels": sink.channel_map,
                //If a speaker has been split into channels via 'module-remap-sink', store the parent speaker details here.
                "parent": { 
                    "name": "",
                    "id": ""
                },
                "combined": {
                    "enabled": false,
                    "name": "",
                    "id": ""
                }
            }
        });

        this.updateStateKey("raopSinksMap", parsedSinks && Object.keys(parsedSinks).length > 0 ? parsedSinks : {});

        console.log('the map of sinks is -', JSON.stringify(this.getStateKey("raopSinksMap"), null, 2));
    }

    async updateSinkVolume(sinkId, volume) {
        let raopSinksMap = this.getStateKey("raopSinksMap");

        if (raopSinksMap[sinkId]) {
            raopSinksMap[sinkId].volume = volume;
            this.updateStateKey("raopSinksMap", raopSinksMap, false);
        }
        
        const commandArray = [
            "pactl",
            "--format=json",
            "set-sink-volume",
            sinkId,
            volume.toString() + "%"
        ];
        try {
            await asyncExecCommandAndReadOutput(
                commandArray,
                null,
                null
            );
        } catch (err) {
            logErr(this.state, err);
        }
    }

    async toggleSinkMute(sinkId) {
        let raopSinksMap = this.getStateKey("raopSinksMap");

        if (raopSinksMap[sinkId]) {
            raopSinksMap[sinkId].muted = raopSinksMap[sinkId].muted === 1 ? 0 : 1;
            this.updateStateKey("raopSinksMap", raopSinksMap, false);
        }

        const commandArray = [
            "pactl",
            "set-sink-mute",
            sinkId,
            raopSinksMap[sinkId].muted === 1 ? "1" : "0"
        ];
        try {
            await asyncExecCommandAndReadOutput(
                commandArray,
                null,
                null
            );
        } catch (err) {
            logErr(this.state, err);
        }
    }
}