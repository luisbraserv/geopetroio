package com.braserv.core.identidade.servico;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ServicoClienteRepository extends JpaRepository<ServicoClienteEntity, String> {

	List<ServicoClienteEntity> findAllByOrderByIdAsc();
}
