import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { PREFS_GROUPS } from './constants/config.js';

const ComboOptions = GObject.registerClass({
    Properties: {
        'label': GObject.ParamSpec.string(
            'label', 'label', 'label',
            GObject.ParamFlags.READWRITE,
            null),
        'value': GObject.ParamSpec.string(
            'value', 'value', 'value',
            GObject.ParamFlags.READWRITE,
            null),
    },
}, class ComboOptions extends GObject.Object {
    _init(label, value) {
        super._init({label, value});
    }
});

/** Class representing an Extension Preferences Window */
export default class PipeWireAirPlayTogglePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const groupsConfig = PREFS_GROUPS;
        window._settings = this.getSettings();
        
        // Create a preferences page, with a single group
        const page = new Adw.PreferencesPage({
            title: _('Preferences'),
            icon_name: 'dialog-information-symbolic'
        });
        window.add(page);

        for (const groupConfig of groupsConfig) {
            const group = this._createGroup(groupConfig);
            page.add(group);

            for (const rowConfig of groupConfig.rows) {
                switch(rowConfig.type) {
                    case 'switch':
                        this._switchRow = this._createSwitchRow(rowConfig.row);
                        group.add(this._switchRow);

                        this._connectSwitchRow(window, rowConfig);
                        break;
                    case 'combo':
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

    /***
     * Create a new Adw.PreferencesGroup from a group configuration object.
     *
     * @param {Object} group - Group configuration object.
     * @param {string} [group.title] - The group title.
     * @param {string} [group.description] - The group description.
     * @returns {Adw.PreferencesGroup} A new Adw.PreferencesGroup.
     */
    _createGroup(group) {
        return new Adw.PreferencesGroup({
            title: group.title ? _(group.title) : null,
            description: group.description ? _(group.description) : null
        });
    }

    /***
     * Create a new Adw.SwitchRow from a switch configuration object.
     *
     * @param {Object} row - Switch Row configuration object.
     * @param {string} [row.title] - The switch title.
     * @param {string} [row.subtitle] - The switch subtitle.
     * @returns {Adw.SwitchRow} A new Adw.SwitchRow.
     */
    _createSwitchRow(row) {
        return new Adw.SwitchRow({
            title: row.title ? _(row.title) : null,
            subtitle: row.subtitle ? _(row.subtitle) : null
        });
    }

    /***
     * Create a new Gio.ListStore from a list of ComboOptions objects.
     *
     * @param {Object[]} modelOptions - A list of objects representing ComboOptions objects.
     * @param {string} modelOptions.label - The label for the option.
     * @param {string} modelOptions.value - The value for the option.
     * @returns {Gio.ListStore} A new Gio.ListStore containing the options.
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

    /***
     * Create a new Adw.ComboRow from a combo configuration object.
     *
     * @param {Object} row - Combo Row configuration object.
     * @param {string} [row.title] - The combo title.
     * @param {string} [row.subtitle] - The combo subtitle.
     * @param {Object[]} row.model - A list of objects representing ComboOptions objects.
     * @returns {Adw.ComboRow} A new Adw.ComboRow.
     */
    _createComboRow(row) {
        return new Adw.ComboRow({
            title: row.title ? _(row.title) : null,
            subtitle: row.subtitle ? _(row.subtitle) : null,
            model: this._createModel(row.model),
            expression: new Gtk.PropertyExpression(ComboOptions, null, 'label')
        });
    }

    /***
     * Connects the switch row to the extension's settings notify event handler.
     *
     * When the switch is toggled, the extension's settings are updated.
     * When the extension's settings change, the switch is updated.
     *
     * @param {Adw.PreferencesWindow} window - The window containing the switch row and the extension's settings
     * @param {Object} rowConfig - The configuration object for the switch row.
     * @param {string} rowConfig.settingsKey - The key in the extension's settings to bind to.
     */
    _connectSwitchRow(window, rowConfig) {
        window._settings.bind(rowConfig.settingsKey, this._switchRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);
    }

    /***
     * Connects the combo box row to the extension's settings notify event handler.
     * 
     * When the selected item of the combo box changes, the extension's settings are updated.
     * When the extension's settings change, the selected item of the combo box is updated.
     * 
     * @param {Adw.PreferencesWindow} window - The window containing the combo box and the extension's settings.
     * @param {Object} rowConfig - The configuration object for the combo box row.
     * @param {string} rowConfig.settingsKey - The key in the extension's settings to bind to.
     */
    _connectComboRow(window, rowConfig) {
        // Update the setting if a new option is selected
        this._comboRow.connect('notify::selected-item', () => {
            const { selectedItem } = this._comboRow;
            window._settings.set_string(rowConfig.settingsKey, selectedItem.value);
        });
        
        // Update the selected item in the UI if the selected option changes, even if changed via CLI, etc.
        window._settings.connect(`changed::${rowConfig.settingsKey}`,
            () => this._comboRow.set_selected(window._settings.get_string(rowConfig.settingsKey).substring(6)));

        // Set the intial selection in the UI based on the current setting
        this._comboRow.set_selected(window._settings.get_string(rowConfig.settingsKey).substring(6));
    }
}