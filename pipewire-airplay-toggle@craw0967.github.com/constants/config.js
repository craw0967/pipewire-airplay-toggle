/***
 * A function used to identify strings for automated localization tools like `xgettext`.
 * This function takes an input string and returns it without modification.
 * It is intended to be used to mark strings for inclusion in a `.pot` file for translation.
 *
 * @param {string} input - The string to include in the `.pot` file for translation.
 * @returns {string} - The input string is returned without modification.
 */
const _ = function gettext(input) {
    return input;
}

const INDICATOR_ICON_MODEL = [
    {
        label: _("Music Note - Outline"), 
        icon: "music-note-outline-symbolic.svg", 
        value: "option0"
    },
    {
        label: _("Music Note - Solid"), 
        icon: "music-note-symbolic.svg", 
        value: "option1"
    },
    {
        label: _("Waves & Screen"), 
        icon: "waves-and-screen-symbolic.svg", 
        value: "option2"
    },
    {
        label: _("Wireless Speaker"), 
        icon: "speaker-wireless-symbolic.svg", 
        value: "option3"
    },
    {
        label: _("Speaker"), 
        icon: "speaker-symbolic.svg", 
        value: "option4"
    }
]

export const PREFS_PAGES = [
    {
        title: _("Preferences"),
        icon_name: "dialog-information-symbolic",
        groups: [
            {
                hidden: false,
                title: _("Appearance"),
                //description: "",
                rows: [
                    {
                        type: "combo",
                        settingsKey: "indicator-icon",
                        row: {
                            title: _("Indicator Icon"),
                            subtitle: _("The icon to display on the Quick Settings button and the panel indicator."),
                            model: INDICATOR_ICON_MODEL,
                        }
                    },
                    {
                        type: "switch",
                        settingsKey: "show-indicator",
                        row: {
                            title: _("Show Indicator"),
                            subtitle: _("Enable to show a panel indicator when the RAOP Discover (AirPlay) module is enabled.")
                        }
                    }
                ]
            },
            {
                hidden: function(prefSettings) {
                    return prefSettings.get_string("audio-server") === "pipewire";
                },
                title: _("PulseAudio Settings"),
                //description: "",
                rows: [
                    {
                        type: "switch",
                        settingsKey: "hide-duplicate-raop-sinks",
                        row: {
                            title: _("Hide Duplicate Speakers"),
                            subtitle: _("Enable to automatically remove duplicate AirPlay speakers when PulseAudio loads them more than once. " +
                                        "(It may also be possible to prevent duplicate speakers by using PipeWire, by disabling IPv6 networking, or by disabling IPv6 in Avahi.)")
                        }
                    }
                ]
            },
            {
                hidden: false,
                title: _("Developer"),
                //description: "",
                rows: [
                    {
                        type: "switch",
                        settingsKey: "show-debug",
                        row: {
                            title: _("Enable Debug Statements"),
                            subtitle: _("Enable debug statements for this extension.")
                        }
                    }
                ]
            }
        ]
    }
]

export const INDICATOR_ICON_MAP = INDICATOR_ICON_MODEL.reduce((acc, current) => {
    acc[current.value] = current.icon;
    return acc;
}, {});

export const INDICATOR_TEXT = _("AirPlay Speakers");

export const PW_MISSING_TITLE = _("Supported Audio Server and/or Modules Not Found");
export const PW_MISSING_BODY =  _("Please review and install the required dependencies outlined in the 'pipewire-airplay-toggle' extension's Installation Guide - " +
                                  "https://github.com/craw0967/pipewire-airplay-toggle/wiki/Installation-Guide");
