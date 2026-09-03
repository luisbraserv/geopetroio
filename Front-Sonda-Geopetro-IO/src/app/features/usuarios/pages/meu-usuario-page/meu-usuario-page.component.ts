import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TuiButton } from '@taiga-ui/core';
import { Store } from '@ngxs/store';

import { CepService } from '../../../../shared/services/cep.service';
import { ToastService } from '../../../../shared/toast/toast.service';
import { AuthState } from '../../../auth/state/auth.state';
import { UpdateAuthenticatedUser } from '../../../auth/state/auth.actions';
import { UsuariosService } from '../../services/usuarios.service';

@Component({
  selector: 'app-meu-usuario-page',
  imports: [CommonModule, FormsModule, TuiButton],
  templateUrl: './meu-usuario-page.component.html',
  styleUrl: './meu-usuario-page.component.css',
})
export class MeuUsuarioPageComponent {
  private readonly store = inject(Store);
  private readonly usuariosService = inject(UsuariosService);
  private readonly cepService = inject(CepService);
  private readonly toast = inject(ToastService);

  protected readonly currentUser = this.store.selectSignal(AuthState.currentUser);
  protected readonly isLoading = signal(false);
  protected readonly isPasswordLoading = signal(false);
  protected readonly buscandoCep = signal(false);
  protected readonly feedback = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly rolesLabel = computed(() => this.currentUser()?.roles.join(', ') ?? '');

  protected readonly form = {
    nome: '',
    email: '',
    telefone: '',
    cep: '',
    logradouro: '',
    bairro: '',
    cidade: '',
    estado: '',
    numero: '',
    complemento: '',
  };

  protected readonly passwordForm = {
    senhaAtual: '',
    novaSenha: '',
    confirmacaoSenha: '',
  };

  constructor() {
    const user = this.currentUser();
    if (user) {
      this.form.nome = user.nome;
      this.form.email = user.email;
      this.form.telefone = user.telefone;
      this.form.cep = user.cep ?? '';
      this.form.logradouro = user.logradouro ?? '';
      this.form.bairro = user.bairro ?? '';
      this.form.cidade = user.cidade ?? '';
      this.form.estado = user.estado ?? '';
      this.form.numero = user.numero ?? '';
      this.form.complemento = user.complemento ?? '';
    }
  }

  protected salvar(): void {
    this.isLoading.set(true);
    this.feedback.set(null);
    this.error.set(null);

    this.usuariosService.atualizarMeuUsuario(this.form).subscribe({
      next: (usuario) => {
        const current = this.currentUser();
        if (current) {
          this.store.dispatch(
            new UpdateAuthenticatedUser({
              ...current,
              nome: usuario.nome,
              email: usuario.email,
              telefone: usuario.telefone,
              endereco: usuario.endereco,
              cep: usuario.cep,
              logradouro: usuario.logradouro,
              bairro: usuario.bairro,
              cidade: usuario.cidade,
              estado: usuario.estado,
              numero: usuario.numero,
              complemento: usuario.complemento,
              role: usuario.role,
              roles: usuario.roles,
            }),
          );
        }
        this.toast.success('Dados atualizados com sucesso.');
        this.isLoading.set(false);
      },
      error: (error: Error) => {
        const message = error?.message || 'Não foi possível concluir a operação.';
        this.error.set(message);
        this.toast.error(message);
        this.isLoading.set(false);
      },
    });
  }

  protected alterarSenha(): void {
    this.error.set(null);

    if (!this.passwordForm.senhaAtual || !this.passwordForm.novaSenha || !this.passwordForm.confirmacaoSenha) {
      this.toast.warning('Preencha todos os campos de senha.');
      return;
    }

    if (this.passwordForm.novaSenha !== this.passwordForm.confirmacaoSenha) {
      this.toast.warning('A nova senha e a confirmação não conferem.');
      return;
    }

    this.isPasswordLoading.set(true);
    this.usuariosService.alterarMinhaSenha(this.passwordForm).subscribe({
      next: () => {
        this.toast.success('Senha alterada com sucesso.');
        this.limparSenha();
        this.isPasswordLoading.set(false);
      },
      error: (error: Error) => {
        this.toast.error(error?.message || 'Não foi possível alterar a senha.');
        this.isPasswordLoading.set(false);
      },
    });
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

  private limparSenha(): void {
    Object.assign(this.passwordForm, { senhaAtual: '', novaSenha: '', confirmacaoSenha: '' });
  }
}
