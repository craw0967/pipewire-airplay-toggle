/* pipewire-airplay-toggle
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import * as Main from "resource:///org/gnome/shell/ui/main.js";

import { AirPlayIndicator } from "./classes/indicator.js";
import { AirPlayToggleExtensionState } from "./state/state.js";
import { AirPlayMultiSpeakerMenu } from "./classes/multiSpeakerMenu.js";

/**
 * The main class for the PipeWire AirPlay Toggle extension.
 * @extends Extension
 */
export default class PipeWireAirPlayToggleExtension extends Extension {
    /**
     * Enables the extension.
     * This is called when the extension is initialized.
     */
    enable() {
        this.state = new AirPlayToggleExtensionState();
        this.state.setExtensionObject(this);
        
        this._indicator = new AirPlayIndicator({ state: this.state });
        
        this._multiSpeakerMenu = null;
        const quickSettings = Main.panel.statusArea.quickSettings;

        // Connect to the quick setting menu's open-state-changed signal.
        // This is a clean, event-driven way to initialize the multi speaker menu UI,
        // ensuring the dependencies from GNOME Shell are loaded before we load the AirPlayMultiSpeakerMenu class
        const openStateSignalId = this.state.connectSignal(quickSettings.menu, 'open-state-changed', (menu, isOpen) => {
            if (isOpen && !this._multiSpeakerMenu) {
                // Once the menu is open, the volume slider should exist.
                // We do a one-time check and create our menu if needed.
                if (quickSettings._volumeOutput) {
                    this._multiSpeakerMenu = new AirPlayMultiSpeakerMenu({ state: this.state });

                    // The menu is created, so we can disconnect this signal handler
                    // to prevent it from running again.
                    // If the user never opens the quick setting menu, 
                    // this.state.destroy() will handle signal cleanup
                    this.state.disconnectSignal(menu, openStateSignalId);
                }
            }
        });
    }

    /**
     * Disables the extension.
     * This is called when the extension is disabled or uninstalled.
     */
    disable() {
        this.state?.destroy();
        this.state = null;
        
        this._multiSpeakerMenu?.destroy();
        this._multiSpeakerMenu = null;
        
        this._indicator?.destroy();
        this._indicator = null;
    }
}