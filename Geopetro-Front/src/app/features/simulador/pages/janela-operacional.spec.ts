import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormBuilder, FormGroup } from '@angular/forms';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PressureWindowInputsComponent, PRESSURE_WINDOW_FORM_DEFAULTS } from '../components/pressure-window/pressure-window-inputs.component';
import { PressureWindowPanelComponent } from '../components/pressure-window/pressure-window-panel.component';
import { scenarioForm, scenarioPayload } from '../models/poco.model';
import { profileAt } from '../services/pressure-profile';
import { SimuladorSqueezeComponent } from './simulador-squeeze/simulador-squeeze.component';
import { SimuladorTampaoComponent } from './simulador-tampao/simulador-tampao.component';
import { SQUEEZE_EXAMPLE, TAMPAO_EXAMPLE } from './squeeze-tampao-examples.fixture';

/** Janela operacional na tela do squeeze e do tampão (SPEC janela-operacional J3). */
type Page = SimuladorSqueezeComponent | SimuladorTampaoComponent;
function open<T extends Page>(component: new (...args: never[]) => T): T {
  TestBed.resetTestingModule();
  localStorage.clear();
  TestBed.configureTestingModule({ providers: [component, { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn() } }] });
  const page = TestBed.inject(component as never) as T;
  page.ngOnInit();
  return page;
}
function saved(page: Page): ReturnType<typeof scenarioPayload> {
  let value: Record<string, unknown> = {};
  (page as unknown as { stateModal: unknown }).stateModal = { setCurrentForm: (v: Record<string, unknown>) => { value = v; } };
  page.openStateModal();
  return scenarioPayload(value);
}
// Poro de 8,5 ppg constante; fratura de 16 ppg a 1000 m caindo para 15 ppg a 2000 m, em psi/ft.
const TABLE = { gradUnit: 'psi/ft', gradMode: 'table',
  gradPoints: [{ tvd: 1000, poro: 0.442, fratura: 0.832 }, { tvd: 2000, poro: 0.442, fratura: 0.78 }],
  margemAtencaoPpg: 1.5, margemAlertaPpg: 0.8, margemCriticoPpg: 0.3 };

afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); localStorage.clear(); });

describe('janela operacional na tela', () => {
  it('squeeze: a tabela em psi/ft vira o perfil do motor, com o ponto crítico por etapa, e reabre igual', () => {
    const page = open(SimuladorSqueezeComponent);
    page.onCarregarEstado({ ...page.form.getRawValue(), ...SQUEEZE_EXAMPLE.form, ...TABLE,
      _dadosRelatorio: { ...page.dadosRelatorio, ...SQUEEZE_EXAMPLE.dadosRelatorio } });
    const input = page.squeezeResult!.input;
    expect(input.pressureProfile!.unit).toBe('psi/ft');
    expect(input.pressureProfile!.points).toHaveLength(2);
    // Os valores únicos do motor são os do perfil na TVD da referência dos canhoneados.
    const refTVD = (page as any).squeezeTvdOf()(input.referenceMD);
    expect(input.fracGradPpg).toBeCloseTo(profileAt(input.pressureProfile!, refTVD).fracturePpg, 9);
    expect(input.poreGradPpg).toBeCloseTo(8.5, 2);
    const critical = page.criticalPoints!;
    expect(critical.classes).toEqual({ atencaoPpg: 1.5, alertaPpg: 0.8, criticoPpg: 0.3 });
    expect(critical.steps.map(step => step.etapa)).toContain('Compressão');
    expect(critical.worst).not.toBeNull();
    expect(critical.worst!.elemento).toContain('Canhoneado');

    const payload = saved(page);
    const reopened = open(SimuladorSqueezeComponent);
    reopened.onCarregarEstado(scenarioForm({ formValue: payload.formValue }));
    expect(reopened.form.getRawValue().gradPoints).toEqual(TABLE.gradPoints);
    expect(reopened.squeezeResult!.input.pressureProfile).toEqual(input.pressureProfile);
    expect(reopened.criticalPoints!.worst!.md).toBeCloseTo(critical.worst!.md, 9);
    expect(reopened.squeezeResult!.summary.lowPressureLimitPsi).toBeCloseTo(page.squeezeResult!.summary.lowPressureLimitPsi!, 9);
  });

  it('cenário salvo antes da janela abre constante em ppg, com os valores de sempre', () => {
    const page = open(SimuladorSqueezeComponent);
    page.onCarregarEstado({ ...page.form.getRawValue(), ...SQUEEZE_EXAMPLE.form,
      _dadosRelatorio: { ...page.dadosRelatorio, ...SQUEEZE_EXAMPLE.dadosRelatorio } });
    expect(page.form.getRawValue()).toMatchObject({ gradUnit: 'ppg', gradMode: 'constant', gradPoints: [] });
    expect(page.squeezeResult!.input.pressureProfile).toEqual({ unit: 'ppg', mode: 'constant', pore: 8.5, fracture: 15.5, points: [] });
    expect(page.squeezeResult!.input.fracGradPpg).toBe(15.5);
    expect(page.criticalPoints!.classes).toEqual({ atencaoPpg: 1, alertaPpg: 0.5, criticoPpg: 0.25 });
  });

  it('tampão: o perfil vale no poço aberto e o ponto crítico sai por etapa', () => {
    const page = open(SimuladorTampaoComponent);
    page.onCarregarEstado({ ...page.form.getRawValue(), ...TAMPAO_EXAMPLE.form, ...TABLE,
      _dadosRelatorio: { ...page.dadosRelatorio, ...TAMPAO_EXAMPLE.dadosRelatorio } });
    expect(page.tampaoResult!.primary.pressureWindow.length).toBeGreaterThan(1);
    const critical = page.criticalPoints!;
    expect(critical.steps.map(step => step.etapa)).toEqual(expect.arrayContaining(['Pasta', 'Deslocamento']));
    expect(critical.worst!.fracturePsi).not.toBeNull();
    expect(critical.casing).toBeNull();
  });
});

