import { Injectable } from '@angular/core';
import { RelatorioBuilderService } from '../components/relatorio/relatorio-builder.service';
import { SqueezeHydraulicSimulation } from '../models/squeeze.model';
import { DadosRelatorio } from './simulador-state-store.service';

export type FatorConformidade =
  | 'ecd' | 'bhp' | 'freefall' | 'injetividade'
  | 'risco' | 'interfaces' | 'subdeslocamento' | 'hidrostatica';

/** Sobreposições aplicadas na re-simulação (varredura de otimização/sensibilidade). */
export interface VarreduraOverride {
  standoffPct?: number;
  /** Multiplicador aplicado às vazões de bombeio (1 = vazão atual). */
  rateFactor?: number;
  /** Densidade da pasta (ppg) — undefined mantém a densidade do projeto. */
  density?: number;
  /** Multiplicador do volume de deslocamento (1 = deslocamento planejado). */
  displacementFactor?: number;
}

/**
 * Dados de posicionamento da pasta, normalizados pelo componente (squeeze usa a
 * geometria do squeeze; tampão usa o PlugGeometry). Alimenta a previsão de
 * movimento de interfaces e a sensibilização do sub-deslocamento.
 */
export interface PlacementInfo {
  /** Topo planejado da pasta (m MD). */
  cementTopMD: number;
  /** Base da pasta (m MD). */
  cementBaseMD: number;
  /** Capacidade no trecho da pasta (bbl/m) — converte volume em altura. */
  capBblM: number;
  /** Volume de deslocamento planejado (bbl). */
  displacementBbl: number;
  /** Topo alvo (m MD) — padrão = topo planejado. */
  targetTopMD?: number;
}

export interface ConformidadeParams {
  operacao: 'SQUEEZE' | 'TAMPÃO';
  fator: FatorConformidade;
  sim: SqueezeHydraulicSimulation;
  dadosRelatorio: DadosRelatorio;
  /** getRawValue() do formulário — gradientes e vazões de entrada. */
  v: any;
  /** Posicionamento da pasta (interfaces/sub-deslocamento). */
  placement?: PlacementInfo;
  /** Re-simula a hidráulica com sobreposições (varredura de otimização/sensibilidade). */
  reSimulate?: (o: VarreduraOverride) => SqueezeHydraulicSimulation | null;
}

interface CriterioRow {
  criterio: string;
  valor: string;
  limite: string;
  atende: boolean;
}

interface MemoriaSection {
  title: string;
  formulas: string[];
  notes?: string[];
}

/** Fator de risco componente do score consolidado. */
interface FatorRisco {
  nome: string;
  /** Risco 0 (nenhum) a 1 (máximo). */
  risco: number;
  /** Peso relativo no score. */
  peso: number;
  /** Reprovação dura (fora dos limites físicos). */
  hardFail: boolean;
  detalhe: string;
  /** Instrução objetiva de correção do fator (usada em "Possíveis ajustes"). */
  correcao: string;
}

/** Tabela auxiliar (varredura de otimização/sensibilidade). */
interface TabelaExtra {
  titulo: string;
  colunas: string[];
  linhas: string[][];
  /** Índice da linha destacada (melhor combinação / cenário recomendado). */
  destaqueIdx?: number;
  legenda?: string;
}

interface Avaliacao {
  titulo: string;
  subtitulo: string;
  resultados: Array<{ label: string; value: string }>;
  criterios: CriterioRow[];
  memoria: MemoriaSection[];
  /** Parágrafos explicando por que o fator é (ou não) operacional. */
  explicacao: string[];
  /** Sugestões de ajuste (só quando reprova), já priorizadas; máx. 5. */
  ajustes?: string[];
  /** Estado destacado (ex.: "Sem injeção", "Índice de injetividade inválido"). */
  estado?: { rotulo: string; ok: boolean };
  /** Tabelas de varredura (otimização de risco / sensibilidade de deslocamento). */
  tabelas?: TabelaExtra[];
  /** Score numérico destacado no topo (0–100). */
  scoreBanner?: { valor: number; rotulo: string; classe: 'ok' | 'warn' | 'high' | 'crit' };
}

const HYDRO_K = 0.1706; // psi/(ppg·m)

/**
 * Relatórios de conformidade operacional: avaliam ECD, BHP e Free Fall da
 * simulação hidráulica (tubo em U, fricção Petroguia F-40) contra os limites
 * do poço e emitem o veredito OPERACIONAL / NÃO OPERACIONAL.
 * Compartilhado entre squeeze e tampão.
 */
@Injectable({ providedIn: 'root' })
export class ConformidadeOperacionalReportService {
  constructor(private relatorioBuilder: RelatorioBuilderService) {}

  abrir(p: ConformidadeParams): void {
    const avaliacao = this.avaliar(p);
    const operacional = avaliacao.criterios.every(c => c.atende);
    this.openCompliancePage(p, avaliacao, operacional);
  }

  private avaliar(p: ConformidadeParams): Avaliacao {
    switch (p.fator) {
      case 'ecd': return this.avaliarEcd(p);
      case 'bhp': return this.avaliarBhp(p);
      case 'freefall': return this.avaliarFreeFall(p);
      case 'injetividade': return this.avaliarInjetividade(p);
      case 'risco': return this.avaliarRisco(p);
      case 'interfaces': return this.avaliarInterfaces(p);
      case 'subdeslocamento': return this.avaliarSubdeslocamento(p);
      case 'hidrostatica': return this.avaliarHidrostatica(p);
    }
  }

  // ── ECD ────────────────────────────────────────────────────────────────────
  private avaliarEcd(p: ConformidadeParams): Avaliacao {
    const s = p.sim.summary;
    const tvd = s.referenceTVD;
    const withEcd = p.sim.points.filter(pt => pt.ecdPpg !== null && Number.isFinite(pt.ecdPpg));
    const ptMax = withEcd.reduce((a, b) => (b.ecdPpg! > a.ecdPpg! ? b : a), withEcd[0]);
    const ptMin = withEcd.reduce((a, b) => (b.ecdPpg! < a.ecdPpg! ? b : a), withEcd[0]);
    const ecdMax = ptMax?.ecdPpg ?? 0;
    const ecdMin = ptMin?.ecdPpg ?? 0;
    const fracGrad = this.toNumber(p.v.fracGrad, 16);
    const poreGrad = this.toNumber(p.v.poreGrad, 9);
    const margemFrat = fracGrad - ecdMax;
    const margemPoro = ecdMin - poreGrad;
    const atendeFrat = ecdMax < fracGrad;
    const atendePoro = ecdMin > poreGrad;

    return {
      titulo: 'Relatório de conformidade — ECD',
      subtitulo: 'Densidade equivalente de circulação na profundidade de referência ao longo de todo o bombeio.',
      resultados: [
        { label: 'ECD máximo', value: `${this.fmt(ecdMax)} ppg  (fase: ${ptMax?.phase ?? '-'}, t = ${this.fmt(ptMax?.timeMin, 1)} min)` },
        { label: 'ECD mínimo', value: `${this.fmt(ecdMin)} ppg  (fase: ${ptMin?.phase ?? '-'}, t = ${this.fmt(ptMin?.timeMin, 1)} min)` },
        { label: 'Gradiente de fratura', value: `${this.fmt(fracGrad)} ppg` },
        { label: 'Gradiente de poro', value: `${this.fmt(poreGrad)} ppg` },
        { label: 'Margem até a fratura', value: `${this.fmt(margemFrat)} ppg` },
        { label: 'Margem acima do poro', value: `${this.fmt(margemPoro)} ppg` },
      ],
      criterios: [
        { criterio: 'ECD máximo abaixo do gradiente de fratura', valor: `${this.fmt(ecdMax)} ppg`, limite: `< ${this.fmt(fracGrad)} ppg`, atende: atendeFrat },
        { criterio: 'ECD mínimo acima do gradiente de poro', valor: `${this.fmt(ecdMin)} ppg`, limite: `> ${this.fmt(poreGrad)} ppg`, atende: atendePoro },
      ],
      memoria: [
        {
          title: 'Definição do ECD',
          formulas: [
            'ECD (ppg) = BHP (psi) / [ K × TVD (m) ]',
            `K = ${HYDRO_K} psi/(ppg·m)   |   TVD de referência = ${this.fmt(tvd, 1)} m`,
          ],
          notes: ['O ECD converte a pressão de fundo (BHP) em densidade equivalente — a densidade estática que geraria a mesma pressão naquela profundidade.'],
        },
        {
          title: 'ECD máximo (ponto crítico do bombeio)',
          formulas: [
            `BHP no instante do ECD máx = ${this.fmt(ptMax?.bhpPsi, 0)} psi`,
            `ECDmáx = ${this.fmt(ptMax?.bhpPsi, 0)} / (${HYDRO_K} × ${this.fmt(tvd, 1)}) = ${this.fmt(ecdMax)} ppg`,
            `Margem até a fratura = ${this.fmt(fracGrad)} − ${this.fmt(ecdMax)} = ${this.fmt(margemFrat)} ppg`,
          ],
        },
        {
          title: 'ECD mínimo (ponto crítico do bombeio)',
          formulas: [
            `BHP no instante do ECD mín = ${this.fmt(ptMin?.bhpPsi, 0)} psi`,
            `ECDmín = ${this.fmt(ptMin?.bhpPsi, 0)} / (${HYDRO_K} × ${this.fmt(tvd, 1)}) = ${this.fmt(ecdMin)} ppg`,
            `Margem acima do poro = ${this.fmt(ecdMin)} − ${this.fmt(poreGrad)} = ${this.fmt(margemPoro)} ppg`,
          ],
        },
      ],
      explicacao: [
        atendeFrat
          ? `O ECD máximo (${this.fmt(ecdMax)} ppg) ficou ABAIXO do gradiente de fratura (${this.fmt(fracGrad)} ppg), com folga de ${this.fmt(margemFrat)} ppg. Não há risco de fraturar a formação durante a circulação.`
          : `O ECD máximo (${this.fmt(ecdMax)} ppg) ATINGIU OU ULTRAPASSOU o gradiente de fratura (${this.fmt(fracGrad)} ppg) — excesso de ${this.fmt(-margemFrat)} ppg. A circulação nessa vazão fraturaria a formação: reduzir a vazão de bombeio, aliviar a densidade dos fluidos ou rever a janela.`,
        atendePoro
          ? `O ECD mínimo (${this.fmt(ecdMin)} ppg) ficou ACIMA do gradiente de poro (${this.fmt(poreGrad)} ppg), com folga de ${this.fmt(margemPoro)} ppg. A coluna mantém o poço sob controle, sem influxo.`
          : `O ECD mínimo (${this.fmt(ecdMin)} ppg) CAIU ABAIXO do gradiente de poro (${this.fmt(poreGrad)} ppg) — déficit de ${this.fmt(-margemPoro)} ppg. Há risco de influxo/kick: aumentar a densidade dos fluidos de deslocamento ou a contrapressão.`,
      ],
      ajustes: this.dedupe([
        ...(atendeFrat ? [] : [
          'Revisar pressão de fratura, TVD e geometria — verificar se o ponto crítico está corretamente selecionado (corrige dados).',
          'Reduzir a vazão de bombeio para diminuir a perda de carga (reduz ECD).',
          'Reduzir a contrapressão aplicada na superfície (reduz ECD).',
          'Reduzir a densidade da pasta ou avaliar pasta leve tecnicamente adequada (aumenta margem para fratura; exige validação laboratorial).',
          'Reduzir volume/altura da coluna de pasta ou dividir a cimentação em estágios (aumenta margem para fratura).',
        ]),
        ...(atendePoro ? [] : [
          'Revisar pressão de poros, TVD e posição das interfaces (corrige dados).',
          'Revisar densidade dos fluidos no poço e verificar coluna parcialmente preenchida (aumenta margem sobre o poro).',
          'Aumentar a densidade da pasta dentro do limite de fratura (aumenta margem sobre o poro; exige validação laboratorial).',
          'Aumentar a pressão superficial mantendo-a abaixo do limite de fratura (aumenta BHP).',
        ]),
      ]),
    };
  }

