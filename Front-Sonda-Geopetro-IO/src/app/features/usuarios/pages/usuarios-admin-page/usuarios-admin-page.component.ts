import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TuiButton, TuiIcon } from '@taiga-ui/core';

import { ModalComponent } from '../../../../shared/ui/modal/modal.component';
import { PaginatorComponent } from '../../../../shared/ui/paginator/paginator.component';
import { SearchBoxComponent } from '../../../../shared/ui/search-box/search-box.component';
import { CepService } from '../../../../shared/services/cep.service';
import { ToastService } from '../../../../shared/toast/toast.service';
import { UserRole } from '../../../auth/models/user.model';
import { Empresa, Regional, Setor, UnidadeSonda } from '../../../cadastros/models/cadastros.model';
import { EmpresaService } from '../../../cadastros/services/empresa.service';
import { RegionalService } from '../../../cadastros/services/regional.service';
import { SetorService } from '../../../cadastros/services/setor.service';
import { UnidadeSondaService } from '../../../cadastros/services/unidade-sonda.service';
import {
  AtualizarUsuarioPayload,
  CriarUsuarioClientePayload,
  CriarUsuarioInternoPayload,
  UsuarioResponse,
} from '../../models/usuario-api.model';
import { UsuariosService } from '../../services/usuarios.service';

type TipoUsuario = 'CLIENTE' | 'INTERNO';

@Component({
  selector: 'app-usuarios-admin-page',
  imports: [CommonModule, FormsModule, TuiButton, TuiIcon, ModalComponent, SearchBoxComponent, PaginatorComponent],
  templateUrl: './usuarios-admin-page.component.html',
  styleUrl: './usuarios-admin-page.component.css',
})
export class UsuariosAdminPageComponent {
  private readonly usuariosService = inject(UsuariosService);
  private readonly empresaService = inject(EmpresaService);
  private readonly regionalService = inject(RegionalService);
  private readonly setorService = inject(SetorService);
  private readonly unidadeSondaService = inject(UnidadeSondaService);
  private readonly cepService = inject(CepService);
  private readonly toast = inject(ToastService);

  protected readonly tipo = signal<TipoUsuario>('INTERNO');
  protected readonly modalAberto = signal(false);
  protected readonly usuarios = signal<UsuarioResponse[]>([]);
  protected readonly pagina = signal(0);
  protected readonly totalPaginas = signal(0);
  protected readonly totalElementos = signal(0);
  private busca = '';
  protected readonly isLoading = signal(false);
  protected readonly buscandoCep = signal(false);
  protected readonly feedback = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly editandoUsername = signal<string | null>(null);
  protected readonly empresas = signal<Empresa[]>([]);
  protected readonly regionais = signal<Regional[]>([]);
  protected readonly setores = signal<Setor[]>([]);
  protected readonly unidades = signal<UnidadeSonda[]>([]);
  // Regional principal fica em form.regionalId; abaixo as N regionais e N setores vinculados
  protected readonly regionaisSelecionadas = signal<number[]>([]);
  protected readonly setoresSelecionados = signal<number[]>([]);
  // Unidades/Sondas concedidas ao CLIENTE
  protected readonly unidadesSelecionadas = signal<number[]>([]);
  protected readonly rolesSel = signal<UserRole[]>([]);

  /**
   * Roles atribuíveis além da role base (CLIENTE/INTERNO, aplicada automaticamente pelo backend).
   *
   * Espelha o enum `Role` do backend. Não faz sentido oferecer aqui uma role que o servidor não
   * conhece — ela seria rejeitada ou simplesmente não teria efeito.
   */
  protected readonly rolesAdicionais: UserRole[] = [
    'ADMIN',
    'CIMENTACAO',
    'SONDA',
    'GERENCIA',
    'DIRETORIA',
  ];

  protected readonly form = {
    id: 1,
    empresaId: 0,
    empresa: '',
    matricula: 100,
    regionalId: 0,
    username: '',
    password: '',
    nome: '',
    telefone: '',
    email: '',
    cep: '',
    logradouro: '',
    bairro: '',
    cidade: '',
    estado: '',
    numero: '',
    complemento: '',
  };

  constructor() {
    this.listarUsuarios();
    this.carregarRelacionamentos();
  }

  protected editando(): boolean {
    return this.editandoUsername() !== null;
  }

  protected abrirNovo(): void {
    this.limparFormulario();
    this.feedback.set(null);
    this.error.set(null);
    this.modalAberto.set(true);
  }

  protected fecharModal(): void {
    this.modalAberto.set(false);
    this.limparFormulario();
  }

