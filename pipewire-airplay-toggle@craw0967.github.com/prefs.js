import Gio from "gi://Gio";
import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import GObject from "gi://GObject";

import {ExtensionPreferences, gettext as _} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import { 
    PREFS_PAGES, 
    LABEL_CANCEL, 
    LABEL_EXECUTE, 
    LABEL_OPEN, 
    LABEL_RESET, 
    RESET_MSG_BODY, 
    RESET_MSG_HEADING, 
    RESET_TOAST_TITLE 
} from "./constants/config.js";
import { detectAudioServer } from "./functions/utils.js";
import { logErr, logWarn } from "./functions/logs.js";

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

        this._loggingEnabled = window._settings.get_boolean("show-debug");
        
        // Detect audio server if not already set
        await this._detectAndSetAudioServer(window);
        
        for(const pageConfig of pagesConfig) {
            this._addPage(window, pageConfig);
        }
    }

    _addPage(window, pageConfig) {
        let pageAttributes = {
            title: _(pageConfig.title)
        }

        if(pageConfig.icon_name) {
            pageAttributes.icon_name = pageConfig.icon_name;
        }

        if(pageConfig.icon) {
            pageAttributes.icon_name = pageConfig.icon;
        }

        // Create a preferences page, with a single group
        const page = new Adw.PreferencesPage(pageAttributes);
        
        window.add(page);

        for (const groupConfig of pageConfig.groups) {
            this._addGroup(window, page, groupConfig)
        }
    }

    _addGroup(window, page, groupConfig) {
        const group = this._createGroup(groupConfig);
        this._bindVisibility(window, groupConfig, group);
        
        page.add(group);

        for (const rowConfig of groupConfig.rows) {
            this._addRow(window, group, rowConfig);
        }
    }

    _addRow(window, group, rowConfig) {
        switch(rowConfig.type) {
            case "switch": {
                const switchRow = this._createSwitchRow(rowConfig.row);
                group.add(switchRow);

                this._connectSwitchRow(window, rowConfig, switchRow);
                this._bindVisibility(window, rowConfig, switchRow);
                break;
            }
            case "combo": {
                const comboRow = this._createComboRow(rowConfig.row);
                group.add(comboRow);
                
                this._connectComboRow(window, rowConfig, comboRow);
                this._bindVisibility(window, rowConfig, comboRow);
                break;
            }
            case "button": {
                const { actionRow, button } = this._createButtonRow(rowConfig.row);
                group.add(actionRow);
                this._connectButtonRow(window, button, rowConfig.row.functionName);
                this._bindVisibility(window, rowConfig, actionRow);
                break;
            }
            case "link": {
                const linkRow = this._createLinkRow(rowConfig.row);
                group.add(linkRow);
                this._bindVisibility(window, rowConfig, linkRow);
                break;
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
     * Creates a new Adw.ActionRow with a Gtk.Button suffix.
     *
     * @private
     * @param {object} row - The button row configuration object.
     * @returns {{actionRow: Adw.ActionRow, button: Gtk.Button}} An object containing the row and the button.
     */
    _createButtonRow(row) {
        const actionRow = new Adw.ActionRow({
            title: row.title ? _(row.title) : null,
            subtitle: row.subtitle ? _(row.subtitle) : null,
        });

        const button = new Gtk.Button({
            label: row.button_label || _(LABEL_EXECUTE),
            valign: Gtk.Align.CENTER,
        });

        if (row.destructive) {
            button.add_css_class("destructive-action");
        }

        actionRow.add_suffix(button);
        return { actionRow, button };
    }

    /**
     * Creates a new Adw.ActionRow with a Gtk.LinkButton suffix.
     *
     * @private
     * @param {object} row - The link row configuration object.
     * @returns {Adw.ActionRow} A new action row with a link button.
     */
    _createLinkRow(row) {
        const linkRow = new Adw.ActionRow({
            title: row.title ? _(row.title) : null,
            subtitle: row.subtitle ? _(row.subtitle) : null,
        });

        const button = new Gtk.LinkButton({
            uri: row.uri,
            label: row.button_label || _(LABEL_OPEN),
            valign: Gtk.Align.CENTER,
        });

        linkRow.add_suffix(button);
        return linkRow;
    }

    /**
     * Connects the switch row to the extension's settings.
     * Establishes a two-way binding between the switch's active state and the GSettings key.
     *
     * @private
     * @param {Adw.PreferencesWindow} window - The preferences window, which holds the settings object.
     * @param {object} rowConfig - The configuration object for the switch row.
     * @param {Adw.SwitchRow} switchRow - The switch row widget to connect.
     * @param {string} rowConfig.settingsKey - The GSettings key to bind to.
     */
    _connectSwitchRow(window, rowConfig, switchRow) {
        window._settings.bind(rowConfig.settingsKey, switchRow, "active",
            Gio.SettingsBindFlags.DEFAULT);
    }

    /**
     * Connects a button to reset all extension settings to their default values.
     *
     * @private
     * @param {Adw.PreferencesWindow} window - The preferences window, which holds the settings object.
     * @param {Gtk.Button} button - The button widget to connect.
     */
    _connectButtonRow(window, button, functionName) {
        button.connect("clicked", () => this[functionName](window));
    }

    /**
     * Connects the combo row to the extension's settings.
     * Establishes manual two-way synchronization between the combo box selection and the GSettings key.
     *
     * @private
     * @param {Adw.PreferencesWindow} window - The preferences window, which holds the settings object.
     * @param {object} rowConfig - The configuration object for the combo box row.
     * @param {Adw.ComboRow} comboRow - The combo row widget to connect.
     * @param {string} rowConfig.settingsKey - The GSettings key to connect to.
     */
    _connectComboRow(window, rowConfig, comboRow) {
        // Update the setting if a new option is selected
        comboRow.connect("notify::selected-item", () => {
            const { selectedItem } = comboRow;
            window._settings.set_string(rowConfig.settingsKey, selectedItem.value);
        });
        
        // Update the selected item in the UI if the setting changes
        window._settings.connect(`changed::${rowConfig.settingsKey}`, () => {
            const value = window._settings.get_string(rowConfig.settingsKey);
            comboRow.set_selected(this._findIndexByValue(comboRow.model, value));
        });

        // Set the initial selection
        const initialValue = window._settings.get_string(rowConfig.settingsKey);
        comboRow.set_selected(this._findIndexByValue(comboRow.model, initialValue));
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
            const audioServer = await detectAudioServer();
            
            if (audioServer && window._settings.get_string("audio-server") !== audioServer) {
                window._settings.set_string("audio-server", audioServer);
            }
        } catch (err) {
            logErr(null, err, this._loggingEnabled);
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

        logWarn(null, `[PipeWireAirPlayToggle] Value '${value}' not found in combo model. Defaulting to index 0.`, this._loggingEnabled);
        return 0; // fallback to first item
    }

    /**
     * Binds the visibility of a widget to the configuration.
     * If the configuration has a 'hidden' property, it sets the visibility accordingly.
     * If 'hidden' is a function, it connects to the settings 'changed' signal to update visibility dynamically.
     *
     * @private
     * @param {Adw.PreferencesWindow} window - The preferences window.
     * @param {object} config - The configuration object (group or row).
     * @param {Gtk.Widget} widget - The widget to control.
     */
    _bindVisibility(window, config, widget) {
        const check = () => {
            const hidden = typeof config.hidden === "function" ? config.hidden(window) : config.hidden;
            widget.visible = !hidden;
        };

        check();

        if (typeof config.hidden === "function") {
            const id = window._settings.connect("changed", check);
            widget.connect("destroy", () => window._settings.disconnect(id));
        }
    }

    resetPrefsToDefaults(window) {
        const dialog = new Adw.MessageDialog({
            body: _(RESET_MSG_BODY),
            heading: _(RESET_MSG_HEADING),
            transient_for: window,
        });

        dialog.add_response("cancel", _(LABEL_CANCEL));
        dialog.add_response("reset", _(LABEL_RESET));
        dialog.set_response_appearance("reset", Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_default_response("cancel");
        dialog.set_close_response("cancel");

        dialog.connect("response", (self, response) => {
            if (response === "reset") {
                const keys = window._settings.list_keys();
                for (const key of keys) {
                    window._settings.reset(key);
                }
                const toast = new Adw.Toast({ title: _(RESET_TOAST_TITLE) });
                window.add_toast(toast);
            }
        });
        dialog.present();
    }
}