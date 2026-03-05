import GObject from "gi://GObject";
import Clutter from "gi://Clutter";
import St from "gi://St";

import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import { AirPlayOutputSlider } from "./outputSlider.js";

/**
 * Represents a single AirPlay speaker control within the multi-speaker menu.
 * It acts as a submenu item that contains a volume slider for an individual sink.
 * Clicking the item toggles the speaker's inclusion in the combined sink.
 *
 * @class AirPlayOutputControl
 * @extends PopupMenu.PopupSubMenuMenuItem
 */
export const AirPlayOutputControl = GObject.registerClass(
    class AirPlayOutputControl extends PopupMenu.PopupSubMenuMenuItem {
        _sinkEnabled;
        _menuItem;
        _slider;
        _sink;
        _icon;

        /**
         * @constructor
         * @param {object} args - The constructor arguments.
         * @param {AirPlayToggleExtensionState} args.state - The extension state object.
         * @param {object} args.sink - The sink object this control represents.
         */
        constructor({ ...args }) {
            const { state, sink, ...addArgs } = args;
            super(sink.description, {
                
                ...addArgs,
            });

            this.state = state;
            this._sink = sink;

            // Set initial "enabled" status based on persistent data from gsettings
            this._sinkEnabled = this.state.getSettingsKey("get_string", "combined-sinks")?.split(",").includes(this._sink.name);

            this._menuItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
            this._slider = new AirPlayOutputSlider({state: this.state, sink: this._sink, ...addArgs});

            this._setupControl();
        }

        /**
         * Asynchronously sets up the control's components and signals.
         * This ensures components are rendered before their state is manipulated.
         *
         * @private
         * @async
         */
        async _setupControl() {
            // Make this method async and use a promise to allow the components to get added and fully loaded/rendered
            await this._setupControlComponents();
            this._connectControlSignals();
            
            // Otherwise you will get errors and rendering issues when trying to set the initial open/enabled state
            if(this._sinkEnabled) {
                this._updateControlOpenState();
            }
        }

        /**
         * Creates and arranges the UI components for the control.
         * This includes the icon and the volume slider within the submenu.
         *
         * @private
         * @async
         */
        async _setupControlComponents() {
            this._icon = new St.Icon({style_class: "popup-menu-icon", gicon: this.state.getStateKey("speakerDisabledGIcon")});
            this.add_child(this._icon);
            this._triangleBin.visible = false;

            this._menuItem.add_child(this._slider);
            this.menu.addMenuItem(this._menuItem);
        }

        /**
         * Connects the necessary signals for the control.
         * It handles the button press to toggle the sink's enabled state
         * and stops the event to prevent default submenu activation.
         *
         * @private
         */
        _connectControlSignals() {
            this.state.connectSignal(
                this,
                "button-press-event",
                () => {
                    this._sinkEnabled = !this._sinkEnabled; // Toggle your state

                    this._updateControlOpenState();
                    this.state.updateCombinedSinks(this._sink.id);

                    // Stop the event here to prevent the default activate handler from running
                    // This is much safer and less fragile then overriding PopupSubMenuMenuItem functions
                    return Clutter.EVENT_STOP;
                }
            );
        }

        /**
         * Updates the visual state of the control based on whether the sink is enabled.
         * When enabled, it opens the submenu to show the slider and changes the icon.
         * It uses a workaround (`this.menu.isOpen = false`) to prevent the menu from
         * closing automatically when another control is clicked, allowing multiple
         * sliders to be visible at once.
         *
         * @private
         */
        _updateControlOpenState() {
            if (this._sinkEnabled) {
                // Open the menu and set the isOpen state to false to prevent the menu from closing when other controls open
                this._setOpenState(true);
                this.menu.isOpen = false;
                this._icon.gicon = this.state.getStateKey("speakerEnabledGIcon");
            } else {
                // To close, we need to reverse the isOpen hack before calling setOpenState
                this.menu.isOpen = true;
                this._setOpenState(false);
                this._icon.gicon = this.state.getStateKey("speakerDisabledGIcon");
            }
        }

        /**
         * Cleans up all resources used by this control, including child widgets.
         */
        destroy() {
            this._slider.destroy();
            this._slider = null;

            this._menuItem.destroy();
            this._menuItem = null;

            this._sink = null;
            this._sinkEnabled = null;

            super.destroy();
        }
    }
);