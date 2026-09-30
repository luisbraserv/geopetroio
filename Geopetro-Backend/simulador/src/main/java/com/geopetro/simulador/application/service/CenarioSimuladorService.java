package com.geopetro.simulador.application.service;

import com.geopetro.core.exception.ResourceNotFoundException;
import com.geopetro.simulador.adapter.in.web.request.CenarioRequest;
import com.geopetro.simulador.adapter.out.persistence.entity.CenarioSimuladorEntity;
import com.geopetro.simulador.adapter.out.persistence.entity.PastaSimuladorEntity;
import com.geopetro.simulador.adapter.out.persistence.repository.CenarioSimuladorJpaRepository;
import com.geopetro.simulador.adapter.out.persistence.repository.PastaSimuladorJpaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class CenarioSimuladorService {

    private final CenarioSimuladorJpaRepository repository;
    private final PastaSimuladorJpaRepository pastaRepository;
    private final PocoService pocos;
    private static final tools.jackson.databind.json.JsonMapper JSON = tools.jackson.databind.json.JsonMapper.builder().build();

    public CenarioSimuladorService(CenarioSimuladorJpaRepository repository,
            PastaSimuladorJpaRepository pastaRepository, PocoService pocos) {
        this.repository = repository;
        this.pastaRepository = pastaRepository;
        this.pocos = pocos;
    }

    @Transactional(readOnly = true)
    public List<CenarioSimuladorEntity> listar(String operacao, Long pastaId) {
        if (pastaId != null) {
            validarPasta(pastaId, operacao);
            return repository.findByOperacaoAndPastaIdOrderByAtualizadoEmDesc(operacao, pastaId);
        }
        return repository.findByOperacaoOrderByAtualizadoEmDesc(operacao);
    }

    @Transactional(readOnly = true)
    public List<CenarioSimuladorEntity> listarSemPasta(String operacao) {
        return repository.findByOperacaoAndPastaIsNullOrderByAtualizadoEmDesc(operacao);
    }

    @Transactional(readOnly = true)
    public CenarioSimuladorEntity buscar(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Cenário não encontrado."));
    }

    @Transactional
    public CenarioSimuladorEntity criar(CenarioRequest request, String username) {
        CenarioSimuladorEntity cenario = new CenarioSimuladorEntity();
        cenario.setNome(request.nome());
        cenario.setOperacao(request.operacao());
        aplicarGeometria(cenario, request);
        cenario.setDadosRelatorio(request.dadosRelatorio());
        cenario.setCriadoPor(username);
        if (request.pastaId() != null) {
            PastaSimuladorEntity pasta = validarPasta(request.pastaId(), request.operacao());
            cenario.setPasta(pasta);
        }
        return repository.save(cenario);
    }

    @Transactional
    public CenarioSimuladorEntity atualizar(Long id, CenarioRequest request) {
        CenarioSimuladorEntity cenario = buscar(id);
        if (!cenario.getOperacao().equals(request.operacao()))
            throw new IllegalArgumentException("A operação do cenário não pode ser alterada.");
        cenario.setNome(request.nome());
        aplicarGeometria(cenario, request);
        cenario.setDadosRelatorio(request.dadosRelatorio());
        if (request.pastaId() != null) {
            PastaSimuladorEntity pasta = validarPasta(request.pastaId(), request.operacao());
            cenario.setPasta(pasta);
        } else {
            cenario.setPasta(null);
        }
        return repository.save(cenario);
    }

    private PastaSimuladorEntity validarPasta(Long id, String operacao) {
        var pasta = pastaRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Pasta não encontrada."));
        if (!pasta.getOperacao().equals(operacao))
            throw new IllegalArgumentException("A pasta pertence a outra operação.");
        return pasta;
    }

    private void aplicarGeometria(CenarioSimuladorEntity cenario, CenarioRequest request) {
        if (request.pocoId() == null) {
            cenario.setPoco(null);
            cenario.setFormValue(request.formValue());
            return;
        }
        var poco = pocos.paraVincular(request.pocoId(), request.pocoVersion());
        try {
            var node = JSON.readTree(request.formValue());
            if (!(node instanceof tools.jackson.databind.node.ObjectNode object))
                throw new IllegalArgumentException("formValue deve ser um objeto JSON.");
            // Compatibilidade com clientes que ainda enviam estes campos: nunca persistir a copia.
            for (String key : List.of("wellFinalMD", "wellFinalTVD", "fases", "trajectory", "_poco")) object.remove(key);
            cenario.setPoco(poco);
            cenario.setFormValue(JSON.writeValueAsString(object));
        } catch (tools.jackson.core.JacksonException e) {
            throw new IllegalArgumentException("formValue deve ser um objeto JSON valido.");
        }
    }

    @Transactional
    public void excluir(Long id) {
        repository.delete(buscar(id));
    }
}
