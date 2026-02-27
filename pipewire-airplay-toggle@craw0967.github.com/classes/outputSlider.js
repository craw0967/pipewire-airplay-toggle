import St from "gi://St";
import GObject from "gi://GObject";

import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";

export const AirPlayOutputSlider = GObject.registerClass(
    class AirPlayOutputSlider extends QuickSettings.QuickSlider {
        constructor() {
            super({
                icon_label: "Mute/Unmute",
                icon_name:'audio-volume-muted-symbolic',
                icon_reactive: true,
                menu_enabled: false,
                x_expand: true
            });

            this._iconButton.remove_style_class_name('flat');

            this._leftChannelButton = new St.Button({
                child: new St.Icon({icon_name: 'audio-speakers-rtl-symbolic'}),
                style_class: "icon-button pw-ap-toggle-icon-button",
                can_focus: true,
                x_expand: false,
                y_expand: false,
                visible: true,
                toggleMode: true,
                accessible_name: _("Enable/Disable Left Channel"),
            })
            this._rightChannelButton = new St.Button({
                child: new St.Icon({icon_name: 'audio-speakers-symbolic'}),
                style_class: "icon-button pw-ap-toggle-icon-button",
                can_focus: true,
                x_expand: false,
                y_expand: false,
                visible: true,
                toggleMode: true,
                accessible_name: _("Enable/Disable Right Channel"),
            })
            /*
            this._enableSpeakerButton = new St.Button({
                child: new St.Icon({icon_name: 'object-select-symbolic'}),
                //label: "Enable", //Can't have both label and icon like this
                style_class: "icon-button pw-ap-toggle-icon-button",
                can_focus: true,
                x_expand: false,
                y_expand: false,
                visible: true,
                toggleMode: true,
                accessible_name: _("Enable/Disable Speaker"),
            })*/
            this.child.add_child(this._leftChannelButton);
            this.child.add_child(this._rightChannelButton);
            //this.child.add_child(this._enableSpeakerButton);

        }

        destroy() {
            this._leftChannelButton?.destroy();
            this._leftChannelButton = null;
            this._rightChannelButton?.destroy();
            this._rightChannelButton = null;
            //this._enableSpeakerButton?.destroy();
            //this._enableSpeakerButton = null;
            
            super.destroy();
        }
    }
);