  // ── BHP ────────────────────────────────────────────────────────────────────
  private avaliarBhp(p: ConformidadeParams): Avaliacao {
    const s = p.sim.summary;
    const tvd = s.referenceTVD;
    const fracGrad = this.toNumber(p.v.fracGrad, 16);
    const poreGrad = this.toNumber(p.v.poreGrad, 9);
    const ptMax = p.sim.points.reduce((a, b) => (b.bhpPsi > a.bhpPsi ? b : a), p.sim.points[0]);
    const ptMin = p.sim.points.reduce((a, b) => (b.bhpPsi < a.bhpPsi ? b : a), p.sim.points[0]);
    const atendeFrat = s.bhpMaxPsi < s.fracturePsi;
    const atendePoro = s.bhpMinPsi > s.porePsi;

    return {
      titulo: 'Relatório de conformidade — BHP',
      subtitulo: 'Pressão de fundo na profundidade de referência contra a janela poro × fratura, em todas as fases.',
      resultados: [
        { label: 'BHP máximo', value: `${this.fmt(s.bhpMaxPsi, 0)} psi  (fase: ${ptMax?.phase ?? '-'}, t = ${this.fmt(ptMax?.timeMin, 1)} min)` },
        { label: 'BHP mínimo', value: `${this.fmt(s.bhpMinPsi, 0)} psi  (fase: ${ptMin?.phase ?? '-'}, t = ${this.fmt(ptMin?.timeMin, 1)} min)` },
        { label: 'Pressão de fratura', value: `${this.fmt(s.fracturePsi, 0)} psi` },
        { label: 'Pressão de poro', value: `${this.fmt(s.porePsi, 0)} psi` },
        { label: 'Margem até a fratura', value: `${this.fmt(s.marginToFracturePsi, 0)} psi` },
        { label: 'Margem acima do poro', value: `${this.fmt(s.marginAbovePorePsi, 0)} psi` },
        { label: 'Pressão máx. de superfície aplicada', value: `${this.fmt(s.maxSurfacePressurePsi, 0)} psi` },
      ],
      criterios: [
        { criterio: 'BHP máximo abaixo da pressão de fratura', valor: `${this.fmt(s.bhpMaxPsi, 0)} psi`, limite: `< ${this.fmt(s.fracturePsi, 0)} psi`, atende: atendeFrat },
        { criterio: 'BHP mínimo acima da pressão de poro', valor: `${this.fmt(s.bhpMinPsi, 0)} psi`, limite: `> ${this.fmt(s.porePsi, 0)} psi`, atende: atendePoro },
      ],
      memoria: [
        {
          title: 'Janela operacional (poro × fratura) na TVD de referência',
          formulas: [
            `Pressão de poro = K × grad.poro × TVD = ${HYDRO_K} × ${this.fmt(poreGrad)} × ${this.fmt(tvd, 1)} = ${this.fmt(s.porePsi, 0)} psi`,
            `Pressão de fratura = K × grad.fratura × TVD = ${HYDRO_K} × ${this.fmt(fracGrad)} × ${this.fmt(tvd, 1)} = ${this.fmt(s.fracturePsi, 0)} psi`,
            `K = ${HYDRO_K} psi/(ppg·m)   |   TVD de referência = ${this.fmt(tvd, 1)} m`,
          ],
        },
        {
          title: 'Composição do BHP na profundidade de referência',
          formulas: [
            'BHP = P.superfície + P.hidrostática (coluna) − Fricção coluna + Fricção anular (retorno)',
          ],
          notes: [
            'A pressão hidrostática é a soma das colunas de fluido (deslocamento, espaçadores, pasta) por altura; a fricção da coluna alivia o fundo e a fricção do retorno anular represa contrapressão.',
            'Na injeção do squeeze não há retorno (fluido vai para a formação): a fricção anular é zero e entra a pressão de operação aplicada na superfície.',
          ],
        },
        {
          title: 'BHP máximo (ponto crítico)',
          formulas: [
            `P.superfície = ${this.fmt(ptMax?.surfacePressurePsi, 0)} psi`,
            `P.hidrostática = ${this.fmt(ptMax?.hydrostaticPsi, 0)} psi`,
            `Fricção coluna = ${this.fmt(ptMax?.frictionPsi, 0)} psi   |   Fricção anular = ${this.fmt(ptMax?.annularFrictionPsi, 0)} psi`,
            `BHPmáx = ${this.fmt(ptMax?.surfacePressurePsi, 0)} + ${this.fmt(ptMax?.hydrostaticPsi, 0)} − ${this.fmt(ptMax?.frictionPsi, 0)} + ${this.fmt(ptMax?.annularFrictionPsi, 0)} = ${this.fmt(s.bhpMaxPsi, 0)} psi`,
            `Margem até a fratura = ${this.fmt(s.fracturePsi, 0)} − ${this.fmt(s.bhpMaxPsi, 0)} = ${this.fmt(s.marginToFracturePsi, 0)} psi`,
          ],
        },
      ],
      explicacao: [
        atendeFrat
          ? `O BHP máximo (${this.fmt(s.bhpMaxPsi, 0)} psi) ficou ABAIXO da pressão de fratura (${this.fmt(s.fracturePsi, 0)} psi), com folga de ${this.fmt(s.marginToFracturePsi, 0)} psi. A pressão de fundo não fratura a formação em nenhuma fase.`
          : `O BHP máximo (${this.fmt(s.bhpMaxPsi, 0)} psi) ATINGIU OU ULTRAPASSOU a pressão de fratura (${this.fmt(s.fracturePsi, 0)} psi) — excesso de ${this.fmt(-s.marginToFracturePsi, 0)} psi, na fase "${ptMax?.phase ?? '-'}". Fraturaria a formação: reduzir vazão/pressão de operação ou aliviar as densidades.`,
        atendePoro
          ? `O BHP mínimo (${this.fmt(s.bhpMinPsi, 0)} psi) ficou ACIMA da pressão de poro (${this.fmt(s.porePsi, 0)} psi), com folga de ${this.fmt(s.marginAbovePorePsi, 0)} psi. O poço permanece sob controle, sem influxo.`
          : `O BHP mínimo (${this.fmt(s.bhpMinPsi, 0)} psi) CAIU ABAIXO da pressão de poro (${this.fmt(s.porePsi, 0)} psi) — déficit de ${this.fmt(-s.marginAbovePorePsi, 0)} psi, na fase "${ptMin?.phase ?? '-'}". Risco de influxo/kick: aumentar a densidade dos fluidos ou a contrapressão.`,
      ],
      ajustes: this.dedupe([
        ...(atendeFrat ? [] : [
          'Revisar pressão de fratura, TVD e geometria; verificar se o ponto crítico está correto (corrige dados).',
          'Reduzir a vazão de bombeio ou a pressão de operação (reduz BHP).',
          'Reduzir a contrapressão na superfície e as perdas de carga (reduz BHP).',
          'Reduzir a densidade da pasta/espaçador ou avaliar pasta leve (aumenta margem para fratura; exige validação laboratorial).',
          'Reduzir volume/altura da coluna de pasta, dividir em estágios ou avaliar squeeze de baixa pressão (aumenta margem para fratura).',
        ]),
        ...(atendePoro ? [] : [
          'Revisar pressão de poros, TVD e posição das interfaces (corrige dados).',
          'Revisar densidade dos fluidos e verificar coluna parcialmente preenchida (aumenta margem sobre o poro).',
          'Aumentar a densidade da pasta dentro do limite de fratura (aumenta BHP; exige validação laboratorial).',
          'Aumentar a pressão superficial mantendo-a abaixo do limite de fratura (aumenta BHP).',
        ]),
      ]),
    };
  }

