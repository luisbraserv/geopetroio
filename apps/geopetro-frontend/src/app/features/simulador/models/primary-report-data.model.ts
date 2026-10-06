export interface PrimaryReportData {
  reportSchemaVersion: 1;
  operation: 'primaria';
  cliente: string;
  clienteLogoNome: string;
  clienteLogoImagem: string;
  preparadoPara: string;
  preparadoPor: string;
  revisadoPor: string;
  documento: string;
  data: string;
  versao: string;
  origem: string;
  poco: string;
  campo: string;
  sonda: string;
  jobNum: string;
  pais: string;
  objetivo: string;
  observacoes: string;
  sequence: {
    preparation: string;
    lineTestPressurePsi: number | null;
    lineTestDurationMin: number | null;
    lineTestReference: string;
    closing: string;
    stepNotes: Record<string, string>;
    laboratoryNotes: Record<string, string>;
  };
  extraSections: { title: string; text: string }[];
}

export function createPrimaryReportData(): PrimaryReportData {
  return { reportSchemaVersion: 1, operation: 'primaria', cliente: '', clienteLogoNome: '',
    clienteLogoImagem: '', preparadoPara: '', preparadoPor: '', revisadoPor: '',
    documento: 'Programa de Cimentação Primária', data: '', versao: '', origem: '', poco: '',
    campo: '', sonda: '', jobNum: '', pais: '', objetivo: '', observacoes: '',
    sequence: { preparation: '', lineTestPressurePsi: null, lineTestDurationMin: null,
      lineTestReference: '', closing: '', stepNotes: {}, laboratoryNotes: {} }, extraSections: [] };
}

/** Usado no banco e no arquivo; valida antes de substituir o estado da tela. */
export function parsePrimaryReportData(value: unknown): PrimaryReportData {
  if (value == null || value === '') return createPrimaryReportData();
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { throw new Error('Dados do relatório inválidos. O original foi preservado.'); }
  }
  const fail = (): never => { throw new Error('Formato dos dados do relatório não reconhecido. O original foi preservado.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const row = value as Record<string, unknown>;
  if (row['operation'] !== undefined && row['operation'] !== 'primaria') return fail();
  if (row['reportSchemaVersion'] !== undefined && row['reportSchemaVersion'] !== 1) return fail();
  if (row['reportSchemaVersion'] === undefined && typeof row['cliente'] !== 'string') return fail();
  const result = createPrimaryReportData();
  for (const key of Object.keys(result) as (keyof PrimaryReportData)[]) {
    if (typeof result[key] !== 'string' || key === 'operation') continue;
    if (row[key] !== undefined) {
      if (typeof row[key] !== 'string') return fail();
      (result as unknown as Record<string, unknown>)[key] = row[key];
    }
  }
  if (result.clienteLogoImagem && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(result.clienteLogoImagem)) return fail();
  if (row['sequence'] !== undefined) {
    const sequence = row['sequence'];
    if (!sequence || typeof sequence !== 'object' || Array.isArray(sequence)) return fail();
    const seq = sequence as Record<string, unknown>;
    for (const key of ['preparation', 'lineTestReference', 'closing'] as const) {
      if (seq[key] !== undefined && typeof seq[key] !== 'string') return fail();
      result.sequence[key] = (seq[key] as string | undefined) ?? '';
    }
    for (const key of ['lineTestPressurePsi', 'lineTestDurationMin'] as const) {
      if (seq[key] != null && (typeof seq[key] !== 'number' || !Number.isFinite(seq[key]) || (seq[key] as number) < 0)) return fail();
      result.sequence[key] = (seq[key] as number | null) ?? null;
    }
    for (const key of ['stepNotes', 'laboratoryNotes'] as const) {
      const notes = seq[key] ?? {};
      if (!notes || typeof notes !== 'object' || Array.isArray(notes) || Object.values(notes).some(v => typeof v !== 'string')) return fail();
      result.sequence[key] = { ...notes } as Record<string, string>;
    }
  }
  if (row['extraSections'] !== undefined) {
    if (!Array.isArray(row['extraSections'])) return fail();
    result.extraSections = row['extraSections'].map((section: unknown) => {
      if (!section || typeof section !== 'object' || !('title' in section) || !('text' in section)
        || typeof section.title !== 'string' || typeof section.text !== 'string') return fail();
      return { title: section.title, text: section.text };
    });
  }
  return result;
}
