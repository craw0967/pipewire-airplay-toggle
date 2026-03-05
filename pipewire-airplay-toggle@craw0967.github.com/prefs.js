import Gio from "gi://Gio";
import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import GObject from "gi://GObject";

import {ExtensionPreferences, gettext as _} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import { PREFS_PAGES } from "./constants/config.js";
import { detectAudioServer } from "./functions/utils.js";
import { logErr } from "./functions/logs.js";

/**
 * A GObject class to represent an item in a combo box model.
 * It holds a label for display and a corresponding value.
 *
 * @class ComboOptions
 * @extends GObject.Object
 */
const ComboOptions = GObject.registerClass({
    Properties: {
        "label": GObject.ParamSpec.string(
            "label", "label", "label",
            GObject.ParamFlags.READWRITE,
            null),
        "value": GObject.ParamSpec.string(
            "value", "value", "value",
            GObject.ParamFlags.READWRITE,
            null),
    },
}, class ComboOptions extends GObject.Object {
    /**
     * @constructor
     * @param {string} label - The display label for the option.
     * @param {string} value - The underlying value for the option.
     */
    constructor(label, value) {
        super({label, value});
    }
});

/**
 * The preferences window for the PipeWire AirPlay Toggle extension.
 *
 * @class PipeWireAirPlayTogglePreferences
 * @extends ExtensionPreferences
 */
export default class PipeWireAirPlayTogglePreferences extends ExtensionPreferences {
    /**
     * Populates the preferences window with pages, groups, and rows.
     * This method is called by the GNOME Shell when the preferences window is opened.
     *
     * @param {Adw.PreferencesWindow} window - The preferences window to fill.
     * @async
     */
    async fillPreferencesWindow(window) {
        const pagesConfig = PREFS_PAGES;
        window._settings = this.getSettings();
        
        // Detect audio server if not already set
        await this._detectAndSetAudioServer(window);
        
        // TODO - This works and isn't very slow because the number of configured preferences is low
        // Need to consider optimizing this so that it's not using nested loops
        for(const pageConfig of pagesConfig) {
            // Create a preferences page, with a single group
            const page = new Adw.PreferencesPage({
                title: _(pageConfig.title),
                icon_name: pageConfig.icon_name
            });
            window.add(page);

            for (const groupConfig of pageConfig.groups) {
                const hidden = typeof groupConfig.hidden === "function" ? groupConfig.hidden(window._settings) : groupConfig.hidden;
                if(hidden) {
                    continue;
                }

                const group = this._createGroup(groupConfig);
                page.add(group);

                for (const rowConfig of groupConfig.rows) {
                    switch(rowConfig.type) {
                        case "switch":
                            this._switchRow = this._createSwitchRow(rowConfig.row);
                            group.add(this._switchRow);

                            this._connectSwitchRow(window, rowConfig);
                            break;
                        case "combo":
                            this._comboRow = this._createComboRow(rowConfig.row);
                            group.add(this._comboRow);
                            
                            this._connectComboRow(window, rowConfig)
                            break;
                        default:
                            // Preference types should be explicitly set
                    }
                    
                }
            }
        }
    }

    /**
     * Creates a new Adw.PreferencesGroup from a group configuration object.
     *
     * @private
     * @param {object} group - The group configuration object.
     * @param {string} [group.title] - The group title.
     * @param {string} [group.description] - The group description.
     * @returns {Adw.PreferencesGroup} A new preferences group.
     */
    _createGroup(group) {
        return new Adw.PreferencesGroup({
            title: group.title ? _(group.title) : null,
            description: group.description ? _(group.description) : null
        });
    }

    /**
     * Creates a new Adw.SwitchRow from a switch configuration object.
     *
     * @private
     * @param {object} row - The switch row configuration object.
     * @param {string} [row.title] - The switch title.
     * @param {string} [row.subtitle] - The switch subtitle.
     * @returns {Adw.SwitchRow} A new switch row.
     */
    _createSwitchRow(row) {
        return new Adw.SwitchRow({
            title: row.title ? _(row.title) : null,
            subtitle: row.subtitle ? _(row.subtitle) : null
        });
    }

