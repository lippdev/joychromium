namespace JoyChromium;

/// <summary>How the controller drives a page.</summary>
public enum InputMode
{
    /// <summary>D-pad/stick jump between focusable elements (script-driven); A activates.</summary>
    Spatial,
    /// <summary>Left stick moves a real mouse cursor; A clicks; right stick scrolls.</summary>
    Cursor,
    /// <summary>D-pad/stick are sent as arrow keys; A is Enter. For sites with their own TV navigation.</summary>
    Arrows,
}

/// <summary>Pure controller math and mode rules, shared with the tests.</summary>
public static class ControllerInput
{
    public const short StickDeadzone = 8000;
    public const short DirectionThreshold = 16000;
    public const double MaxCursorSpeed = 22;   // px per 50 ms tick at full deflection
    public const int ScrollNotchesPerTick = 1;

    /// <summary>Hosts whose pages already implement arrow-key navigation (10-foot UIs).</summary>
    private static readonly string[] ArrowHosts = ["youtube.com", "tv.youtube.com", "twitch.tv"];

    public static InputMode DefaultModeFor(string? host, InputMode fallback = InputMode.Spatial)
    {
        if (host is null)
            return fallback;
        foreach (var known in ArrowHosts)
            if (host.Equals(known, StringComparison.OrdinalIgnoreCase) || host.EndsWith("." + known, StringComparison.OrdinalIgnoreCase))
                return InputMode.Arrows;
        return fallback;
    }

    public static InputMode Next(InputMode mode) => mode switch
    {
        InputMode.Spatial => InputMode.Cursor,
        InputMode.Cursor => InputMode.Arrows,
        _ => InputMode.Spatial,
    };

    /// <summary>
    /// Maps a raw stick to a cursor displacement for one tick: circular deadzone, then a squared response curve so
    /// small deflections give fine control and full deflection reaches <see cref="MaxCursorSpeed"/>.
    /// </summary>
    public static (double Dx, double Dy) StickToVelocity(short x, short y, short deadzone = StickDeadzone, double maxSpeed = MaxCursorSpeed)
    {
        double nx = x / 32767.0, ny = y / 32767.0;
        var magnitude = Math.Sqrt(nx * nx + ny * ny);
        var dead = deadzone / 32767.0;
        if (magnitude <= dead)
            return (0, 0);
        var scaled = Math.Min(1, (magnitude - dead) / (1 - dead));
        var speed = scaled * scaled * maxSpeed;
        // Screen Y grows downward; XInput Y grows upward.
        return (nx / magnitude * speed, -ny / magnitude * speed);
    }

    /// <summary>Wheel notches for one tick from the right stick's vertical axis (positive = scroll up).</summary>
    public static int StickToScroll(short y, short deadzone = StickDeadzone) =>
        Math.Abs(y) <= deadzone ? 0 : Math.Sign(y) * ScrollNotchesPerTick;
}
