/**
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

/**
 * Defines the available icon options for the indicator.
 * Each option includes a label, icon name, and a value.
 *
 * @type {Array<{label: string, icon: string, value: string}>}
 */
const INDICATOR_ICON_MODEL = [
    {
        label: _("Music Note - Outline"), 
        icon: "indicator0",
        value: "option0"
    },
    {
        label: _("Music Note - Solid"), 
        icon: "indicator1",
        value: "option1"
    },
    {
        label: _("Waves & Screen"), 
        icon: "indicator2",
        value: "option2"
    },
    {
        label: _("Wireless Speaker"), 
        icon: "indicator3",
        value: "option3"
    },
    {
        label: _("Speaker"), 
        icon: "indicator4",
        value: "option4"
    }
]

/**
 * A map of internal icon keys to their corresponding SVG filenames.
 * These icons are used throughout the extension for various UI elements.
 *
 * @type {Object.<string, string>}
 */
export const G_ICON_MAP = {
    "speakerEnabledGIcon": "selection-mode-symbolic.svg",
    "speakerDisabledGIcon": "radio-symbolic.svg",
    "volumeGIcon0": "volume-0-symbolic.svg",
    "volumeGIcon1": "volume-1-symbolic.svg",
    "volumeGIcon2": "volume-2-symbolic.svg",
    "volumeGIcon3": "volume-3-symbolic.svg",
    "volumeGIcon4": "volume-4-symbolic.svg",
    "multiStreamGIcon": "media-podcast-symbolic.svg",
    "indicator0": "music-note-outline-symbolic.svg",
    "indicator1": "music-note-symbolic.svg",
    "indicator2": "waves-and-screen-symbolic.svg",
    "indicator3": "speaker-wireless-symbolic.svg",
    "indicator4": "speaker-symbolic.svg"
}

/**
 * Configuration for the extension's preferences page.
 * Defines the structure of pages, groups, and rows for the settings window.
 *
 * @type {Array<object>}
 */
// TODO - fix icons
export const PREFS_PAGES = [
  {
    title: _("Appearance"),
    icon_name: "preferences-desktop-appearance-symbolic",
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
              subtitle: _(
                "The icon to display on the Quick Settings button and the panel indicator.",
              ),
              model: INDICATOR_ICON_MODEL,
            },
          },
          {
            type: "switch",
            settingsKey: "show-indicator",
            row: {
              title: _("Show Indicator"),
              subtitle: _(
                "Enable to show a panel indicator when the RAOP Discover (AirPlay) module is enabled.",
              ),
            },
          },
        ],
      }
    ],
  },
  {
    title: _("Behavior"),
    icon_name: "preferences-system-symbolic",
    groups: [
      /* {
        hidden: false,
        title: _("Automatic Actions"),
        rows: [
          {
            type: "switch",
            settingsKey: "auto-enable-on-login",
            row: {
              title: _("Enable AirPlay Discovery on Login"),
              subtitle: _("Automatically load the RAOP (AirPlay) discovery module when you log in."),
            },
          },
          {
            type: "switch",
            settingsKey: "auto-combine-sinks",
            row: {
              title: _("Combine Sinks Automatically"),
              subtitle: _("Automatically create a combined speaker output when multiple AirPlay devices are detected."),
            },
          },
          {
            type: "switch",
            settingsKey: "restore-previous-sink",
            row: {
              title: _("Restore Default Output"),
              subtitle: _("When AirPlay is disabled, automatically switch back to the previously used sound output device."),
            },
          },
          {
            type: "switch",
            settingsKey: "auto-adjust-volume",
            row: {
              title: _("Adust Volume When Enabled"),
              subtitle: _("Automatically adjust volume to a default level when sinks are created."),
            },
          },
          //TODO create a menu for volume level adjustment values
        ],
      }, */
      {
        hidden: function (prefSettings) {
          return prefSettings.get_string("audio-server") === "pipewire";
        },
        title: _("PulseAudio Settings"),
        //description: "",
        rows: [
          {
            type: "switch",
            settingsKey: "hide-duplicate-raop-sinks",
            row: {
              title: _("Remove Duplicate Speakers"),
              subtitle: _(
                "Enable to automatically remove duplicate AirPlay speakers when PulseAudio loads them more than once. " +
                  "(It may also be possible to prevent duplicate speakers by using PipeWire, by disabling IPv6 networking, or by disabling IPv6 in Avahi.)",
              ),
            },
          },
        ],
      }
    ],
  },
  {
    title: _("Developer"),
    icon_name: "general-properties-symbolic", // TODO - find appropriate icon and update
    groups: [
      {
        hidden: false,
        title: _("Debugging"),
        //description: "",
        rows: [
          {
            type: "switch",
            settingsKey: "show-debug",
            row: {
              title: _("Enable Debug Statements"),
              subtitle: _("Enable debug statements for this extension."),
            },
          },
          {
            type: "button",
            row: {
              title: _("Reset All Settings"),
              subtitle: _(
                "Restore all extension settings to their default values."
              ),
              button_label: _("Reset"),
              destructive: true,
              functionName: "resetPrefsToDefaults"
            },
          },
        ],
      },
      {
        hidden: false,
        title: _("Developer Information"),
        //description: "",
        rows: [
          {
            type: "link",
            row: {
              title: _("Developer Guide"),
              subtitle: _("Technical documentation and contribution guidelines"),
              uri: "https://github.com/craw0967/pipewire-airplay-toggle",
              button_label: _("Open"),
            },
          },
        ],
      }
    ],
  },
  {
    title: _("About"),
    icon_name: "help-about-symbolic",
    groups: [
      {
        hidden: false,
        title: _("Help &amp; Support"),
        //description: "",
        rows: [
          {
            type: "link",
            row: {
              title: _("Installation Guide"),
              subtitle: _("Detailed instructions for installing required audio dependencies"),
              uri: "https://github.com/craw0967/pipewire-airplay-toggle/wiki/Installation-Guide",
              button_label: _("Open"),
            },
          },
          {
            type: "link",
            row: {
              title: _("User Guide"),
              subtitle: _("Learn how to use AirPlay toggling and multi-speaker features"),
              uri: "https://github.com/craw0967/pipewire-airplay-toggle/wiki/User-Guide",
              button_label: _("Open"),
            },
          },
          {
            type: "link",
            row: {
              title: _("Report an Issue"),
              subtitle: _("Submit bug reports or suggest new features on GitHub"),
              uri: "https://github.com/craw0967/pipewire-airplay-toggle/issues",
              button_label: _("Report"),
            },
          }
        ],
      },
      {
        hidden: false,
        title: _("Website"),
        //description: "",
        rows: [
          {
            type: "link",
            row: {
              title: _("Github Repository"),
              subtitle: _("View source code, releases, and contribute"),
              uri: "https://www.github.com/craw0967/pipewire-airplay-toggle",
              button_label: _("Open"),
            },
          },
        ],
      },
      {
        hidden: false, // TODO - create a donation page and update
        title: _("Support the Developer"),
        //description: "",
        rows: [
          {
            type: "link",
            row: {
              title: _("Buy Me a Coffee"),
              subtitle: _("If you enjoy this extension, consider buying me a coffee to say thanks!"),
              uri: "...",
              button_label: _("Donate"),
            },
          },
        ],
      },
    ],
  },
];