  protected selecionarTipo(tipo: TipoUsuario): void {
    if (this.editando()) return;
    this.tipo.set(tipo);
  }

  protected roleBase(): UserRole {
    return this.tipo();
  }

  protected roleSelecionada(role: UserRole): boolean {
    return this.rolesSel().includes(role);
  }

  protected alternarRole(role: UserRole, checked: boolean): void {
    if (checked) {
      if (!this.rolesSel().includes(role)) {
        this.rolesSel.update((roles) => [...roles, role]);
      }
      return;
    }
    this.rolesSel.update((roles) => roles.filter((item) => item !== role));
  }

  protected regionalSelecionada(id: number): boolean {
    return this.regionaisSelecionadas().includes(id);
  }

  protected alternarRegional(id: number, checked: boolean): void {
    if (checked) {
      if (!this.regionaisSelecionadas().includes(id)) {
        this.regionaisSelecionadas.update((ids) => [...ids, id]);
      }
      return;
    }
    // Ao desmarcar a regional, remove tambem seus setores selecionados
    this.regionaisSelecionadas.update((ids) => ids.filter((item) => item !== id));
    const setoresDaRegional = this.setores().filter((s) => s.regionalId === id).map((s) => s.id);
    this.setoresSelecionados.update((ids) => ids.filter((item) => !setoresDaRegional.includes(item)));
    // Se a principal era esta regional, limpa
    if (Number(this.form.regionalId) === id) {
      this.form.regionalId = 0;
    }
  }

  protected setoresDaRegional(regionalId: number): Setor[] {
    return this.setores().filter((s) => s.regionalId === regionalId);
  }

  protected setorSelecionado(id: number): boolean {
    return this.setoresSelecionados().includes(id);
  }

  protected alternarSetor(id: number, checked: boolean): void {
    if (checked) {
      if (!this.setoresSelecionados().includes(id)) {
        this.setoresSelecionados.update((ids) => [...ids, id]);
      }
      return;
    }
    this.setoresSelecionados.update((ids) => ids.filter((item) => item !== id));
  }

  // Regionais disponiveis para escolher a principal = as que estao marcadas
  protected regionaisMarcadas(): Regional[] {
    return this.regionais().filter((r) => this.regionaisSelecionadas().includes(r.id));
  }

  protected roleLabel(role: UserRole): string {
    const labels: Record<UserRole, string> = {
      ADMIN: 'Administrador',
      CLIENTE: 'Cliente',
      INTERNO: 'Interno',
      CIMENTACAO: 'Cimentação',
      SONDA: 'Sonda',
      GERENCIA: 'Gerência',
      DIRETORIA: 'Diretoria',
    };
    return labels[role] ?? role;
  }

  // ---------------------------------------------------------------------------
  // Unidades/Sondas concedidas ao CLIENTE
  //
  // Diferente dos perfis internos, o cliente não enxerga a frota inteira: seu
  // acesso ao monitoramento é concedido unidade a unidade, aqui.
  // ---------------------------------------------------------------------------

  protected unidadeSelecionada(id: number): boolean {
    return this.unidadesSelecionadas().includes(id);
  }

  protected alternarUnidade(id: number, checked: boolean): void {
    if (checked) {
      if (!this.unidadesSelecionadas().includes(id)) {
        this.unidadesSelecionadas.update((ids) => [...ids, id]);
      }
      return;
    }
    this.unidadesSelecionadas.update((ids) => ids.filter((item) => item !== id));
  }

  protected marcarTodasUnidades(): void {
    this.unidadesSelecionadas.set(this.unidades().map((u) => u.id));
  }

  protected desmarcarTodasUnidades(): void {
    this.unidadesSelecionadas.set([]);
  }

  protected rotuloUnidade(unidade: UnidadeSonda): string {
    return unidade.apelido ? `${unidade.nome} — ${unidade.apelido}` : unidade.nome;
  }

  protected buscarCep(): void {
    if (!this.form.cep) return;
    this.buscandoCep.set(true);
    this.cepService.buscar(this.form.cep).subscribe({
      next: (end) => {
        this.form.logradouro = end.logradouro;
        this.form.bairro = end.bairro;
        this.form.cidade = end.localidade;
        this.form.estado = end.uf;
        this.buscandoCep.set(false);
      },
      error: (e: Error) => {
        this.toast.error(e.message || 'CEP não encontrado.');
        this.buscandoCep.set(false);
      },
    });
  }

