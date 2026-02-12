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
        this._multiSpeakerMenu = new AirPlayMultiSpeakerMenu({ state: this.state });
    }

    /**
     * Disables the extension.
     * This is called when the extension is disabled or uninstalled.
     */
    disable() {
        // https://gjs.guide/extensions/review-guidelines/review-guidelines.html#destroy-all-objects
        this._multiSpeakerMenu?.destroy();
        this._multiSpeakerMenu = null;
        
        this._indicator?.destroy();
        this._indicator = null;

        this.state.destroy();
        this.state = null;
    }
}