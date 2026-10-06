package com.braserv.core.identidade.smtp;

import com.braserv.core.comum.exception.BusinessException;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Component;

@Component
public class SmtpTransport {
    JavaMailSenderImpl sender(SmtpSettings settings) {
        var sender = new JavaMailSenderImpl();
        sender.setHost(settings.host()); sender.setPort(settings.port()); sender.setDefaultEncoding("UTF-8");
        if (settings.auth()) { sender.setUsername(settings.username()); sender.setPassword(settings.password()); }
        var p = sender.getJavaMailProperties();
        p.setProperty("mail.smtp.auth", Boolean.toString(settings.auth()));
        p.setProperty("mail.smtp.starttls.enable", Boolean.toString(settings.transport() == SmtpSettings.Transport.STARTTLS));
        p.setProperty("mail.smtp.starttls.required", Boolean.toString(settings.transport() == SmtpSettings.Transport.STARTTLS));
        p.setProperty("mail.smtp.ssl.enable", Boolean.toString(settings.transport() == SmtpSettings.Transport.TLS));
        p.setProperty("mail.smtp.ssl.checkserveridentity", "true");
        for (String timeout : new String[]{"connectiontimeout", "timeout", "writetimeout"}) p.setProperty("mail.smtp." + timeout, "5000");
        return sender;
    }
    public void send(SmtpSettings settings, SimpleMailMessage message) { sender(settings).send(message); }
    public void test(SmtpSettings settings) {
        SmtpSettingsService.validateConnection(settings);
        try { sender(settings).testConnection(); }
        catch (Exception e) { throw new BusinessException("Nao foi possivel conectar ao SMTP. Confira servidor, porta, seguranca e credenciais.", HttpStatus.BAD_GATEWAY); }
    }
}
