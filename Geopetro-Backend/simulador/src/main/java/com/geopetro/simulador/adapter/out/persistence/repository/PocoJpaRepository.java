package com.geopetro.simulador.adapter.out.persistence.repository;

import com.geopetro.simulador.adapter.out.persistence.entity.PocoEntity;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface PocoJpaRepository extends JpaRepository<PocoEntity, Long> {
    List<PocoEntity> findAllByOrderByNomeAscIdAsc();
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from PocoEntity p where p.id = :id")
    Optional<PocoEntity> buscarParaAlteracao(@Param("id") Long id);
}
