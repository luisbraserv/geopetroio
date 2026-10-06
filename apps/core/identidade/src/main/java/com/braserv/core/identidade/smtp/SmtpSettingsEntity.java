package com.braserv.core.identidade.smtp;

import jakarta.persistence.*;

@Entity @Table(name = "configuracao_smtp")
public class SmtpSettingsEntity {
    @Id Long id = 1L;
    @Version Long version;
    @Column(nullable = false) boolean enabled;
    @Column(nullable = false) String host;
    @Column(nullable = false) int port;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) SmtpSettings.Transport transport;
    @Column(nullable = false) boolean auth;
    @Column(nullable = false) String username;
    @Column(name = "password_encrypted", length = 8192) String passwordEncrypted;
    @Column(name = "sender_address", nullable = false) String senderAddress;
    @Column(name = "frontend_url", nullable = false, length = 2048) String frontendUrl;
    public SmtpSettingsEntity() {}
}
