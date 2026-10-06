package com.braserv.core.usuario.application.dto;

import java.util.List;
import java.util.Set;

import com.braserv.core.usuario.domain.model.Role;
import com.braserv.core.usuario.domain.model.StatusUsuario;
import com.braserv.core.usuario.domain.model.Usuario;
import com.braserv.core.usuario.domain.model.UsuarioCliente;
import com.braserv.core.usuario.domain.model.UsuarioInterno;

public record UsuarioOutput(String username, String nome, String email, String telefone, String endereco, Role role,
		Set<Role> roles, StatusUsuario status, String cep, String logradouro, String bairro, String cidade,
		String estado, String numero, String complemento, Integer id, String empresa, Integer matricula,
		Long empresaId, String empresaNome, List<UsuarioCliente.UnidadeRef> unidades) {

	public static UsuarioOutput de(Usuario usuario) {
		String endereco = usuario.getEndereco() == null ? null : usuario.getEndereco().formatado();
		String cep = usuario.getEndereco() == null ? null : usuario.getEndereco().getCep();
		String logradouro = usuario.getEndereco() == null ? null : usuario.getEndereco().getLogradouro();
		String bairro = usuario.getEndereco() == null ? null : usuario.getEndereco().getBairro();
		String cidade = usuario.getEndereco() == null ? null : usuario.getEndereco().getCidade();
		String estado = usuario.getEndereco() == null ? null : usuario.getEndereco().getEstado();
		String numero = usuario.getEndereco() == null ? null : usuario.getEndereco().getNumero();
		String complemento = usuario.getEndereco() == null ? null : usuario.getEndereco().getComplemento();
		Integer id = usuario instanceof UsuarioCliente cliente ? cliente.getId() : null;
		String empresa = usuario instanceof UsuarioCliente cliente ? cliente.getEmpresa() : null;
		Long empresaId = usuario instanceof UsuarioCliente cliente ? cliente.getEmpresaId() : null;
		Integer matricula = usuario instanceof UsuarioInterno interno ? interno.getMatricula() : null;
		List<UsuarioCliente.UnidadeRef> unidades = usuario instanceof UsuarioCliente cliente
				? cliente.getUnidades()
				: List.of();

		return new UsuarioOutput(usuario.getUsername(), usuario.getNome(), usuario.getEmail().formatado(),
				usuario.getTelefone().formatado(), endereco, usuario.getRole(), usuario.getRoles(),
				usuario.getStatus(), cep, logradouro, bairro, cidade, estado, numero, complemento,
				id, empresa, matricula, empresaId, empresa, unidades);
	}
}
