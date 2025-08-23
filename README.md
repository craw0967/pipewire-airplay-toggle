# pipewire-airplay-toggle

Simple Gnome-Shell extension to load and unload the 'module-raop-discover' Pipewire module to toggle AirPlay® speaker connectivity.

You must be on Gnome 45 or later for this extension. PipeWire and the libpipewire-module-raop-discover module (installed via the 'pipewire-zeroconf' package on many distributions) must be installed. This extension does not support PulseAudio.

<p style="padding: 5px; text-align: center;">
  <img style="padding: 0 5px 0 5px; vertical-align: middle;" src="screenshot-enabled.png" title="'AirPlay® Speakers' Quick Settings Toggle - Enabled" alt="'AirPlay® Speakers' Quick Settings Toggle - Enabled"/>
  <img style="padding: 0 5px 0 5px; vertical-align: middle;" src="screenshot-disabled.png" title="'AirPlay® Speakers' Quick Settings Toggle - Disabled" alt="'AirPlay® Speakers' Quick Settings Toggle - Disabled"/>
</p>
<p style="padding: 5px; text-align: center;">
  <img style="padding: 0 5px 0 5px; vertical-align: middle;" src="screenshot-prefs.png" title="'AirPlay® Speakers' Quick Settings Toggle Preferences Screen" alt="'AirPlay® Speakers' Quick Settings Toggle Preferences Screen"/>
</p>

AirPlay® is a trademark of Apple Inc., registered in the U.S. and other countries and regions.

## To Install ##
### Recommended:

[Install via the official Gnome Extensions website](https://extensions.gnome.org/extension/7652/pipewire-airplay-toggle/)


### Manual Installation:

From the gnome-extensions tool man pages, these methods are mainly intended for testing, not as a replacement for the extension website. As extensions have privileged access to the user's session, it is advised to never load extensions from untrusted sources without carefully reviewing their content.

If you would like to install extensions from the Gnome Extension website without installing via a web browser, I also have a script that automates the process [here](https://github.com/craw0967/gnome-extension-install-script).

#### Option 1: Using the `package_extension.sh` Script and Gnome-Extensions Tool

1. Clone the repository and navigate to its root directory in the terminal.
2. Make the `package_extension.sh` script executable and run it:
```bash
chmod +x package_extension.sh
./package_extension.sh
```
3. Install the extension using the gnome-extension CLI application. The --force argument force installs the extension, even if another version is already installed.
```bash
gnome-extensions install --force pipewire-airplay-toggle@craw0967.github.com.shell-extension.zip
```
4. Enable the extension:
```bash
gnome-extensions enable pipewire-airplay-toggle@craw0967.github.com
```

#### Option 2: Manual Copy and Compile

1. Copy the `pipewire-airplay-toggle@craw0967.github.com` directory to your local or global extension directory.
2. Navigate to the extension folder:
	* For a current user install: `cd ~/.local/share/gnome-shell/extensions/pipewire-airplay-toggle@craw0967.github.com`
	* For a global install: `cd /usr/share/gnome-shell/extensions/pipewire-airplay-toggle@craw0967.github.com`
3. Compile the schema:
```bash
glib-compile-schemas schemas/
```
4. Enable the extension:
```bash
gnome-extensions enable pipewire-airplay-toggle@craw0967.github.com
```

**Important:** If you don't package the extension, you will not have translations if any are available (currently only US English is available).

**Note:** You may need to log out and back in after installing the extension for it to be fully available. Ensure your Gnome version is supported by checking the `shell-version` list in the `metadata.json` file.