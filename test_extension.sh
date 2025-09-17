#!/bin/sh -e

# Options - https://docs.gtk.org/glib/running.html
#export G_MESSAGES_DEBUG=all
export MUTTER_DEBUG_DUMMY_MODE_SPECS=1366x768
export SHELL_DEBUG=all

# GNOME 49 and later
# dbus-run-session -- gnome-shell --devkit

# GNOME 48 and earlier
dbus-run-session -- gnome-shell --nested --wayland