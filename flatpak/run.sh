#!/bin/sh
# zypak runs Chromium's sandbox inside the Flatpak sandbox: the SUID chrome-sandbox helper cannot work here, and zypak
# replaces it with a user-namespace one the Flatpak allows.
exec zypak-wrapper.sh /app/main/electron "$@"
