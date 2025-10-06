/* pipewire-airplay-toggle Version 7
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

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import { connectSettings } from "./functions/utils.js";
import { AirPlayIndicator } from "./classes/indicator.js";
import { AirPlayToggle } from "./classes/toggle.js";

export default class PipeWireAirPlayToggleExtension extends Extension {
    enable() {
        this.settings = this.getSettings();

        this.toggle = new AirPlayToggle(this)
        this.indicator = new AirPlayIndicator(this);
        this.indicator.quickSettingsItems.push(this.toggle);

        connectSettings(this, this.settings);

        Main.panel.statusArea.quickSettings.addExternalIndicator(
            this.indicator
        );
    }

    disable() {
        if(this.toggle) {
            if (this.toggle._monitorProcess) {
                this.toggle._monitorProcess.force_exit();
            }

            this.toggle._monitorProcess = null;
            this.toggle._raopModuleId = null;

            this.toggle.destroy();
            this.toggle = null;
        }

        this.indicator?.quickSettingsItems?.forEach((item) => {
            item.destroy();
            item = null;
        });
        this.indicator?.destroy();
        this.indicator = null;

        this.settings = null;
    }
}