package com.braserv.core.identidade.recuperacao;

import com.braserv.core.identidade.smtp.*;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.stereotype.Component;

@Component
public class SmtpRecoveryMail implements RecoveryMail {
    private final SmtpSettingsService settings;
    private final SmtpTransport transport;
    public SmtpRecoveryMail(SmtpSettingsService settings, SmtpTransport transport) {
        this.settings = settings; this.transport = transport;
    }
    @Override public boolean available() {
        try { enabledSettings(); return true; }
        catch (RuntimeException e) { return false; }
    }
    private SmtpSettings enabledSettings() {
        var current = settings.current();
        if (!current.enabled()) throw new IllegalStateException("Recuperacao indisponivel.");
        SmtpSettingsService.validateEnabled(current);
        return current;
    }
    @Override public void sendLink(String email, String token) {
        var current = enabledSettings();
        send(current, email, "Geopetro IO — recuperação de senha",
            "Recebemos uma solicitação para redefinir sua senha.\n\n" +
            "O link abaixo pode ser usado uma vez e expira em 30 minutos:\n" +
            current.frontendUrl() + "/redefinir-senha#token=" + token +
            "\n\nSe você não fez esta solicitação, ignore este e-mail. Sua senha continua a mesma.");
    }
    @Override public void sendConfirmation(String email) {
        send(enabledSettings(), email, "Geopetro IO — senha alterada",
            "Sua senha foi alterada pelo fluxo de recuperação.\nSe não foi você, procure o administrador do sistema.");
    }
    private void send(SmtpSettings current, String email, String subject, String text) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(current.from()); message.setTo(email); message.setSubject(subject); message.setText(text);
        transport.send(current, message);
    }
}
