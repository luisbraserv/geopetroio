import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TuiButton, TuiIcon } from '@taiga-ui/core';

import { parseApiError } from '../../../../core/http/api-error';
import {
  EstadoProntidao,
  ProntidaoDaUnidade,
  ProntidaoService,
  estadoDe,
  ordenarPorPendencia,
} from '../../services/prontidao.service';

/** Uma unidade já classificada, para a tela não recalcular o estado a cada binding. */
export interface UnidadeExibida {
  unidade: ProntidaoDaUnidade;
  estado: EstadoProntidao;
}

/**
 * Prontidão da frota — resolve `OQ-049`.
 *
 * <h2>A pergunta que ninguém conseguia responder de fora</h2>
 * A frota nasce vazia e cada unidade fica muda até alguém configurá-la pela tela do Desktop
 * (RN-088, RN-092). <b>"A migração terminou" era uma afirmação sem como conferir</b>, e uma unidade
 * esquecida ficava sem telemetria sem que nada acusasse.
 *
 * <h2>⚠️ O que a tela não diz</h2>
 * Se a unidade <b>está publicando</b>. Configurada e muda são coisas diferentes: um CLP desligado,
 * um cabo solto ou uma estação sem energia aparecem aqui como prontos. Prometer mais que isso seria
 * transformar um relatório de configuração num monitor de disponibilidade que ele não é.
 */
@Component({
  selector: 'app-prontidao-frota-page',
  standalone: true,
  imports: [CommonModule, TuiButton, TuiIcon],
  templateUrl: './prontidao-frota-page.component.html',
  styleUrl: './prontidao-frota-page.component.css',
})
export class ProntidaoFrotaPageComponent implements OnInit {
  private readonly service = inject(ProntidaoService);

  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly unidades = signal<UnidadeExibida[]>([]);

  readonly total = computed(() => this.unidades().length);
  readonly prontas = computed(() => this.contar('PRONTA'));
  readonly nuncaConfiguradas = computed(() => this.contar('NUNCA_CONFIGURADA'));
  readonly mudas = computed(() => this.contar('MUDA'));
  readonly semAlarme = computed(() => this.contar('SEM_ALARME'));

  /** Quantas não produzem telemetria — nem por falta de visita, nem por engano de configuração. */
  readonly semTelemetria = computed(() => this.nuncaConfiguradas() + this.mudas());

  readonly frotaCompleta = computed(() => this.total() > 0 && this.semTelemetria() === 0);

  ngOnInit(): void {
    this.consultar();
  }

  consultar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.service.daFrota().subscribe({
      next: (unidades) => {
        this.carregando.set(false);
        this.unidades.set(
          ordenarPorPendencia(unidades).map((unidade) => ({ unidade, estado: estadoDe(unidade) })),
        );
      },
      error: (falha) => {
        this.carregando.set(false);
        this.erro.set(parseApiError(falha));
      },
    });
  }

  private contar(estado: EstadoProntidao): number {
    return this.unidades().filter((item) => item.estado === estado).length;
  }

  rotuloEstado(estado: EstadoProntidao): string {
    switch (estado) {
      case 'NUNCA_CONFIGURADA': return 'Nunca configurada';
      case 'MUDA': return 'Sem card ativo';
      case 'SEM_ALARME': return 'Sem alarme';
      default: return 'Pronta';
    }
  }

  /** O que fazer a respeito — a tela não serve para constatar, e sim para agir. */
  acaoDe(estado: EstadoProntidao): string {
    switch (estado) {
      case 'NUNCA_CONFIGURADA':
        return 'Não produz telemetria. Configure os cards no Geopetro-Desktop da unidade.';
      case 'MUDA':
        return 'Tem documento, e todos os cards estão desativados: não lê nada. Reative pelo Desktop.';
      case 'SEM_ALARME':
        return 'Lê e publica, e nada a vigia. Ajuste os limites em Limites de Alarme.';
      default:
        return 'Lê, publica e tem alarme configurado.';
    }
  }
}