  // ── Hidrostática × Fratura (deslocamento e injeção) ────────────────────────
  private avaliarHidrostatica(p: ConformidadeParams): Avaliacao {
    const s = p.sim.summary;
    const pts = p.sim.points;
    const tvd = s.referenceTVD;
    const toPpg = (psi: number) => tvd > 0 ? psi / (HYDRO_K * tvd) : 0;
    const isInj = (phase: string) => /Inje/i.test(phase);
    const janela = Math.max(1, s.fracturePsi - s.porePsi);

    const hydroMaxPt = pts.reduce((a, b) => (b.hydrostaticPsi > a.hydrostaticPsi ? b : a), pts[0]);
    const hydroMinPt = pts.reduce((a, b) => (b.hydrostaticPsi < a.hydrostaticPsi ? b : a), pts[0]);
    const desloc = pts.filter(pt => pt.phase === 'Deslocamento');
    const inj = pts.filter(pt => isInj(pt.phase));
    const bhpDeslocMax = desloc.length ? Math.max(...desloc.map(pt => pt.bhpPsi)) : null;
    const bhpDeslocMin = desloc.length ? Math.min(...desloc.map(pt => pt.bhpPsi)) : null;
    const bhpInjMax = inj.length ? Math.max(...inj.map(pt => pt.bhpPsi)) : null;
    const pressaoOperacao = this.toNumber(p.v.pressaoOperacao, 0);

    const atendeHydroFrat = hydroMaxPt.hydrostaticPsi < s.fracturePsi;
    const atendeHydroPoro = hydroMinPt.hydrostaticPsi > s.porePsi;
    const atendeDeslocFrat = bhpDeslocMax == null || bhpDeslocMax < s.fracturePsi;
    const atendeDeslocPoro = bhpDeslocMin == null || bhpDeslocMin > s.porePsi;
    const atendeInjFrat = bhpInjMax == null || bhpInjMax < s.fracturePsi;

    // Tabela por fase, na ordem de bombeio
    const fases: string[] = [];
    for (const pt of pts) if (!fases.includes(pt.phase)) fases.push(pt.phase);
    const linhasFase = fases.map(fase => {
      const fpts = pts.filter(pt => pt.phase === fase);
      const hMax = Math.max(...fpts.map(pt => pt.hydrostaticPsi));
      const bMax = Math.max(...fpts.map(pt => pt.bhpPsi));
      return [
        fase,
        `${this.fmt(hMax, 0)} psi`,
        `${this.fmt(bMax, 0)} psi`,
        `${this.fmt(toPpg(bMax), 2)} ppg`,
        `${this.fmt(s.fracturePsi - bMax, 0)} psi`,
        `${this.fmt((bMax - s.porePsi) / janela * 100, 0)}%`,
        bMax < s.fracturePsi ? 'OK' : 'FRATURA',
      ];
    });

    const criterios: CriterioRow[] = [
      { criterio: 'Hidrostática máx. abaixo da fratura', valor: `${this.fmt(hydroMaxPt.hydrostaticPsi, 0)} psi (${hydroMaxPt.phase})`, limite: `< ${this.fmt(s.fracturePsi, 0)} psi`, atende: atendeHydroFrat },
      { criterio: 'Hidrostática mín. acima do poro', valor: `${this.fmt(hydroMinPt.hydrostaticPsi, 0)} psi (${hydroMinPt.phase})`, limite: `> ${this.fmt(s.porePsi, 0)} psi`, atende: atendeHydroPoro },
      ...(bhpDeslocMax != null ? [
        { criterio: 'BHP máx. no deslocamento abaixo da fratura', valor: `${this.fmt(bhpDeslocMax, 0)} psi`, limite: `< ${this.fmt(s.fracturePsi, 0)} psi`, atende: atendeDeslocFrat },
        { criterio: 'BHP mín. no deslocamento acima do poro', valor: `${this.fmt(bhpDeslocMin, 0)} psi`, limite: `> ${this.fmt(s.porePsi, 0)} psi`, atende: atendeDeslocPoro },
      ] : []),
      ...(bhpInjMax != null ? [
        { criterio: 'BHP máx. na injeção/pressurização abaixo da fratura', valor: `${this.fmt(bhpInjMax, 0)} psi`, limite: `< ${this.fmt(s.fracturePsi, 0)} psi`, atende: atendeInjFrat },
      ] : []),
    ];

    return {
      titulo: `Relatório de conformidade — Hidrostática × Fratura (${p.operacao === 'TAMPÃO' ? 'Tampão' : 'Squeeze'})`,
      subtitulo: 'Pressão hidrostática de fundo ao longo do bombeio e pressão total exercida no deslocamento' + (inj.length ? ' e na injeção do squeeze' : '') + ', comparadas ao peso de fratura e à pressão de poros.',
      estado: p.operacao === 'SQUEEZE' && !inj.length
        ? { rotulo: 'Sem fase de injeção simulada — preencha Pressão de Operação, Volume injetado e Tempo de pressurização.', ok: false }
        : undefined,
      resultados: [
        { label: 'Pressão de fratura na referência', value: `${this.fmt(s.fracturePsi, 0)} psi (${this.fmt(toPpg(s.fracturePsi), 2)} ppg equiv.)` },
        { label: 'Pressão de poros na referência', value: `${this.fmt(s.porePsi, 0)} psi (${this.fmt(toPpg(s.porePsi), 2)} ppg equiv.)` },
        { label: 'TVD de referência', value: `${this.fmt(tvd, 1)} m` },
        { label: 'Hidrostática de fundo máx.', value: `${this.fmt(hydroMaxPt.hydrostaticPsi, 0)} psi (${this.fmt(toPpg(hydroMaxPt.hydrostaticPsi), 2)} ppg equiv., fase ${hydroMaxPt.phase})` },
        { label: 'Hidrostática de fundo mín.', value: `${this.fmt(hydroMinPt.hydrostaticPsi, 0)} psi (${this.fmt(toPpg(hydroMinPt.hydrostaticPsi), 2)} ppg equiv., fase ${hydroMinPt.phase})` },
        ...(bhpDeslocMax != null ? [{ label: 'BHP máx. no deslocamento', value: `${this.fmt(bhpDeslocMax, 0)} psi — folga à fratura ${this.fmt(s.fracturePsi - bhpDeslocMax, 0)} psi` }] : []),
        ...(bhpInjMax != null ? [
          { label: 'BHP máx. na injeção/pressurização', value: `${this.fmt(bhpInjMax, 0)} psi — folga à fratura ${this.fmt(s.fracturePsi - bhpInjMax, 0)} psi` },
          { label: 'Pressão de operação aplicada na superfície', value: `${this.fmt(pressaoOperacao, 0)} psi` },
        ] : []),
      ],
      criterios,
      tabelas: [{
        titulo: 'Pressões por fase de bombeio',
        colunas: ['Fase', 'Hidrostática máx.', 'BHP máx.', 'BHP máx. (ppg equiv.)', 'Folga à fratura', 'Posição na janela', 'Situação'],
        linhas: linhasFase,
        legenda: 'BHP = hidrostática + pressão aplicada − fricção da coluna + fricção do retorno anular. Posição na janela: 0% = pressão de poros, 100% = pressão de fratura.',
      }],
      memoria: [
        {
          title: 'Hidrostática de fundo (coluna)',
          formulas: [
            'P_hidro = Σ 0,1706 × ρᵢ (ppg) × hᵢ (m TVD) — soma dos fluidos dentro da coluna na referência.',
            'O trem bombeado (água frente → pasta → água atrás → deslocamento) muda a composição da coluna no tempo — a hidrostática varia a cada fase.',
            'Abaixo/fora do trem bombeado o poço está preenchido pelo fluido de completação.',
          ],
        },
        {
          title: 'Pressão exercida no deslocamento',
          formulas: [
            'BHP_desloc = P_hidro − fricção da coluna + fricção do retorno anular (poço aberto, sem pressão aplicada).',
            bhpDeslocMax != null ? `BHP_desloc máx = ${this.fmt(bhpDeslocMax, 0)} psi = ${this.fmt(toPpg(bhpDeslocMax), 2)} ppg equivalente.` : 'Sem fase de deslocamento na simulação.',
          ],
        },
        ...(inj.length ? [{
          title: 'Pressão na injeção do squeeze',
          formulas: [
            'BHP_inj = P_operação (superfície) + P_hidro − fricção da coluna (anular estático, poço fechado).',
            `BHP_inj máx = ${this.fmt(pressaoOperacao, 0)} + hidrostática = ${this.fmt(bhpInjMax, 0)} psi = ${this.fmt(toPpg(bhpInjMax ?? 0), 2)} ppg equivalente.`,
          ],
        }] : []),
        {
          title: 'Janela operacional (poro × fratura)',
          formulas: [
            `P_fratura = 0,1706 × ${this.fmt(this.toNumber(p.v.fracGrad, 16), 2)} ppg × ${this.fmt(tvd, 1)} m = ${this.fmt(s.fracturePsi, 0)} psi.`,
            `P_poros = 0,1706 × ${this.fmt(this.toNumber(p.v.poreGrad, 9), 2)} ppg × ${this.fmt(tvd, 1)} m = ${this.fmt(s.porePsi, 0)} psi.`,
          ],
        },
      ],
      explicacao: [
        atendeHydroFrat && atendeHydroPoro
          ? `A hidrostática de fundo permanece dentro da janela poro × fratura durante todo o bombeio (${this.fmt(hydroMinPt.hydrostaticPsi, 0)}–${this.fmt(hydroMaxPt.hydrostaticPsi, 0)} psi para uma janela de ${this.fmt(s.porePsi, 0)}–${this.fmt(s.fracturePsi, 0)} psi).`
          : `A hidrostática de fundo SAI da janela poro × fratura (${this.fmt(hydroMinPt.hydrostaticPsi, 0)}–${this.fmt(hydroMaxPt.hydrostaticPsi, 0)} psi contra ${this.fmt(s.porePsi, 0)}–${this.fmt(s.fracturePsi, 0)} psi) — o peso dos fluidos, por si só, já viola o limite.`,
        bhpDeslocMax != null
          ? (atendeDeslocFrat && atendeDeslocPoro
            ? `Durante o deslocamento, a pressão total exercida no fundo fica entre ${this.fmt(bhpDeslocMin, 0)} e ${this.fmt(bhpDeslocMax, 0)} psi — abaixo da fratura (folga ${this.fmt(s.fracturePsi - (bhpDeslocMax ?? 0), 0)} psi) e acima do poro (folga ${this.fmt((bhpDeslocMin ?? 0) - s.porePsi, 0)} psi).`
            : `Durante o deslocamento, a pressão total exercida no fundo (${this.fmt(bhpDeslocMin, 0)}–${this.fmt(bhpDeslocMax, 0)} psi) VIOLA a janela poro × fratura — rever densidade do fluido de deslocamento e vazões.`)
          : '',
        bhpInjMax != null
          ? (atendeInjFrat
            ? `Na injeção/pressurização final, a pressão de operação de ${this.fmt(pressaoOperacao, 0)} psi somada à hidrostática leva o fundo a ${this.fmt(bhpInjMax, 0)} psi — ${this.fmt((bhpInjMax - s.porePsi) / janela * 100, 0)}% da janela, com folga de ${this.fmt(s.fracturePsi - bhpInjMax, 0)} psi à fratura.`
            : `Na injeção/pressurização final o fundo atinge ${this.fmt(bhpInjMax, 0)} psi e ULTRAPASSA a pressão de fratura (${this.fmt(s.fracturePsi, 0)} psi) — reduzir a pressão de operação ou a densidade do fluido de deslocamento.`)
          : '',
      ].filter(Boolean),
      ajustes: this.dedupe([
        ...(atendeHydroFrat ? [] : ['Reduzir a densidade da pasta e/ou dos fluidos anulares — a hidrostática estática já excede a fratura.']),
        ...(atendeHydroPoro ? [] : ['Aumentar a densidade dos fluidos (completação/deslocamento) para manter a hidrostática acima da pressão de poros.']),
        ...(atendeDeslocFrat ? [] : ['Reduzir a vazão de deslocamento (menos fricção anular) e/ou a densidade do fluido de deslocamento.']),
        ...(atendeDeslocPoro ? [] : ['Aumentar a densidade do fluido de deslocamento ou aplicar contrapressão na superfície durante o deslocamento.']),
        ...(atendeInjFrat ? [] : ['Reduzir a pressão de operação da injeção mantendo ΔP suficiente para injetar (ver relatório de Injetividade).']),
      ]),
    };
  }

  // ── Free Fall ──────────────────────────────────────────────────────────────
  private avaliarFreeFall(p: ConformidadeParams): Avaliacao {
    const s = p.sim.summary;
    const pts = p.sim.points;
    const maxExtraRate = pts.reduce((m, pt) => Math.max(m, pt.freeFallExtraRateBpm), 0);
    const maxProgrammedRate = pts.reduce((m, pt) => Math.max(m, pt.programmedRateBpm), 0);
    const totalPumped = pts.reduce((m, pt) => Math.max(m, pt.pumpedVolumeBbl), 0);
    const rateRatio = maxProgrammedRate > 0 ? maxExtraRate / maxProgrammedRate : 0;
    const volumeRatio = totalPumped > 0 ? s.freeFallAccumBbl / totalPumped : 0;
    const atendeRate = rateRatio <= 0.5;
    const atendeVol = volumeRatio <= 0.10;

    return {
      titulo: 'Relatório de conformidade — Free Fall / Tubo em U',
      subtitulo: 'Queda livre da coluna de fluidos: vazão adicional além da bombeada e volume acumulado em queda livre.',
      resultados: [
        { label: 'Vazão adicional máx. de free fall', value: `${this.fmt(maxExtraRate)} bpm` },
        { label: 'Vazão programada máx.', value: `${this.fmt(maxProgrammedRate)} bpm` },
        { label: 'Razão de queda livre (extra ÷ programada)', value: `${this.fmt(rateRatio * 100, 0)}%` },
        { label: 'Volume acumulado em free fall', value: `${this.fmt(s.freeFallAccumBbl)} bbl` },
        { label: 'Volume total bombeado', value: `${this.fmt(totalPumped)} bbl` },
        { label: 'Fração do volume em queda livre', value: `${this.fmt(volumeRatio * 100, 0)}%` },
        { label: 'Altura equivalente de queda na coluna', value: `${this.fmt(s.freeFallHeightM, 1)} m` },
      ],
      criterios: [
        { criterio: 'Vazão de queda livre controlável pela bomba', valor: `${this.fmt(rateRatio * 100, 0)}%`, limite: '≤ 50% da vazão programada', atende: atendeRate },
        { criterio: 'Volume em queda livre limitado', valor: `${this.fmt(volumeRatio * 100, 0)}%`, limite: '≤ 10% do volume bombeado', atende: atendeVol },
      ],
      memoria: [
        {
          title: 'Origem do free fall (tubo em U)',
          formulas: [
            'A pasta é mais pesada que o fluido do anular → a coluna tende a cair sozinha (queda livre).',
            'Vazão natural: a fricção da coluna (Petroguia F-40) equilibra o desbalanço hidrostático (drive).',
            'Free fall extra = máx(0, vazão natural − vazão bombeada) integrada no tempo = volume acumulado.',
          ],
        },
        {
          title: 'Razão de vazão de queda livre',
          formulas: [
            `Razão = vazão adicional máx / vazão programada máx = ${this.fmt(maxExtraRate)} / ${this.fmt(maxProgrammedRate)} = ${this.fmt(rateRatio * 100, 0)}%`,
            'Limite adotado: ≤ 50% (acima disso a bomba perde o controle da coluna).',
          ],
        },
        {
          title: 'Fração do volume em queda livre',
          formulas: [
            `Fração = volume free fall / volume bombeado = ${this.fmt(s.freeFallAccumBbl)} / ${this.fmt(totalPumped)} = ${this.fmt(volumeRatio * 100, 0)}%`,
            `Altura equivalente na coluna = ${this.fmt(s.freeFallHeightM, 1)} m`,
            'Limite adotado: ≤ 10% (acima disso a incerteza de posicionamento da pasta cresce demais).',
          ],
        },
      ],
      explicacao: [
        atendeRate
          ? `A vazão de queda livre (${this.fmt(rateRatio * 100, 0)}% da programada) está dentro do limite de 50%. A bomba consegue acompanhar/controlar a descida da coluna.`
          : `A vazão de queda livre (${this.fmt(rateRatio * 100, 0)}% da programada) ULTRAPASSA o limite de 50%. A coluna cai mais rápido do que a bomba impõe — perda de controle do deslocamento. Reduzir o contraste de densidade, usar tampão de fundo ou controlar a descida com back-pressure.`,
        atendeVol
          ? `O volume em queda livre (${this.fmt(volumeRatio * 100, 0)}% do bombeado) está dentro do limite de 10%. O posicionamento da pasta é previsível.`
          : `O volume em queda livre (${this.fmt(volumeRatio * 100, 0)}% do bombeado) ULTRAPASSA o limite de 10%. O topo da pasta pode ficar em profundidade diferente da projetada — rever a sequência/vazões antes de executar.`,
        maxExtraRate <= 0
          ? 'Observação: neste cenário não houve queda livre — o desbalanço hidrostático não superou a fricção da coluna na vazão programada.'
          : '',
      ].filter(Boolean),
      ajustes: this.dedupe([
        ...(atendeRate ? [] : [
          'Revisar contraste de densidade entre pasta e fluido do anular (corrige a causa da queda livre).',
          'Controlar a descida com contrapressão (back-pressure) na superfície (reduz vazão de queda livre).',
          'Avaliar tampão de fundo ou rever a sequência/vazões de bombeio (reduz vazão de queda livre).',
        ]),
        ...(atendeVol ? [] : [
          'Rever a sequência e as vazões antes de executar — o topo da pasta pode ficar fora da profundidade projetada (reduz incerteza de posicionamento).',
          'Reduzir o contraste de densidade ou aumentar a fricção da coluna (reduz volume em queda livre).',
        ]),
      ]),
    };
  }

