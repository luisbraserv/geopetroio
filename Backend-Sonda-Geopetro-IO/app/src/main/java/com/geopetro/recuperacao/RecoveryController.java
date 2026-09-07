package com.geopetro.recuperacao;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/auth/recuperacao-senha")
public class RecoveryController {
    private final RecoveryService service;
    public RecoveryController(RecoveryService service) { this.service = service; }
    public record Request(@NotBlank @Email @Size(max = 254) String email) {
        @Override public String toString() { return "RecoveryRequest[redacted]"; }
    }
    public record Confirm(@NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{43}") String token,
        @NotBlank @Size(max = 20) String novaSenha, @NotBlank @Size(max = 20) String confirmacaoSenha) {
        @Override public String toString() { return "RecoveryConfirm[redacted]"; }
    }
    public record Message(String message) {}
    @PostMapping public ResponseEntity<Message> request(@RequestBody @Valid Request request) {
        service.request(request.email());
        return ResponseEntity.accepted().body(new Message("Se houver uma conta ativa com esse e-mail, você receberá as instruções de recuperação."));
    }
    @PostMapping("/confirmar") public ResponseEntity<Void> confirm(@RequestBody @Valid Confirm request) {
        service.confirm(request.token(), request.novaSenha(), request.confirmacaoSenha());
        return ResponseEntity.noContent().build();
    }
}
