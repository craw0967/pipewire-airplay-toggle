//TODO - Review and improve new text additions, especially in the prefs

// Mock 'gettext' function to allow for easy, automated generation of the .pot file
const _ = function gettext(string) {
    return string;
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
                            subtitle: _("The icon to display on the Quick Settings button and the panel indicator"),
                            model: INDICATOR_ICON_MODEL,
                        }
                    },
                    {
                        type: "switch",
                        settingsKey: "show-indicator",
                        row: {
                            title: _("Show Indicator"),
                            subtitle: _("Show a panel indicator when the RAOP Discover (AirPlay) module is enabled")
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
                            subtitle: _("Remove duplicate speakers when PulseAudio loads more than one RAOP (AirPlay) sink. This may cause a very short, temporary UI freeze if there are a lot of duplicate speakers. " +
                                    "Instead of removing duplicate speakers, duplicates may be prevented by using PipeWire instead of PulseAudio, by disabling IPv6 networking, or by disabling IPv6 in Avahi.")
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
                            subtitle: _("Enable debug statements for this extension")
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

export const PW_MISSING_TITLE = _("Supported Audio Server and/or zeroconf package not found");
export const PW_MISSING_BODY =  _("Please review and install either PipeWire and pipewire-zeroconf packages or PulseAudio and pulseaudio-zeroconf packages to use this extension. " +
                                "If you do not want to install these packages, you may wish to uninstall this extension.");