  // ── Injetividade (squeeze) ──────────────────────────────────────────────────
  private avaliarInjetividade(p: ConformidadeParams): Avaliacao {
    const s = p.sim.summary;
    const tvd = s.referenceTVD;
    const fracGrad = this.toNumber(p.v.fracGrad, 16);
    const poreGrad = this.toNumber(p.v.poreGrad, 9);
    const pressaoOperacao = this.toNumber(p.v.pressaoOperacao, 0);
    const volInjetado = this.toNumber(p.v.volMaxInjetadoBbl, 0);
    const tempoPress = this.toNumber(p.v.tempoPressurizacaoMin, 0);

    // Ponto de injeção da simulação: BHP no canhoneado durante a pressurização final.
    const injPts = p.sim.points.filter(pt => /Inje/i.test(pt.phase));
    const injPoint = injPts.length ? injPts[injPts.length - 1] : null;
    const bhpCan = injPoint ? injPoint.bhpPsi : (pressaoOperacao + HYDRO_K * this.toNumber(p.v.displacementWeight, this.toNumber(p.v.completionWeight, 9.5)) * tvd);
    const porePsi = s.porePsi;
    const fracPsi = s.fracturePsi;
    const deltaP = bhpCan - porePsi;
    const qInj = tempoPress > 0 ? volInjetado / tempoPress : 0;

    // Índice de injetividade II = Q / ΔP  (bpm/psi). Limiar de "baixa injetividade"
    // é critério de engenharia ajustável no menu lateral (4.5 Injeção).
    const LIMIAR_II = this.toNumber(p.v.limiarInjetividadeBpmPsi, 0.001); // bpm/psi
    const limiarSugerido = this.limiarInjetividadeSugerido(p.sim, p.v);
    const iiValido = deltaP > 0 && qInj > 0 && Number.isFinite(qInj / deltaP);
    const ii = iiValido ? qInj / deltaP : NaN;

    const haInjecao = deltaP > 0;
    const naoFratura = bhpCan < fracPsi;
    const dadosInjecaoOk = pressaoOperacao > 0 && volInjetado > 0 && tempoPress > 0;
    const baixaInjetividade = iiValido && ii < LIMIAR_II;

    // Motivo de dado inválido (quando aplicável)
    const inputInvalido = !dadosInjecaoOk
      ? (pressaoOperacao <= 0 ? 'Pressão de Operação ausente ou ≤ 0'
        : volInjetado <= 0 ? 'Volume injetado p/ formação ausente ou ≤ 0'
          : 'Tempo de pressurização ausente ou ≤ 0')
      : (!Number.isFinite(deltaP) ? 'ΔP de injeção não numérico (revisar TVD/gradiente/pressão)' : '');

    const estado: Avaliacao['estado'] = !dadosInjecaoOk
      ? { rotulo: 'Índice de injetividade inválido — dados de injeção incompletos', ok: false }
      : !haInjecao
        ? { rotulo: 'Sem injeção (BHP no canhoneado ≤ pressão de poros)', ok: false }
        : { rotulo: 'Injeção possível', ok: true };

    const criterios: CriterioRow[] = [
      { criterio: 'Dados de injeção válidos (pressão, volume e tempo > 0)', valor: dadosInjecaoOk ? 'completos' : (inputInvalido || 'incompletos'), limite: 'todos > 0', atende: dadosInjecaoOk },
      { criterio: 'BHP no canhoneado acima da pressão de poros (há injeção)', valor: `${this.fmt(bhpCan, 0)} psi`, limite: `> ${this.fmt(porePsi, 0)} psi`, atende: haInjecao },
      { criterio: 'BHP no canhoneado abaixo da pressão de fratura', valor: `${this.fmt(bhpCan, 0)} psi`, limite: `< ${this.fmt(fracPsi, 0)} psi`, atende: naoFratura },
    ];

    const resultados: Array<{ label: string; value: string }> = [
      { label: 'Estado da injetividade', value: estado.rotulo },
      { label: 'Pressão de operação (superfície)', value: `${this.fmt(pressaoOperacao, 0)} psi` },
      { label: 'BHP no canhoneado (injeção)', value: `${this.fmt(bhpCan, 0)} psi` },
      { label: 'Pressão de poros', value: `${this.fmt(porePsi, 0)} psi` },
      { label: 'Pressão de fratura', value: `${this.fmt(fracPsi, 0)} psi` },
      { label: 'ΔP de injeção (BHP − poro)', value: `${this.fmt(deltaP, 0)} psi` },
      { label: 'Volume injetado p/ formação', value: `${this.fmt(volInjetado)} bbl` },
      { label: 'Tempo de pressurização', value: `${this.fmt(tempoPress, 0)} min` },
      { label: 'Vazão de injeção', value: `${this.fmt(qInj, 3)} bpm` },
      { label: 'Índice de injetividade (Q/ΔP)', value: iiValido ? `${this.fmt(ii, 5)} bpm/psi` : 'inválido' },
    ];

    const explicacao: string[] = [];
    if (!dadosInjecaoOk) {
      explicacao.push(`Não é possível avaliar a injetividade: ${inputInvalido}. Corrija a entrada e gere o relatório novamente.`);
    } else if (!haInjecao) {
      explicacao.push(`O BHP no canhoneado durante a injeção (${this.fmt(bhpCan, 0)} psi) NÃO SUPERA a pressão de poros (${this.fmt(porePsi, 0)} psi) — ΔP = ${this.fmt(deltaP, 0)} psi ≤ 0. Nessa condição não há injeção da pasta na formação (estado "Sem injeção").`);
    } else {
      explicacao.push(`Há injeção: o BHP no canhoneado (${this.fmt(bhpCan, 0)} psi) supera a pressão de poros (${this.fmt(porePsi, 0)} psi) em ΔP = ${this.fmt(deltaP, 0)} psi, empurrando a pasta para a formação.`);
    }
    if (dadosInjecaoOk && haInjecao) {
      explicacao.push(naoFratura
        ? `A injeção ocorre sem fraturar: o BHP (${this.fmt(bhpCan, 0)} psi) permanece abaixo da pressão de fratura (${this.fmt(fracPsi, 0)} psi).`
        : `A vazão/pressão programada leva o BHP (${this.fmt(bhpCan, 0)} psi) ACIMA da pressão de fratura (${this.fmt(fracPsi, 0)} psi): a injeção fraturaria a formação — reduzir a vazão/pressão de operação.`);
    }
    if (baixaInjetividade) {
      explicacao.push(`O índice de injetividade calculado (${this.fmt(ii, 5)} bpm/psi) está abaixo do limiar de referência (${LIMIAR_II} bpm/psi, critério de engenharia ajustável): a formação aceita pouco volume por unidade de pressão — a injeção pode ser lenta ou incompleta no tempo previsto.`);
    }

    const ajustes = this.dedupe([
      ...(!dadosInjecaoOk ? [
        `Corrigir a entrada indicada (${inputInvalido}) e revalidar — o índice não é usado enquanto o dado for inválido.`,
        'Revisar pressão superficial do teste, densidade do fluido, TVD, perda de carga e pressão de poros; repetir com dados estabilizados.',
      ] : []),
      ...(dadosInjecaoOk && !haInjecao ? [
        'Aumentar a pressão superficial respeitando a pressão de fratura (aumenta BHP no canhoneado).',
        'Aumentar a densidade do fluido, se houver margem hidráulica (aumenta BHP).',
        'Reduzir a perda de carga na coluna e/ou reduzir a vazão programada (aumenta BHP no fundo).',
        'Revisar pressão de poros e TVD dos canhoneados (corrige dados).',
        'Verificar isolamento/obstrução/restrição na coluna e se os canhoneados estão abertos e comunicando (corrige a causa física).',
      ] : []),
      ...(dadosInjecaoOk && haInjecao && !naoFratura ? [
        'Reduzir a vazão programada ou usar a vazão máxima segura (reduz BHP para abaixo da fratura).',
        'Reduzir perdas de carga e a pressão mínima de entrada (reduz BHP).',
        'Avaliar técnica de squeeze de baixa pressão e confirmar se o fraturamento é intencional (muda estratégia).',
        'Reduzir a viscosidade do fluido, quando tecnicamente permitido (reduz perda de carga).',
      ] : []),
      ...(dadosInjecaoOk && haInjecao && naoFratura && baixaInjetividade ? [
        'Reduzir a vazão programada e aumentar a pressão gradualmente dentro da janela operacional (acomoda baixa injetividade).',
        'Revisar dados do teste de injetividade e verificar obstrução dos canhoneados ou dano de formação (corrige dados/causa).',
        'Avaliar limpeza/condicionamento do intervalo e um novo teste de injetividade (nova avaliação).',
        'Verificar compatibilidade do fluido com a formação (nova avaliação; não aplicar tratamento químico sem dados e autorização).',
      ] : []),
    ]);

    return {
      titulo: 'Relatório de conformidade — Injetividade da formação',
      subtitulo: 'Avalia se a pressão de fundo na injeção supera o poro (há injeção) sem ultrapassar a fratura, e o índice de injetividade Q/ΔP.',
      estado,
      resultados,
      criterios,
      memoria: [
        {
          title: 'Janela na injeção (TVD de referência dos canhoneados)',
          formulas: [
            `Pressão de poros = K × grad.poro × TVD = ${HYDRO_K} × ${this.fmt(poreGrad)} × ${this.fmt(tvd, 1)} = ${this.fmt(porePsi, 0)} psi`,
            `Pressão de fratura = K × grad.fratura × TVD = ${HYDRO_K} × ${this.fmt(fracGrad)} × ${this.fmt(tvd, 1)} = ${this.fmt(fracPsi, 0)} psi`,
            `K = ${HYDRO_K} psi/(ppg·m)   |   TVD de referência = ${this.fmt(tvd, 1)} m`,
          ],
        },
        {
          title: 'BHP no canhoneado e ΔP de injeção',
          formulas: [
            `BHP no canhoneado (injeção) = ${this.fmt(bhpCan, 0)} psi   (pressão de operação + hidrostática − fricção; sem retorno anular)`,
            `ΔP de injeção = BHP − poro = ${this.fmt(bhpCan, 0)} − ${this.fmt(porePsi, 0)} = ${this.fmt(deltaP, 0)} psi`,
          ],
          notes: ['ΔP ≤ 0 significa que a formação não recebe pasta (estado "Sem injeção").'],
        },
        {
          title: 'Índice de injetividade',
          formulas: [
            `Vazão de injeção = volume / tempo = ${this.fmt(volInjetado)} / ${this.fmt(tempoPress, 0)} = ${this.fmt(qInj, 3)} bpm`,
            iiValido
              ? `II = Q / ΔP = ${this.fmt(qInj, 3)} / ${this.fmt(deltaP, 0)} = ${this.fmt(ii, 5)} bpm/psi`
              : 'II = Q / ΔP — inválido (ΔP ≤ 0 ou entradas ausentes)',
            `Limiar de baixa injetividade (ajustável) = ${LIMIAR_II} bpm/psi`,
            limiarSugerido != null
              ? `Limiar sugerido p/ o cenário = 2 × Q ÷ janela = 2 × ${this.fmt(qInj, 3)} ÷ ${this.fmt(fracPsi - porePsi, 0)} = ${this.fmt(limiarSugerido, 5)} bpm/psi`
              : 'Limiar sugerido — indisponível (informe volume e tempo de pressurização).',
          ],
          notes: ['O limiar de "baixa injetividade" é um critério de engenharia específico do campo — ajustável no menu lateral ("4.5 Injeção") conforme o teste de injetividade real. O limiar sugerido usa FS 2 (a operação ocupa no máximo metade da janela poro→fratura).'],
        },
      ],
      explicacao,
      ajustes,
    };
  }

