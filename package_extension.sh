#!/bin/bash
gnome-extensions pack pipewire-airplay-toggle@craw0967.github.com \
    --force \
    --schema=schemas/org.gnome.shell.extensions.pipewire-airplay-toggle.gschema.xml \
    --extra-source=constants \
    --extra-source=functions \
    --extra-source=icons \
    --extra-source=classes \
    --extra-source=../LICENSE