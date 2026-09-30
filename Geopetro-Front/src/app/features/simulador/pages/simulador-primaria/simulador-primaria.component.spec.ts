import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SimuladorPrimariaComponent } from './simulador-primaria.component';

afterEach(() => TestBed.resetTestingModule());

function create() {
  const fixture = TestBed.createComponent(SimuladorPrimariaComponent);
  fixture.componentInstance.selectOperationPhase('open');
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance };
}

describe('primary cementing page (P7)', () => {
  it('opens with a calculable example and shows the result as calculated', () => {
    const { component } = create();
    expect(component.geometryIssues().filter(i => i.level === 'error')).toEqual([]);
    expect(component.volumes().valid).toBe(true);
    expect(component.hasBlockingError()).toBe(false);
    const placement = component.volumes().stages[0].placements[0];
    expect(placement.annularBbl).toBeCloseTo(74.100075, 6);
    expect(component.transport()).not.toBeNull();
    expect(component.totalTimeMin()).toBeGreaterThan(0);
  });

  it('moves the cursor without running the engine again', () => {
    const { component } = create();
    const before = component.result();
    component.onCursor(String(component.totalTimeMin() / 2));
    expect(component.result()).toBe(before);
    expect(component.selection().snapshot).not.toBeNull();
  });

  it('pauses playback and rewinds when an input changes', () => {
    const { component } = create();
    component.selectedTimeMin.set(5);
    component.playing.set(true);
    component.phaseForms.at(1).patchValue({ bottomMD: 1600, bottomTVD: 1600, shoeMD: 1600, shoeTVD: 1600 });
    component.onPhaseEdit();
    expect(component.playing()).toBe(false);
    expect(component.selectedTimeMin()).toBe(0);
    expect(component.form().shoeMD).toBe(1600);
  });

  it('keeps the placement interval attached to the target top of cement', () => {
    const { component } = create();
    component.setTargetToc(0, '700');
    expect(component.form().stages[0].placements[0].topMD).toBe(700);
    expect(component.volumes().diagnostics.map(d => d.code)).not.toContain('PRIMARY_PLACEMENT_GAP');
  });

  it('marks a typed density as entered, without erasing the origin of the others', () => {
    const { component } = create();
    component.setFluidDensity('cement', '16.4');
    const cement = component.form().fluids.find(f => f.id === 'cement')!;
    const mud = component.form().fluids.find(f => f.id === 'mud')!;
    expect(cement.densityPpg).toBe(16.4);
    expect(cement.propertySources.densityPpg!.source).toBe('entered');
    expect(mud.propertySources.densityPpg!.source).toBe('estimated');
  });

  it('reorders and repeats program steps from the screen', () => {
    const { component } = create();
    const original = component.form().stages[0].steps.map(s => s.id);
    component.moveStepBy(0, 0, 1);
    expect(component.form().stages[0].steps.map(s => s.id)).not.toEqual(original);
    component.moveStepBy(0, 1, -1);
    expect(component.form().stages[0].steps.map(s => s.id)).toEqual(original);

    component.repeatStepAt(0, 0);
    expect(component.form().stages[0].steps).toHaveLength(original.length + 1);
    expect(component.volumes().diagnostics.map(d => d.code)).not.toContain('PRIMARY_PLACEMENT_FRACTIONS');
  });

  it('keeps the volume mode and the ECD references used by the charts', () => {
    const { component } = create();
    // Ambos continuam no cenário e alimentam o motor, mesmo sem gráfico na tela.
    expect(component.volumeAxis()).toBe('total-pumped');
    component.volumeAxis.set('cement-pumped');
    expect(component.scenario().presentation.volumeAxis).toBe('cement-pumped');

    expect(component.references().map(reference => reference.id)).toEqual(['sapata']);
    component.addReference('900', 'Meio do trecho aberto');
    expect(component.references()).toHaveLength(2);
    const ecd = component.hydraulics()!.points
      .find(point => point.references.length > 0)!.references;
    expect(ecd.map(entry => entry.id)).toContain(component.extraReferences()[0].id);
  });

  it('applies the fluid volume field to the operational program', () => {
    const { component } = create();
    expect(component.fluidProgrammedVolume('spacer')).toBe(0);
    component.setFluidVolume('spacer', '12.5');
    expect(component.fluidProgrammedVolume('spacer')).toBeCloseTo(12.5, 9);
    const spacer = component.form().stages[0].steps.find(step =>
      step.kind === 'pump' && step.fluidId === 'spacer');
    expect(spacer?.kind).toBe('pump');
    expect(component.operationCharts()?.volumes.find(series => series.id === 'spacer')
      ?.points.at(-1)?.volumeBbl).toBeCloseTo(12.5, 9);

    component.setFluidVolume('displacement', '25');
    expect(component.fluidProgrammedVolume('displacement')).toBeCloseTo(25, 9);
    // O fluido inicial e dimensionado pela capacidade do poco e nao aceita sobrescrita.
    const initial = component.fluidProgrammedVolume('mud');
    component.setFluidVolume('mud', '1');
    expect(component.fluidProgrammedVolume('mud')).toBeCloseTo(initial, 9);
  });

  it('adds a pause that costs time without pumping volume', () => {
    const { component } = create();
    const before = component.transport()!;
    component.addPause(0);
    const after = component.transport()!;
    expect(after.totalPumpedBbl).toBeCloseTo(before.totalPumpedBbl, 9);
    expect(after.totalTimeMin).toBeCloseTo(before.totalTimeMin + 10, 9);
    expect(component.volumes().stages[0].steps.some(step => step.kind === 'pause')).toBe(true);
  });

  it('edits the well phases and recomputes the outer wall from them', () => {
    const { component } = create();
    const before = component.volumes().stages[0].placements[0].annularBbl;
    // Aprofundar a sapata do revestimento anterior encurta o trecho aberto.
    component.phasesArray.at(0).patchValue({ bottomMD: 600, bottomTVD: 600, shoeMD: 600, shoeTVD: 600 });
    component.phasesArray.at(1).patchValue({ topMD: 600, topTVD: 600 });
    component.onPhaseEdit();
    const previous = component.result().primary.outerBoundaries.find(b => b.kind === 'previous-casing')!;
    expect(previous.bottomMD).toBe(600);
    // A parede externa mudou, então o volume anular dimensionado também muda.
    expect(component.volumes().stages[0].placements[0].annularBbl).not.toBeCloseTo(before, 6);
  });

  it('adds a second stage above the previous outlet and keeps the program valid', () => {
    const { component } = create();
    component.addStage();
    expect(component.form().stages).toHaveLength(2);
    const second = component.form().stages[1];
    expect(second.outletMD).toBeLessThan(component.form().stages[0].outletMD);
    expect(component.volumes().diagnostics.map(d => d.code)).not.toContain('PRIMARY_STAGE_ORDER');
    // O shoe track continua só no primeiro estágio.
    expect(component.result().primary.stages[1].placements[0].retainedVolumeIds).toEqual([]);
    component.removeStage(1);
    expect(component.form().stages).toHaveLength(1);
  });

  it('refuses to remove the first stage or a fluid the program still uses', () => {
    const { component } = create();
    component.removeStage(0);
    expect(component.form().stages).toHaveLength(1);
    expect(component.fluidInUse('cement')).toBe(true);
    component.removeFluid('cement');
    expect(component.form().fluids.some(f => f.id === 'cement')).toBe(true);
  });

  it('adds a slurry that is removable while nothing references it', () => {
    const { component } = create();
    const before = component.form().fluids.length;
    component.addSlurry();
    const added = component.form().fluids.at(-1)!;
    expect(component.form().fluids).toHaveLength(before + 1);
    expect(component.fluidInUse(added.id)).toBe(false);
    component.removeFluid(added.id);
    expect(component.form().fluids).toHaveLength(before);
  });

  it('recomputes the recipe when the composition changes, keeping the pumped volume', () => {
    const { component } = create();
    const before = component.recipes().placements[0];
    component.setRecipeField('density', '16.4');
    const after = component.recipes().placements[0];
    expect(component.selectedRecipe()!.density).toBe(16.4);
    // Mudar a composição muda o rendimento e os sacos, não o volume bombeado.
    expect(after.pumpedBbl).toBeCloseTo(before.pumpedBbl, 9);
    expect(after.sacks94lb).not.toBeCloseTo(before.sacks94lb, 3);
  });

  it('splits the water between fresh and sea without leaving a gap', () => {
    const { component } = create();
    component.setRecipeField('waterSplitFresh', '70');
    expect(component.selectedRecipe()!.waterSplitFresh).toBe(70);
    expect(component.selectedRecipe()!.waterSplitSea).toBe(30);
  });

  it('adds a catalogue additive that changes the yield, never the pumped volume', () => {
    const { component } = create();
    const before = {
      pumped: component.recipes().placements[0].pumpedBbl,
      planned: component.volumes().stages[0].placements[0].plannedBbl,
      yield: component.recipes().placements[0].yieldFt3PerFt3Cement,
      sacks: component.recipes().placements[0].sacks94lb,
    };
    expect(component.additiveForms.length).toBe(0);

    component.addAditivoCatalogo(component.catalogoAditivos[0]);
    expect(component.additiveForms.length).toBe(1);
    const after = component.recipes().placements[0];
    // Opção A: o volume bombeado e o dimensionado não se mexem.
    expect(after.pumpedBbl).toBeCloseTo(before.pumped, 9);
    expect(component.volumes().stages[0].placements[0].plannedBbl).toBeCloseTo(before.planned, 9);
    // O rendimento muda, e com ele os sacos e as quantidades.
    expect(after.yieldFt3PerFt3Cement).not.toBeCloseTo(before.yield, 6);
    expect(after.sacks94lb).not.toBeCloseTo(before.sacks, 3);
  });

  it('writes the additive into the selected slurry composition only', () => {
    const { component } = create();
    component.addSlurry();
    const other = component.form().fluids.at(-1)!.id;
    component.selectSlurry('cement');
    component.addAditivoCatalogo(component.catalogoAditivos[0]);
    expect(component.form().fluids.find(f => f.id === 'cement')!.recipe!.additivos).toHaveLength(1);
    expect(component.form().fluids.find(f => f.id === other)!.recipe!.additivos).toHaveLength(0);

    // Trocar de pasta troca as linhas editadas, sem misturar as duas.
    component.selectSlurry(other);
    expect(component.additiveForms.length).toBe(0);
    component.selectSlurry('cement');
    expect(component.additiveForms.length).toBe(1);
  });

  it('shows the additive as a row of the placement composition', () => {
    const { component } = create();
    component.addAditivoCatalogo(component.catalogoAditivos[0]);
    const rows = component.recipes().placements[0].rows;
    const name = component.catalogoAditivos[0].name;
    expect(rows.some(row => row.productName === name)).toBe(true);
    // E entra no total por produto, com a sua própria unidade.
    expect(component.recipes().totals.some(total => total.productName === name)).toBe(true);
  });

  it('removes an additive and returns the recipe to what it was', () => {
    const { component } = create();
    const before = component.recipes().placements[0].sacks94lb;
    component.addAditivoCatalogo(component.catalogoAditivos[0]);
    expect(component.recipes().placements[0].sacks94lb).not.toBeCloseTo(before, 3);
    component.removeAditivo(0);
    expect(component.additiveForms.length).toBe(0);
    expect(component.recipes().placements[0].sacks94lb).toBeCloseTo(before, 9);
  });

  it('carries the additives through the portable file', () => {
    const { component } = create();
    component.addAditivoCatalogo(component.catalogoAditivos[0]);
    const json = component.exportarArquivo()!;
    const reopened = create().component;
    reopened.lerArquivo(json);
    reopened.confirmarImportacao();
    expect(reopened.form().fluids.find(f => f.id === 'cement')!.recipe!.additivos).toHaveLength(1);
    expect(reopened.additiveForms.length).toBe(1);
  });

  it('builds 3D overlays with the annulus radial limits and without mud', () => {
    const { component } = create();
    component.onCursor(String(component.totalTimeMin()));
    const overlays = component.overlays();
    expect(overlays.length).toBeGreaterThan(0);
    expect(overlays.every(o => o.label !== 'Lama')).toBe(true);
    const sheath = overlays.find(o => o.zone === 'casing-annulus' && o.type === 'CEMENT')!;
    expect(sheath.outerDiameterIn).toBe(8.5);
    expect(sheath.innerDiameterIn).toBe(7);
  });

  it('previews a CSV, maps a channel and compares it without touching the result', () => {
    const { component } = create();
    const before = component.volumes();
    component.loadCsvText('tempo;retorno\n0;3,0\n10;4,0\n');
    expect(component.csv()!.headers).toEqual(['tempo', 'retorno']);
    component.setCsvDecimal(',');
    expect(component.csv()!.delimiter).toBe(';');
    component.timeColumn.set('tempo');
    component.setChannelColumn('return-rate', 'retorno');
    component.importDataset();
    expect(component.importErrors()).toEqual([]);
    expect(component.datasets()).toHaveLength(1);
    // A prévia é limpa ao incorporar, e o dimensionamento não muda.
    expect(component.csv()).toBeNull();
    expect(component.volumes()).toBe(before);
    const series = component.comparisons()[0].series.find(s => s.series.channelId === 'return-rate')!;
    expect(series.series.points.map(p => p.measured)).toEqual([3, 4]);
  });

  it('keeps previous datasets when an import fails', () => {
    const { component } = create();
    component.loadCsvText('tempo,retorno\n0,3\n');
    component.timeColumn.set('tempo');
    component.setChannelColumn('return-rate', 'retorno');
    component.importDataset();
    expect(component.datasets()).toHaveLength(1);

    component.loadCsvText('tempo,retorno\n0,3\n');
    component.timeColumn.set('tempo');
    // Sem canal mapeado a importação é recusada.
    component.importDataset();
    expect(component.importErrors().length).toBeGreaterThan(0);
    expect(component.datasets()).toHaveLength(1);
  });

  it('shifts the comparison by the offset without rewriting the samples', () => {
    const { component } = create();
    component.loadCsvText('tempo,retorno\n0,3\n');
    component.timeColumn.set('tempo');
    component.setChannelColumn('return-rate', 'retorno');
    component.importDataset();
    const id = component.datasets()[0].id;
    component.setDatasetOffset(id, '5');
    expect(component.datasets()[0].samples[0].timeMin).toBe(0);
    const series = component.comparisons()[0].series[0].series;
    expect(series.points[0].timeMin).toBe(5);
  });

  it('removes a dataset without changing the program', () => {
    const { component } = create();
    component.loadCsvText('tempo,retorno\n0,3\n');
    component.timeColumn.set('tempo');
    component.setChannelColumn('return-rate', 'retorno');
    component.importDataset();
    const steps = component.form().stages[0].steps;
    component.removeDataset(component.datasets()[0].id);
    expect(component.datasets()).toEqual([]);
    expect(component.form().stages[0].steps).toBe(steps);
  });

  it('round-trips the whole scenario through the portable file', () => {
    const { component } = create();
    component.loadCsvText('tempo,retorno\n0,3\n5,4\n');
    component.timeColumn.set('tempo');
    component.setChannelColumn('return-rate', 'retorno');
    component.importDataset();
    component.setTargetToc(0, '650');
    component.volumeAxis.set('cement-pumped');
    component.addReference('900', 'Meio');
    const before = {
      toc: component.form().stages[0].targetTocMD,
      annular: component.volumes().stages[0].placements[0].annularBbl,
      samples: component.datasets()[0].samples.length,
      axis: component.volumeAxis(),
      references: component.references().length,
    };

    const json = component.exportarArquivo()!;
    expect(json).toBeTruthy();
    // Reabrir do zero: nova instância, estado padrão, depois o arquivo.
    const reopened = create().component;
    expect(reopened.form().stages[0].targetTocMD).not.toBe(before.toc);
    reopened.lerArquivo(json);
    expect(reopened.importSummary()!.measurements).toBe(1);
    reopened.confirmarImportacao();
    expect(reopened.form().stages[0].targetTocMD).toBe(before.toc);
    expect(reopened.volumes().stages[0].placements[0].annularBbl).toBeCloseTo(before.annular, 9);
    expect(reopened.datasets()[0].samples).toHaveLength(before.samples);
    expect(reopened.volumeAxis()).toBe(before.axis);
    expect(reopened.references()).toHaveLength(before.references);
  });

  it('keeps the open scenario untouched when the file is invalid', () => {
    const { component } = create();
    const toc = component.form().stages[0].targetTocMD;
    component.lerArquivo('{ not json');
    expect(component.importSummary()).toBeNull();
    expect(component.scenarioMessage()).toBeTruthy();
    expect(component.form().stages[0].targetTocMD).toBe(toc);

    component.lerArquivo(JSON.stringify({ kind: 'geopetro-squeeze-scenario', exportVersion: 1 }));
    expect(component.scenarioMessage()).toContain('primária');
    expect(component.form().stages[0].targetTocMD).toBe(toc);
  });

  it('shows the summary before anything is adopted, and cancel discards it', () => {
    const { component } = create();
    const json = component.exportarArquivo()!;
    const other = create().component;
    other.setTargetToc(0, '400');
    const toc = other.form().stages[0].targetTocMD;
    other.lerArquivo(json);
    // Só o resumo apareceu: a tela ainda não mudou.
    expect(other.importSummary()).not.toBeNull();
    expect(other.form().stages[0].targetTocMD).toBe(toc);
    other.cancelarImportacao();
    expect(other.importSummary()).toBeNull();
    expect(other.form().stages[0].targetTocMD).toBe(toc);
  });

  it('marks the scenario as unsaved after an edit', () => {
    const { component } = create();
    expect(component.saveState().status).toBe('unsaved');
    component.setField('shoeMD', '1550');
    expect(component.saveState().status).toBe('unsaved');
    expect(component.saveState().scenarioId).toBeNull();
  });

  it('builds a scenario that carries geometry, program, measurements and presentation', () => {
    const { component } = create();
    const scenario = component.scenario();
    expect(scenario.operation).toBe('primaria');
    expect(scenario.schemaVersion).toBe(2);
    expect(scenario.engineVersion).toBeNull();
    expect(scenario.fases.length).toBeGreaterThan(0);
    expect(scenario.primary.stages).toHaveLength(1);
    expect(scenario.presentation.volumeAxis).toBe('total-pumped');
  });

  it('draws the schematic from the selected instant, with cement outside the casing', () => {
    const { component } = create();
    component.onCursor(String(component.totalTimeMin()));
    const state = component.schematicState();
    expect(state.snapshot).not.toBeNull();
    expect(state.target!.shoeMD).toBe(1500);
    const annularCement = state.snapshot!.parcels
      .filter(p => p.zone === 'casing-annulus' && p.fluidId === 'cement');
    expect(annularCement.length).toBeGreaterThan(0);
  });
});
