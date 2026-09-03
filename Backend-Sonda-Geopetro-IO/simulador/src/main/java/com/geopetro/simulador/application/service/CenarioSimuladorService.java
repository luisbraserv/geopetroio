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

    public CenarioSimuladorService(CenarioSimuladorJpaRepository repository,
            PastaSimuladorJpaRepository pastaRepository) {
        this.repository = repository;
        this.pastaRepository = pastaRepository;
    }

    @Transactional(readOnly = true)
    public List<CenarioSimuladorEntity> listar(String operacao, Long pastaId) {
        if (pastaId != null) {
            return repository.findByPastaIdOrderByAtualizadoEmDesc(pastaId);
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
        cenario.setFormValue(request.formValue());
        cenario.setDadosRelatorio(request.dadosRelatorio());
        cenario.setCriadoPor(username);
        if (request.pastaId() != null) {
            PastaSimuladorEntity pasta = pastaRepository.findById(request.pastaId())
                    .orElseThrow(() -> new ResourceNotFoundException("Pasta não encontrada."));
            cenario.setPasta(pasta);
        }
        return repository.save(cenario);
    }

    @Transactional
    public CenarioSimuladorEntity atualizar(Long id, CenarioRequest request) {
        CenarioSimuladorEntity cenario = buscar(id);
        cenario.setNome(request.nome());
        cenario.setFormValue(request.formValue());
        cenario.setDadosRelatorio(request.dadosRelatorio());
        if (request.pastaId() != null) {
            PastaSimuladorEntity pasta = pastaRepository.findById(request.pastaId())
                    .orElseThrow(() -> new ResourceNotFoundException("Pasta não encontrada."));
            cenario.setPasta(pasta);
        } else {
            cenario.setPasta(null);
        }
        return repository.save(cenario);
    }

    @Transactional
    public void excluir(Long id) {
        repository.delete(buscar(id));
    }
}
