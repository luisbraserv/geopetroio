package com.braserv.core.usuario.adapter.out.persistence.mapper;

import java.util.List;
import java.util.stream.Collectors;

import com.braserv.core.empresa.adapter.out.persistence.entity.EmpresaEntity;
import com.braserv.core.unidade.adapter.out.persistence.entity.UnidadeEntity;
import com.braserv.core.usuario.adapter.out.persistence.entity.UsuarioClienteEntity;
import com.braserv.core.usuario.adapter.out.persistence.entity.UsuarioEntity;
import com.braserv.core.usuario.adapter.out.persistence.entity.UsuarioInternoEntity;
import com.braserv.core.usuario.domain.exception.UsuarioInvalidoException;
import com.braserv.core.usuario.domain.model.Email;
import com.braserv.core.usuario.domain.model.Endereco;
import com.braserv.core.usuario.domain.model.Role;
import com.braserv.core.usuario.domain.model.Telefone;
import com.braserv.core.usuario.domain.model.Usuario;
import com.braserv.core.usuario.domain.model.UsuarioCliente;
import com.braserv.core.usuario.domain.model.UsuarioInterno;

public class UsuarioPersistenceMapper {

	public UsuarioEntity toEntity(Usuario usuario) {
		UsuarioEntity entity = criarEntity(usuario);
		entity.setUsername(usuario.getUsername());
		entity.setPassword(usuario.getPassword());
		entity.setRoles(usuario.getRoles());
		entity.setStatus(usuario.getStatus());
		entity.setNome(usuario.getNome());
		entity.setTelefone(usuario.getTelefone().formatado());
		entity.setEmail(usuario.getEmail().formatado());
		if (usuario.getEndereco() != null) {
			entity.setCep(usuario.getEndereco().getCep());
			entity.setLogradouro(usuario.getEndereco().getLogradouro());
			entity.setBairro(usuario.getEndereco().getBairro());
			entity.setCidade(usuario.getEndereco().getCidade());
			entity.setEstado(usuario.getEndereco().getEstado());
			entity.setNumero(usuario.getEndereco().getNumero());
			entity.setComplemento(usuario.getEndereco().getComplemento());
		}
		return entity;
	}

	public Usuario toDomain(UsuarioEntity entity) {
		Telefone telefone = Telefone.comTratamento(entity.getTelefone());
		Email email = Email.comTratamento(entity.getEmail());
		Endereco endereco = null;
		if (entity.getCep() != null) {
			endereco = Endereco.comTratamento(entity.getCep(), entity.getLogradouro(), entity.getBairro(),
					entity.getCidade(), entity.getEstado(), entity.getNumero(), entity.getComplemento());
		}

		Usuario usuario = criarDomain(entity, telefone, email, endereco);
		usuario.setStatus(entity.getStatus());
		return usuario;
	}

	private UsuarioEntity criarEntity(Usuario usuario) {
		if (usuario instanceof UsuarioCliente cliente) {
			UsuarioClienteEntity entity = new UsuarioClienteEntity();
			entity.setClienteId(cliente.getId());
			entity.setEmpresa(cliente.getEmpresa());
			if (cliente.getEmpresaId() != null) {
				EmpresaEntity empresa = new EmpresaEntity();
				empresa.setId(cliente.getEmpresaId());
				entity.setEmpresaRef(empresa);
			}
			entity.setUnidades(cliente.getUnidadeIds().stream()
					.map(this::referenciaUnidade)
					.collect(Collectors.toCollection(java.util.LinkedHashSet::new)));
			return entity;
		}

		if (usuario instanceof UsuarioInterno interno) {
			UsuarioInternoEntity entity = new UsuarioInternoEntity();
			entity.setMatricula(interno.getMatricula());
			return entity;
		}

		throw new UsuarioInvalidoException("Tipo de usuario invalido.");
	}

	private Usuario criarDomain(UsuarioEntity entity, Telefone telefone, Email email, Endereco endereco) {
		if (entity.getRoles().contains(Role.CLIENTE) && entity instanceof UsuarioClienteEntity cliente) {
			Long empresaId = cliente.getEmpresaRef() == null ? null : cliente.getEmpresaRef().getId();
			String empresaNome = cliente.getEmpresaRef() == null ? cliente.getEmpresa() : cliente.getEmpresaRef().getNome();
			List<UsuarioCliente.UnidadeRef> unidades = cliente.getUnidades().stream()
					.map(u -> new UsuarioCliente.UnidadeRef(u.getId(), u.getNome(), u.getApelido()))
					.toList();
			return new UsuarioCliente(cliente.getClienteId(), empresaId, empresaNome, entity.getUsername(),
					entity.getPassword(), entity.getNome(), telefone, email, endereco, entity.getRoles(), unidades);
		}

		if (entity.getRoles().contains(Role.INTERNO) && entity instanceof UsuarioInternoEntity interno) {
			return new UsuarioInterno(interno.getMatricula(), entity.getUsername(), entity.getPassword(),
					entity.getNome(), telefone, email, endereco, entity.getRoles());
		}

		throw new UsuarioInvalidoException("Tipo de usuario invalido.");
	}

	private UnidadeEntity referenciaUnidade(Long id) {
		UnidadeEntity unidade = new UnidadeEntity();
		unidade.setId(id);
		return unidade;
	}
}
