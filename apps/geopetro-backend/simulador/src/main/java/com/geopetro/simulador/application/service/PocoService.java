package com.geopetro.simulador.application.service;

import com.geopetro.comum.exception.BusinessException;
import com.geopetro.comum.exception.ResourceNotFoundException;
import com.geopetro.simulador.adapter.in.web.request.PocoRequest;
import com.geopetro.simulador.adapter.out.persistence.entity.PocoEntity;
import com.geopetro.simulador.adapter.out.persistence.repository.*;
import com.geopetro.simulador.domain.PocoGeometryValidator;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Objects;

@Service
public class PocoService {
    private final PocoJpaRepository repository;
    private final CenarioSimuladorJpaRepository cenarios;
    public PocoService(PocoJpaRepository repository, CenarioSimuladorJpaRepository cenarios) {
        this.repository = repository;
        this.cenarios = cenarios;
    }
    @Transactional(readOnly = true)
    public List<PocoEntity> listar() { return repository.findAllByOrderByNomeAscIdAsc(); }
    @Transactional(readOnly = true)
    public PocoEntity buscar(Long id) {
        return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Poço não encontrado."));
    }
    @Transactional
    public PocoEntity paraVincular(Long id, Long version) {
        PocoEntity poco = repository.buscarParaAlteracao(id)
                .orElseThrow(() -> new ResourceNotFoundException("Poço não encontrado."));
        conferirVersao(poco, version);
        return poco;
    }
    private void conferirVersao(PocoEntity poco, Long version) {
        if (version == null || !Objects.equals(poco.getVersion(), version))
            throw new BusinessException("O poço foi alterado. Recarregue a geometria antes de salvar.", HttpStatus.CONFLICT);
    }
    @Transactional
    public PocoEntity criar(PocoRequest request, String username) {
        return gravar(new PocoEntity(), request, username);
    }
    @Transactional
    public PocoEntity atualizar(Long id, PocoRequest request, String username) {
        return gravar(paraVincular(id, request.version()), request, username);
    }
    private PocoEntity gravar(PocoEntity poco, PocoRequest request, String username) {
        PocoGeometryValidator.validate(request.geometria());
        if (request.nome() == null || request.nome().isBlank() || request.nome().trim().length() > 255)
            throw new BusinessException("Informe o nome do poço (até 255 caracteres).");
        poco.setNome(request.nome().trim());
        poco.setGeometria(request.geometria());
        poco.setAtualizadoPor(username);
        return repository.saveAndFlush(poco);
    }
    @Transactional
    public void excluir(Long id) {
        PocoEntity poco = repository.buscarParaAlteracao(id)
                .orElseThrow(() -> new ResourceNotFoundException("Poço não encontrado."));
        if (cenarios.existsByPocoId(id))
            throw new BusinessException("Não é possível excluir um poço com cenários vinculados.", HttpStatus.CONFLICT);
        repository.delete(poco);
        repository.flush();
    }
}
