import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TuiButton, TuiIcon } from '@taiga-ui/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MonitoramentoSondaService, MonitoramentoSerie, SondaDisponivel } from '../../services/monitoramento-sonda.service';
import { GraficoMonitoramentoComponent } from '../../components/grafico-monitoramento/grafico-monitoramento.component';
import { environment } from '../../../../../environments/environment';

interface DispositivoMonitoramento {
  id: string;
  label: string;
  unidade: string;
  visivel: boolean;
}

@Component({
  selector: 'app-monitoramento-sonda-page',
  standalone: true,
  imports: [CommonModule, FormsModule, TuiButton, TuiIcon, GraficoMonitoramentoComponent],
  templateUrl: './monitoramento-sonda-page.component.html',
  styleUrl: './monitoramento-sonda-page.component.css',
})
export class MonitoramentoSondaPageComponent implements OnInit {
  private readonly service = inject(MonitoramentoSondaService);

  readonly sondas = signal<SondaDisponivel[]>([]);
  readonly sondaSelecionada = signal<SondaDisponivel | null>(null);
  readonly periodo = signal<string>('1h');
  readonly inicioPeriodo = signal<string>('');
  readonly fimPeriodo = signal<string>('');
  readonly carregando = signal(false);
  readonly series = signal<MonitoramentoSerie[]>([]);
  readonly semDados = signal(false);
  readonly erro = signal<string | null>(null);

  readonly demonstracaoAtiva = computed(() => {
    const demoId = environment.telemetriaDemoSondaId;
    return !!demoId && this.sondaSelecionada()?.idSondaUnidade === demoId;
  });

  readonly dispositivos = signal<DispositivoMonitoramento[]>([
    { id: 'PESO_COLUNA_01',  label: 'Peso da Coluna',          unidade: 'lbf',    visivel: true },
    { id: 'TORQUE_01',       label: 'Torque Ch. Hid. Tubos',   unidade: 'lbf·ft', visivel: true },
    { id: 'TORQUE_02',       label: 'Torque Ch. Flutuante',    unidade: 'lbf·ft', visivel: true },
    { id: 'PRESSAO_01',      label: 'Pressao Bomba / ESCP',    unidade: 'psi',    visivel: true },
    { id: 'VAZAO_01',        label: 'Vazao',                   unidade: 'bbl/min',visivel: true },
  ]);

  readonly periodos = [
    { value: '15m', label: 'Ultimos 15 minutos' },
    { value: '1h', label: 'Ultima 1 hora' },
    { value: '6h', label: 'Ultimas 6 horas' },
    { value: 'custom', label: 'Personalizado' },
  ];

  get sondaSelecionadaValue() { return this.sondaSelecionada(); }
  set sondaSelecionadaValue(v: SondaDisponivel | null) { this.sondaSelecionada.set(v); }

  get periodoValue() { return this.periodo(); }
  set periodoValue(v: string) { this.periodo.set(v); }

  get inicioPeriodoValue() { return this.inicioPeriodo(); }
  set inicioPeriodoValue(v: string) { this.inicioPeriodo.set(v); }

  get fimPeriodoValue() { return this.fimPeriodo(); }
  set fimPeriodoValue(v: string) { this.fimPeriodo.set(v); }

  readonly dispositivosSelecionados = computed(() =>
    this.dispositivos().filter((dispositivo) => dispositivo.visivel)
  );

  readonly podeconsultar = computed(() =>
    !!this.sondaSelecionada() &&
    this.dispositivosSelecionados().length > 0 &&
    (this.periodo() !== 'custom' || (!!this.inicioPeriodo() && !!this.fimPeriodo()))
  );

  ngOnInit() {
    this.service.listarMinhas().subscribe({
      next: (sondas) => {
        this.sondas.set(sondas);
        const demoId = environment.telemetriaDemoSondaId;
        const sondaDemo = demoId ? sondas.find((sonda) => sonda.idSondaUnidade === demoId) : undefined;
        if (sondaDemo) {
          this.sondaSelecionada.set(sondaDemo);
          this.consultar();
        }
      },
      error: () => this.erro.set('Erro ao carregar sondas disponiveis.'),
    });
  }

  onSondaChange() {
    this.series.set([]);
    this.semDados.set(false);
    this.erro.set(null);
  }

  alternarDispositivo(id: string, checked: boolean) {
    this.dispositivos.update((dispositivos) =>
      dispositivos.map((dispositivo) =>
        dispositivo.id === id ? { ...dispositivo, visivel: checked } : dispositivo
      )
    );
    this.series.update((series) => checked ? series : series.filter((serie) => serie.dispositivoId !== id));
    this.semDados.set(false);
    this.erro.set(null);
  }

  private calcularPeriodo(): { inicio: string; fim: string } {
    const fim = new Date();
    let inicio = new Date();
    const p = this.periodo();
    if (p === '15m') inicio = new Date(fim.getTime() - 15 * 60 * 1000);
    else if (p === '1h') inicio = new Date(fim.getTime() - 60 * 60 * 1000);
    else if (p === '6h') inicio = new Date(fim.getTime() - 6 * 60 * 60 * 1000);
    else return {
      inicio: new Date(this.inicioPeriodo()).toISOString(),
      fim: new Date(this.fimPeriodo()).toISOString(),
    };
    return { inicio: inicio.toISOString(), fim: fim.toISOString() };
  }

  consultar() {
    const sonda = this.sondaSelecionada();
    const dispositivos = this.dispositivosSelecionados();
    if (!sonda || dispositivos.length === 0) return;

    this.carregando.set(true);
    this.series.set([]);
    this.semDados.set(false);
    this.erro.set(null);

    const { inicio, fim } = this.calcularPeriodo();

    forkJoin(
      dispositivos.map((dispositivo) =>
        this.service.consultarSerie(sonda.idSondaUnidade, dispositivo.id, inicio, fim).pipe(
          catchError(() => of({ idSondaUnidade: sonda.idSondaUnidade, dispositivoId: dispositivo.id, pontos: [] }))
        )
      )
    ).subscribe({
      next: (resultados) => {
        this.carregando.set(false);
        const seriesComDados = resultados.filter((serie) => serie.pontos?.length);
        if (seriesComDados.length === 0) {
          this.semDados.set(true);
        } else {
          this.series.set(seriesComDados);
        }
      },
      error: (err) => {
        this.carregando.set(false);
        if (err.status === 403) {
          this.erro.set('Voce nao tem permissao para acessar esta sonda.');
        } else if (err.status === 502) {
          this.erro.set('Servico de telemetria indisponivel no momento.');
        } else {
          this.erro.set('Erro ao consultar dados de telemetria.');
        }
      },
    });
  }

  nomeDispositivo(dispositivoId: string): string {
    return this.dispositivos().find((dispositivo) => dispositivo.id === dispositivoId)?.label ?? dispositivoId;
  }

  unidadeDispositivo(dispositivoId: string): string {
    return this.dispositivos().find((dispositivo) => dispositivo.id === dispositivoId)?.unidade ?? '';
  }
}
