import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimuladorSqueezeComponent } from './simulador-squeeze/simulador-squeeze.component';
import { SimuladorTampaoComponent } from './simulador-tampao/simulador-tampao.component';
import { RetiradaTubosReportService } from '../services/retirada-tubos-report.service';
import { RelatorioBuilderService } from '../components/relatorio/relatorio-builder.service';
import { RelatorioCapaData } from '../components/relatorio/relatorio-capa-modal.component';
import { BBL_M } from '../models/constantes';
import { FormBuilder } from '@angular/forms';
import { createTrajectoryForm } from '../models/well-trajectory.form';
import { PocoApi, scenarioForm, scenarioPayload } from '../models/poco.model';

for (const component of [SimuladorSqueezeComponent, SimuladorTampaoComponent]) {
  describe(component.name + ' — geometria inválida', () => {
    let page: SimuladorSqueezeComponent | SimuladorTampaoComponent;
    const result = () => page instanceof SimuladorSqueezeComponent ? page.geom : page.plug;

    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({
        providers: [component, { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn() } }],
      });
      page = TestBed.inject(component as typeof SimuladorSqueezeComponent);
      page.ngOnInit();
      page.selectOperationPhase('phase-2');
      expect(result()).not.toBeNull();
    });

    afterEach(() => {
      page?.ngOnDestroy();
      TestBed.resetTestingModule();
      vi.restoreAllMocks();
      localStorage.clear();
    });

    it('starts with a valid surface phase followed by the operation phase', () => {
      const phases = page.form.getRawValue().fases;
      expect(phases).toHaveLength(2);
      expect(phases[0]).toMatchObject({
        id: 'phase-1', name: 'Superfície', type: 'SURFACE',
        topMD: 0, bottomMD: 300, topTVD: 0, bottomTVD: 300,
        holeDiameterIn: 17.5, casingOD: 13.375, casingID: 12.415,
        shoeMD: 300, shoeTVD: 300,
      });
      expect(phases[1]).toMatchObject({
        id: 'phase-2', topMD: 300, bottomMD: 1500, topTVD: 300, bottomTVD: 1500,
        holeDiameterIn: 8.535,
        ...(page instanceof SimuladorSqueezeComponent
          ? { name: 'Produção', type: 'PRODUCTION', casingOD: 5.5, casingID: 4.778 }
          : { name: 'Poço aberto', type: 'OPEN_HOLE', casingOD: null, casingID: null }),
      });
      expect(page.wellIssues).toEqual([]);
      expect(page.operationIssues).toEqual([]);
      expect(page.hydraulicSim).not.toBeNull();
    });

    it('recovers after the operation phase hole is enlarged to fit its casing, independently of the surface diameter', () => {
      const surface = structuredClone(page.fases.at(0).getRawValue());
      const bottomPhase = page.fases.at(page.fases.length - 1);
      bottomPhase.patchValue({
        type: 'PRODUCTION', casingOD: 9.625, casingID: 8.835,
        shoeMD: 1500, shoeTVD: 1500,
      }, { emitEvent: false });
      page.simulate();
      expect(page.wellIssues.some(issue => issue.code === 'CASING_OD_GT_HOLE' && issue.phaseId === 'phase-2')).toBe(true);
      expect(result()).toBeNull();
      expect(page.hydraulicSim).toBeNull();

      bottomPhase.patchValue({ holeDiameterIn: 12.25 }, { emitEvent: false });
      page.simulate();
      expect(page.wellIssues).toEqual([]);
      expect(result()).not.toBeNull();
      expect(page.hydraulicSim).not.toBeNull();
      expect(page.fases.at(0).getRawValue()).toEqual(surface);
      expect(page.form.getRawValue()).toMatchObject(page instanceof SimuladorSqueezeComponent
        ? { caliper: 12.25, casingOD: 9.625, casingID: 8.835 }
        : { holeID: 8.835 });

      page.fases.at(0).patchValue({ holeDiameterIn: 20 }, { emitEvent: false });
      page.simulate();
      expect(result()).not.toBeNull();
      expect(page.form.getRawValue()).toMatchObject(page instanceof SimuladorSqueezeComponent
        ? { caliper: 12.25, casingOD: 9.625, casingID: 8.835 }
        : { holeID: 8.835 });
    });

    it('restores a legacy single phase without adding the new default surface phase', () => {
      const legacy = structuredClone(page.form.getRawValue());
      legacy.fases = [{
        ...legacy.fases[legacy.fases.length - 1],
        id: 'legacy-single', name: 'Fase única', type: 'PRODUCTION', topMD: 0, topTVD: 0,
      }];
      delete legacy.selectedPhaseId;
      page.onCarregarEstado(legacy);
      expect(result()).toBeNull();
      page.selectOperationPhase('legacy-single');
      expect(page.fases.getRawValue()).toEqual(legacy.fases);
      expect(page.wellGeometry!.phases).toHaveLength(1);
      expect(page.wellGeometry!.phases[0].id).toBe('legacy-single');
      expect(page.wellIssues).toEqual([]);
      expect(result()).not.toBeNull();
      expect(page.hydraulicSim).not.toBeNull();
    });

    it('warns about engineering relations without blocking results or the report, and clears warnings on scenario load', () => {
      const original = structuredClone(page.form.getRawValue());
      page.form.patchValue({ fracGrad: 8, poreGrad: 9, displacementWeight: 20 }, { emitEvent: false });
      page.simulate();
      expect(page.engineeringIssues.map(i => i.code)).toEqual(expect.arrayContaining([
        'FRACTURE_PORE_ORDER', 'SLURRY_DISPLACEMENT_DENSITY',
      ]));
      expect(page.engineeringIssues.every(i => i.level === 'warning')).toBe(true);
      expect(result()).not.toBeNull();
      expect(page.hydraulicSim).not.toBeNull();
      expect(page.recipe).not.toBeNull();
      page.openCapaModal();
      expect(page.capaModalOpen).toBe(true);
      expect(page.form.getRawValue().fracGrad).toBe(8);
      page.onCarregarEstado(original);
      expect(page.engineeringIssues).toEqual([]);
      expect(result()).not.toBeNull();
    });

    it('removes stale engineering warnings when geometry becomes invalid', () => {
      page.form.patchValue({ fracGrad: 8 }, { emitEvent: false });
      page.simulate();
      expect(page.engineeringIssues.length).toBeGreaterThan(0);
      page.form.patchValue({ operacaoBaseMD: 1800 }, { emitEvent: false });
      page.simulate();
      expect(page.engineeringIssues).toEqual([]);
      expect(result()).toBeNull();
    });

    if (component === SimuladorSqueezeComponent) {
      it('warns when the actual hydraulic reference lies between two perforations', () => {
        const squeeze = page as SimuladorSqueezeComponent;
        squeeze.perforacoes.clear({ emitEvent: false });
        for (const [top, base] of [[1400, 1420], [1460, 1480]]) {
          squeeze.perforacoes.push(TestBed.inject(FormBuilder).group({ top, base }), { emitEvent: false });
        }
        squeeze.simulate();
        expect(squeeze.hydraulicSim!.summary.referenceMD).toBe(1440);
        expect(squeeze.engineeringIssues.map(i => i.code)).toContain('SQUEEZE_REFERENCE_OUTSIDE_PERFORATIONS');
        squeeze.perforacoes.at(0).patchValue({ base: 1440 }, { emitEvent: false });
        squeeze.simulate();
        expect(squeeze.engineeringIssues.map(i => i.code)).not.toContain('SQUEEZE_REFERENCE_OUTSIDE_PERFORATIONS');
      });
    }

    it('reuses shared well geometry, preserves operation data and clears the reference on legacy load', () => {
      const legacy = JSON.parse(JSON.stringify(page.form.getRawValue()));
      const poco: PocoApi = { id: 4, nome: 'Poço A', version: 0, geometria: page.pocoGeometry, atualizadoPor: 'ana', atualizadoEm: '' };
      page.manualVolumeBbl = 20;
      page.setDepthUnit('ft');
      page.applyPoco(poco);
      page.selectOperationPhase('phase-2');
      expect(page.form.getRawValue().operacaoTopoMD).toBe(legacy.operacaoTopoMD);
      expect(page.manualVolumeBbl).toBe(20);
      expect(page.dadosRelatorio.poco).toBe('Poço A');
      const payload = scenarioPayload({ ...page.form.getRawValue(), _poco: page.poco });
      expect(JSON.parse(payload.formValue).fases).toBeUndefined();
      const geometry = structuredClone(poco.geometria);
      geometry.wellFinalTVD = 1200;
      for (const phase of geometry.fases) {
        phase.topTVD = phase.topMD! * 0.8;
        phase.bottomTVD = phase.bottomMD! * 0.8;
        if (phase.shoeMD != null) phase.shoeTVD = phase.shoeMD * 0.8;
      }
      page.onCarregarEstado(scenarioForm({ formValue: payload.formValue, poco: { ...poco, version: 1, geometria: geometry } }));
      expect(page.wellGeometry!.finalTVD).toBe(1200);
      expect(page.hydraulicSim!.summary.referenceTVD).toBeCloseTo(page.hydraulicSim!.summary.referenceMD * 0.8, 9);
      expect(page.depthUnit).toBe('ft');
      page.onCarregarEstado(legacy);
      expect(page.poco).toBeNull();
      expect(page.wellGeometry!.finalTVD).toBe(1500);
    });

    it('changes display units without recalculation and restores scenarios as metres while viewing feet', () => {
      const snapshot = JSON.parse(JSON.stringify(page.form.getRawValue()));
      const simulation = page.hydraulicSim;
      const geometry = result();
      const simulate = vi.spyOn(page, 'simulate');
      const changes = vi.fn();
      page.form.valueChanges.subscribe(changes);
      page.setDepthUnit('ft');
      expect(page.fmtDepth(304.8, 1)).toBe('1.000,0');
      expect(page.fmtCapacity(1, 4)).toBe('0,3048');
      expect(page.form.getRawValue()).toEqual(snapshot);
      expect(page.hydraulicSim).toBe(simulation);
      expect(result()).toBe(geometry);
      expect(simulate).not.toHaveBeenCalled();
      expect(changes).not.toHaveBeenCalled();
      page.onCarregarEstado(snapshot);
      expect(page.depthUnit).toBe('ft');
      expect(page.form.getRawValue()).toEqual(snapshot);
      expect(page.wellGeometry!.finalMD).toBe(snapshot.wellFinalMD);
      page.setDepthUnit('m');
      expect(page.fmtDepth(304.8, 1)).toBe('304,8');
    });

    it('clears a previous simulation when a required phase depth is erased, and recovers after correction', () => {
      const originalBottomTVD = page.fases.at(0).value.bottomTVD;
      page.fases.at(0).patchValue({ bottomTVD: null }, { emitEvent: false });
      page.simulate();
      expect(page.wellIssues.some(issue => issue.code === 'PHASE_DEPTH_INVALID')).toBe(true);
      expect(result()).toBeNull();
      expect(page.slurry).toBeNull();
      expect(page.recipe).toBeNull();
      expect(page.hydraulicSim).toBeNull();
      expect(page.wellOverlays).toEqual([]);
      // Tampão e squeeze trocaram o gráfico do cronograma pela tabela (SPEC squeeze-tampao S4 e S7).
      expect(page.cronograma).toEqual([]);
      page.fases.at(0).patchValue({ bottomTVD: originalBottomTVD }, { emitEvent: false });
      page.simulate();
      expect(result()).not.toBeNull();
      expect(page.wellIssues).toEqual([]);
    });

    it('uses geometry TVD in the hydraulic simulation and sensitivity runs', () => {
      for (const phase of page.fases.controls) {
        phase.patchValue({
          topTVD: phase.value.topMD * 0.8,
          bottomTVD: phase.value.bottomMD * 0.8,
          ...(phase.value.shoeMD != null ? { shoeTVD: phase.value.shoeMD * 0.8 } : {}),
        }, { emitEvent: false });
      }
      page.form.patchValue({ wellFinalTVD: 1200 }, { emitEvent: false });
      page.simulate();
      expect(page.hydraulicSim).not.toBeNull();
      const sim = page.hydraulicSim!;
      expect(sim.summary.referenceTVD).toBeCloseTo(sim.summary.referenceMD * 0.8, 9);
      const varied = (page as any).reSimulateHidraulica({ rateFactor: 0.5 });
      expect(varied.summary.referenceTVD).toBeCloseTo(sim.summary.referenceTVD, 9);
      expect(varied.summary.totalTimeMin).toBeGreaterThan(sim.summary.totalTimeMin);
    });

    it('blocks an oversized work string and missing geometry above the operation', () => {
      page.form.patchValue(page instanceof SimuladorSqueezeComponent
        ? { tubingOD: 20 } : { pipeOD: 20 }, { emitEvent: false });
      page.simulate();
      expect(page.operationIssues.some(issue => issue.code === 'WORK_STRING_FIT')).toBe(true);
      expect(result()).toBeNull();
      page.form.patchValue(page instanceof SimuladorSqueezeComponent
        ? { tubingOD: 2.875 } : { pipeOD: 3.5 }, { emitEvent: false });
      page.fases.at(0).patchValue({ topMD: 100, topTVD: 100 }, { emitEvent: false });
      page.simulate();
      expect(page.operationIssues.some(issue => issue.code === 'WORK_STRING_GAP')).toBe(true);
      expect(result()).toBeNull();
    });

    it('saves and restores survey while retaining the manual TVD for legacy mode', () => {
      const legacy = structuredClone(page.form.getRawValue());
      delete legacy.trajectory;
      page.form.setControl('trajectory', createTrajectoryForm(TestBed.inject(FormBuilder), {
        enabled: true, stations: [
          { md: 0, inclinationDeg: 0, azimuthDeg: 0 },
          { md: 1500, inclinationDeg: 90, azimuthDeg: 0 },
        ],
      }), { emitEvent: false });
      page.simulate();
      expect(result()).not.toBeNull();
      expect(page.wellGeometry!.finalTVD).toBeCloseTo(3000 / Math.PI, 8);
      expect(page.form.getRawValue().wellFinalTVD).toBe(1500);
      const md = page.hydraulicSim!.summary.referenceMD;
      expect(page.hydraulicSim!.summary.referenceTVD).toBeCloseTo(
        (3000 / Math.PI) * Math.sin(md * Math.PI / 3000), 8);
      const saved = JSON.parse(JSON.stringify(page.form.getRawValue()));
      page.trajectoryForm.patchValue({ enabled: false }, { emitEvent: false });
      page.simulate();
      expect(page.wellGeometry!.finalTVD).toBe(1500);
      page.onCarregarEstado(saved);
      expect(page.trajectoryForm.value.enabled).toBe(true);
      expect(page.wellGeometry!.finalTVD).toBeCloseTo(3000 / Math.PI, 8);
      expect(result()).not.toBeNull();
      page.onCarregarEstado(legacy);
      expect(page.trajectoryForm.value.enabled).toBe(false);
      expect(page.trajectoryForm.value.stations).toEqual([]);
      expect(page.wellGeometry!.finalTVD).toBe(1500);
    });

    it('blocks incomplete survey and recovers when the station reaches the bottom', () => {
      page.form.setControl('trajectory', createTrajectoryForm(TestBed.inject(FormBuilder), {
        enabled: true, stations: [
          { md: 0, inclinationDeg: 0, azimuthDeg: 0 },
          { md: 500, inclinationDeg: 30, azimuthDeg: 0 },
        ],
      }), { emitEvent: false });
      page.simulate();
      expect(page.wellIssues.some(i => i.code === 'SURVEY_INVALID')).toBe(true);
      expect(result()).toBeNull();
      page.openCapaModal();
      expect(page.capaModalOpen).toBe(false);
      page.trajectoryForm.get('stations.1.md')!.setValue(1500, { emitEvent: false });
      page.simulate();
      expect(result()).not.toBeNull();
      expect(page.wellIssues).toEqual([]);
    });

    it('does not substitute zero for a missing operation top', () => {
      page.form.patchValue({ operacaoTopoMD: null }, { emitEvent: false });
      page.simulate();
      expect(page.operationIssues.some(issue => issue.code === 'INTERVAL_INVALID')).toBe(true);
      expect(result()).toBeNull();
    });

    it.each([false, true])('only publishes captured charts if the form stays unchanged (changed=%s)', async changed => {
      const builder = TestBed.inject(RelatorioBuilderService);
      const openReport = vi.spyOn(builder, 'openInNewTab').mockImplementation(() => {});
      vi.spyOn(builder, 'buildCapa').mockReturnValue('<html></html>');
      vi.spyOn(page as any, 'captureGraficosImages').mockResolvedValue([]);
      page.onCapaGerada({} as RelatorioCapaData);
      if (changed) page.form.patchValue({ operacaoBaseMD: null }, { emitEvent: false });
      await Promise.resolve();
      expect(openReport).toHaveBeenCalledTimes(changed ? 0 : 1);
    });

    it('blocks reports immediately, even before the form debounce fires', () => {
      const openReport = vi.spyOn(TestBed.inject(RelatorioBuilderService), 'openInNewTab').mockImplementation(() => {});
      const withdrawal = vi.spyOn(TestBed.inject(RetiradaTubosReportService), 'abrirRetirada').mockImplementation(() => {});
      page.form.patchValue({ operacaoBaseMD: 1800 });
      page.openCapaModal();
      page.gerarCalculoRetiradaTubos();
      page.gerarRelatorioConformidade('bhp');
      expect(page.capaModalOpen).toBe(false);
      expect(result()).toBeNull();
      expect(openReport).not.toHaveBeenCalled();
      expect(withdrawal).not.toHaveBeenCalled();
    });
  });
}