  // Validacoes espelhando as regras do backend (Usuario/Telefone/Email/UsuarioInterno)
  private validarFormulario(): string | null {
    const novo = !this.editando();
    const nome = this.form.nome?.trim() ?? '';
    const username = this.form.username?.trim() ?? '';
    const email = this.form.email?.trim() ?? '';
    const telefoneDigitos = (this.form.telefone ?? '').replace(/\D/g, '');

    if (!nome) return 'Informe o nome.';
    if (!email) return 'Informe o e-mail.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'E-mail deve conter usuário e domínio separados por @.';
    if (telefoneDigitos.length !== 11) return 'Telefone deve conter DDD e número com 11 dígitos.';

    if (novo) {
      if (!username) return 'Informe o username.';
      if (username.length > 60) return 'Username deve ter no máximo 60 caracteres.';
      if (!/^[A-Za-z0-9._-]+$/.test(username)) {
        return 'Username deve conter apenas letras, números, ponto, hífen ou underline.';
      }
      const senha = this.form.password ?? '';
      if (!senha) return 'Informe a senha.';
      if (senha.length < 8 || senha.length > 20) return 'Senha deve ter entre 8 e 20 caracteres.';
      if (!/[a-z]/.test(senha)) return 'Senha deve conter ao menos uma letra minúscula.';
      if (!/[A-Z]/.test(senha)) return 'Senha deve conter ao menos uma letra maiúscula.';
      if (!/\d/.test(senha)) return 'Senha deve conter ao menos um número.';
      if (!/[^A-Za-z0-9]/.test(senha)) return 'Senha deve conter ao menos um caractere especial.';
    }

    if (this.tipo() === 'INTERNO') {
      if (!this.form.matricula || Number(this.form.matricula) <= 0) return 'Matrícula deve ser maior que zero.';
      if (this.regionaisSelecionadas().length === 0) return 'Selecione ao menos uma regional para o usuário interno.';
      if (!this.form.regionalId || !this.regionaisSelecionadas().includes(Number(this.form.regionalId))) {
        return 'Selecione a regional principal entre as regionais marcadas.';
      }
    } else {
      if (!this.form.id || Number(this.form.id) <= 0) return 'Informe o ID do cliente.';
      if (!this.form.empresaId) return 'Selecione a empresa do cliente.';
    }

    return null;
  }

  protected salvar(): void {
    this.isLoading.set(true);
    this.feedback.set(null);
    this.error.set(null);

    const erro = this.validarFormulario();
    if (erro) {
      this.toast.warning(erro);
      this.error.set(erro);
      this.isLoading.set(false);
      return;
    }

    const username = this.editandoUsername();
    const request = username
      ? this.usuariosService.atualizarUsuario(username, this.payloadAtualizacao())
      : this.tipo() === 'CLIENTE'
        ? this.usuariosService.criarCliente(this.payloadCliente())
        : this.usuariosService.criarInterno(this.payloadInterno());

    request.subscribe({
      next: () => {
        this.toast.success(username ? 'Usuário atualizado com sucesso.' : 'Usuário cadastrado com sucesso.');
        this.modalAberto.set(false);
        this.limparFormulario();
        this.listarUsuarios();
      },
      error: (error: Error) => {
        this.notificarErro(error);
        this.isLoading.set(false);
      },
    });
  }

  protected listarUsuarios(): void {
    this.usuariosService.listar(this.pagina(), 10, this.busca).subscribe({
      next: (pagina) => {
        this.usuarios.set(pagina.conteudo);
        this.totalPaginas.set(pagina.totalPaginas);
        this.totalElementos.set(pagina.totalElementos);
        this.isLoading.set(false);
      },
      error: (error: Error) => {
        this.notificarErro(error);
        this.isLoading.set(false);
      },
    });
  }

  protected aoBuscar(termo: string): void { this.busca = termo; this.pagina.set(0); this.listarUsuarios(); }
  protected irParaPagina(p: number): void { this.pagina.set(p); this.listarUsuarios(); }

