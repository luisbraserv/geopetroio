package com.geopetro.configuracoes;

import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.SecureRandom;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.spec.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Dedicated AES-GCM key outside the database; never derives keys from login/JWT secrets. */
@Component
public class SmtpSecretCipher {
    private final Path keyFile;
    private final String configuredKey;
    private final SecureRandom random = new SecureRandom();
    public SmtpSecretCipher(@Value("${smtp.settings.key-file:${user.home}/.geopetro/smtp-settings.key}") String file,
        @Value("${smtp.settings.encryption-key:}") String configuredKey) {
        this.keyFile = Path.of(file); this.configuredKey = configuredKey;
    }
    public String encrypt(String plain) {
        if (plain == null || plain.isEmpty()) return null;
        try {
            byte[] iv = new byte[12]; random.nextBytes(iv);
            var cipher = cipher(Cipher.ENCRYPT_MODE, key(true), iv);
            byte[] data = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            return "v1:" + Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + data.length).put(iv).put(data).array());
        } catch (Exception e) { throw new IllegalStateException("Nao foi possivel proteger a credencial SMTP."); }
    }
    public String decrypt(String encrypted) {
        if (encrypted == null || encrypted.isEmpty()) return "";
        try {
            if (!encrypted.startsWith("v1:")) throw new IllegalArgumentException();
            byte[] data = Base64.getDecoder().decode(encrypted.substring(3));
            if (data.length < 28) throw new IllegalArgumentException();
            return new String(cipher(Cipher.DECRYPT_MODE, key(false), Arrays.copyOf(data, 12))
                .doFinal(Arrays.copyOfRange(data, 12, data.length)), StandardCharsets.UTF_8);
        } catch (Exception e) { throw new IllegalStateException("Nao foi possivel ler a credencial SMTP. Informe a senha novamente."); }
    }
    private Cipher cipher(int mode, byte[] key, byte[] iv) throws Exception {
        var cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        cipher.updateAAD("geopetro:smtp-password:v1".getBytes(StandardCharsets.UTF_8));
        return cipher;
    }
    private synchronized byte[] key(boolean create) throws Exception {
        if (!configuredKey.isBlank()) return checked(Base64.getDecoder().decode(configuredKey));
        if (create && !Files.exists(keyFile)) {
            Path parent = keyFile.toAbsolutePath().getParent();
            Files.createDirectories(parent);
            byte[] bytes = new byte[32]; random.nextBytes(bytes);
            var permissions = Files.getFileStore(parent).supportsFileAttributeView("posix")
                ? new java.nio.file.attribute.FileAttribute<?>[]{PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------"))}
                : new java.nio.file.attribute.FileAttribute<?>[0];
            try (var file = FileChannel.open(keyFile, Set.of(StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE), permissions)) {
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) file.write(buffer);
                file.force(true);
            } catch (FileAlreadyExistsException ignored) { /* Another instance created the dedicated key. */ }
        }
        if (Files.size(keyFile) != 32) throw new IllegalStateException();
        return checked(Files.readAllBytes(keyFile));
    }
    private byte[] checked(byte[] key) {
        if (key.length != 32) throw new IllegalArgumentException();
        return key;
    }
}