describe('Squeeze — integração da geometria', () => {
  it('retains the preceding path while limiting the operation and withdrawal recipe to the selected phase', () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [SimuladorSqueezeComponent, { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn() } }],
    });
    const page = TestBed.inject(SimuladorSqueezeComponent);
    try {
      page.ngOnInit();
      page.onCarregarEstado({
        ...page.form.getRawValue(),
        fases: [
          {
            id: 'cased', name: 'Revestido', type: 'SURFACE',
            topMD: 0, bottomMD: 1000, topTVD: 0, bottomTVD: 1000, holeDiameterIn: 12.25,
            casingOD: 9.625, casingID: 8.835, shoeMD: 1000, shoeTVD: 1000,
          },
          {
            id: 'open', name: 'Poço aberto', type: 'OPEN_HOLE',
            topMD: 1000, bottomMD: 1500, topTVD: 1000, bottomTVD: 1500, holeDiameterIn: 8.5,
            casingOD: null, casingID: null, shoeMD: null, shoeTVD: null,
          },
        ],
      });
      page.selectOperationPhase('open');
      page.form.patchValue({ operacaoTopoMD: 950, operacaoBaseMD: 1050 }, { emitEvent: false });
      page.simulate();
      expect(page.operationIssues.some(i => i.code === 'OPERATION_OUTSIDE_SELECTED_PHASE')).toBe(true);
      expect(page.geom).toBeNull();
      page.form.patchValue({ operacaoTopoMD: 1000, operacaoBaseMD: 1100 }, { emitEvent: false });
      page.perforacoes.at(0).patchValue({ top: 1010, base: 1040 }, { emitEvent: false });
      page.cementVolumeSource = 'receita';
      page.manualVolumeBbl = 5;
      page.simulate();
      expect(page.wellIssues).toEqual([]);
      // O tampão do intervalo é o bombeado; os 2 bbl a injetar saem dele (SPEC squeeze-tampao §2.1).
      expect(page.geom!.slurryTotal).toBeCloseTo(BBL_M * 100 * 8.5 ** 2, 9);
      expect(page.geom!.slurryPhysicalVolumeBbl).toBeCloseTo(BBL_M * 100 * 8.5 ** 2 - 2, 9);
      // Antes da injeção o tampão enche o intervalo; depois, o topo desce os 2 bbl injetados.
      expect(page.geom!.topCementAfterPullMD).toBeCloseTo(1000, 9);
      expect(page.geom!.topCementAfterInjectionMD).toBeCloseTo(1000 + 2 / (BBL_M * 8.5 ** 2), 9);
      // "Volume de pasta" é o bombeado: os 5 bbl já contam os 2 bbl a injetar.
      const manualTop = 1100 - 5 / (BBL_M * 8.5 ** 2);
      expect(page.schematicGeom!.topCementAfterPullMD).toBeCloseTo(manualTop, 9);
      expect(page.wellOverlays.find(o => o.type === 'CEMENT')?.topMD).toBe(page.schematicGeom!.topCementImmersedMD);
      const withdrawal = vi.spyOn(TestBed.inject(RetiradaTubosReportService), 'abrirRetirada').mockImplementation(() => {});
      const reverse = vi.spyOn(TestBed.inject(RetiradaTubosReportService), 'abrirCirculacaoReversa').mockImplementation(() => {});
      page.gerarCalculoRetiradaTubos();
      page.gerarCalculoCirculacaoReversa();
      // A retirada conta a pasta inteira no poço, antes de os 2 bbl irem para a formação
      // (SPEC squeeze-tampao S7): com "Volume de pasta", eles saem dos 5 bbl informados.
      expect(withdrawal.mock.calls[0][0].topoCimentoRetiradaM).toBeCloseTo(manualTop, 9);
      expect(reverse.mock.calls[0][0].topoCimentoRetiradaM).toBeCloseTo(manualTop, 9);
    } finally {
      page.ngOnDestroy();
      TestBed.resetTestingModule();
      vi.restoreAllMocks();
      localStorage.clear();
    }
  });

  it('blocks an inverted perforation instead of normalizing its endpoints silently', () => {
    TestBed.configureTestingModule({
      providers: [SimuladorSqueezeComponent, { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn() } }],
    });
    const page = TestBed.inject(SimuladorSqueezeComponent);
    try {
      page.ngOnInit();
      page.perforacoes.at(0).patchValue({ top: 1450, base: 1400 }, { emitEvent: false });
      page.simulate();
      expect(page.perforationIssues.some(issue => issue.code === 'INTERVAL_ORDER')).toBe(true);
      expect(page.geom).toBeNull();
      expect(page.hydraulicSim).toBeNull();
    } finally {
      page.ngOnDestroy();
      TestBed.resetTestingModule();
    }
  });
});
