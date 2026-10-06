package com.geopetro.configuracoes;

import com.geopetro.core.exception.BusinessException;
import jakarta.mail.internet.InternetAddress;
import java.net.URI;
import java.util.Objects;
import org.springframework.core.env.Environment;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static com.geopetro.configuracoes.SmtpSettingsController.*;

@Service
public class SmtpSettingsService {
    private final SmtpSettingsRepository repository;
    private final SmtpSecretCipher secrets;
    private final Environment environment;
    public SmtpSettingsService(SmtpSettingsRepository repository, SmtpSecretCipher secrets, Environment environment) {
        this.repository = repository; this.secrets = secrets; this.environment = environment;
    }
    @Transactional(readOnly = true) public View view() {
        var saved = repository.findById(1L).orElse(null);
        if (saved != null) return view(saved);
        var s = defaults();
        return new View(s.enabled(), s.host(), s.port(), s.transport(), s.auth(), s.username(),
            !s.password().isEmpty(), s.from(), s.frontendUrl(), null);
    }
    @Transactional(readOnly = true) public SmtpSettings current() {
        var saved = repository.findById(1L).orElse(null);
        return saved == null ? defaults() : new SmtpSettings(saved.enabled, saved.host, saved.port,
            saved.transport, saved.auth, saved.username, secrets.decrypt(saved.passwordEncrypted), saved.senderAddress, saved.frontendUrl);
    }
    @Transactional public View save(Update u) {
        var saved = repository.findById(1L).orElse(null);
        if (!Objects.equals(u.version(), saved == null ? null : saved.version)) throw conflict();
        var entry = saved == null ? new SmtpSettingsEntity() : saved;
        String password;
        try {
            password = u.clearPassword() ? "" : u.password() != null && !u.password().isEmpty() ? u.password() :
                saved == null ? defaults().password() : secrets.decrypt(saved.passwordEncrypted);
        } catch (IllegalStateException e) { throw new BusinessException(e.getMessage()); }
        var settings = new SmtpSettings(u.enabled(), u.host().trim(), u.port(), u.transport(), u.auth(),
            u.username().trim(), password, u.from().trim(), u.frontendUrl().trim().replaceAll("/+$", ""));
        if (settings.enabled()) validateEnabled(settings);
        else {
            if (!settings.host().isEmpty() && !settings.host().matches("[A-Za-z0-9.:-]+")) throw new BusinessException("Informe somente o servidor SMTP, sem protocolo ou caminho.");
            if (!settings.frontendUrl().isEmpty() && !validOrigin(settings.frontendUrl())) throw new BusinessException("Informe a origem HTTPS do sistema, sem caminho. HTTP somente em localhost.");
        }
        entry.enabled = settings.enabled(); entry.host = settings.host(); entry.port = settings.port();
        entry.transport = settings.transport(); entry.auth = settings.auth(); entry.username = settings.username();
        entry.senderAddress = settings.from(); entry.frontendUrl = settings.frontendUrl();
        try { entry.passwordEncrypted = secrets.encrypt(password); }
        catch (IllegalStateException e) { throw new BusinessException("Nao foi possivel salvar a credencial SMTP.", HttpStatus.SERVICE_UNAVAILABLE); }
        try { return view(repository.saveAndFlush(entry)); }
        catch (DataIntegrityViolationException e) { throw conflict(); }
    }
    private View view(SmtpSettingsEntity e) {
        return new View(e.enabled, e.host, e.port, e.transport, e.auth, e.username,
            e.passwordEncrypted != null, e.senderAddress, e.frontendUrl, e.version);
    }
    private SmtpSettings defaults() {
        return new SmtpSettings(environment.getProperty("recovery.enabled", Boolean.class, false),
            property("spring.mail.host"), environment.getProperty("spring.mail.port", Integer.class, 587),
            environment.getProperty("spring.mail.properties.mail.smtp.ssl.enable", Boolean.class, false) ? SmtpSettings.Transport.TLS :
            environment.getProperty("spring.mail.properties.mail.smtp.starttls.enable", Boolean.class, true) ? SmtpSettings.Transport.STARTTLS : SmtpSettings.Transport.NONE,
            environment.getProperty("spring.mail.properties.mail.smtp.auth", Boolean.class, true),
            property("spring.mail.username"), property("spring.mail.password"), property("recovery.from"),
            property("recovery.frontend-url").replaceAll("/+$", ""));
    }
    private String property(String name) { return environment.getProperty(name, ""); }
    public static void validateConnection(SmtpSettings s) {
        if (s.host().isBlank() || !s.host().matches("[A-Za-z0-9.:-]+") || s.host().length() > 255 || s.port() < 1 || s.port() > 65535 || s.transport() == null)
            throw new BusinessException("Informe um servidor SMTP e uma porta valida.");
        if (s.auth() && (s.username().isBlank() || s.password().isEmpty())) throw new BusinessException("Informe usuario e senha para autenticar no SMTP.");
        if (s.auth() && s.transport() == SmtpSettings.Transport.NONE) throw new BusinessException("Use STARTTLS ou TLS para enviar credenciais SMTP.");
    }
    public static void validateEnabled(SmtpSettings s) {
        validateConnection(s);
        try {
            InternetAddress address = new InternetAddress(s.from(), true); address.validate();
            if (!address.getAddress().equals(s.from()) || s.from().contains("\r") || s.from().contains("\n")) throw new IllegalArgumentException();
        } catch (Exception e) { throw new BusinessException("Informe um e-mail de remetente valido."); }
        if (!validOrigin(s.frontendUrl())) throw new BusinessException("Informe a origem HTTPS do sistema, sem caminho. HTTP somente em localhost.");
    }
    public static boolean validOrigin(String origin) {
        try {
            var uri = URI.create(origin);
            boolean scheme = "https".equals(uri.getScheme()) || ("http".equals(uri.getScheme()) &&
                ("localhost".equals(uri.getHost()) || "127.0.0.1".equals(uri.getHost())));
            return scheme && uri.getHost() != null && uri.getUserInfo() == null && uri.getQuery() == null &&
                uri.getFragment() == null && (uri.getPath().isEmpty() || uri.getPath().equals("/"));
        } catch (IllegalArgumentException e) { return false; }
    }
    private static BusinessException conflict() { return new BusinessException("A configuracao foi alterada. Recarregue antes de salvar.", HttpStatus.CONFLICT); }
}