describe('componentes da janela operacional', () => {
  it('troca de unidade converte o que foi digitado, e "por TVD" começa com os constantes na superfície e no fundo', () => {
    const fb = TestBed.inject(FormBuilder);
    const form: FormGroup = fb.group({ fracGrad: [16], poreGrad: [9], ...Object.fromEntries(Object.entries(PRESSURE_WINDOW_FORM_DEFAULTS)
      .map(([key, value]) => [key, [value]])), gradPoints: fb.array([]) }) as FormGroup;
    const fixture = TestBed.createComponent(PressureWindowInputsComponent);
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('wellFinalTVD', 1800);
    fixture.detectChanges();
    const inputs = fixture.componentInstance;
    inputs.setUnit('psi/ft');
    expect(form.value.gradUnit).toBe('psi/ft');
    expect(form.value.fracGrad).toBeCloseTo(0.832, 4);
    expect(form.value.poreGrad).toBeCloseTo(0.468, 4);
    inputs.setMode('table');
    expect(form.value.gradMode).toBe('table');
    expect(form.getRawValue().gradPoints).toEqual([{ tvd: 0, poro: 0.468, fratura: 0.832 }, { tvd: 1800, poro: 0.468, fratura: 0.832 }]);
    inputs.add();
    expect(inputs.points.length).toBe(3);
    expect(inputs.points.at(2).value.tvd).toBe(1900);
    inputs.remove(2); inputs.remove(1);
    expect(inputs.points.length).toBe(2);
    inputs.setUnit('ppg');
    expect(form.getRawValue().gradPoints[1].fratura).toBeCloseTo(16, 3);
    // Sem zone: as chamadas diretas não marcam o componente; na tela, o (change) marca.
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.pw-row:not(.pw-row--head)')).toHaveLength(2);
  });

  it('painel: o ponto mais crítico com a situação e a tabela por etapa', () => {
    const point = { md: 1510, tvd: 1460, timeMin: 22, elemento: 'Canhoneado 1508–1521 m', porePsi: 2200, pressurePsi: 4100,
      fracturePsi: 3990, ecdPpg: 16.46, fractureMarginPsi: -110, fractureMarginPpg: -0.44, poreMarginPsi: 1900, poreMarginPpg: 7.6,
      status: 'fratura' as const };
    const fixture = TestBed.createComponent(PressureWindowPanelComponent);
    fixture.componentRef.setInput('data', { steps: [{ etapa: 'Compressão', fracture: point, pore: point, status: 'fratura' }],
      worst: { ...point, etapa: 'Compressão', kind: 'fracture' }, casing: null,
      classes: { atencaoPpg: 1, alertaPpg: 0.5, criticoPpg: 0.25 } });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.pw-worst .pw-badge')?.textContent).toBe('Fratura');
    expect(root.querySelector('.pw-worst')?.textContent).toContain('Canhoneado 1508–1521 m');
    expect(root.querySelectorAll('[data-table="ponto-critico"] tbody tr')).toHaveLength(1);
    expect(root.textContent).toContain('-110 psi');
  });
});
