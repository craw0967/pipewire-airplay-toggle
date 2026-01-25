import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

export const AirPlayMultiSpeakerSelect = class AirPlayMultiSpeakerControl extends PopupMenu.PopupMenuSection { 
    constructor() {
        super();

        this.mixerSubMenu = new PopupMenu.PopupSubMenuMenuItem('Combined Speakers', true);
        //TODO - Get each Airplay Speaker and add as a menu item
        this._airplaySpeakers = [
            new PopupMenu.PopupSwitchMenuItem('Test', false)
        ];

        this._airplaySpeakers.forEach((speaker) => {
            this.mixerSubMenu.menu.addMenuItem(speaker);
        });
        
        this.addMenuItem(this.mixerSubMenu);
        this.box.hide();
    }

    destroy() {
        this._airplaySpeakers?.forEach((speaker) => {
            speaker.destroy();
            speaker = null;
        });
        this.mixerSubMenu?.destroy();
        this.mixerSubMenu = null;

        super.destroy();
    }   
}