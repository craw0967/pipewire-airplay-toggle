import GObject from "gi://GObject";
import { gettext as _ } from "resource:///org/gnome/shell/extensions/extension.js";
import St from "gi://St";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import { AirPlayMultiSpeakerControls } from "./multiSpeakerControls.js";

import { logErr, logWarn } from "../functions/logs.js";
import { COMBINED_SINK_NAME, MULTI_SPEAKER_MENU_ACCESSIBLE_NAME, DEFAULT_VOLUME_MENU_HEADER } from "../constants/config.js";

/**
 * A button and menu system for controlling multiple AirPlay speakers.
 * This class adds a button to the system's main volume/output slider.
 * When clicked, it replaces the volume slider's default menu with a custom
 * menu for managing individual AirPlay speaker volumes.
 *
 * @class AirPlayMultiSpeakerMenu
 * @extends St.Button
 */
export const AirPlayMultiSpeakerMenu = GObject.registerClass(
    class AirPlayMultiSpeakerMenu extends St.Button { 
        /**
         * @constructor
         * @param {object} args - The constructor arguments.
         * @param {AirPlayToggleExtensionState} args.state - The extension state object.
         */
        constructor({ ...args }) {
            const { state, ...addArgs } = args;
            super({
                ...addArgs,
                style_class: "icon-button flat",
                can_focus: true,
                x_expand: false,
                y_expand: true,
                accessible_name: _(MULTI_SPEAKER_MENU_ACCESSIBLE_NAME),
            });

            this.state = state;

            this.child = new St.Icon({gicon: this.state.getGIconFile("multiStreamGIcon")});

            this.QuickSettings = Main.panel.statusArea.quickSettings;
            this._slider = this.QuickSettings._volumeOutput._output;
            
            // This won't work if the volume output slider hasn't fully initialized
            // Catch the error and don't load the menu
            // This race condition should be prevented in the extension.js enable() function
            // NOTE: This class relies on internal properties of the Quick Settings volume
            // slider (_volumeOutput, _output, _deviceSection). These may change in
            // future GNOME versions, which could break this functionality.
            try {
                this.visible = false;
                this._slider.child.add_child(this);

                this._mixerMenuSeparator = new PopupMenu.PopupSeparatorMenuItem()
                this._mixerMenuVolumeSection = new AirPlayMultiSpeakerControls({ state: this.state })

                this._slider.menu.addMenuItem(this._mixerMenuSeparator, 1);
                this._slider.menu.addMenuItem(this._mixerMenuVolumeSection, 1);

                this._connectMultiSpeakerMenuSignals();
                this._setMultiSpeakerMenuVisibility();
            } catch(err) {
                logWarn(this.state, "Unable to detect quick settings menu dependencies. Multi-Speaker menu won't be available.");
                logErr(this.state, err);
            }
        }

        /**
         * Cleans up resources used by the menu.
         * This method destroys the menu items that were added to the system
         * volume slider.
         */
        destroy() {
            this._mixerMenuSeparator?.destroy();
            this._mixerMenuSeparator = null;

            this._mixerMenuVolumeSection?.destroy();
            this._mixerMenuVolumeSection = null;

            super.destroy();
        }

        /**
         * Reverts the main volume slider's menu to its original state.
         * This is called when the multi-speaker menu is closed.
         *
         * @private
         */
        revert() {
            this._slider.menu.setHeader("audio-headphones-symbolic", _(DEFAULT_VOLUME_MENU_HEADER));
            this._slider.menu._setSettingsVisibility(Main.sessionMode.allowSettings);
            this._updateSeparatorVisibility();
            this._slider._deviceSection.box.show();
            
        }

        /**
         * Updates the visibility of separators in the main volume slider's menu.
         *
         * @private
         */
        _updateSeparatorVisibility() {
            for (const item of this._slider.menu._getMenuItems()) {
                if (!(item instanceof PopupMenu.PopupSeparatorMenuItem)) {
                    continue;
                }
                this._slider.menu._updateSeparatorVisibility(item);
            }
        }

        /**
         * Connects signals for the multi-speaker menu button and related events.
         *
         * @private
         */
        _connectMultiSpeakerMenuSignals() {
            this.state.connectSignal(
                this,
                "clicked",
                () => {
                    this._mixerMenuSeparator.actor.show();
                    this._mixerMenuVolumeSection.box.show();
                    this._slider.menu.setHeader(this.state.getGIconFile("indicatorGIcon"), _(COMBINED_SINK_NAME));
                    this._slider._deviceSection.box.hide();
                    this._slider.menu._setSettingsVisibility(false);
                    this._updateSeparatorVisibility();
                    this._slider.menu.open(true);
                }
            );
            
            this.state.connectSignal(
                this._slider.menu,
                "menu-closed",
                () => {
                    this._mixerMenuSeparator.actor.hide();
                    this._mixerMenuVolumeSection.box.hide();
                    this.revert();
                }
            );

            //Connect menu button visibility to "combined-speakers" setting
            this.state.connectSetting("combined-speakers", () => {
                this._setMultiSpeakerMenuVisibility();
            });

            //Update menu button visibility if the toggle button is checked
            this.state.connectSignal(
                this.state, 
                "pipewire-airplay-toggle-state-changed", 
                (obj, key) => {
                    if (key === "modulesList") {
                        this._setMultiSpeakerMenuVisibility();
                    }
                }
            );
        }

        /**
         * Sets the visibility of the multi speaker menu based on extension settings.
         * If the combined-speakers setting is enabled and the toggle button is checked, then show the menu button
         * Otherwise, hide the menu button
         * @private
         */
        _setMultiSpeakerMenuVisibility() {
            if (this.state.getSettingsKey("get_boolean", "combined-speakers") === true && this.state.getStateKey("modulesList").includes("module-raop-discover")) {
               this.visible = true;
            } else {
               this.visible = false;
            }
        }
    }
);