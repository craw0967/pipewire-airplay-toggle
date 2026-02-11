/* Requirements

- When enabled, show menu icon next to audio select/volume slider - figured out
- menu icon expands popupmenu
- use submenu to show/hide toggle switches for speakers
- Auto add default RAOP sink to combined?
- Figure out some way to store last combined speakers and settings?
- if speakers added
    - Use Volume sliders to set individual speaker volumes
    - Include mute/unmute icon
- Use volume slider menu to add options for channels, etc.
    - Default to both channels
    - Button for left channel
    - Button for right channel
    - Stereo only for now?
- Include other options below sliders or in prefs?

*/

import GObject from "gi://GObject";
import Gio from "gi://Gio";
import St from "gi://St";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import { AirPlayMultiSpeakerSelect } from "./multiSpeakerSelect.js";
import { AirPlayMultiSpeakerControl } from "./multiSpeakerControl.js";

export const AirPlayMultiSpeakerMenu = GObject.registerClass(
    class AirPlayMultiSpeakerMenu extends St.Button { 
        constructor(state) {
            super({
                child: new St.Icon({icon_name: 'open-menu-symbolic'}),
                style_class: "icon-button flat",
                can_focus: true,
                x_expand: false,
                y_expand: true,
                accessible_name: _("Open AirPlay Multi-Speaker Menu"),
            });

            this.state = state;
            
            this.visible = this.state.getSettingsKey("get_boolean", "combined-speakers");

            this.QuickSettings = Main.panel.statusArea.quickSettings;
            this._slider = this.QuickSettings?._volumeOutput?._output;
            
            this._slider.child.add_child(this);
            this._slider.menu.addMenuItem(this.mixerMenuSpeakerSection = new AirPlayMultiSpeakerSelect(), 1);
            this._slider.menu.addMenuItem(this.mixerMenuSeparator = new PopupMenu.PopupSeparatorMenuItem(), 1);
            this._slider.menu.addMenuItem(this.mixerMenuVolumeSection = new AirPlayMultiSpeakerControl(), 1);

            this._connectEvents();
        }

        destroy() {
            this._disconnectEvents();

            this.mixerMenuSpeakerSection?.destroy();
            this.mixerMenuSpeakerSection = null;
            this.mixerMenuSeparator?.destroy();
            this.mixerMenuSeparator = null;
            this.mixerMenuVolumeSection?.destroy();
            this.mixerMenuVolumeSection = null;
            
            super.destroy();
        }

        revert() {
            this._slider.menu.setHeader("audio-headphones-symbolic", (_)("Sound Output"));
            this._slider.menu._setSettingsVisibility(Main.sessionMode.allowSettings);
            this._updateSeparatorVisibility();
            this._slider._deviceSection.box.show();
            
        }

        _updateSeparatorVisibility() {
            //TODO - use the _getMenuItems method to destroy menu items in other classes
            for (const item of this._slider.menu._getMenuItems()) {
                if (!(item instanceof PopupMenu.PopupSeparatorMenuItem)) {
                    continue;
                }
                this._slider.menu._updateSeparatorVisibility(item);
            }
        }

        _connectEvents() {
            this._mmbConnectId = this.connect('clicked', () => {
                this.mixerMenuSpeakerSection.box.show();
                this.mixerMenuSeparator.actor.show();
                this.mixerMenuVolumeSection.box.show();
                this._slider.menu.setHeader("audio-headphones-symbolic", _("AirPlay Speakers"));
                this._slider._deviceSection.box.hide();
                this._slider.menu._setSettingsVisibility(false);
                this._updateSeparatorVisibility();
                this._slider.menu.open(true);
            });
            
            this._mmbClosedId = this._slider.menu.connect("menu-closed", () => {
                this.mixerMenuSpeakerSection.box.hide();
                this.mixerMenuSeparator.actor.hide();
                this.mixerMenuVolumeSection.box.hide();
                this.revert(this._slider);
            });

            //bind button visibility to 'combined-speakers' setting
            this.state.bindSetting('combined-speakers',
                this, 
                'visible',
                Gio.SettingsBindFlags.DEFAULT
            );
        }

        _disconnectEvents() {
            this._slider.menu.disconnect(this._mmbClosedId);
            this.disconnect(this._mmbConnectId);
        }
    }
);