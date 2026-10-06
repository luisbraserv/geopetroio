package com.braserv.core.identidade.recuperacao;

import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface RecoveryTokenRepository extends JpaRepository<RecoveryToken, String> {
    @Query("select t.username from RecoveryToken t where t.tokenHash = :hash")
    Optional<String> usernameForHash(@Param("hash") String hash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from RecoveryToken t where t.username = :username")
    Optional<RecoveryToken> locked(@Param("username") String username);
}
