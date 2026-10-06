package com.braserv.core.identidade.smtp;

public record SmtpSettings(boolean enabled, String host, int port, Transport transport,
    boolean auth, String username, String password, String from, String frontendUrl) {
    public enum Transport { STARTTLS, TLS, NONE }
    @Override public String toString() { return "SmtpSettings[redacted]"; }
}