  protected editar(usuario: UsuarioResponse): void {
    this.feedback.set(null);
    this.error.set(null);
    this.editandoUsername.set(usuario.username);
    this.tipo.set(usuario.roles.includes('CLIENTE') ? 'CLIENTE' : 'INTERNO');

    Object.assign(this.form, {
      id: usuario.id ?? 1,
      empresaId: usuario.empresaId ?? 0,
      empresa: usuario.empresaNome ?? usuario.empresa ?? '',
      matricula: usuario.matricula ?? 100,
      regionalId: usuario.regionalId ?? 0,
      username: usuario.username,
      password: '',
      nome: usuario.nome,
      telefone: usuario.telefone,
      email: usuario.email,
      cep: usuario.cep ?? '',
      logradouro: usuario.logradouro ?? '',
      bairro: usuario.bairro ?? '',
      cidade: usuario.cidade ?? '',
      estado: usuario.estado ?? '',
      numero: usuario.numero ?? '',
      complemento: usuario.complemento ?? '',
    });
    this.rolesSel.set(usuario.roles.filter((role) => role !== 'CLIENTE' && role !== 'INTERNO'));

    this.regionaisSelecionadas.set((usuario.regionais ?? []).map((r) => r.id));
    this.setoresSelecionados.set((usuario.setores ?? []).map((s) => s.id));
    this.unidadesSelecionadas.set((usuario.unidadesSondas ?? []).map((u) => u.id));
    this.modalAberto.set(true);
  }

  protected cancelarEdicao(): void {
    this.limparFormulario();
  }

  private payloadCliente(): CriarUsuarioClientePayload {
    return {
      ...this.payloadComum(),
      id: Number(this.form.id),
      empresaId: Number(this.form.empresaId),
      empresa: this.form.empresa,
      username: this.form.username,
      password: this.form.password,
      roles: this.rolesSelecionadas(),
      unidadeSondaIds: this.unidadesSelecionadas(),
    };
  }

  private payloadInterno(): CriarUsuarioInternoPayload {
    return {
      ...this.payloadComum(),
      matricula: Number(this.form.matricula),
      regionalId: Number(this.form.regionalId),
      regionalIds: this.regionaisSelecionadas(),
      setorIds: this.setoresSelecionados(),
      username: this.form.username,
      password: this.form.password,
      roles: this.rolesSelecionadas(),
    };
  }

  private payloadAtualizacao(): AtualizarUsuarioPayload {
    return {
      ...this.payloadComum(),
      roles: this.rolesSelecionadas(),
      ...(this.tipo() === 'CLIENTE'
        ? {
            id: Number(this.form.id),
            empresaId: Number(this.form.empresaId),
            empresa: this.form.empresa,
            unidadeSondaIds: this.unidadesSelecionadas(),
          }
        : {
            matricula: Number(this.form.matricula),
            regionalId: Number(this.form.regionalId),
            regionalIds: this.regionaisSelecionadas(),
            setorIds: this.setoresSelecionados(),
          }),
    };
  }

  private payloadComum() {
    return {
      nome: this.form.nome,
      telefone: this.form.telefone,
      email: this.form.email,
      cep: this.form.cep,
      logradouro: this.form.logradouro,
      bairro: this.form.bairro,
      cidade: this.form.cidade,
      estado: this.form.estado,
      numero: this.form.numero,
      complemento: this.form.complemento,
    };
  }

  private rolesSelecionadas(): UserRole[] {
    return Array.from(new Set<UserRole>([this.roleBase(), ...this.rolesSel()]));
  }

  private limparFormulario(): void {
    this.editandoUsername.set(null);
    this.tipo.set('INTERNO');
    Object.assign(this.form, {
      id: 1,
      empresaId: 0,
      empresa: '',
      matricula: 100,
      regionalId: 0,
      username: '',
      password: '',
      nome: '',
      telefone: '',
      email: '',
      cep: '',
      logradouro: '',
      bairro: '',
      cidade: '',
      estado: '',
      numero: '',
      complemento: '',
    });
    this.rolesSel.set([]);
    this.regionaisSelecionadas.set([]);
    this.setoresSelecionados.set([]);
    this.unidadesSelecionadas.set([]);
  }

  private carregarRelacionamentos(): void {
    this.empresaService.listar().subscribe({
      next: (empresas) => this.empresas.set(empresas),
      error: (error: Error) => this.notificarErro(error),
    });
    this.regionalService.listar().subscribe({
      next: (regionais) => this.regionais.set(regionais),
      error: (error: Error) => this.notificarErro(error),
    });
    this.setorService.listar().subscribe({
      next: (setores) => this.setores.set(setores),
      error: (error: Error) => this.notificarErro(error),
    });
    // Necessário para conceder acesso ao monitoramento no cadastro de CLIENTE.
    this.unidadeSondaService.listar().subscribe({
      next: (unidades) => this.unidades.set(unidades),
      error: (error: Error) => this.notificarErro(error),
    });
  }

  private notificarErro(error: Error): void {
    const message = error?.message || 'Não foi possível concluir a operação.';
    this.error.set(message);
    this.toast.error(message);
  }
}
