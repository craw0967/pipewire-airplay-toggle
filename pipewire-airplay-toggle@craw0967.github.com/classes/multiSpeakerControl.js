import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import { AirPlayOutputSlider } from "./outputSlider.js";

export const AirPlayMultiSpeakerControl = class AirPlayMultiSpeakerControl extends PopupMenu.PopupMenuSection { 
    constructor() {
        super();

        this._sliders = [
            new AirPlayOutputSlider()
        ];

        this._sliders.forEach((slider) => {
            this.box.add_child(slider);
        });

        this.box.hide();
    }

    destroy() {
        this._sliders?.forEach((slider) => {
            slider.destroy();
            slider = null;
        })
        
        super.destroy();
    }
}