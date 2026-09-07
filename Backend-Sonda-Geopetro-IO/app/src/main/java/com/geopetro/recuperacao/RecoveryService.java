package com.geopetro.recuperacao;

import com.geopetro.core.exception.BusinessException;
import com.geopetro.usuario.application.port.out.PasswordEncoderPort;
import com.geopetro.usuario.adapter.out.persistence.entity.UsuarioEntity;
import com.geopetro.usuario.domain.model.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Service
public class RecoveryService {
    private final RecoveryUserRepository users;
    private final RecoveryTokenRepository tokens;
    private final PasswordEncoderPort passwords;
    private final RecoveryMail mail;
    private final ExecutorService executor;
    private final Clock clock;
    private final TransactionTemplate transaction;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Attempts> attempts = new HashMap<>();
    private Instant globalStart = Instant.EPOCH;
    private int globalCount;
    private record Attempts(Instant start, int count) {}

    public RecoveryService(RecoveryUserRepository users, RecoveryTokenRepository tokens,
        PasswordEncoderPort passwords, RecoveryMail mail,
        @Qualifier("recoveryExecutor") ExecutorService executor, @Qualifier("recoveryClock") Clock clock,
        PlatformTransactionManager manager) {
        this.users = users; this.tokens = tokens; this.passwords = passwords; this.mail = mail;
        this.executor = executor; this.clock = clock; this.transaction = new TransactionTemplate(manager);
    }
    public void request(String email) {
        if (!mail.available()) throw unavailable();
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        if (!allow(normalized)) return;
        try { executor.execute(() -> {
            try { issue(normalized); }
            catch (RuntimeException e) { LoggerFactory.getLogger(RecoveryService.class).warn("Falha ao processar recuperação de senha."); }
        }); } catch (RejectedExecutionException e) { throw unavailable(); }
    }
    private synchronized boolean allow(String email) {
        Instant now = clock.instant();
        if (!now.isBefore(globalStart.plusSeconds(60))) { globalStart = now; globalCount = 0; }
        if (++globalCount > 60) throw unavailable();
        attempts.entrySet().removeIf(e -> !now.isBefore(e.getValue().start.plusSeconds(900)));
        String key = hash(email);
        Attempts previous = attempts.getOrDefault(key, new Attempts(now, 0));
        if (previous.count >= 3) return false;
        attempts.put(key, new Attempts(previous.start, previous.count + 1));
        return true;
    }
    // Package access permits persistence tests without asynchronous timing or SMTP.
    void issue(String email) {
        transaction.executeWithoutResult(status -> {
            var matching = users.lockedByEmail(email);
            if (matching.size() != 1 || matching.getFirst().getStatus() != StatusUsuario.ATIVO) return;
            var user = matching.getFirst();
            var saved = tokens.locked(user.getUsername()).orElse(null);
            Instant now = clock.instant();
            if (saved != null && now.isBefore(saved.issuedAt.plusSeconds(60))) return;
            byte[] bytes = new byte[32]; random.nextBytes(bytes);
            String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            var entry = saved == null ? new RecoveryToken(user.getUsername()) : saved;
            entry.tokenHash = hash(token); entry.credentialHash = credentials(user);
            entry.issuedAt = now; entry.expiresAt = now.plusSeconds(1800);
            tokens.saveAndFlush(entry);
            mail.sendLink(user.getEmail(), token); // Failure rolls back issuance, preserving the prior link.
        });
    }
    public void confirm(String token, String password, String confirmation) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) throw invalidLink();
        String recipient = transaction.execute(status -> {
            String hash = hash(token);
            String username = tokens.usernameForHash(hash).orElseThrow(RecoveryService::invalidLink);
            var user = users.locked(username).orElseThrow(RecoveryService::invalidLink);
            var entry = tokens.locked(username).orElseThrow(RecoveryService::invalidLink);
            if (!hash.equals(entry.tokenHash) || !clock.instant().isBefore(entry.expiresAt) ||
                user.getStatus() != StatusUsuario.ATIVO || !credentials(user).equals(entry.credentialHash)) throw invalidLink();
            PoliticaSenha.validar(password);
            if (!password.equals(confirmation)) throw new BusinessException("Nova senha e confirmação não conferem.");
            if (passwords.matches(password, user.getPassword())) throw new BusinessException("A nova senha deve ser diferente da atual.");
            user.setPassword(passwords.encode(password));
            entry.tokenHash = null;
            return user.getEmail();
        });
        try { executor.execute(() -> {
            try { mail.sendConfirmation(recipient); }
            catch (RuntimeException e) { LoggerFactory.getLogger(RecoveryService.class).warn("Falha ao enviar confirmação de troca de senha."); }
        }); } catch (RejectedExecutionException e) {
            LoggerFactory.getLogger(RecoveryService.class).warn("Fila indisponível para confirmação de troca de senha.");
        }
    }
    static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    private static String credentials(UsuarioEntity user) { return hash(user.getPassword() + "\n" + user.getEmail()); }
    private static BusinessException invalidLink() { return new BusinessException("Link inválido ou expirado. Solicite uma nova recuperação."); }
    private static BusinessException unavailable() { return new BusinessException("Recuperação de senha indisponível no momento. Tente novamente mais tarde.", HttpStatus.SERVICE_UNAVAILABLE); }
}
