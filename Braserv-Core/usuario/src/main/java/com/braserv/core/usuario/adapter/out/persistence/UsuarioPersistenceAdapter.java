package com.braserv.core.usuario.adapter.out.persistence;

import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Repository;

import com.braserv.core.usuario.adapter.out.persistence.mapper.UsuarioPersistenceMapper;
import com.braserv.core.usuario.adapter.out.persistence.entity.UsuarioEntity;
import com.braserv.core.usuario.adapter.out.persistence.repository.UsuarioJpaRepository;
import com.braserv.core.usuario.application.dto.PaginaOutput;
import com.braserv.core.usuario.application.port.out.UsuarioRepositoryPort;
import com.braserv.core.usuario.domain.model.StatusUsuario;
import com.braserv.core.usuario.domain.model.Usuario;

@Repository
public class UsuarioPersistenceAdapter implements UsuarioRepositoryPort {

	private final UsuarioJpaRepository usuarioJpaRepository;
	private final UsuarioPersistenceMapper usuarioPersistenceMapper;

	public UsuarioPersistenceAdapter(UsuarioJpaRepository usuarioJpaRepository,
			UsuarioPersistenceMapper usuarioPersistenceMapper) {
		this.usuarioJpaRepository = usuarioJpaRepository;
		this.usuarioPersistenceMapper = usuarioPersistenceMapper;
	}

	@Override
	public Usuario salvar(Usuario usuario) {
		return usuarioPersistenceMapper.toDomain(usuarioJpaRepository.save(usuarioPersistenceMapper.toEntity(usuario)));
	}

	@Override
	public Optional<Usuario> buscarPorUsername(String username) {
		return usuarioJpaRepository.findById(username).map(usuarioPersistenceMapper::toDomain);
	}

	@Override
	public Optional<Usuario> buscarPorEmail(String email) {
		return usuarioJpaRepository.findByEmail(email).map(usuarioPersistenceMapper::toDomain);
	}

	@Override
	public boolean existePorUsername(String username) {
		return usuarioJpaRepository.existsById(username);
	}

	@Override
	public Optional<StatusUsuario> buscarStatusPorUsername(String username) {
		return usuarioJpaRepository.findStatusByUsername(username);
	}

	@Override
	public PaginaOutput<Usuario> listar(int pagina, int tamanho, String busca) {
		PageRequest pageRequest = PageRequest.of(pagina, tamanho, Sort.by("username").ascending());
		Page<UsuarioEntity> usuarios = (busca == null || busca.isBlank())
				? usuarioJpaRepository.findAll(pageRequest)
				: usuarioJpaRepository
						.findByUsernameContainingIgnoreCaseOrNomeContainingIgnoreCaseOrEmailContainingIgnoreCase(
								busca.trim(), busca.trim(), busca.trim(), pageRequest);

		return new PaginaOutput<>(usuarios.getContent().stream().map(usuarioPersistenceMapper::toDomain).toList(),
				usuarios.getNumber(), usuarios.getSize(), usuarios.getTotalElements(), usuarios.getTotalPages(),
				usuarios.isFirst(), usuarios.isLast());
	}
}
