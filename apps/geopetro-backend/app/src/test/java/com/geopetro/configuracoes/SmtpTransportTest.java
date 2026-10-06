package com.geopetro.configuracoes;

import com.geopetro.core.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SmtpTransportTest {
    private SmtpSettings settings(SmtpSettings.Transport transport, boolean auth) {
        return new SmtpSettings(true, "smtp.example.test", 587, transport, auth, "account", "password", "account@example.test", "https://app.example.test");
    }
    @Test void configuresRequiredTlsIdentityVerificationAndTimeouts() {
        var transport = new SmtpTransport();
        var sender = transport.sender(settings(SmtpSettings.Transport.STARTTLS, true));
        assertEquals("account", sender.getUsername());
        assertEquals("password", sender.getPassword());
        var properties = sender.getJavaMailProperties();
        assertEquals("true", properties.getProperty("mail.smtp.starttls.required"));
        assertEquals("true", properties.getProperty("mail.smtp.ssl.checkserveridentity"));
        assertEquals("5000", properties.getProperty("mail.smtp.connectiontimeout"));
        assertEquals("true", transport.sender(settings(SmtpSettings.Transport.TLS, true)).getJavaMailProperties().getProperty("mail.smtp.ssl.enable"));
        var relay = transport.sender(settings(SmtpSettings.Transport.NONE, false));
        assertNull(relay.getUsername()); assertNull(relay.getPassword());
        assertEquals("false", relay.getJavaMailProperties().getProperty("mail.smtp.auth"));
    }
    @Test void testsConnectionWithoutSendingAndSanitizesSmtpFailures() throws Exception {
        var sender = mock(JavaMailSenderImpl.class);
        var transport = new SmtpTransport() { @Override JavaMailSenderImpl sender(SmtpSettings settings) { return sender; } };
        transport.test(settings(SmtpSettings.Transport.STARTTLS, true));
        verify(sender).testConnection(); verifyNoMoreInteractions(sender);
        doThrow(new jakarta.mail.MessagingException("sensitive server response")).when(sender).testConnection();
        var failure = assertThrows(BusinessException.class, () -> transport.test(settings(SmtpSettings.Transport.STARTTLS, true)));
        assertEquals(502, failure.getStatus().value());
        assertFalse(failure.getMessage().contains("sensitive"));
    }
}