  // ── Score de risco consolidado ───────────────────────────────────────────
  /**
   * Decompõe a simulação em fatores de risco ponderados (0 = sem risco,
   * 1 = risco máximo) e devolve o score de sucesso (0–100). Posições relativas
   * na janela poro × fratura, controle de free fall, limites do equipamento e
   * (no squeeze) a injetividade. `hardFail` marca reprovações duras (BHP fora
   * da janela, free fall descontrolado, equipamento excedido, sem injeção).
   * Dados de injeção incompletos NÃO são risco físico: o fator sai do score
   * (a soma dos pesos renormaliza) e `injNaoAvaliada` sinaliza o aviso.
   */
  private computeRiskFactors(
    sim: SqueezeHydraulicSimulation,
    v: any,
    operacao: 'SQUEEZE' | 'TAMPÃO',
  ): { fatores: FatorRisco[]; score: number; hardFail: boolean; injNaoAvaliada: boolean } {
    const s = sim.summary;
    const window = Math.max(1, s.fracturePsi - s.porePsi);
    const posMax = (s.bhpMaxPsi - s.porePsi) / window;
    const posMin = (s.bhpMinPsi - s.porePsi) / window;

    // Free fall
    const pts = sim.points;
    const maxExtra = pts.reduce((m, pt) => Math.max(m, pt.freeFallExtraRateBpm), 0);
    const maxProg = pts.reduce((m, pt) => Math.max(m, pt.programmedRateBpm), 0);
    const totalPumped = pts.reduce((m, pt) => Math.max(m, pt.pumpedVolumeBbl), 0);
    const rateRatio = maxProg > 0 ? maxExtra / maxProg : 0;
    const volRatio = totalPumped > 0 ? s.freeFallAccumBbl / totalPumped : 0;

    const clamp01 = (x: number) => this.clamp(x, 0, 1);
    const fatores: FatorRisco[] = [];

    // 1. Fratura (BHP máx)
    const fratHard = s.bhpMaxPsi >= s.fracturePsi;
    fatores.push({
      nome: 'Contenção de fratura (BHP máx.)',
      risco: fratHard ? 1 : clamp01((posMax - 0.7) / 0.3),
      peso: operacao === 'SQUEEZE' ? 0.25 : 0.30,
      hardFail: fratHard,
      detalhe: `BHP máx ${this.fmt(s.bhpMaxPsi, 0)} psi ocupa ${this.fmt(posMax * 100, 0)}% da janela poro→fratura (folga ${this.fmt(s.marginToFracturePsi, 0)} psi).`,
      correcao: 'reduzir a vazão de bombeio e/ou a pressão de operação; se persistir, aliviar a densidade da pasta ou dividir a cimentação em estágios (ver relatório de BHP/ECD).',
    });
    // 2. Controle de poço (BHP mín)
    const poreHard = s.bhpMinPsi <= s.porePsi;
    fatores.push({
      nome: 'Controle de poço (BHP mín.)',
      risco: poreHard ? 1 : clamp01((0.3 - posMin) / 0.3),
      peso: operacao === 'SQUEEZE' ? 0.22 : 0.27,
      hardFail: poreHard,
      detalhe: `BHP mín ${this.fmt(s.bhpMinPsi, 0)} psi a ${this.fmt(posMin * 100, 0)}% da janela (folga sobre o poro ${this.fmt(s.marginAbovePorePsi, 0)} psi).`,
      correcao: 'aumentar a densidade dos fluidos de deslocamento ou aplicar contrapressão na superfície; revisar coluna parcialmente preenchida e a pressão de poros (ver relatório de BHP/ECD).',
    });
    // 3. Free fall / tubo em U
    const ffHard = rateRatio > 0.5 || volRatio > 0.10;
    fatores.push({
      nome: 'Free fall / tubo em U',
      risco: Math.max(clamp01((rateRatio - 0.2) / 0.3), clamp01((volRatio - 0.03) / 0.07)),
      peso: operacao === 'SQUEEZE' ? 0.18 : 0.25,
      hardFail: ffHard,
      detalhe: `Vazão de queda livre ${this.fmt(rateRatio * 100, 0)}% (lim. 50%); volume ${this.fmt(volRatio * 100, 0)}% (lim. 10%).`,
      correcao: 'reduzir o contraste de densidade pasta × fluido do anular, aplicar contrapressão (back-pressure) na superfície e/ou sub-deslocar o volume de queda livre (ver relatórios de Free Fall e Sub-deslocamento).',
    });
    // 4. Equipamento
    const equipHard = (s.equipmentAlerts?.length ?? 0) > 0;
    const equipBase = s.hhpUsePct != null ? clamp01((s.hhpUsePct - 70) / 30) : 0;
    fatores.push({
      nome: 'Limites do equipamento',
      risco: equipHard ? Math.max(equipBase, 0.8) : equipBase,
      peso: operacao === 'SQUEEZE' ? 0.12 : 0.18,
      hardFail: equipHard,
      detalhe: s.hhpUsePct != null
        ? `Uso de HHP ${this.fmt(s.hhpUsePct, 0)}%${equipHard ? ` — ${s.equipmentAlerts.length} alerta(s)` : ''}.`
        : (equipHard ? `${s.equipmentAlerts.length} alerta(s) de equipamento.` : 'Sem limites informados / dentro do disponível.'),
      correcao: 'reduzir a vazão programada e/ou a pressão de superfície, ou disponibilizar unidade com mais HHP (motor × eficiência); revisar os limites informados em Equipamento.',
    });
    // 5. Injetividade (só squeeze)
    let injNaoAvaliada = false;
    if (operacao === 'SQUEEZE') {
      const inj = this.injetividadeSnapshot(sim, v);
      if (!inj.dadosOk) {
        injNaoAvaliada = true;
      } else {
        const injHard = !inj.haInjecao || !inj.naoFratura;
        fatores.push({
          nome: 'Injetividade da formação',
          risco: injHard ? 1 : (inj.baixa ? 0.6 : 0.15),
          peso: 0.23,
          hardFail: injHard,
          detalhe: !inj.haInjecao ? `Sem injeção (ΔP = ${this.fmt(inj.deltaP, 0)} psi ≤ 0).`
            : !inj.naoFratura ? `Injeção fraturaria (BHP ${this.fmt(inj.bhpCan, 0)} ≥ fratura ${this.fmt(inj.fracPsi, 0)} psi).`
              : inj.baixa ? `Baixa injetividade (II ${this.fmt(inj.ii, 5)} bpm/psi).`
                : `Injeção possível (ΔP ${this.fmt(inj.deltaP, 0)} psi; II ${this.fmt(inj.ii, 5)} bpm/psi).`,
          correcao: !inj.haInjecao
            ? 'aumentar a pressão de operação mantendo o BHP abaixo da fratura e revisar pressão de poros/TVD dos canhoneados (ver relatório de Injetividade).'
            : !inj.naoFratura
              ? 'reduzir a pressão de operação e/ou a vazão para manter o BHP no canhoneado abaixo da pressão de fratura (ver relatório de Injetividade).'
              : inj.baixa
                ? 'reduzir a vazão e subir a pressão gradualmente dentro da janela; revisar o teste de injetividade (volume ÷ tempo) e possível obstrução/dano nos canhoneados (ver relatório de Injetividade).'
                : 'manter os parâmetros de injeção do programa.',
        });
      }
    }

    const somaPeso = fatores.reduce((a, f) => a + f.peso, 0) || 1;
    const riscoPonderado = fatores.reduce((a, f) => a + f.risco * f.peso, 0) / somaPeso;
    const hardFail = fatores.some(f => f.hardFail);
    let score = Math.round(100 * (1 - riscoPonderado));
    if (hardFail) score = Math.min(score, 45); // reprovação dura nunca lê como “baixo risco”
    return { fatores, score: this.clamp(score, 0, 100), hardFail, injNaoAvaliada };
  }

  /**
   * Limiar de injetividade sugerido p/ o cenário: FS × Q_necessária ÷ janela.
   * Q = volume a injetar ÷ tempo de pressurização; janela = fratura − poro na
   * TVD de referência; FS = 2 (a operação usa no máximo metade da janela).
   * Ponto de partida — o valor do teste de injetividade real prevalece.
   */
  limiarInjetividadeSugerido(sim: SqueezeHydraulicSimulation, v: any): number | null {
    const s = sim.summary;
    const vol = this.toNumber(v.volMaxInjetadoBbl, 0);
    const tempo = this.toNumber(v.tempoPressurizacaoMin, 0);
    const janela = s.fracturePsi - s.porePsi;
    if (vol <= 0 || tempo <= 0 || janela <= 0) return null;
    return 2 * (vol / tempo) / janela;
  }

  /** Snapshot de injetividade (reaproveitado pelo score, sem montar o relatório). */
  private injetividadeSnapshot(sim: SqueezeHydraulicSimulation, v: any) {
    const s = sim.summary;
    const pressaoOperacao = this.toNumber(v.pressaoOperacao, 0);
    const volInjetado = this.toNumber(v.volMaxInjetadoBbl, 0);
    const tempoPress = this.toNumber(v.tempoPressurizacaoMin, 0);
    const injPts = sim.points.filter(pt => /Inje/i.test(pt.phase));
    const injPoint = injPts.length ? injPts[injPts.length - 1] : null;
    const bhpCan = injPoint ? injPoint.bhpPsi
      : (pressaoOperacao + HYDRO_K * this.toNumber(v.displacementWeight, this.toNumber(v.completionWeight, 9.5)) * s.referenceTVD);
    const deltaP = bhpCan - s.porePsi;
    const qInj = tempoPress > 0 ? volInjetado / tempoPress : 0;
    const ii = deltaP > 0 && qInj > 0 ? qInj / deltaP : NaN;
    const limiarII = this.toNumber(v.limiarInjetividadeBpmPsi, 0.001);
    return {
      dadosOk: pressaoOperacao > 0 && volInjetado > 0 && tempoPress > 0,
      haInjecao: deltaP > 0,
      naoFratura: bhpCan < s.fracturePsi,
      baixa: Number.isFinite(ii) && ii < limiarII,
      bhpCan, deltaP, ii, fracPsi: s.fracturePsi,
    };
  }

  private classeScore(score: number, hardFail: boolean): { classe: 'ok' | 'warn' | 'high' | 'crit'; rotulo: string } {
    if (hardFail || score < 50) return { classe: 'crit', rotulo: 'Risco crítico' };
    if (score < 70) return { classe: 'high', rotulo: 'Risco elevado' };
    if (score < 85) return { classe: 'warn', rotulo: 'Risco moderado' };
    return { classe: 'ok', rotulo: 'Baixo risco' };
  }

