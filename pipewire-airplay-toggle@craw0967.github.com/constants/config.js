const INDICATOR_ICON_MODEL = [
    {
        label: "Music Note - Outline", 
        icon: "music-note-outline-symbolic.svg", 
        value: "option0"
    },
    {
        label: "Music Note - Solid", 
        icon: "music-note-symbolic.svg", 
        value: "option1"
    },
    {
        label: "Waves & Screen", 
        icon: "waves-and-screen-symbolic.svg", 
        value: "option2"
    },
    {
        label: "Wireless Speaker", 
        icon: "speaker-wireless-symbolic.svg", 
        value: "option3"
    },
    {
        label: "Speaker", 
        icon: "speaker-symbolic.svg", 
        value: "option4"
    }
]

export const PREFS_GROUPS = [
    {
        title: "Appearance",
        //description: "",
        rows: [
            {
                type: "combo",
                settingsKey: "indicator-icon",
                row: {
                    title: "Indicator Icon",
                    subtitle: "The icon to display on the Quick Settings button and the panel indicator",
                    model: INDICATOR_ICON_MODEL,
                }
            },
            {
                type: "switch",
                settingsKey: "show-indicator",
                row: {
                    title: "Show Indicator",
                    subtitle: "Show a panel indicator when the RAOP Discover (AirPlay) module is enabled"
                }
            }
        ]
    },
    {
        title: "Developer",
        //description: "",
        rows: [
            {
                type: "switch",
                settingsKey: "show-debug",
                row: {
                    title: "Enable Debug Statements",
                    subtitle: "Enable debug statements for this extension"
                }
            }
        ]
    }
]

export const INDICATOR_ICON_MAP = INDICATOR_ICON_MODEL.reduce((acc, current) => {
    acc[current.value] = current.icon;
    return acc;
}, {});

export const INDICATOR_TEXT = "AirPlay Speakers";