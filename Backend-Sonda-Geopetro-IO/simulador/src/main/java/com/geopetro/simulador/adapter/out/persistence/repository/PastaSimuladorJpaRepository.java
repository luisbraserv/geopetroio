package com.geopetro.simulador.adapter.out.persistence.repository;

import com.geopetro.simulador.adapter.out.persistence.entity.PastaSimuladorEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PastaSimuladorJpaRepository extends JpaRepository<PastaSimuladorEntity, Long> {
    List<PastaSimuladorEntity> findByOperacaoOrderByNomeAsc(String operacao);
}
