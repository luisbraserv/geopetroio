package com.geopetro.recuperacao;

import com.geopetro.usuario.adapter.out.persistence.entity.UsuarioEntity;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface RecoveryUserRepository extends Repository<UsuarioEntity, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from UsuarioEntity u where lower(u.email) = :email")
    List<UsuarioEntity> lockedByEmail(@Param("email") String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from UsuarioEntity u where u.username = :username")
    Optional<UsuarioEntity> locked(@Param("username") String username);
}
