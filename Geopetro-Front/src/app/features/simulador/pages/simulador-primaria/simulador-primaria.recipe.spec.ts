import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SimuladorPrimariaComponent } from './simulador-primaria.component';
import { importPrimaryScenario } from '../../services/primary-scenario-portable';

afterEach(() => TestBed.resetTestingModule());

function page(selected = true) {
  const fixture = TestBed.createComponent(SimuladorPrimariaComponent);
  const c = fixture.componentInstance;
  if (selected) c.selectOperationPhase('open');
  c.tab.set('receita'); fixture.detectChanges();
  const root: HTMLElement = fixture.nativeElement;
  const change = (element: HTMLInputElement | HTMLSelectElement, value: string) => {
    element.value = value; element.dispatchEvent(new Event('change', { bubbles: true })); fixture.detectChanges();
  };
  return { fixture, c, root, change };
}

function row(root: ParentNode, section: string, name: string) {
  return [...root.querySelectorAll<HTMLTableRowElement>(section + ' tbody tr')]
    .find(tr => tr.cells[0].textContent?.trim() === name);
}

describe('receita da primária com aditivos no padrão do squeeze', () => {
  it('requires a selected phase for both the base and prepared recipes', () => {
    const { c, root, fixture } = page(false);
    expect(root.querySelector('.pr-base-recipe')).toBeNull();
    expect(root.querySelector('.pr-volume-recipe')).toBeNull();
    expect(root.textContent).toContain('Selecione uma fase válida');
    c.selectOperationPhase('open'); fixture.detectChanges();
    expect(row(root, '.pr-base-recipe', 'Cimento')?.cells[3].textContent).toContain('42.638 kg');
    expect(row(root, '.pr-base-recipe', 'Água doce')?.cells[3].textContent).toContain('L');
    c.selectOperationPhase(null); fixture.detectChanges();
    expect(root.querySelector('.pr-base-recipe')).toBeNull();
    expect(root.querySelector('.pr-volume-recipe')).toBeNull();
  });

  it('updates the base, prepared recipe and report when a catalog additive is edited or deactivated', () => {
    const { c, root, fixture, change } = page();
    root.querySelector<HTMLButtonElement>('#primary-heading-additives')!.click(); fixture.detectChanges();
    const planned = c.volumes().totalCementPlannedBbl;
    change(root.querySelector<HTMLSelectElement>('[aria-label="Acrescentar aditivo do catálogo"]')!, 'bqrt_40');
    const concentration = root.querySelector<HTMLInputElement>('#primary-section-additives input[type="number"]')!;
    change(concentration, '0.08');
    const baseRow = row(root, '.pr-base-recipe', 'BQRT-40')!;
    expect(baseRow.cells[1].textContent).toBe('bqrt_40');
    expect(baseRow.cells[2].textContent).toContain('0.0800');
    expect(baseRow.cells[3].textContent).toBe('0.303 L');
    const recipe = c.recipes().placements[0];
    const expectedLitres = 0.08 * recipe.sacks94lb * 3.78541;
    expect(row(root, '.pr-volume-recipe', 'BQRT-40')!.cells[3].textContent).toBe(expectedLitres.toFixed(2) + ' L');
    const report = c.report().sections.find(section => section.id.startsWith('receita-'))!;
    const reportRow = report.table!.rows.find(cells => cells[0] === 'BQRT-40')!;
    expect(reportRow[1]).toBe('bqrt_40'); expect(reportRow[3]).toBe('0,303 L');
    expect(reportRow[4]).toBe(expectedLitres.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' L');
    expect(c.reportHtml()).toContain('Base calculada (94 lb)');
    expect(c.volumes().totalCementPlannedBbl).toBe(planned);
    root.querySelector<HTMLInputElement>('#primary-section-additives input[type="checkbox"]')!.click(); fixture.detectChanges();
    expect(row(root, '.pr-base-recipe', 'BQRT-40')).toBeUndefined();
    expect(row(root, '.pr-volume-recipe', 'BQRT-40')).toBeUndefined();
    expect(c.report().sections.find(s => s.id.startsWith('receita-'))!.table!.rows.some(r => r[0] === 'BQRT-40')).toBe(false);
    expect(importPrimaryScenario(c.exportarArquivo()!).scenario.primary.fluids.find(f => f.id === 'cement')!.recipe!.additivos[0].ativo).toBe(false);
  });

  it('selects a newly created slurry and keeps each recipe and its additives independent', () => {
    const { c, root, fixture } = page();
    c.addAditivoCatalogo(c.catalogoAditivos.find(item => item.catalogId === 'bqrt_40')!);
    c.addSlurry(); const second = c.cementFluids()[1];
    expect(c.selectedSlurryId()).toBe(second.id); expect(c.additiveForms.length).toBe(0);
    c.renameSlurry('Tail'); c.addAditivoCatalogo(c.catalogoAditivos.find(item => item.catalogId === 'bqfl_30')!);
    c.addPlacement(0); fixture.detectChanges();
    expect(root.querySelectorAll('.pr-base-recipe')).toHaveLength(2);
    expect(row(root, '.pr-base-recipe[data-fluid-id="cement"]', 'BQRT-40')).toBeDefined();
    expect(row(root, '.pr-base-recipe[data-fluid-id="cement"]', 'BQFL-30')).toBeUndefined();
    expect(row(root, `.pr-base-recipe[data-fluid-id="${second.id}"]`, 'BQFL-30')!.cells[3].textContent).toBe('0.021 kg');
    const reports = c.report().sections.filter(s => s.id.startsWith('receita-'));
    expect(reports).toHaveLength(2);
    expect(reports[0].table!.rows.some(r => r[0] === 'BQFL-30')).toBe(false);
    expect(reports[1].table!.rows.some(r => r[0] === 'BQRT-40')).toBe(false);
    c.selectSlurry('cement'); expect(c.additiveForms.at(0).get('name')!.value).toBe('BQRT-40');
  });

  it('identifies the calculated base separately from the manual prepared recipe', () => {
    const { c, root, fixture } = page();
    c.setRecipeParameters('source', 'manual'); c.setRecipeParameters('yieldFt3', '1.3');
    c.setRecipeParameters('facGpc', '4.5'); c.setRecipeParameters('famGpc', '4.8'); fixture.detectChanges();
    expect(root.querySelector('.pr-base-recipe')!.textContent).toContain('Esta base mostra a composição calculada');
    expect(root.querySelector('.pr-volume-recipe')!.textContent).toContain('Parâmetros informados manualmente');
    const total = c.recipes().placements[0];
    expect(row(root, '.pr-volume-recipe', 'Água doce')!.cells[3].textContent).toBe((4.5 * total.sacks94lb * 3.78541).toFixed(2) + ' L');
    expect(c.report().sections.find(s => s.id.startsWith('receita-'))!.notes!.join(' ')).toContain('informados manualmente');
  });
});