  private avaliarRisco(p: ConformidadeParams): Avaliacao {
    const base = this.computeRiskFactors(p.sim, p.v, p.operacao);
    const cls = this.classeScore(base.score, base.hardFail);

    // ── Varredura de otimização (standoff × vazão × densidade) ──
    const densAtual = this.toNumber(p.v.density, this.toNumber(p.v.densidadePastaPpg, 15.8));
    const stoAtual = this.clamp(this.toNumber(p.v.standoffPct, 80), 0, 100);
    const combos: Array<{ label: string; o: VarreduraOverride; score: number; hardFail: boolean; sto: number; rateF: number; dens: number }> = [];
    let melhor: typeof combos[number] | null = null;
    if (p.reSimulate) {
      const rateFactors = [0.5, 0.7, 0.85, 1.0];
      const standoffs = this.uniqNum([stoAtual, 70, 85, 100]);
      const densidades = this.uniqNum([densAtual, densAtual - 0.5, densAtual + 0.5]).filter(d => d >= 12 && d <= 19);
      if (!densidades.length) densidades.push(densAtual); // densidade fora da faixa típica: varre só vazão × standoff
      for (const rateF of rateFactors) {
        for (const sto of standoffs) {
          for (const dens of densidades) {
            const alt = p.reSimulate({ rateFactor: rateF, standoffPct: sto, density: dens });
            if (!alt) continue;
            const r = this.computeRiskFactors(alt, p.v, p.operacao);
            const combo = { label: '', o: { rateFactor: rateF, standoffPct: sto, density: dens }, score: r.score, hardFail: r.hardFail, sto, rateF, dens };
            combos.push(combo);
            if (!melhor || combo.score > melhor.score) melhor = combo;
          }
        }
      }
    }
    const ganho = melhor ? melhor.score - base.score : 0;
    const rateBaseBpm = p.sim.points.reduce((m, pt) => Math.max(m, pt.programmedRateBpm), 0);

    const criterios: CriterioRow[] = [
      { criterio: 'Score de sucesso do cenário atual', valor: `${base.score}/100`, limite: '≥ 70', atende: base.score >= 70 && !base.hardFail },
      ...base.fatores.map(f => ({
        criterio: f.nome,
        valor: `${this.fmt((1 - f.risco) * 100, 0)}% de folga${f.risco >= 0.6 ? ' (atenção)' : ''}`,
        limite: 'sem reprovação dura',
        atende: !f.hardFail,
      })),
      ...(base.injNaoAvaliada ? [{
        criterio: 'Injetividade avaliada (dados de injeção completos)',
        valor: 'dados incompletos',
        limite: 'pressão, volume e tempo > 0',
        atende: false,
      }] : []),
    ];

    const resultados: Array<{ label: string; value: string }> = [
      { label: 'Score de sucesso (atual)', value: `${base.score}/100 — ${cls.rotulo}` },
      { label: 'Reprovação dura', value: base.hardFail ? 'SIM — há fator crítico' : 'Não' },
      { label: 'Vazão de referência atual', value: `${this.fmt(rateBaseBpm, 2)} bpm` },
      { label: 'Standoff atual', value: `${this.fmt(stoAtual, 0)}%` },
      { label: 'Densidade da pasta atual', value: `${this.fmt(densAtual, 1)} ppg` },
    ];
    if (melhor) {
      resultados.push(
        { label: 'Melhor combinação encontrada', value: `${melhor.score}/100 (${this.classeScore(melhor.score, melhor.hardFail).rotulo})` },
        { label: '→ Vazão recomendada', value: `${this.fmt(rateBaseBpm * melhor.rateF, 2)} bpm (${this.fmt(melhor.rateF * 100, 0)}% da atual)` },
        { label: '→ Standoff recomendado', value: `${this.fmt(melhor.sto, 0)}%` },
        { label: '→ Densidade avaliada', value: `${this.fmt(melhor.dens, 1)} ppg` },
        { label: 'Ganho de score', value: `${ganho >= 0 ? '+' : ''}${ganho} pontos` },
      );
    }

    // Tabela: melhores combinações (top 8 por score) + destaque na melhor
    const tabelas: TabelaExtra[] = [];
    if (combos.length) {
      const ordenadas = [...combos].sort((a, b) => b.score - a.score).slice(0, 8);
      const destaqueIdx = melhor ? ordenadas.findIndex(c => c === melhor) : -1;
      tabelas.push({
        titulo: 'Varredura de otimização (melhores combinações)',
        colunas: ['Vazão (bpm)', 'Standoff (%)', 'Densidade (ppg)', 'Score', 'Classe'],
        linhas: ordenadas.map(c => [
          this.fmt(rateBaseBpm * c.rateF, 2),
          this.fmt(c.sto, 0),
          this.fmt(c.dens, 1),
          `${c.score}/100`,
          this.classeScore(c.score, c.hardFail).rotulo,
        ]),
        destaqueIdx: destaqueIdx >= 0 ? destaqueIdx : undefined,
        legenda: `${combos.length} combinações avaliadas (vazão × standoff × densidade). A densidade é sensibilizada apenas como estudo — alterá-la muda a receita e exige validação laboratorial.`,
      });
    }

    const explicacao: string[] = [
      `O score de sucesso consolida ${base.fatores.length} fatores da simulação hidráulica em um único índice de 0 a 100 (quanto maior, menor o risco). O cenário atual obteve ${base.score}/100 — ${cls.rotulo.toLowerCase()}.`,
      base.hardFail
        ? `Há pelo menos um fator em reprovação dura: ${base.fatores.filter(f => f.hardFail).map(f => f.nome).join('; ')}. Enquanto existir reprovação dura o score é limitado e a operação não deve ser executada como está.`
        : `Nenhum fator está em reprovação dura — todos permanecem dentro dos limites físicos, com folga variável.`,
    ];
    if (base.injNaoAvaliada) {
      explicacao.push('A injetividade da formação NÃO entrou no score: os dados de injeção estão incompletos (Pressão de Operação, Volume injetado p/ formação e Tempo de pressurização devem ser > 0). O score acima é PARCIAL — consolida apenas os fatores hidráulicos — e o cenário permanece não operacional até completar os dados e reavaliar.');
    }
    if (melhor && ganho > 0) {
      explicacao.push(`A varredura de otimização encontrou uma combinação que eleva o score para ${melhor.score}/100 (ganho de ${ganho} pontos): vazão ${this.fmt(rateBaseBpm * melhor.rateF, 2)} bpm, standoff ${this.fmt(melhor.sto, 0)}% e densidade ${this.fmt(melhor.dens, 1)} ppg. Trate como ponto de partida para a engenharia, não como ajuste automático.`);
    } else if (melhor) {
      explicacao.push(`A varredura não encontrou combinação melhor que a atual dentro do espaço avaliado — o cenário atual já é o melhor ponto na grade de vazão × standoff × densidade testada.`);
    }

    const ajustes = this.dedupe([
      ...(base.injNaoAvaliada ? [
        'Preencher os dados de injeção (Pressão de Operação, Volume injetado p/ formação e Tempo de pressurização) para incluir a injetividade no score.',
      ] : []),
      ...base.fatores
        .filter(f => f.hardFail || f.risco >= 0.6)
        .sort((a, b) => b.risco - a.risco)
        .map(f => `${f.nome}: ${f.detalhe} Como corrigir: ${f.correcao}`),
    ]);

    return {
      titulo: `Score de risco e otimização — ${p.operacao === 'TAMPÃO' ? 'Tampão' : 'Squeeze'}`,
      subtitulo: 'Consolida ECD/BHP, free fall, equipamento' + (p.operacao === 'SQUEEZE' ? ' e injetividade' : '') + ' em um único score de sucesso, e varre vazão × standoff × densidade em busca do melhor conjunto.',
      scoreBanner: { valor: base.score, rotulo: base.injNaoAvaliada ? `${cls.rotulo} (score parcial)` : cls.rotulo, classe: cls.classe },
      estado: base.injNaoAvaliada
        ? { rotulo: 'Score parcial — injetividade não avaliada (dados de injeção incompletos)', ok: false }
        : undefined,
      resultados,
      criterios,
      tabelas,
      memoria: [
        {
          title: 'Composição do score',
          formulas: [
            'Score = 100 × (1 − Σ riscoᵢ × pesoᵢ / Σ pesoᵢ)',
            ...base.fatores.map(f => `${f.nome}: risco ${this.fmt(f.risco, 2)} × peso ${this.fmt(f.peso, 2)}  →  ${f.detalhe}`),
            ...(base.injNaoAvaliada ? ['Injetividade da formação: NÃO AVALIADA (dados de injeção incompletos) — fator excluído do score; pesos renormalizados.'] : []),
            base.hardFail ? 'Reprovação dura ativa → score limitado a 45.' : 'Sem reprovação dura.',
          ],
          notes: [
            'Risco por fator (0–1): posição relativa na janela poro→fratura (BHP), razões de free fall (50%/10%), uso de HHP/limites do equipamento e, no squeeze, o estado da injetividade.',
            'Os pesos são critérios de engenharia (a soma normaliza para 1); ajuste conforme a criticidade do poço.',
          ],
        },
        ...(p.operacao === 'SQUEEZE' ? [{
          title: 'Índice de injetividade (II) — o que significa o bpm/psi',
          formulas: [
            'II = Q ÷ ΔP  (bpm/psi) — volume que a formação aceita por unidade de pressão aplicada',
            'Q (bpm) = Vol. injetado p/ formação (bbl) ÷ Tempo de pressurização (min)',
            'ΔP (psi) = BHP no canhoneado durante a injeção − Pressão de poros',
            `Limiar de baixa injetividade = ${this.fmt(this.toNumber(p.v.limiarInjetividadeBpmPsi, 0.001), 5)} bpm/psi (ajustável em "4.5 Injeção")`,
            (() => {
              const sug = this.limiarInjetividadeSugerido(p.sim, p.v);
              return sug != null
                ? `Limiar sugerido p/ o cenário = 2 × Q ÷ janela poro→fratura = ${this.fmt(sug, 5)} bpm/psi`
                : 'Limiar sugerido — indisponível (informe volume e tempo de pressurização).';
            })(),
          ],
          notes: [
            'O BHP no canhoneado vem da simulação (pressão de operação + hidrostática − fricção da coluna, sem retorno anular); a pressão de poros = K × gradiente de poros × TVD.',
            'II abaixo do limiar indica formação que aceita pouco volume por psi: injeção lenta ou incompleta no tempo previsto.',
            'O limiar sugerido usa FS 2 (a operação ocupa no máximo metade da janela); o valor do teste de injetividade real do poço prevalece.',
          ],
        }] : []),
        ...(combos.length ? [{
          title: 'Varredura de otimização',
          formulas: [
            `Grade avaliada: vazão × {50, 70, 85, 100%} · standoff × {atual, 70, 85, 100%} · densidade × {atual ±0,5 ppg}`,
            `Total de combinações válidas: ${combos.length}`,
            melhor ? `Melhor: vazão ${this.fmt(rateBaseBpm * melhor.rateF, 2)} bpm · standoff ${this.fmt(melhor.sto, 0)}% · densidade ${this.fmt(melhor.dens, 1)} ppg → score ${melhor.score}/100` : '—',
          ],
          notes: ['Cada combinação re-executa a simulação hidráulica completa (tubo em U, fricção F-40) e recalcula o score.'],
        }] : []),
      ],
      explicacao,
      ajustes,
    };
  }

