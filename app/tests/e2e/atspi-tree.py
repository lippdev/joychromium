"""Reads the tree an assistive technology sees on Linux: what the app publishes over AT-SPI, which is the same
tree Orca walks. Two commands, both talking to the session bus in DBUS_SESSION_BUS_ADDRESS.

  enable  turns the accessibility bus on for the session, the way a screen reader announcing itself does
  dump    prints the JoyChromium application tree as JSON: {"role", "name", "children"}

Exit code 2 means this machine cannot talk to AT-SPI at all (no pyatspi, no session bus, no app on the bus), and
the caller is expected to say so instead of pretending it checked.
"""
import json
import sys


def fail(message):
    print(f"atspi: {message}", file=sys.stderr)
    raise SystemExit(2)


def enable():
    """Activates org.a11y.Bus and flips its status flags, what a screen reader does when it starts."""
    import pyatspi

    pyatspi.Registry.getDesktop(0)
    import gi

    from gi.repository import Gio, GLib

    bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    if bus is None:
        fail("no session bus to carry AT-SPI")
    proxy = Gio.DBusProxy.new_sync(
        bus, Gio.DBusProxyFlags.NONE, None, "org.a11y.Bus", "/org/a11y/bus",
        "org.freedesktop.DBus.Properties", None,
    )
    for prop in ("IsEnabled", "ScreenReaderEnabled"):
        proxy.call_sync(
            "Set",
            GLib.Variant("(ssv)", ("org.a11y.Status", prop, GLib.Variant("b", True))),
            Gio.DBusCallFlags.NONE, -1, None,
        )
    print("atspi: accessibility bus enabled")


def node(accessible, depth=0, max_depth=40):
    try:
        entry = {"role": accessible.getRoleName(), "name": accessible.name or ""}
    except Exception:
        return None
    children = []
    if depth < max_depth:
        try:
            for child in accessible:
                built = node(child, depth + 1, max_depth)
                if built:
                    children.append(built)
        except Exception:
            pass
    if children:
        entry["children"] = children
    return entry


def find_app(desktop):
    """The dev build reports the application as `electron`; a packaged one reports the product name."""
    applications = []
    for app in desktop:
        try:
            applications.append(app)
        except Exception:
            continue
    for app in applications:
        try:
            if any(child.name == "JoyChromium" for child in app):
                return app
        except Exception:
            continue
    for app in applications:
        try:
            if app.name in ("JoyChromium", "electron"):
                return app
        except Exception:
            continue
    return None


def dump():
    import pyatspi

    app = find_app(pyatspi.Registry.getDesktop(0))
    if app is None:
        fail("no JoyChromium application on the accessibility bus")
    print(json.dumps(node(app), ensure_ascii=False))


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "enable":
        enable()
    elif command == "dump":
        dump()
    else:
        print(__doc__, file=sys.stderr)
        raise SystemExit(2)