/**
 * Maps icon values to their corresponding icon filenames.
 * Generated from INDICATOR_ICON_MODEL.
 *
 * @type {Object.<string, string>}
 */
export const INDICATOR_ICON_MAP = INDICATOR_ICON_MODEL.reduce((acc, current) => {
    acc[current.value] = current.icon;
    return acc;
}, {});

/**
 * The text label displayed for the indicator.
 *
 * @type {string}
 */
export const INDICATOR_TEXT = _("AirPlay Speakers");

/**
 * The name used for the combined sink when creating a virtual sink.
 *
 * @type {string}
 */
export const COMBINED_SINK_NAME = _("AirPlay-Enabled Speakers");

/**
 * The label for the multi-speaker menu item.
 *
 * @type {string}
 */
export const MULTI_SPEAKER_LABEL = _("Enable Streaming to Multiple Speakers");

/**
 * The label for the settings menu item.
 *
 * @type {string}
 */
export const SETTINGS_LABEL = _("Extension Settings");

/**
 * The accessible name for the multi-speaker menu button.
 *
 * @type {string}
 */
export const MULTI_SPEAKER_MENU_ACCESSIBLE_NAME = _("Open AirPlay Multi-Speaker Menu");

/**
 * The default header text for the volume menu.
 *
 * @type {string}
 */
export const DEFAULT_VOLUME_MENU_HEADER = _("Sound Output");

/**
 * The label for the mute/unmute button on the output slider.
 *
 * @type {string}
 */
export const MUTE_UNMUTE_LABEL = _("Mute/Unmute");

/**
 * The default values for the extension state.
 *
 * @type {object}
 */
export const STATE_DEFAULTS = {
    //UI Variables
    indicatorGIcon: null,

    //PipeWire/PulseAudio Variables
    audioServerInstalled: false,
    raopModuleInstalled: false,
    raopModuleId: null,
    modulesList: [],

    //Sinks Variables
    currentCombineModuleId: null,
    newCombineModuleId: null,
    combinedSinks: [],
    raopSinksMap: {}
};

/**
 * Title text for the notification shown when dependencies are missing.
 *
 * @type {string}
 */
export const PW_MISSING_TITLE = _("Supported Audio Server and/or Modules Not Found");

/**
 * Body text for the notification shown when dependencies are missing.
 *
 * @type {string}
 */
export const PW_MISSING_BODY =  _("Please review and install the required dependencies outlined in the 'pipewire-airplay-toggle' extension's Installation Guide - " +
                                  "https://github.com/craw0967/pipewire-airplay-toggle/wiki/Installation-Guide");
