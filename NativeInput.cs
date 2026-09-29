using System.Runtime.InteropServices;

namespace JoyChromium;

[StructLayout(LayoutKind.Sequential)]
internal struct XInputGamepad
{
    public ushort Buttons;
    public byte LeftTrigger;
    public byte RightTrigger;
    public short ThumbLX;
    public short ThumbLY;
    public short ThumbRX;
    public short ThumbRY;
}

[StructLayout(LayoutKind.Sequential)]
internal struct XInputState
{
    public uint PacketNumber;
    public XInputGamepad Gamepad;
}

/// <summary>Win32 input: XInput polling and synthesized keyboard/mouse events (SendInput).</summary>
internal static class NativeInput
{
    public static void SendMouse(uint flags, int x, int y, int data)
    {
        var input = new[]
        {
            new Input { Type = 0, Union = new InputUnion { Mouse = new MouseInput { X = x, Y = y, Data = (uint)data, Flags = flags } } },
        };
        _ = SendInput(1, input, Marshal.SizeOf<Input>());
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MouseInput
    {
        public int X;
        public int Y;
        public uint Data;
        public uint Flags;
        public uint Time;
        public IntPtr ExtraInfo;
    }

    public static bool SendVirtualKey(ushort key)
    {
        var input = new[]
        {
            new Input { Type = 1, Union = new InputUnion { Keyboard = new KeyboardInput { VirtualKey = key } } },
            new Input { Type = 1, Union = new InputUnion { Keyboard = new KeyboardInput { VirtualKey = key, Flags = 0x0002 } } }
        };
        return SendInput((uint)input.Length, input, Marshal.SizeOf<Input>()) == input.Length;
    }

    [DllImport("xinput1_4.dll", EntryPoint = "XInputGetState")]
    public static extern uint XInputGetState(uint userIndex, out XInputState state);

    [StructLayout(LayoutKind.Sequential)]
    private struct Input
    {
        public uint Type;
        public InputUnion Union;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public KeyboardInput Keyboard;
        [FieldOffset(0)] public MouseInput Mouse;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KeyboardInput
    {
        public ushort VirtualKey;
        public ushort ScanCode;
        public uint Flags;
        public uint Time;
        public IntPtr ExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint count, Input[] inputs, int size);
}
