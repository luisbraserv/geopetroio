import { formatDepth } from '../models/depth-unit';
import type { PrimaryReportData } from '../models/primary-report-data.model';
import type { PrimaryReportInput, PrimaryReportSection } from './primary-report';
import { primaryRecipeCode, primaryRecipeQuantity } from './primary-recipe-presentation';

const n = (value: number | null | undefined, digits = 2): string =>
  value != null && Number.isFinite(value) ? value.toLocaleString('pt-BR', { maximumFractionDigits: digits }) : 'Não informado';

export function primaryRecipeSections(input: PrimaryReportInput): PrimaryReportSection[] {
  return input.recipes.placements.map(recipe => {
    const fluid = input.primary.fluids.find(f => f.id === recipe.fluidId);
    const stage = input.primary.stages.find(s => s.id === recipe.stageId);
    const placement = input.volumes.stages.find(s => s.stageId === recipe.stageId)?.placements.find(p => p.placementId === recipe.placementId);
    return {
      id: `receita-${recipe.stageId}-${recipe.placementId}`,
      title: `Receita — ${fluid?.name ?? recipe.fluidId} · ${stage?.name ?? recipe.stageId}`,
      rows: [
        { label: 'Colocação', value: recipe.placementId },
        { label: 'Classe de cimento', value: fluid?.recipe?.cementClass || 'Não informada' },
        { label: 'Densidade utilizada / alvo da composição', value: `${n(fluid?.densityPpg)} / ${n(fluid?.recipe?.density)} ppg` },
        { label: 'Origem dos parâmetros da receita', value: recipe.parameterSource === 'manual' ? 'Informados manualmente' : 'Calculados pela composição' },
        { label: 'Base de cálculo', value: 'Receita base por 1 ft³ de cimento / saco de 94 lb; quantidades para o volume preparado' },
        { label: 'Volume dimensionado / reserva extra', value: `${n(placement?.plannedBbl)} / ${n(placement?.reserveExtraBbl)} bbl` },
        { label: 'Bombeio / reserva de mistura / preparado', value: `${n(recipe.pumpedBbl)} / ${n(placement?.mixingReserveBbl)} / ${n(recipe.preparedBbl)} bbl` },
        { label: 'Rendimento', value: recipe.error ? 'Indisponível' : `${n(recipe.yieldFt3PerFt3Cement, 4)} ft³/ft³ cimento` },
        { label: 'FAC / FAM', value: recipe.error ? 'Indisponível' : `${n(recipe.facGpc)} / ${n(recipe.famGpc)} gal/ft³ cimento` },
        { label: 'Sacos calculados / suprimento', value: recipe.error ? 'Indisponível' : `${n(recipe.sacks94lb)} / ${n(recipe.supplySacks94, 0)} sacos de 94 lb` },
        { label: 'Água de mistura', value: recipe.error ? 'Indisponível' : `${n(recipe.mixWaterGal)} gal` },
      ],
      table: { headers: ['Produto', 'Código / origem', 'Concentração', 'Base calculada (94 lb)', 'Quantidade'],
        rows: recipe.error ? [] : recipe.rows.map(row => {
          const base = primaryRecipeQuantity(row);
          const total = primaryRecipeQuantity(row, true);
          return [row.productName, primaryRecipeCode(row, fluid?.recipe),
            row.concentration === 'base' ? row.concentrationUnit : `${row.concentration} ${row.concentrationUnit}`,
            `${n(base.value, 3)} ${base.unit}`, `${n(total.value)} ${total.unit}`];
        }) },
      notes: [recipe.error || 'Reserva de mistura e arredondamento de suprimento não alteram o volume bombeado.',
        ...(recipe.parameterSource === 'manual' ? ['A base calculada mostra a composição do simulador; as quantidades para preparo usam o rendimento, FAC e FAM informados manualmente.'] : [])],
    };
  });
}

/** Trecho de um passo da sequência; `strong` são os números e nomes que se conferem na operação. */
export interface PrimarySequencePart { text: string; strong?: boolean }
export interface PrimarySequenceItem {
  /** `stage` abre um estágio; `step` é um passo do programa; `text` vem do usuário. */
  kind: 'text' | 'stage' | 'step';
  parts: PrimarySequencePart[];
  /** Quadro embutido no passo, como a receita no preparo da pasta. */
  table?: { headers: string[]; rows: string[][] };
  note?: string;
}

export const primarySequenceText = (item: PrimarySequenceItem): string =>
  item.parts.map(part => part.text).join('') + (item.note ? ` Observação: ${item.note}` : '');

const TOOL_ACTIONS: Record<string, string> = { 'launch-bottom': 'Lançar plugue inferior', 'launch-top': 'Lançar plugue superior',
  'launch-dart': 'Lançar dardo', 'open-stage': 'Abrir ferramenta de estágio', 'close-stage': 'Fechar ferramenta de estágio',
  'launch-closing-plug': 'Lançar plugue de fechamento' };

/**
 * Sequência operacional como no relatório do squeeze e do tampão: passos numerados em
 * linguagem de operação, com volumes, vazões e densidades em destaque e a receita no
 * preparo da pasta. Números vêm do programa, nunca de campos documentais independentes.
 */
