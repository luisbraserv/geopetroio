package com.braserv.core.identidade.recuperacao;

import jakarta.persistence.*;
import java.time.Instant;

@Entity @Table(name = "recuperacao_senha")
public class RecoveryToken {
    @Id @Column(length = 255) String username;
    @Column(name = "token_hash", length = 64, unique = true) String tokenHash;
    @Column(name = "credential_hash", length = 64, nullable = false) String credentialHash;
    @Column(name = "issued_at", nullable = false) Instant issuedAt;
    @Column(name = "expires_at", nullable = false) Instant expiresAt;
    protected RecoveryToken() {}
    RecoveryToken(String username) { this.username = username; }
}
