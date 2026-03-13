import GObject from "gi://GObject";
//import St from "gi://St";

import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";
import { MUTE_UNMUTE_LABEL } from "../constants/config.js";

/**
 * A volume slider control for an individual AirPlay sink.
 * It includes a mute/unmute button and updates its state based on the sink's properties.
 *
 * @class AirPlayOutputSlider
 * @extends QuickSettings.QuickSlider
 * @property {object} _sink - The sink object this slider controls.
 * @property {number} _volumeSignalId - The ID of the volume change signal handler.
 * @property {number} _muteSignalId - The ID of the mute icon click signal handler.
 * @property {number} _stateSignalId - The ID of the global state change signal handler.
 */
export const AirPlayOutputSlider = GObject.registerClass(
    class AirPlayOutputSlider extends QuickSettings.QuickSlider {
        _sink;
        _volumeSignalId;
        _muteSignalId;
        _stateSignalId;

        /**
         * @constructor
         * @param {object} args - The constructor arguments.
         * @param {AirPlayToggleExtensionState} args.state - The extension state object.
         * @param {object} args.sink - The sink object this slider controls.
         */
        constructor({ ...args }) {
            const { state, sink, ...addArgs } = args;
            super({
                icon_label: _(MUTE_UNMUTE_LABEL),
                //icon_name:"audio-volume-muted-symbolic",
                icon_reactive: true,
                menu_enabled: false,
                x_expand: true,
                ...addArgs
            });

            this.state = state;
            this._sink = sink;

            this._iconButton.remove_style_class_name("flat");

            this._connectSliderSignals();
            this._updateSliderState();

            /* Keeping for LR channel support in future versions
            // To play just left or right channel audio with pulse, we'd need to remap the channels to a new sink
            // pactl load-module module-remap-sink sink_name=airplay_left_channel master=raop_output.MyAirPlaySpeaker channels=1 master_channel_map=front-left channel_map=mono
            // Then combine the sinks
            // pactl load-module module-combine-sink sink_name=my_combined_sink slaves=airplay_left_channel,alsa_output.pci-0000_00_1f.3.analog-stereo
            this._leftChannelButton = new St.Button({
                child: new St.Icon({icon_name: "audio-speakers-rtl-symbolic"}),
                style_class: "icon-button pw-ap-toggle-icon-button",
                can_focus: true,
                x_expand: false,
                y_expand: false,
                visible: true,
                toggleMode: true,
                accessible_name: _("Enable/Disable Left Channel"),
            })
            this._rightChannelButton = new St.Button({
                child: new St.Icon({icon_name: "audio-speakers-symbolic"}),
                style_class: "icon-button pw-ap-toggle-icon-button",
                can_focus: true,
                x_expand: false,
                y_expand: false,
                visible: true,
                toggleMode: true,
                accessible_name: _("Enable/Disable Right Channel"),
            })

            this.child.add_child(this._leftChannelButton);
            this.child.add_child(this._rightChannelButton);
            */
        }

        /**
         * Connects signals for the slider's value changes, the mute icon click,
         * and global state changes that affect the sink.
         *
         * @private
         */
        _connectSliderSignals() {
            this._volumeSignalId = this.state.connectSignal(
                this.slider, 
                "notify::value",
                () =>  this.state.updateSinkVolume(this._sink.id, this.slider.value * 100)
            );

            this._muteSignalId = this.state.connectSignal(
                this, 
                "icon-clicked",
                () => this.state.updateSinkMute(this._sink.id)
            );

            this._stateSignalId = this.state.connectSignal(
                this.state, 
                "pipewire-airplay-toggle-state-changed", 
                (obj, key) => {
                    if (key === "raopSinksMap") {
                        const sinks = this.state.getStateKey("raopSinksMap");
                        this._sink = sinks?.[this._sink?.id];
                        if(this._sink) {
                            this._updateSliderState();
                        }
                    }
                }
            );
        }

        /**
         * Updates the slider's value and icon based on the current state of the
         * associated sink (volume and mute status). It blocks the 'notify::value'
         * signal during the update to prevent feedback loops.
         *
         * @private
         */
        _updateSliderState() {
            this.slider.block_signal_handler(this._volumeSignalId);
            this.slider.value = this._sink.muted === 1 ? 0 : parseFloat(this._sink.volume || 0) / 100.0;
            this.gicon = this._getVolumeIcon( this._sink.muted === 1 ? 0 : parseFloat(this._sink.volume || 0));
            this.slider.unblock_signal_handler(this._volumeSignalId);
        }

        /**
         * Determines the appropriate volume icon based on the volume level.
         *
         * @private
         * @param {number} volume - The current volume level (0-100+).
         * @returns {Gio.Icon} The GIcon corresponding to the volume level.
         */
        _getVolumeIcon(volume) {
            let iconKey = "";

            if(volume === 0) {
                iconKey = "volumeGIcon0";
            } else if(volume < 33) {
                iconKey = "volumeGIcon1";
            } else if (volume < 66) {
                iconKey = "volumeGIcon2";
            } else if (volume <= 100) {
                iconKey = "volumeGIcon3";
            } else {
                iconKey = "volumeGIcon4";
            }

            return this.state.getGIconFile(iconKey);
        }

        /**
         * Cleans up all resources used by this slider, including disconnecting
         * all signal handlers to prevent memory leaks.
         */
        destroy() {
            /* Keeping for LR channel support in future versions
            this._leftChannelButton?.destroy();
            this._leftChannelButton = null;
            this._rightChannelButton?.destroy();
            this._rightChannelButton = null;
            */

            this._sink = null;

            // Because this slider may get destroyed during normal use of the extension
            // We need to handle the signal cleanup here instead of relying on this.state.destroy()
            this.state.disconnectSignal(this.slider, this._volumeSignalId);
            this.state.disconnectSignal(this, this._muteSignalId);
            this.state.disconnectSignal(this.state, this._stateSignalId);
            
            this._volumeSignalId = null;
            this._muteSignalId = null;
            this._stateSignalId = null;
            
            super.destroy();
        }
    }
);