import St from "gi://St";
import GObject from "gi://GObject";

import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";

export const AirPlayOutputSlider = GObject.registerClass(
    class AirPlayOutputSlider extends QuickSettings.QuickSlider {
        constructor() {
            super({
                icon_name:'audio-volume-muted-symbolic',
                icon_reactive: true,
                menu_enabled: false
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
            this.child.add_child(this._leftChannelButton);
            this.child.add_child(this._rightChannelButton);

        }

        destroy() {
            this._leftChannelButton?.destroy();
            this._leftChannelButton = null;
            this._rightChannelButton?.destroy();
            this._rightChannelButton = null;
            
            super.destroy();
        }
    }
);