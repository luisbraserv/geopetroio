package com.geopetro.simulador.adapter.out.persistence.repository;

import com.geopetro.simulador.adapter.out.persistence.entity.CenarioSimuladorEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CenarioSimuladorJpaRepository extends JpaRepository<CenarioSimuladorEntity, Long> {
    List<CenarioSimuladorEntity> findByOperacaoAndPastaIsNullOrderByAtualizadoEmDesc(String operacao);
    List<CenarioSimuladorEntity> findByPastaIdOrderByAtualizadoEmDesc(Long pastaId);
    List<CenarioSimuladorEntity> findByOperacaoOrderByAtualizadoEmDesc(String operacao);
}
