#!/bin/bash
# We need to include 'gschemas.compiled' for Gnome 45
gnome-extensions pack pipewire-airplay-toggle@craw0967.github.com \
    --force \
    --schema=schemas/gschemas.compiled \
    --schema=schemas/org.gnome.shell.extensions.pipewire-airplay-toggle.gschema.xml \
    --extra-source=constants \
    --extra-source=functions \
    --extra-source=icons \
    --extra-source=../LICENSE