  // ── Movimento de interfaces (posicionamento da pasta) ──────────────────────
  private avaliarInterfaces(p: ConformidadeParams): Avaliacao {
    const s = p.sim.summary;
    const pl = p.placement;
    const Vff = Math.max(0, s.freeFallAccumBbl);
    const cap = pl && pl.capBblM > 0 ? pl.capBblM : 0;
    // Sobre-deslocamento por queda livre: o volume em free fall empurra o trem
    // além do programado → o topo da pasta desce Δh = Vff / capacidade.
    const deltaH = cap > 0 ? Vff / cap : s.freeFallHeightM;
    const topoPlanejado = pl ? pl.cementTopMD : s.referenceMD;
    const topoPrevisto = topoPlanejado + deltaH; // mais fundo = maior MD
    const alvo = pl?.targetTopMD ?? topoPlanejado;
    const desvio = topoPrevisto - alvo;
    const colHeight = pl ? Math.abs(pl.cementBaseMD - pl.cementTopMD) : 0;

    // Desbalanço hidrostático que gera a queda livre e a vazão natural
    const maxDrive = p.sim.points.reduce((m, pt) => Math.max(m, pt.drivePsi), 0);
    const maxNatural = p.sim.points.reduce((m, pt) => Math.max(m, pt.realRateBpm), 0);
    const maxProg = p.sim.points.reduce((m, pt) => Math.max(m, pt.programmedRateBpm), 0);
    const maxExtra = p.sim.points.reduce((m, pt) => Math.max(m, pt.freeFallExtraRateBpm), 0);

    // Critérios: desvio absoluto e relativo à altura da coluna de pasta
    const LIMITE_ABS_M = 15;            // tolerância de posicionamento (ajustável)
    const desvioRelPct = colHeight > 0 ? (Math.abs(desvio) / colHeight) * 100 : 0;
    const atendeAbs = Math.abs(desvio) <= LIMITE_ABS_M;
    const atendeRel = colHeight <= 0 || desvioRelPct <= 10;
    const atendeControle = maxProg <= 0 || maxExtra / maxProg <= 0.5;

    const criterios: CriterioRow[] = [
      { criterio: 'Desvio do topo da pasta dentro da tolerância', valor: `${this.fmt(desvio, 1)} m`, limite: `|Δ| ≤ ${LIMITE_ABS_M} m`, atende: atendeAbs },
      { criterio: 'Desvio relativo à altura da coluna de pasta', valor: `${this.fmt(desvioRelPct, 0)}%`, limite: '≤ 10%', atende: atendeRel },
      { criterio: 'Movimento controlável pela bomba (free fall)', valor: `${this.fmt(maxProg > 0 ? maxExtra / maxProg * 100 : 0, 0)}%`, limite: '≤ 50%', atende: atendeControle },
    ];

    // Recomendação de minimização: sub-deslocar pelo volume esperado de free fall
    const subDeslocRecomendadoBbl = Vff;

    const resultados: Array<{ label: string; value: string }> = [
      { label: 'Volume em queda livre (over-displacement)', value: `${this.fmt(Vff, 2)} bbl` },
      { label: 'Capacidade no trecho da pasta', value: cap > 0 ? `${this.fmt(cap, 4)} bbl/m` : '— (usando altura equivalente)' },
      { label: 'Topo da pasta planejado', value: `${this.fmt(topoPlanejado, 1)} m MD` },
      { label: 'Topo da pasta previsto (com free fall)', value: `${this.fmt(topoPrevisto, 1)} m MD` },
      { label: 'Desvio do topo (previsto − alvo)', value: `${this.fmt(desvio, 1)} m (${desvio >= 0 ? 'mais fundo' : 'mais raso'})` },
      { label: 'Altura da coluna de pasta', value: colHeight > 0 ? `${this.fmt(colHeight, 1)} m` : '—' },
      { label: 'Desbalanço hidrostático (drive) máx.', value: `${this.fmt(maxDrive, 0)} psi` },
      { label: 'Vazão natural (equilíbrio) máx.', value: `${this.fmt(maxNatural, 2)} bpm` },
      { label: 'Sub-deslocamento recomendado p/ acertar o alvo', value: `${this.fmt(subDeslocRecomendadoBbl, 2)} bbl` },
    ];

    const explicacao: string[] = [
      `A pasta é mais pesada que o fluido do anular; o desbalanço hidrostático (drive de até ${this.fmt(maxDrive, 0)} psi) puxa a coluna em queda livre e sobre-desloca o trem em ${this.fmt(Vff, 2)} bbl além do programado.`,
      cap > 0
        ? `Convertido em profundidade pela capacidade do trecho da pasta (${this.fmt(cap, 4)} bbl/m), isso desce o topo da pasta em ${this.fmt(deltaH, 1)} m: do planejado ${this.fmt(topoPlanejado, 1)} m para ${this.fmt(topoPrevisto, 1)} m MD.`
        : `Sem a capacidade do trecho, usa-se a altura equivalente de queda livre (${this.fmt(deltaH, 1)} m) como estimativa do movimento do topo.`,
      atendeAbs && atendeRel && atendeControle
        ? `O desvio previsto (${this.fmt(desvio, 1)} m) está dentro da tolerância — o posicionamento da pasta é previsível e a bomba controla a descida.`
        : `O desvio previsto (${this.fmt(desvio, 1)} m) excede a tolerância adotada: o topo da pasta pode não cair na profundidade projetada.`,
      `Para minimizar o movimento e acertar o alvo, sub-deslocar ~${this.fmt(subDeslocRecomendadoBbl, 2)} bbl (deixar de bombear o volume que o poço vai “ganhar” em queda livre) e/ou aplicar contrapressão de ~${this.fmt(maxDrive, 0)} psi para segurar a coluna.`,
    ];

    const ajustes = this.dedupe([
      ...(atendeAbs && atendeRel && atendeControle ? [] : [
        `Sub-deslocar ~${this.fmt(subDeslocRecomendadoBbl, 2)} bbl para compensar a queda livre e posicionar o topo no alvo (ver relatório de sub-deslocamento).`,
        `Aplicar contrapressão (back-pressure) de ~${this.fmt(maxDrive, 0)} psi na superfície para conter a coluna durante o deslocamento.`,
        'Reduzir o contraste de densidade entre a pasta e o fluido do anular (reduz o drive e o movimento das interfaces).',
        'Reduzir a vazão de deslocamento para manter a coluna sob controle da bomba.',
        'Avaliar tampão de fundo (viscoso/mecânico) para reduzir a contaminação e o avanço das interfaces.',
      ]),
    ]);

    return {
      titulo: `Movimento de interfaces — ${p.operacao === 'TAMPÃO' ? 'Tampão' : 'Squeeze'}`,
      subtitulo: 'Prevê o deslocamento do topo da pasta causado pela queda livre (tubo em U) e recomenda como minimizá-lo.',
      estado: { rotulo: atendeAbs && atendeRel && atendeControle ? 'Posicionamento previsível' : 'Movimento de interface acima da tolerância', ok: atendeAbs && atendeRel && atendeControle },
      resultados,
      criterios,
      memoria: [
        {
          title: 'Sobre-deslocamento por queda livre',
          formulas: [
            `Volume em queda livre Vff = ${this.fmt(Vff, 2)} bbl  (integral da vazão extra no tempo)`,
            cap > 0
              ? `Δh do topo = Vff / capacidade = ${this.fmt(Vff, 2)} / ${this.fmt(cap, 4)} = ${this.fmt(deltaH, 1)} m`
              : `Δh do topo ≈ altura equivalente de free fall = ${this.fmt(deltaH, 1)} m`,
            `Topo previsto = topo planejado + Δh = ${this.fmt(topoPlanejado, 1)} + ${this.fmt(deltaH, 1)} = ${this.fmt(topoPrevisto, 1)} m MD`,
          ],
        },
        {
          title: 'Minimização do movimento',
          formulas: [
            `Sub-deslocamento recomendado = Vff = ${this.fmt(subDeslocRecomendadoBbl, 2)} bbl (compensa a queda livre)`,
            `Contrapressão para conter a coluna ≈ drive máx = ${this.fmt(maxDrive, 0)} psi`,
            `Vazão natural (equilíbrio) = ${this.fmt(maxNatural, 2)} bpm`,
          ],
          notes: ['A tolerância de posicionamento (15 m / 10% da coluna) é critério de engenharia ajustável.'],
        },
      ],
      explicacao,
      ajustes,
    };
  }

  // ── Sub-deslocamento (sensibilização do volume de deslocamento) ────────────
  private avaliarSubdeslocamento(p: ConformidadeParams): Avaliacao {
    const s = p.sim.summary;
    const pl = p.placement;
    const cap = pl && pl.capBblM > 0 ? pl.capBblM : 0;
    const deslocPlanejado = pl ? pl.displacementBbl : 0;
    const Vff = Math.max(0, s.freeFallAccumBbl);
    const topoPlanejado = pl ? pl.cementTopMD : s.referenceMD;
    const alvo = pl?.targetTopMD ?? topoPlanejado;

    // Sensibilidade: variar o deslocamento e ver onde o topo da pasta assenta.
    // Sub-deslocar ΔV deixa o topo Δh = ΔV/cap mais raso (compensa a queda livre).
    // Topo assentado ≈ topo planejado + (Vff − subDesloc)/cap.
    // Varredura centrada no deslocamento ótimo (Δ = −Vff), garantindo a linha do
    // planejado (Δ = 0): se a queda livre exceder a faixa fixa de ±3 bbl, o ótimo
    // ainda aparece (e é destacado) na tabela.
    const offsets = [-3, -2, -1, 0, 1, 2, 3];
    const deltas = this.uniqNum([0, ...offsets.map(o => -Vff + o)])
      .filter(dv => deslocPlanejado + dv >= 0)
      .sort((a, b) => a - b);
    const subRecomendado = Vff; // sub-deslocar o volume esperado de queda livre
    const linhas: string[][] = [];
    let destaqueIdx = -1;
    let melhorDesvio = Infinity;
    deltas.forEach((dv, idx) => {
      const desloc = deslocPlanejado + dv; // dv<0 = sub-deslocamento
      const subDesloc = -dv;               // volume não bombeado (positivo = sub-desloca)
      const topoAssentado = cap > 0 ? topoPlanejado + (Vff - subDesloc) / cap : topoPlanejado - dv;
      const desvio = topoAssentado - alvo;
      if (Math.abs(desvio) < melhorDesvio) { melhorDesvio = Math.abs(desvio); destaqueIdx = idx; }
      linhas.push([
        `${dv >= 0 ? '+' : ''}${this.fmt(dv, 1)}`,
        this.fmt(desloc, 2),
        dv < 0 ? this.fmt(subDesloc, 2) : (dv > 0 ? `sobre +${this.fmt(dv, 1)}` : '0,0'),
        this.fmt(topoAssentado, 1),
        `${this.fmt(desvio, 1)} (${desvio >= 0 ? 'fundo' : 'raso'})`,
      ]);
    });

    // Deslocamento ótimo contínuo: aquele que zera o desvio → desloc = planejado − Vff
    const deslocOtimo = deslocPlanejado - Vff;
    const LIMITE_ABS_M = 15;
    const atende = melhorDesvio <= LIMITE_ABS_M;

    const criterios: CriterioRow[] = [
      { criterio: 'Existe deslocamento que assenta o topo no alvo', valor: `melhor desvio ${this.fmt(melhorDesvio, 1)} m`, limite: `≤ ${LIMITE_ABS_M} m`, atende },
      { criterio: 'Sub-deslocamento recomendado é fisicamente positivo', valor: `${this.fmt(subRecomendado, 2)} bbl`, limite: '≥ 0', atende: subRecomendado >= 0 },
    ];

    const resultados: Array<{ label: string; value: string }> = [
      { label: 'Deslocamento planejado', value: `${this.fmt(deslocPlanejado, 2)} bbl` },
      { label: 'Volume esperado em queda livre', value: `${this.fmt(Vff, 2)} bbl` },
      { label: 'Sub-deslocamento recomendado', value: `${this.fmt(subRecomendado, 2)} bbl` },
      { label: 'Deslocamento ótimo (assenta no alvo)', value: `${this.fmt(deslocOtimo, 2)} bbl` },
      { label: 'Topo alvo', value: `${this.fmt(alvo, 1)} m MD` },
      { label: 'Capacidade no trecho da pasta', value: cap > 0 ? `${this.fmt(cap, 4)} bbl/m` : '—' },
    ];

    const explicacao: string[] = [
      `O sub-deslocamento é a técnica de deixar de bombear parte do fluido de deslocamento para que a pasta assente na profundidade projetada. Como a queda livre sobre-desloca ${this.fmt(Vff, 2)} bbl, deslocar 100% deixaria o topo ~${this.fmt(cap > 0 ? Vff / cap : s.freeFallHeightM, 1)} m fundo demais.`,
      `Sub-deslocando ~${this.fmt(subRecomendado, 2)} bbl (deslocamento efetivo ${this.fmt(deslocOtimo, 2)} bbl), a queda livre completa o posicionamento e o topo cai no alvo (${this.fmt(alvo, 1)} m MD).`,
      atende
        ? `A tabela de sensibilidade mostra uma janela viável de deslocamento com desvio mínimo de ${this.fmt(melhorDesvio, 1)} m.`
        : `Nenhum deslocamento na faixa testada zera o desvio (mínimo ${this.fmt(melhorDesvio, 1)} m): rever geometria, contraste de densidade ou usar tampão de fundo.`,
    ];

    const ajustes = this.dedupe([
      `Programar o deslocamento efetivo em ~${this.fmt(deslocOtimo, 2)} bbl (sub-deslocar ${this.fmt(subRecomendado, 2)} bbl) para acertar o topo da pasta.`,
      'Confirmar o volume de queda livre no dia da operação (nível/retorno) antes de fixar o sub-deslocamento.',
      'Manter o restante do deslocamento para circular após o assentamento, se o procedimento previr.',
      ...(atende ? [] : [
        'Reduzir o contraste de densidade pasta × fluido do anular (reduz a queda livre e o sub-deslocamento necessário).',
        'Avaliar tampão de fundo para estabilizar a base e melhorar a precisão de posicionamento.',
      ]),
    ]);

    return {
      titulo: `Sub-deslocamento — ${p.operacao === 'TAMPÃO' ? 'Tampão' : 'Squeeze'}`,
      subtitulo: 'Sensibiliza o volume de deslocamento contra a queda livre e aponta o deslocamento que assenta a pasta no alvo.',
      estado: { rotulo: atende ? 'Janela de deslocamento viável' : 'Sem janela dentro da tolerância', ok: atende },
      resultados,
      criterios,
      tabelas: [{
        titulo: 'Sensibilidade do deslocamento',
        colunas: ['Δ deslocamento (bbl)', 'Deslocamento (bbl)', 'Sub-deslocamento (bbl)', 'Topo assentado (m MD)', 'Desvio do alvo (m)'],
        linhas,
        destaqueIdx: destaqueIdx >= 0 ? destaqueIdx : undefined,
        legenda: 'Δ negativo = sub-deslocamento (topo mais raso). A linha destacada é a de menor desvio ao alvo.',
      }],
      memoria: [
        {
          title: 'Modelo de posicionamento',
          formulas: [
            `Sobre-deslocamento por queda livre Vff = ${this.fmt(Vff, 2)} bbl`,
            cap > 0 ? `Topo assentado = topo planejado + (Vff − sub-deslocamento) / capacidade` : `Topo assentado ≈ topo planejado − Δ deslocamento / (altura eq.)`,
            `Deslocamento ótimo = planejado − Vff = ${this.fmt(deslocPlanejado, 2)} − ${this.fmt(Vff, 2)} = ${this.fmt(deslocOtimo, 2)} bbl`,
          ],
          notes: [
            'Modelo hidrostático 1D: assume assentamento por balanço de volume, sem contaminação/mistura nas interfaces.',
            'A tolerância de posicionamento (15 m) é critério de engenharia ajustável.',
          ],
        },
      ],
      explicacao,
      ajustes,
    };
  }

