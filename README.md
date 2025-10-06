# pipewire-airplay-toggle

A simple Gnome-Shell extension to load and unload the 'module-raop-discover' module in PipeWire (or PulseAudio starting with version 8 of the extension). The result of this action allows users to toggle AirPlay® speaker connectivity on and off with the click of a button.

This extension started as a convenient way for me to only show my AirPlay speakers when I wanted to stream to one of them, disabling and hiding them away the rest of the time. Everything this extension does could be done manually from a terminal using CLI applications supplied by PipeWire and PulseAudio. Users could also update their PipeWire or PulseAudio configuration to enable the 'module-raop-discover' module permanently if they prefer.

To use this extension, you must be using GNOME 45 or later and PipeWire (or PulseAudio starting with version 8), along with other dependencies.

More details, including an installation and a user guide, can be found on the [Wiki](https://github.com/craw0967/pipewire-airplay-toggle/wiki)

Note: Basic PulseAudio support has been added because it was relatively straightforward to do. The focus of this project however is still PipeWire, and future versions may include updates that rely on PipeWire specific features.

AirPlay® is a trademark of Apple Inc., registered in the U.S. and other countries and regions.

<div align="center">
  
Toggled On | Toggled Off
:-------------------------:|:-------------------------:
<img src="screenshot-enabled.png" align="top" title="'AirPlay® Speakers' Quick Settings Toggle - Enabled" alt="'AirPlay® Speakers' Quick Settings Toggle - Enabled"/>  |  <img src="screenshot-disabled.png" align="top" title="'AirPlay® Speakers' Quick Settings Toggle - Disabled" alt="'AirPlay® Speakers' Quick Settings Toggle - Disabled"/>

Settings
:-------------------------:
<img src="screenshot-prefs.png" title="'AirPlay® Speakers' Quick Settings Toggle Preferences Screen" alt="'AirPlay® Speakers' Quick Settings Toggle Preferences Screen"/> |

</div>
