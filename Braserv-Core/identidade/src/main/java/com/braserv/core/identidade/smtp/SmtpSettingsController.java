package com.braserv.core.identidade.smtp;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/configuracoes/email")
public class SmtpSettingsController {
    public record Update(boolean enabled, @NotNull @Size(max = 255) String host,
        @Min(1) @Max(65535) int port, @NotNull SmtpSettings.Transport transport, boolean auth,
        @NotNull @Size(max = 255) String username, @Size(max = 1024) String password,
        boolean clearPassword, @NotNull @Size(max = 255) String from,
        @NotNull @Size(max = 2048) String frontendUrl, Long version) {
        @Override public String toString() { return "SmtpUpdate[redacted]"; }
    }
    public record View(boolean enabled, String host, int port, SmtpSettings.Transport transport,
        boolean auth, String username, boolean passwordConfigured, String from, String frontendUrl, Long version) {}
    public record Message(String message) {}
    private final SmtpSettingsService service;
    private final SmtpTransport transport;
    public SmtpSettingsController(SmtpSettingsService service, SmtpTransport transport) {
        this.service = service; this.transport = transport;
    }
    @GetMapping public View read() { return service.view(); }
    @PutMapping public View save(@RequestBody @Valid Update update) { return service.save(update); }
    @PostMapping("/teste") public Message test() {
        transport.test(service.current());
        return new Message("Conexao SMTP validada. Nenhum e-mail foi enviado.");
    }
}
