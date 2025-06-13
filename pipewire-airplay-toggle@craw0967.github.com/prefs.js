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

export default class ExamplePreferences extends ExtensionPreferences {
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

    _createGroup(group) {
        return new Adw.PreferencesGroup({
            title: group.title ? _(group.title) : null,
            description: group.description ? _(group.description) : null
        });
    }

    _createSwitchRow(row) {
        return new Adw.SwitchRow({
            title: row.title ? _(row.title) : null,
            subtitle: row.subtitle ? _(row.subtitle) : null
        });
    }

    _createModel(modelOptions) {
        const model = new Gio.ListStore({
            item_type: ComboOptions
        })
        for(const option of modelOptions) {
            model.append(new ComboOptions(option.label, option.value));
        }

        return model;
    }

    _createComboRow(row) {
        return new Adw.ComboRow({
            title: row.title ? _(row.title) : null,
            subtitle: row.subtitle ? _(row.subtitle) : null,
            model: this._createModel(row.model),
            expression: new Gtk.PropertyExpression(ComboOptions, null, 'label')
        });
    }

    _connectSwitchRow(window, rowConfig) {
        window._settings.bind(rowConfig.settingsKey, this._switchRow, 'active',
            Gio.SettingsBindFlags.DEFAULT);
    }

    _connectComboRow(window, rowConfig) {
        this._comboRow.connect('notify::selected-item', () => {
            const { selectedItem } = this._comboRow;
            window._settings.set_string(rowConfig.settingsKey, selectedItem.value);
        });

        window._settings.connect('changed::logo-position',
            () => this._comboRow.set_selected(window._settings.get_string(rowConfig.settingsKey).substring(6)));
        this._comboRow.set_selected(window._settings.get_string(rowConfig.settingsKey).substring(6));
    }
}