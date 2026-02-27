import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import St from "gi://St";
import Clutter from "gi://Clutter";

import { AirPlayOutputSlider } from "./outputSlider.js";

export const AirPlayMultiSpeakerControl = class AirPlayMultiSpeakerControl extends PopupMenu.PopupMenuSection { 
    _sliderChangedIds = {};
    _iconClickedIds = {};

    constructor({ ...args }) {
        const { state, ...addArgs } = args;
        super({
            ...addArgs,
        });

        this.state = state;
        this.state.updateGIcon('speakerEnabledGIcon', 'selection-mode-symbolic.svg');
        this.state.updateGIcon('speakerDisabledGIcon', 'radio-symbolic.svg');
 
        this._sliders = {};
        this._sliderMenuItems = [];
        this._sliderMenus = [];

        this._setupSliders();
        this._connectSignals();

        this.actor.hide();
    }

    _connectSignals() {
        //Update button visibility if the toggle button is checked
        this.state.connectSignal(this.state, 'pipewire-airplay-toggle-state-changed', (obj, key) => {
            if (key === 'raopSinksMap') {
                this._setupSliders();
            }
        });
    }
    
    _setupSliders() {
        const sinks = this.state.getStateKey("raopSinksMap");

        if (Object.keys(sinks).length < 1 && Object.keys(this._sliders).length > 0) {
            this._destroySliders(false);
            
            return;
        }

        Object.keys(sinks).forEach((key) => {
            const sink = sinks[key];
            this._sliders[key] = new AirPlayOutputSlider();

            // Add a state variable
            let isEnabled = false;

            this._sliderChangedIds[key] = this.state.connectSignal(
                this._sliders[key].slider, 
                'notify::value',
                () => this.state.updateSinkVolume(key, this._sliders[key].slider.value * 100)
            );

            this._sliders[key].slider.block_signal_handler(this._sliderChangedIds[key]);
            this._sliders[key].slider.value = parseFloat(sink.volume || 0) / 100.0;
            this._sliders[key].slider.unblock_signal_handler(this._sliderChangedIds[key]);

            this._sliders[key]._leftChannelButton.checked = sink.channels.includes("front-left");
            this._sliders[key]._rightChannelButton.checked = sink.channels.includes("front-right");

            this._iconClickedIds[key] = this.state.connectSignal(
                this._sliders[key], 
                'icon-clicked',
                () => this.state.toggleSinkMute(key)
            );

            // To play just left or right channel audio with pulse, we'd need to remap the channels to a new sink
            // pactl load-module module-remap-sink sink_name=airplay_left_channel master=raop_output.MyAirPlaySpeaker channels=1 master_channel_map=front-left channel_map=mono
            // Then combine the sinks
            // pactl load-module module-combine-sink sink_name=my_combined_sink slaves=airplay_left_channel,alsa_output.pci-0000_00_1f.3.analog-stereo

            const subMenu = new PopupMenu.PopupSubMenuMenuItem(sink.description);
            const icon = new St.Icon({style_class: 'popup-menu-icon', gicon: this.state.getStateKey("speakerDisabledGIcon")}); //TODO - gicon needs to eventually be set based on current state
            subMenu.add_child(icon);
            subMenu._triangleBin.visible = false;

            // TODO - properly track and disconnect this
            subMenu.connect('button-press-event', () => {
                isEnabled = !isEnabled; // Toggle your state

                if (isEnabled) {
                    // Open the menu and set the isOpen state to false to prevent the menu from closing when other submenus open
                    subMenu._setOpenState(true);
                    subMenu.menu.isOpen = false;
                    icon.gicon = this.state.getStateKey("speakerEnabledGIcon");
                } else {
                    // To close, we need to reverse the isOpen hack before calling setOpenState
                    subMenu.menu.isOpen = true;
                    subMenu._setOpenState(false);
                    icon.gicon = this.state.getStateKey("speakerDisabledGIcon");
                }

                // Stop the event here to prevent the default activate handler from running
                // This is much safer and less fragile then overriding PopupSubMenuMenuItem functions
                return Clutter.EVENT_STOP;
            });

            this.addMenuItem(subMenu);
            const sliderItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
            sliderItem.add_child(this._sliders[key]);
            subMenu.menu.addMenuItem(sliderItem);

            this._sliderMenuItems.push(sliderItem);
            this._sliderMenus.push(subMenu);
        });
    }

    _destroySliders(disconnect = true) {
        Object.keys(this._sliders).forEach((key) => {
            this._sliders[key].destroy();
            this._sliders[key] = null; //This should just delete the key from the map - TODO 
        });
        this._sliders = disconnect ? null : [];

        this._sliderMenuItems?.forEach((item) => {
            item.destroy();
            item = null;
        });
        this._sliderMenuItems = disconnect ? null : [];

        this._sliderMenus?.forEach((menu) => {
            menu.destroy();
            menu = null;
        });
        this._sliderMenus = disconnect ? null : [];
    }

    destroy() {
        this._destroySliders(true);
        
        this._sliderChangedIds = null;
        this._iconClickedIds = null;

        super.destroy();
    }
}