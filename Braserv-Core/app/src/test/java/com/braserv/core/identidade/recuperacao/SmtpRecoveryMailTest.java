package com.braserv.core.identidade.recuperacao;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.mockito.ArgumentCaptor;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SmtpRecoveryMailTest {
    private final com.braserv.core.identidade.smtp.SmtpTransport sender = mock(com.braserv.core.identidade.smtp.SmtpTransport.class);
    private SmtpRecoveryMail mail(boolean enabled, String origin) {
        var settings = mock(com.braserv.core.identidade.smtp.SmtpSettingsService.class);
        when(settings.current()).thenReturn(new com.braserv.core.identidade.smtp.SmtpSettings(enabled, "smtp.example.test", 587,
            com.braserv.core.identidade.smtp.SmtpSettings.Transport.STARTTLS, true, "account", "test-only", "account@example.test", origin.replaceAll("/+$", "")));
        return new SmtpRecoveryMail(settings, sender);
    }
    @Test void rejectsDisabledInsecureAndUntrustedOrigins() {
        assertFalse(mail(false, "https://app.example.test").available());
        for (String origin : new String[]{"", "http://app.example.test", "//app.example.test",
            "https://user@app.example.test", "https://app.example.test/path", "https://app.example.test?q=x",
            "https://app.example.test#x", "javascript:alert(1)"}) {
            assertFalse(mail(true, origin).available(), origin);
        }
        assertTrue(mail(true, "http://localhost:4200").available());
        assertTrue(mail(true, "https://app.example.test/").available());
        verifyNoInteractions(sender);
    }
    @Test void messageUsesConfiguredOriginAndNotificationContainsNoToken() {
        var service = mail(true, "https://app.example.test/");
        String token = "x".repeat(43);
        service.sendLink("ana@example.test", token);
        service.sendConfirmation("ana@example.test");
        var messages = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(sender, times(2)).send(any(), messages.capture());
        var link = messages.getAllValues().get(0);
        assertEquals("account@example.test", link.getFrom());
        assertArrayEquals(new String[]{"ana@example.test"}, link.getTo());
        assertTrue(link.getText().contains("https://app.example.test/redefinir-senha#token=" + token));
        assertFalse(messages.getAllValues().get(1).getText().contains(token));
    }
}
