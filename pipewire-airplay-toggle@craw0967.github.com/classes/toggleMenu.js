import St from "gi://St";
import Gio from "gi://Gio";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";

import { INDICATOR_TEXT } from "../constants/config.js";

export const AirPlayToggleMenu = class AirPlayToggleMenu {
    constructor(extensionObject, toggleObject) {
        this._extensionObject = extensionObject;
        this._toggleObject = toggleObject;
        this.menu = this._toggleObject.menu;

        //this.setMenuHeader
        this._createOptionsMenuSection();
        //this._createPrimaryMenuSection();
        this._createSettingsMenuSection();
        
        this.QuickSettings = Main.panel.statusArea.quickSettings;

        this.mixerMenuButton = new St.Button({
			child: new St.Icon({icon_name: 'open-menu-symbolic'}),
			style_class: "icon-button flat",
			can_focus: true,
			x_expand: false,
			y_expand: true,
			visible: true,
			accessible_name: _("Open volumx mixer"),
		})

        
        this.slider = this.QuickSettings?._volumeOutput?._output;
        // Need to perform null checks and need to create the menu section
        // Also need to destroy all of these items after they're created
        this.mixerSubMenu = new PopupMenu.PopupSubMenuMenuItem('Combined Speakers', true);
        this.mixerSubMenu.menu.addMenuItem(new PopupMenu.PopupSwitchMenuItem('Test', false));
        
        this.mixerMenuSection = new PopupMenu.PopupMenuSection();
        this.mixerMenuSection.addMenuItem(this.mixerSubMenu);
        this.mixerMenuSection.box.hide();

        
        //this.mixerSliderLeft = new QuickSettings.QuickToggle({title: 'Left Channel'});
        //this.mixerSliderRight = new QuickSettings.QuickToggle({title: 'Right Channel'});

        this.mixerSliderLeft = new St.Button({
			child: new St.Icon({icon_name: 'audio-speakers-rtl-symbolic'}),
			style_class: "icon-button", //flat
			can_focus: true,
			x_expand: false,
			y_expand: true,
			visible: true,
            toggleMode: true,
			accessible_name: _("Open volumx mixer"),
		})
        this.mixerSliderRight = new St.Button({
			child: new St.Icon({icon_name: 'audio-speakers-symbolic'}),
			style_class: "icon-button", //flat
			can_focus: true,
			x_expand: false,
			y_expand: true,
			visible: true,
            toggleMode: true,
			accessible_name: _("Open volumx mixer"),
		})
        this.mixerSlider = new QuickSettings.QuickSlider({icon_name:'audio-volume-muted-symbolic', icon_reactive: true, menu_enabled: false });
        this.mixerSlider.child.add_child(this.mixerSliderLeft);
        this.mixerSlider.child.add_child(this.mixerSliderRight);
        this.mixerVolumeSection = new PopupMenu.PopupMenuSection();
        this.mixerVolumeSection.box.add_child(this.mixerSlider);
        this.mixerVolumeSection.box.hide();

        this.mixerSlider.menu.connect('open-state-changed', (menu, isOpen) => {
    if (isOpen) {
        // Reparent menu to uiGroup if not already
        if (!menu.actor.get_parent()) {
            Main.uiGroup.add_child(menu.actor);
        }

        // Ensure it's visible
        menu.actor.show();

        // Get the slider's global position
        const [stageX, stageY] = this.mixerSlider.get_transformed_position();

        // Get slider height to offset the menu below it
        const sliderHeight = this.mixerSlider.height;

        // Optional: Add some vertical padding
        const verticalOffset = 4;

        // Position the menu below the slider
        menu.actor.set_position(stageX, stageY + sliderHeight + verticalOffset);
    } else {
        menu.actor.hide();
    }
});

        this.slider.menu.addMenuItem(this.mixerVolumeSection, 1);
        this.slider.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), 1);
        this.slider.menu.addMenuItem(this.mixerMenuSection, 1);
        this.slider.child.add_child(this.mixerMenuButton);

        //bind button visibility to 'combined-speakers' setting
        this._combinedMenuButtonBinding = this._extensionObject.settings.bind(
            'combined-speakers',
            this.mixerMenuButton, 
            'visible',
            Gio.SettingsBindFlags.DEFAULT
        );

        this.mmbConnectId = this.mixerMenuButton.connect('clicked', () => {
            this.mixerMenuSection.box.show();
            this.mixerVolumeSection.box.show();
            this.slider.menu.setHeader("audio-headphones-symbolic", _("AirPlay Speakers"));
            this.slider._deviceSection.box.hide();
            this.slider.menu._setSettingsVisibility(false);
            //this only works if there's not another item after the separator.
            this._updateSeparatorVisibility();
            
            // Show the box in this order so that it's not visible when _updateSeparatorVisibility updates on menu open.  This will keep the separator hidden
            this.slider.menu.open(true);
            
            
        });
        //open and close animation appears jerky.  this has to do with visibility of elements showing/hiding before menu is fully closed
        this.mmbClosedId = this.slider.menu.connect("menu-closed", () => {
            this.mixerMenuSection.box.hide();
            this.mixerVolumeSection.box.hide();
            this.revert(this.slider);
        })
      
        
        
        //Global.GetStreamSlider().then(
		//		({ OutputStreamSlider }) => this.createMenu(OutputStreamSlider)
        
    }

    revert() {
        this.slider.menu.setHeader("audio-headphones-symbolic", (_)("Sound Output"));
        this.slider.menu._setSettingsVisibility(Main.sessionMode.allowSettings);
        this._updateSeparatorVisibility();
        this.slider._deviceSection.box.show();
        
    }

    _updateSeparatorVisibility() {
        for (const item of this.slider.menu._getMenuItems()) {
            if (!(item instanceof PopupMenu.PopupSeparatorMenuItem)) {
                continue;
            }
            this.slider.menu._updateSeparatorVisibility(item);
        }
    }

    destroy() {
        this._combinedSpeakersMenuItem?.disconnect();
        this._combinedSpeakersMenuItem?.destroy();
        this._combinedSpeakersMenuItem = null;

        this._combinedMenuButtonBinding.unbind();
        this.mixerMenuButton?.disconnect(this.mmbConnectId);
        this.slider?.menu?.disconnect(this.mmbClosedId);
        this.mixerMenuButton?.destroy();
        this.mixerMenuButton = null;
        this.mixerMenuSection?.destroy();
        this.mixerMenuSection = null;
    }

    setMenuHeader(icon) {
        this.menu.setHeader(
            icon, 
            _(INDICATOR_TEXT)
        );
    }

    _createOptionsMenuSection() {
        this._optionsSection = new PopupMenu.PopupMenuSection();

        this._combinedSpeakersMenuItem = new PopupMenu.PopupImageMenuItem('Enable Streaming to Multiple Speakers', null);
        //this._combinedSpeakersSubMenu?.setIcon(icon); //This works but I need to add an icon file
        this._combinedSpeakersMenuItem.connect('activate', () => this._toggleCombinedSpeakers());

        this._setCombinedSpeakersOrnament(this._extensionObject.settings.get_boolean("combined-speakers"));

        this.menu.addMenuItem(this._combinedSpeakersMenuItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    }

    _createSettingsMenuSection() {
        // Add an entry-point for more settings
        const settingsItem = this.menu.addAction('Extension Settings',
            () => this._extensionObject.openPreferences());

        // Ensure the settings are unavailable when the screen is locked
        settingsItem.visible = Main.sessionMode.allowSettings;
        this.menu._settingsActions[this._extensionObject.uuid] = settingsItem;
    }

    _toggleCombinedSpeakers() {
        const combinedSpeakersEnabled = !this._extensionObject.settings.get_boolean("combined-speakers");
        this._extensionObject.settings.set_boolean("combined-speakers", combinedSpeakersEnabled);

        this._setCombinedSpeakersOrnament(combinedSpeakersEnabled);
    }

    _setCombinedSpeakersOrnament(combinedSpeakersEnabled) {
        this._combinedSpeakersMenuItem.setOrnament(combinedSpeakersEnabled ? PopupMenu.Ornament.CHECK : PopupMenu.Ornament.NONE);
    }

}

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