  // ── Página ─────────────────────────────────────────────────────────────────
  private openCompliancePage(p: ConformidadeParams, a: Avaliacao, operacional: boolean): void {
    const s = p.sim.summary;
    const cenarioRows = [
      ['Operação', p.operacao],
      ['Cliente', p.dadosRelatorio.cliente || '-'],
      ['Poço', p.dadosRelatorio.poco || '-'],
      ['Campo', p.dadosRelatorio.campo || '-'],
      ['Sonda', p.dadosRelatorio.sonda || '-'],
      ['Gerado em', new Date().toLocaleString('pt-BR')],
      ['Profundidade de referência', `${this.fmt(s.referenceMD, 1)} m MD / ${this.fmt(s.referenceTVD, 1)} m TVD`],
      ['Fonte', 'Simulação hidráulica (tubo em U; fricção Petroguia F-40 c/ standoff)'],
    ];
    const resultadoRows = a.resultados.map(r => [r.label, r.value]);
    const criteriosHtml = a.criterios.map(c => `
      <tr>
        <td>${this.escapeHtml(c.criterio)}</td>
        <td>${this.escapeHtml(c.valor)}</td>
        <td>${this.escapeHtml(c.limite)}</td>
        <td class="${c.atende ? 'ok' : 'fail'}">${c.atende ? 'ATENDE ✓' : 'NÃO ATENDE ✗'}</td>
      </tr>`).join('');
    const explicacaoHtml = a.explicacao.map(par => `<p class="expl-item">${this.escapeHtml(par)}</p>`).join('');
    const estadoHtml = a.estado
      ? `<div class="estado ${a.estado.ok ? 'estado--ok' : 'estado--fail'}">Estado: ${this.escapeHtml(a.estado.rotulo)}</div>`
      : '';
    const ajustes = (a.ajustes ?? []).slice(0, 5);
    const ajustesHtml = ajustes.length ? `
    <section><h2>Possíveis ajustes</h2>
      <div class="expl">
        <ol class="ajustes">${ajustes.map(x => `<li>${this.escapeHtml(x)}</li>`).join('')}</ol>
        <p class="disclaimer">As sugestões são baseadas no modelo hidráulico e não substituem a avaliação da engenharia responsável, os dados reais do poço e os testes laboratoriais. Nenhum dado da operação é alterado automaticamente.</p>
      </div>
    </section>` : '';
    const memoriaHtml = a.memoria.map(m => `
      <div class="mem-block">
        <h3>${this.escapeHtml(m.title)}</h3>
        <div class="formulas">${m.formulas.map(f => `<div>${this.escapeHtml(f)}</div>`).join('')}</div>
        ${m.notes?.length ? `<ul class="notes">${m.notes.map(n => `<li>${this.escapeHtml(n)}</li>`).join('')}</ul>` : ''}
      </div>`).join('');
    const scoreHtml = a.scoreBanner ? `
    <div class="score score--${a.scoreBanner.classe}">
      <div class="score-num">${a.scoreBanner.valor}<span>/100</span></div>
      <div class="score-txt"><b>${this.escapeHtml(a.scoreBanner.rotulo)}</b><small>Score de sucesso (0–100) — quanto maior, menor o risco.</small></div>
    </div>` : '';
    const tabelasHtml = (a.tabelas ?? []).map(t => `
    <section><h2>${this.escapeHtml(t.titulo)}</h2>
      <div class="tbl-scroll">
        <table class="sweep"><thead><tr>${t.colunas.map(c => `<th>${this.escapeHtml(c)}</th>`).join('')}</tr></thead>
        <tbody>${t.linhas.map((row, i) => `<tr class="${i === t.destaqueIdx ? 'best' : ''}">${row.map(cell => `<td>${this.escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      </div>
      ${t.legenda ? `<p class="tbl-cap">${this.escapeHtml(t.legenda)}</p>` : ''}
    </section>`).join('');

    this.relatorioBuilder.openInNewTab(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${this.escapeHtml(a.titulo)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#eef2f6;color:#172033;font-family:Inter,Segoe UI,Arial,sans-serif}
  .page{max-width:980px;margin:24px auto;padding:32px;background:#fff;border:1px solid #dbe3ef;border-radius:8px}
  .header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;border-bottom:2px solid #2d5a8e;padding-bottom:18px;margin-bottom:22px}
  h1{margin:0;color:#1f4977;font-size:24px}
  .subtitle{margin:8px 0 0;color:#526273;font-size:14px;line-height:1.45}
  .print{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer}
  .verdict{display:flex;align-items:center;gap:14px;margin:0 0 22px;padding:18px 22px;border-radius:10px;font-size:22px;font-weight:900;letter-spacing:.02em}
  .verdict--ok{background:#dcfce7;color:#14532d;border:2px solid #16a34a}
  .verdict--fail{background:#fee2e2;color:#7f1d1d;border:2px solid #dc2626}
  .verdict small{display:block;font-size:13px;font-weight:600;margin-top:4px;letter-spacing:0}
  section{margin:0 0 22px}
  h2{margin:0 0 10px;color:#2d5a8e;font-size:17px}
  table{width:100%;border-collapse:collapse}
  td,th{border:1px solid #dbe3ef;padding:9px 11px;font-size:13px;vertical-align:top;text-align:left}
  td:first-child{background:#f8fafc;font-weight:700;color:#42526a}
  th{background:#eef4fb;color:#2d5a8e}
  .crit td:first-child{width:38%}
  .ok{color:#15803d;font-weight:800}
  .fail{color:#b91c1c;font-weight:800}
  .notes{margin-top:10px;padding-left:18px;color:#526273;font-size:13px;line-height:1.5}
  .expl{padding:16px 18px;border-radius:10px;border:1px solid #dbe3ef;background:#f8fafc}
  .expl-item{margin:0 0 10px;font-size:14px;line-height:1.55;color:#28323f}
  .expl-item:last-child{margin-bottom:0}
  .ajustes{margin:0;padding-left:20px}
  .ajustes li{font-size:14px;line-height:1.55;color:#28323f;margin-bottom:8px}
  .disclaimer{margin:12px 0 0;font-size:12px;font-style:italic;color:#7a1f1f}
  .estado{margin:0 0 22px;padding:12px 18px;border-radius:8px;font-size:15px;font-weight:800}
  .estado--ok{background:#e0f2fe;color:#075985;border:1px solid #7dd3fc}
  .estado--fail{background:#fef3c7;color:#854d0e;border:1px solid #fcd34d}
  .score{display:flex;align-items:center;gap:20px;margin:0 0 22px;padding:18px 24px;border-radius:12px;border:2px solid}
  .score-num{font-size:44px;font-weight:900;line-height:1}
  .score-num span{font-size:20px;font-weight:700;opacity:.6}
  .score-txt{display:flex;flex-direction:column;gap:4px}
  .score-txt b{font-size:18px;font-weight:800}
  .score-txt small{font-size:12px;opacity:.85}
  .score--ok{background:#dcfce7;color:#14532d;border-color:#16a34a}
  .score--warn{background:#fef9c3;color:#713f12;border-color:#ca8a04}
  .score--high{background:#ffedd5;color:#7c2d12;border-color:#ea580c}
  .score--crit{background:#fee2e2;color:#7f1d1d;border-color:#dc2626}
  .tbl-scroll{overflow-x:auto}
  table.sweep td,table.sweep th{white-space:nowrap}
  table.sweep tr.best td{background:#dcfce7;font-weight:800;color:#14532d}
  table.sweep tr.best td:first-child{background:#bbf7d0}
  .tbl-cap{margin:10px 0 0;font-size:12px;color:#526273;line-height:1.5}
  .mem-block{margin:0 0 16px}
  .mem-block:last-child{margin-bottom:0}
  .mem-block h3{margin:0 0 8px;font-size:14px;color:#42526a}
  .formulas{padding:12px 14px;border:1px solid #dbe3ef;border-radius:8px;background:#f8fafc}
  .formulas div{font-family:Consolas,monospace;font-size:13px;line-height:1.6;color:#1f2937}
  @media print{body{background:#fff}.page{margin:0;border:0;border-radius:0}.print{display:none}}
</style>
</head>
<body>
  <main class="page">
    <div class="header">
      <div>
        <h1>${this.escapeHtml(a.titulo)}</h1>
        <p class="subtitle">${this.escapeHtml(a.subtitulo)}</p>
      </div>
      <button class="print" onclick="window.print()">Imprimir</button>
    </div>
    <div class="verdict ${operacional ? 'verdict--ok' : 'verdict--fail'}">
      <span>${operacional ? '✔ OPERACIONAL' : '✘ NÃO OPERACIONAL'}</span>
      <small>${operacional
        ? 'Todos os critérios de aceitação foram atendidos para este cenário.'
        : 'Um ou mais critérios de aceitação não foram atendidos — revisar o programa antes de executar.'}</small>
    </div>
    ${scoreHtml}
    ${estadoHtml}
    <section><h2>Por que ${operacional ? 'é operacional' : 'não é operacional'}?</h2>
      <div class="expl">${explicacaoHtml}</div>
    </section>
    ${ajustesHtml}
    ${tabelasHtml}
    <section><h2>Dados do cenário</h2>
      <table><tbody>${cenarioRows.map(r => `<tr><td>${this.escapeHtml(r[0])}</td><td>${this.escapeHtml(r[1])}</td></tr>`).join('')}</tbody></table>
    </section>
    <section><h2>Resultados da simulação</h2>
      <table><tbody>${resultadoRows.map(r => `<tr><td>${this.escapeHtml(r[0])}</td><td>${this.escapeHtml(r[1])}</td></tr>`).join('')}</tbody></table>
    </section>
    <section><h2>Critérios de aceitação</h2>
      <table class="crit"><thead><tr><th>Critério</th><th>Valor simulado</th><th>Limite</th><th>Situação</th></tr></thead>
      <tbody>${criteriosHtml}</tbody></table>
    </section>
    <section><h2>Memória de cálculo</h2>
      ${memoriaHtml}
      <ul class="notes">
        <li>Limiares de free fall (50% da vazão / 10% do volume) são critérios de engenharia ajustáveis; ECD e BHP usam a janela poro × fratura informada no simulador.</li>
        <li>Resultados avaliados em todos os pontos da simulação, da água de frente ao fim ${p.operacao === 'SQUEEZE' ? 'da injeção' : 'do deslocamento'}.</li>
      </ul>
    </section>
  </main>
</body>
</html>`);
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private fmt(v: number | null | undefined, dec = 2): string {
    if (v == null || !Number.isFinite(v)) return '-';
    return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  private dedupe(list: string[]): string[] {
    return [...new Set(list.filter(Boolean))];
  }

  private clamp(v: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, v));
  }

  /** Números únicos (tolerância 1e-6), preservando a ordem. */
  private uniqNum(list: number[]): number[] {
    const out: number[] = [];
    for (const n of list) {
      if (Number.isFinite(n) && !out.some(x => Math.abs(x - n) < 1e-6)) out.push(n);
    }
    return out;
  }

  private toNumber(value: unknown, fallback = 0): number {
    if (value == null || String(value).trim() === '') return fallback;
    const n = Number(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }
}
