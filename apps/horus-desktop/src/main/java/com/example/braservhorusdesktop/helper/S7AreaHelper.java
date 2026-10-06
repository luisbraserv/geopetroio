package com.example.braservhorusdesktop.helper;

public final class S7AreaHelper {

    private S7AreaHelper() {
    }

    public static int getUInt16(byte[] buffer, int index) {
        return ((buffer[index] & 0xFF) << 8)
                | (buffer[index + 1] & 0xFF);
    }

    public static int getInt32(byte[] buffer, int index) {
        return ((buffer[index] & 0xFF) << 24)
                | ((buffer[index + 1] & 0xFF) << 16)
                | ((buffer[index + 2] & 0xFF) << 8)
                | (buffer[index + 3] & 0xFF);
    }

    public static boolean getBit(byte value, int bit) {
        return ((value >> bit) & 1) == 1;
    }
}