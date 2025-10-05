#!/bin/bash

# Define the features and their corresponding functions and descriptions
declare -A features
features["test-extension;function"]="test_extension"
features["test-extension;description"]="Load a new nested Wayland session for extension testing"
features["package-extension;function"]="package_extension"
features["package-extension;description"]="Package the extension for installation or distribution"    
features["compile-gschema;function"]="compile_gschema"
features["compile-gschema;description"]="Compile the extension's settings schema"

# Define the functions for each command
test_extension() {
    gnome_shell_version=$(gnome-shell --version | awk '{print $NF}')
    echo "GNOME Shell version: $gnome_shell_version"
    # Options - https://docs.gtk.org/glib/running.html
    #export G_MESSAGES_DEBUG=all
    export MUTTER_DEBUG_DUMMY_MODE_SPECS=1440x900
    export SHELL_DEBUG=all

    # Check if the GNOME Shell version is 48 or earlier
    if [[ $(printf "%d" "$gnome_shell_version") -lt 49 ]]; then
        dbus-run-session -- gnome-shell --nested --wayland
    
    # GNOME 49 and later
    else
        dbus-run-session -- gnome-shell --devkit

    fi
}

package_extension() {
    directory="./pipewire-airplay-toggle@craw0967.github.com"
    
    if [ ! -d  $directory ]; then
        echo "Directory does not exist: $directory. Please run this script from the extension's git repository root."
        exit 1
    fi

    gnome-extensions pack pipewire-airplay-toggle@craw0967.github.com \
        --force \
        --schema=schemas/org.gnome.shell.extensions.pipewire-airplay-toggle.gschema.xml \
        --extra-source=constants \
        --extra-source=functions \
        --extra-source=icons \
        --extra-source=classes \
        --extra-source=../LICENSE

    echo "Extension packaged successfully."
    echo "You can now install it with 'gnome-extensions install --force pipewire-airplay-toggle@craw0967.github.com.shell-extension.zip'."
    echo "This will install the extension to the current user's extensions directory. The --force flag will overwrite any existing extension with the same name."
    echo "Afterward, you can enable the extension in the GNOME Shell Extensions app, or by running 'gnome-extensions enable pipewire-airplay-toggle@craw0967.github.com'."
    exit 0
}

compile_gschema() {
    local_directory="/home/$USER/.local/share/gnome-shell/extensions/pipewire-airplay-toggle@craw0967.github.com/schemas/"
    global_directory="/usr/share/gnome-shell/extensions/pipewire-airplay-toggle@craw0967.github.com/schemas/"

    if [ -d "$local_directory" ]; then
        glib-compile-schemas "$local_directory"
        echo "Settings schema compiled successfully in $local_directory"
        exit 0
    elif [ -d "$global_directory" ]; then
        glib-compile-schemas "$global_directory"
        echo "Settings schema compiled successfully in $global_directory"
        exit 0
    fi

    echo "Could not compile settings schema. Unable to locate schemas directory: $local_directory or $global_directory"
    exit 1
    
}

# Define the utility functions
help_menu() {
    echo "Available features:"
    echo "-------------------"
    
    # Iterate over the features array
    for key in "${!features[@]}"; do
    if [[ $key == *";description"* ]]; then
        feature=$(echo "${key}" | cut -d';' -f1)
        description="${features[$key]}"

        printf "%-55s %s\n" "./extension_scripts.sh  $feature" "$description"
       fi
    done
}

# Run the main script
if [[ $# -eq 0 ]]; then
    help_menu
    exit 0
fi

feature_name="$1"
if [[ -z ${features[${feature_name};function]} ]]; then
    echo "Invalid feature: $feature_name"
    help_menu
    exit 1
fi

echo "Executing ${features[feature_index]}..."
${features[$feature_name;function]}