    /**
     * Creates a new Gio.ListStore for a combo box from a model configuration.
     *
     * @private
     * @param {Array<object>} modelOptions - A list of option objects.
     * @param {string} modelOptions.label - The label for the option.
     * @param {string} modelOptions.value - The value for the option.
     * @returns {Gio.ListStore} A new list store containing ComboOptions.
     */
    _createModel(modelOptions) {
        const model = new Gio.ListStore({
            item_type: ComboOptions
        })
        for(const option of modelOptions) {
            model.append(new ComboOptions(_(option.label), option.value));
        }

        return model;
    }

    /**
     * Creates a new Adw.ComboRow from a combo configuration object.
     *
     * @private
     * @param {object} row - The combo row configuration object.
     * @param {string} [row.title] - The combo title.
     * @param {string} [row.subtitle] - The combo subtitle.
     * @param {Array<object>} row.model - The model data for the combo options.
     * @returns {Adw.ComboRow} A new combo row.
     */
    _createComboRow(row) {
        return new Adw.ComboRow({
            title: row.title ? _(row.title) : null,
            subtitle: row.subtitle ? _(row.subtitle) : null,
            model: this._createModel(row.model),
            expression: new Gtk.PropertyExpression(ComboOptions, null, "label")
        });
    }

    /**
     * Connects the switch row to the extension's settings.
     * Establishes a two-way binding between the switch's active state and the GSettings key.
     *
     * @private
     * @param {Adw.PreferencesWindow} window - The preferences window, which holds the settings object.
     * @param {object} rowConfig - The configuration object for the switch row.
     * @param {string} rowConfig.settingsKey - The GSettings key to bind to.
     */
    _connectSwitchRow(window, rowConfig) {
        window._settings.bind(rowConfig.settingsKey, this._switchRow, "active",
            Gio.SettingsBindFlags.DEFAULT);
    }

    /**
     * Connects the combo row to the extension's settings.
     * Establishes manual two-way synchronization between the combo box selection and the GSettings key.
     *
     * @private
     * @param {Adw.PreferencesWindow} window - The preferences window, which holds the settings object.
     * @param {object} rowConfig - The configuration object for the combo box row.
     * @param {string} rowConfig.settingsKey - The GSettings key to connect to.
     */
    _connectComboRow(window, rowConfig) {
        // Update the setting if a new option is selected
        this._comboRow.connect("notify::selected-item", () => {
            const { selectedItem } = this._comboRow;
            window._settings.set_string(rowConfig.settingsKey, selectedItem.value);
        });
        
        // Update the selected item in the UI if the setting changes
        window._settings.connect(`changed::${rowConfig.settingsKey}`, () => {
            const value = window._settings.get_string(rowConfig.settingsKey);
            this._comboRow.set_selected(this._findIndexByValue(this._comboRow.model, value));
        });

        // Set the initial selection
        const initialValue = window._settings.get_string(rowConfig.settingsKey);
        this._comboRow.set_selected(this._findIndexByValue(this._comboRow.model, initialValue));
    }

    /**
     * Detects the active audio server and updates the 'audio-server' setting if it's different.
     *
     * @private
     * @param {Adw.PreferencesWindow} window - The preferences window, which holds the settings object.
     * @async
     */
    async _detectAndSetAudioServer(window) {
        try {
            const loggingEnabled = window._settings.get_boolean("show-debug");
            const audioServer = await detectAudioServer(loggingEnabled);
            
            if (audioServer && window._settings.get_string("audio-server") !== audioServer) {
                window._settings.set_string("audio-server", audioServer);
            }
        } catch (err) {
            logErr(this.state, err);
        }
        
    }

    /**
     * Finds the index of an item in a Gio.ListStore by its 'value' property.
     *
     * @private
     * @param {Gio.ListStore} model - The list store to search.
     * @param {string} value - The value to find.
     * @returns {number} The index of the item, or 0 if not found (as a fallback).
     */
    _findIndexByValue(model, value) {
        for (let i = 0; i < model.get_n_items(); i++) {
            if (model.get_item(i).value === value) {
                return i;
            }
        }
        return 0; // fallback to first item
    }
}