export function primaryOperationalSequenceItems(input: PrimaryReportInput, data: PrimaryReportData): PrimarySequenceItem[] {
  const items: PrimarySequenceItem[] = [];
  const b = (text: string): PrimarySequencePart => ({ text, strong: true });
  const t = (text: string): PrimarySequencePart => ({ text });
  const fluidOf = (id: string) => input.primary.fluids.find(f => f.id === id);
  const ppg = (id: string) => { const d = fluidOf(id)?.densityPpg; return d != null && Number.isFinite(d) ? ` (${n(d)} ppg)` : ''; };
  if (data.sequence.preparation.trim()) items.push({ kind: 'text', parts: [t(data.sequence.preparation.trim())] });
  if (data.sequence.lineTestPressurePsi !== null || data.sequence.lineTestDurationMin !== null)
    items.push({ kind: 'step', parts: [t('Realizar teste de linhas com '), b(`${n(data.sequence.lineTestPressurePsi)} psi`),
      t(' por '), b(`${n(data.sequence.lineTestDurationMin)} min`),
      t(`. Referência: ${data.sequence.lineTestReference || 'Não informada'}.`)] });
  for (const stage of input.primary.stages) {
    items.push({ kind: 'stage', parts: [b(stage.name), t(': TOC alvo '), b(`${formatDepth(stage.targetTocMD, input.depthUnit)} MD`),
      t('; saída ativa a '), b(`${formatDepth(stage.outletMD, input.depthUnit)} MD`), t('.')] });
    for (const recipe of input.recipes.placements.filter(r => r.stageId === stage.id)) {
      const fluid = fluidOf(recipe.fluidId);
      const name = fluid?.name ?? recipe.fluidId;
      if (recipe.error) {
        items.push({ kind: 'step', parts: [t('Preparação de '), b(name), t(`: receita indisponível — ${recipe.error}`)] });
        continue;
      }
      items.push({ kind: 'step', parts: [t('Preparar '), b(`${n(recipe.preparedBbl)} bbl`), t(' de '), b(name + ppg(recipe.fluidId)),
        t(', com '), b(`${n(recipe.sacks94lb)} sacos`), t(' de 94 lb e '), b(`${n(recipe.mixWaterGal)} gal`),
        t(' de água de mistura, de acordo com o quadro abaixo;')],
        table: { headers: ['Produto', 'Código / origem', 'Concentração', 'Quantidade'],
          rows: recipe.rows.map(row => {
            const total = primaryRecipeQuantity(row, true);
            return [row.productName, primaryRecipeCode(row, fluid?.recipe),
              row.concentration === 'base' ? row.concentrationUnit : `${row.concentration} ${row.concentrationUnit}`,
              `${n(total.value)} ${total.unit}`];
          }) } });
    }
    const resolved = input.volumes.stages.find(s => s.stageId === stage.id);
    for (const step of stage.steps) {
      const quantity = resolved?.steps.find(s => s.stepId === step.id);
      let parts: PrimarySequencePart[];
      if (step.kind === 'pump') {
        const fluid = fluidOf(step.fluidId);
        const name = b((fluid?.name ?? step.fluidId) + ppg(step.fluidId));
        const volume = b(`${n(quantity?.volumeBbl)} bbl`);
        const rate = [t(' @ '), b(`${n(step.rateBpm)} bpm`), t(` (≈ ${n(quantity?.durationMin, 1)} min)`)];
        const basis = quantity?.preflush;
        const calculated = basis && basis.overrideBbl === null
          ? [t(basis.governing === 'contact' ? `; volume calculado para ${n(basis.contactTimeMin, 1)} min de contato`
            : `; volume calculado para ${n(basis.annularLengthM, 1)} m de anular`)] : [];
        parts = fluid?.kind === 'cement' ? [t('Misturar e bombear '), volume, t(' de '), name, ...rate, t(';')]
          : fluid?.kind === 'displacement' ? [t('Deslocar com '), volume, t(' de '), name, ...rate, t(';')]
          : [t('Bombear '), volume, t(' de '), name, ...rate, ...calculated, t(';')];
      } else if (step.kind === 'pause') {
        parts = [t('Parar o bombeio por '), b(`${n(step.durationMin)} min`), t(';')];
      } else {
        const device = input.primary.devices.find(d => d.id === step.deviceId);
        parts = [b(TOOL_ACTIONS[step.action] ?? step.action), t(` (${device?.name ?? step.deviceId});`)];
      }
      const comment = data.sequence.stepNotes[step.id];
      items.push({ kind: 'step', parts, ...(comment ? { note: comment } : {}) });
    }
  }
  for (const fluid of input.primary.fluids.filter(f => f.kind === 'cement')) {
    const note = data.sequence.laboratoryNotes[fluid.id];
    if (note) items.push({ kind: 'text', parts: [b(`Informações de laboratório — ${fluid.name}: `), t(note)] });
  }
  if (data.sequence.closing.trim()) items.push({ kind: 'text', parts: [t(data.sequence.closing.trim())] });
  return items;
}

/** A mesma sequência em texto corrido, para a prévia da tela. */
export function primaryOperationalSequence(input: PrimaryReportInput, data: PrimaryReportData): string[] {
  return primaryOperationalSequenceItems(input, data).map(primarySequenceText);
}
