package com.example.braservhorusdesktop.service;

import java.time.LocalDateTime;
import java.util.Objects;

import com.example.braservhorusdesktop.dto.OperacaoSnapshot;
import com.example.braservhorusdesktop.model.RegistroOperacao;
import com.example.braservhorusdesktop.repository.JsonRegistroService;

public class RegistroOperacaoService {

    private final JsonRegistroService jsonRegistroService;

    public RegistroOperacaoService() {
        this(new JsonRegistroService());
    }

    RegistroOperacaoService(JsonRegistroService jsonRegistroService) {
        this.jsonRegistroService = Objects.requireNonNull(jsonRegistroService, "jsonRegistroService");
    }

    public void salvar(OperacaoSnapshot snapshot) {
        if (snapshot == null) {
            return;
        }

        RegistroOperacao entity = new RegistroOperacao();
        entity.setTimestamp(snapshot.getTimestamp() != null ? snapshot.getTimestamp() : LocalDateTime.now());
        entity.setPressao(snapshot.getPressao());
        entity.setStrokeAtual(snapshot.getStrokeAtual());
        entity.setStrokeCumulativo(snapshot.getStrokeCumulativo());
        entity.setVazaoAtual(snapshot.getVazaoAtual());
        entity.setVolumeBombeado(snapshot.getVolumeBombeado());

        jsonRegistroService.salvar(entity);
    }
}
