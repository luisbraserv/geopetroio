package com.example.demo.controllers;

/** Formato hexadecimal usado pelo LOGO!Soft Comfort. Nunca interpretar 0300 como decimal. */
final class TsapPlc {
    private TsapPlc() {}

    static int ler(String texto) {
        String valor = texto == null ? "" : texto.trim();
        if (!valor.matches("(?i)(?:[0-9a-f]{2}\\.[0-9a-f]{2}|(?:0x)?[0-9a-f]{4})")) {
            throw new IllegalArgumentException("TSAP inválido. Use quatro dígitos hexadecimais, como 03.00 ou 0300.");
        }
        return Integer.parseInt(valor.replace(".", "").replaceFirst("(?i)^0x", ""), 16);
    }

    static String formatar(Integer valor, int padrao) {
        int tsap = valor == null ? padrao : valor;
        return "%02X.%02X".formatted((tsap >> 8) & 0xff, tsap & 0xff);
    }
}
