package com.geopetro.simulador.application.service;

import com.geopetro.comum.exception.ResourceNotFoundException;
import com.geopetro.simulador.adapter.in.web.request.PastaRequest;
import com.geopetro.simulador.adapter.out.persistence.entity.PastaSimuladorEntity;
import com.geopetro.simulador.adapter.out.persistence.repository.PastaSimuladorJpaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class PastaSimuladorService {

    private final PastaSimuladorJpaRepository repository;

    public PastaSimuladorService(PastaSimuladorJpaRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<PastaSimuladorEntity> listar(String operacao) {
        return repository.findByOperacaoOrderByNomeAsc(operacao);
    }

    @Transactional(readOnly = true)
    public PastaSimuladorEntity buscar(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Pasta não encontrada."));
    }

    @Transactional
    public PastaSimuladorEntity criar(PastaRequest request, String username) {
        PastaSimuladorEntity pasta = new PastaSimuladorEntity();
        pasta.setNome(request.nome());
        pasta.setOperacao(request.operacao());
        pasta.setCriadoPor(username);
        return repository.save(pasta);
    }

    @Transactional
    public PastaSimuladorEntity renomear(Long id, PastaRequest request) {
        PastaSimuladorEntity pasta = buscar(id);
        if (!pasta.getOperacao().equals(request.operacao()))
            throw new IllegalArgumentException("A operação da pasta não pode ser alterada.");
        pasta.setNome(request.nome());
        return repository.save(pasta);
    }

    @Transactional
    public void excluir(Long id) {
        repository.delete(buscar(id));
    }
}
