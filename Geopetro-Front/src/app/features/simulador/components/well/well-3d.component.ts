import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, ViewChild, inject } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DepthUnit, depthFromMetres, depthToMetres, formatDepth } from '../../models/depth-unit';
import { WellGeometry, WellOverlay } from '../../models/well-geometry.model';
import { WellSpatialPath } from '../../services/well-spatial-path';

const COLORS = ['#2563eb', '#0d9488', '#7c3aed', '#d97706', '#64748b'];
class BoreCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private path: WellSpatialPath, private top: number, private bottom: number) { super(); }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const p = this.path.at(this.top + Math.max(0, Math.min(1, t)) * (this.bottom - this.top));
    return target.set(p.east, -p.tvd, -p.north);
  }
}

@Component({
  selector: 'app-well-3d',
  standalone: true,
  template: `
    <section class="viewer">
      <header>
        <div><h3>Poço em 3D</h3>
          <p>{{ geometry.trajectory ? 'Trajetória por survey · mínima curvatura' : 'Sem survey · esquema vertical em MD, sem direção espacial' }}</p>
        </div>
        <div class="actions" aria-label="Câmera 3D">
          <button type="button" (click)="view('iso')">Enquadrar</button>
          <button type="button" (click)="view('front')">Frente</button>
          <button type="button" (click)="view('top')">Topo</button>
          <button type="button" aria-label="Girar para a esquerda" (click)="rotate(-0.25)">↶</button>
          <button type="button" aria-label="Girar para a direita" (click)="rotate(0.25)">↷</button>
          <button type="button" aria-label="Aproximar" (click)="zoom(0.8)">+</button>
          <button type="button" aria-label="Afastar" (click)="zoom(1.25)">−</button>
        </div>
      </header>
      <div class="viewport">
        <canvas #canvas tabindex="0" aria-label="Visualização tridimensional do poço. Arraste para girar, use a roda para zoom. Setas deslocam a câmera; mais e menos ajustam o zoom."
          (keydown)="key($event)" (webglcontextlost)="contextLost($event)" (webglcontextrestored)="contextRestored()"></canvas>
        @if (error) { <div class="fallback" role="status">{{ error }} O esquemático 2D está disponível abaixo.</div> }
        @else { <div class="hint">Arraste para girar · roda para zoom · botão direito para deslocar</div> }
      </div>
      <div class="settings">
        <label>Diâmetro visual
          <input type="range" min="1" max="5" step="0.5" [value]="thickness" (input)="setThickness($any($event.target).value)">
        </label>
        <label><input type="checkbox" [checked]="showOverlays" (change)="showOverlays = $any($event.target).checked; rebuild(false)"> Mostrar operação / fluidos</label>
        <span>Diâmetros ampliados para leitura. Eixos espaciais na mesma escala.</span>
      </div>
      @if (path) {
        <div class="probe">
          <label>Posição no poço · MD {{ depth(selectedMD) }}
            <input type="range" min="0" [max]="displayFinalMD" step="any" [value]="displaySelectedMD"
              (input)="setPosition($any($event.target).value)">
          </label>
          <span>{{ path.mode === 'survey' ? 'TVD' : 'Eixo vertical (MD)' }} {{ depth(position.tvd) }}</span>
          @if (path.mode === 'survey') { <span>Norte {{ depth(position.north) }} · Leste {{ depth(position.east) }}</span> }
        </div>
      }
      <div class="legend" aria-label="Fases do poço">
        @for (phase of geometry.phases; track phase.id; let i = $index) {
          <span><i [style.background]="color(i)"></i>{{ phase.name }} · {{ depth(phase.topMD) }} a {{ depth(phase.bottomMD) }}</span>
        }
        <span><i class="shoe"></i>Sapatas</span>
        @if (showOverlays) {
          @for (overlay of overlays; track $index) {
            <span><i [style.background]="overlayColor(overlay)"></i>{{ overlay.label }}</span>
          }
        }
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; margin-bottom: 16px; }
    .viewer { overflow: hidden; border: 1px solid #dbe3ec; border-radius: 12px; background: #fff; }
    header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; padding: 16px; }
    h3 { margin: 0 0 4px; color: #1e293b; font-size: 1rem; } p { margin: 0; color: #64748b; font-size: .75rem; }
    .actions, .settings, .legend, .probe { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    button { border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; color: #334155; padding: 7px 10px; cursor: pointer; font: inherit; font-size: .75rem; }
    button:hover { background: #e0edff; } button:focus-visible, canvas:focus-visible { outline: 2px solid #2563eb; outline-offset: -2px; }
    .viewport { position: relative; background: #f4f8fc; height: clamp(360px, 62vh, 680px); }
    canvas { display: block; width: 100%; height: 100%; touch-action: none; }
    .hint { position: absolute; bottom: 10px; left: 12px; pointer-events: none; color: #64748b; font-size: .68rem; background: #ffffffd9; border-radius: 5px; padding: 5px 8px; }
    .fallback { position: absolute; inset: 0; display: grid; place-content: center; padding: 24px; color: #475569; text-align: center; font-size: .9rem; }
    .settings, .probe { padding: 10px 16px; border-top: 1px solid #e2e8f0; color: #475569; font-size: .75rem; }
    .settings > span { color: #64748b; font-size: .68rem; } .settings label { display: flex; align-items: center; gap: 7px; }
    input[type=range] { accent-color: #2563eb; max-width: 100%; }
    .probe label { display: grid; gap: 5px; flex: 1; min-width: 200px; } .probe input { width: 100%; }
    .legend { padding: 12px 16px; font-size: .7rem; color: #475569; border-top: 1px solid #e2e8f0; }
    .legend span { display: inline-flex; align-items: center; gap: 5px; } i { width: 9px; height: 9px; border-radius: 50%; background: #334155; flex-shrink: 0; }
    .shoe { background: #0f172a; }
    @media (max-width: 600px) { header { padding: 12px; } .hint { max-width: calc(100% - 40px); } }
  `],
})
export class Well3dComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) geometry!: WellGeometry;
  @Input() overlays: WellOverlay[] = [];
  @Input() depthUnit: DepthUnit = 'm';
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private renderer?: THREE.WebGLRenderer;
  private controls?: OrbitControls;
  private observer?: ResizeObserver;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100000);
  private model = new THREE.Group();
  private marker?: THREE.Mesh;
  private center = new THREE.Vector3();
  private span = 1;
  private radius = 1;
  private ready = false;
  path?: WellSpatialPath;
  error = '';
  selectedMD = 0;
  thickness = 2;
  showOverlays = true;
  color(index: number): string { return COLORS[index % COLORS.length]; }
  overlayColor(overlay: WellOverlay): string {
    return overlay.color || ({ CEMENT: '#f97316', SPACER: '#a855f7', DISPLACEMENT: '#38bdf8',
      PERFORATION: '#ef4444', SQUEEZE: '#ef4444', TUBING: '#475569' }[overlay.type]);
  }
  depth(value: number): string { return formatDepth(value, this.depthUnit, 1); }
  get displayFinalMD(): number { return depthFromMetres(this.geometry.finalMD, this.depthUnit); }
  get displaySelectedMD(): number { return depthFromMetres(this.selectedMD, this.depthUnit); }
  get position() { return this.path!.at(this.selectedMD); }

  ngAfterViewInit(): void {
    this.ready = true;
    this.zone.runOutsideAngular(() => {
      try {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas.nativeElement, antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.scene.background = new THREE.Color('#f4f8fc');
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x94a3b8, 2.5));
        const light = new THREE.DirectionalLight(0xffffff, 3);
        light.position.set(1, 2, 3); this.scene.add(light);
        this.controls = new OrbitControls(this.camera, this.canvas.nativeElement);
        this.controls.listenToKeyEvents(this.canvas.nativeElement);
        this.controls.addEventListener('change', this.render);
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(this.canvas.nativeElement.parentElement!);
        this.resize();
        this.rebuild(true);
      } catch {
        this.error = 'Não foi possível iniciar o 3D neste navegador.';
      }
    });
    this.cdr.markForCheck();
  }
  ngOnChanges(changes: import('@angular/core').SimpleChanges): void {
    if (this.ready && this.renderer) this.rebuild(!!changes['geometry']);
  }
  private resize(): void {
    if (!this.renderer) return;
    const { width, height } = this.canvas.nativeElement.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render();
  }
  rebuild(reset: boolean): void {
    if (!this.renderer) return;
    this.disposeModel();
    this.error = '';
    try {
      this.path = new WellSpatialPath(this.geometry);
      const points = this.path.samples().map(p => new THREE.Vector3(p.east, -p.tvd, -p.north));
      const bounds = new THREE.Box3().setFromPoints(points);
      this.center = bounds.getCenter(new THREE.Vector3());
      this.span = Math.max(bounds.getSize(new THREE.Vector3()).length(), 1);
      this.radius = this.span * 0.003 * this.thickness;
      const maxDiameter = Math.max(...this.geometry.phases.map(p => p.holeDiameterIn));
      this.geometry.phases.forEach((phase, i) => {
        const radius = this.radius * Math.max(phase.holeDiameterIn / maxDiameter, 0.25);
        this.tube(phase.topMD, phase.bottomMD, radius, this.color(i), 0.48);
        if (phase.casing) {
          this.tube(Math.max(phase.topMD, phase.casing.topMD ?? phase.topMD), phase.casing.bottomMD,
            radius * phase.casing.odIn / phase.holeDiameterIn, this.color(i), 0.55);
        }
        const shoe = phase.shoe?.md ?? phase.casing?.bottomMD;
        if (shoe != null) this.dot(shoe, radius * 1.35, '#0f172a');
      });
      if (this.showOverlays) for (const overlay of this.overlays) {
        this.tube(overlay.topMD, overlay.bottomMD, this.radius * (overlay.zone === 'tubing' ? 0.34 : 0.72),
          this.overlayColor(overlay), 0.96);
      }
      // A linha central inclui trechos sem fase cadastrada.
      this.model.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#334155' })));
      const axisLength = this.span * 0.25;
      for (const [direction, color, label] of [
        [new THREE.Vector3(1, 0, 0), '#dc2626', 'Leste'],
        [new THREE.Vector3(0, 0, -1), '#059669', 'Norte'],
        [new THREE.Vector3(0, -1, 0), '#2563eb', this.path.mode === 'survey' ? 'TVD' : 'MD'],
      ] as const) {
        this.model.add(new THREE.ArrowHelper(direction, new THREE.Vector3(), axisLength, color, axisLength * .06, axisLength * .03));
        this.label(`${label} · ${this.depth(axisLength)}`, direction.clone().multiplyScalar(axisLength * 1.15));
      }
      const grid = new THREE.GridHelper(this.span * 0.75, 10, '#94a3b8', '#dbe3ec');
      this.model.add(grid);
      this.label('Superfície', new THREE.Vector3(0, this.span * .045, 0));
      this.label(`Fundo · MD ${this.depth(this.geometry.finalMD)}`, points.at(-1)!.clone().add(new THREE.Vector3(this.span * .08, 0, 0)));
      this.selectedMD = Math.max(0, Math.min(this.selectedMD, this.geometry.finalMD));
      this.marker = this.dot(this.selectedMD, this.radius * 1.6, '#06b6d4');
      this.scene.add(this.model);
      if (reset) this.view('iso');
      this.render();
    } catch (e) {
      this.path = undefined;
      this.error = e instanceof Error ? e.message : 'Geometria indisponível.';
      this.disposeModel();
      this.render();
    }
  }
  private tube(top: number, bottom: number, radius: number, color: string, opacity: number): void {
    top = Math.max(0, top); bottom = Math.min(this.geometry.finalMD, bottom);
    if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= top) return;
    const curve = new BoreCurve(this.path!, top, bottom);
    const segments = Math.max(8, Math.min(256, Math.ceil((bottom - top) / this.geometry.finalMD * 256)));
    this.model.add(new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 12, false),
      new THREE.MeshStandardMaterial({ color, transparent: opacity < 1, opacity, roughness: 0.4, metalness: .15, depthWrite: opacity >= 1 })));
  }
  private dot(md: number, radius: number, color: string): THREE.Mesh {
    const p = this.path!.at(md);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), new THREE.MeshStandardMaterial({ color, roughness: .4 }));
    dot.position.set(p.east, -p.tvd, -p.north); this.model.add(dot); return dot;
  }
  private label(text: string, position: THREE.Vector3): void {
    const canvas = document.createElement('canvas');
    canvas.width = 768; canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '500 32px sans-serif'; ctx.fillStyle = '#334155'; ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, 55);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    sprite.position.copy(position); sprite.scale.set(this.span * .28, this.span * .035, 1);
    this.model.add(sprite);
  }
  view(view: 'iso' | 'front' | 'top'): void {
    if (!this.controls) return;
    const direction = view === 'top' ? new THREE.Vector3(0, 1, .001)
      : view === 'front' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, .45, 1.4).normalize();
    direction.normalize();
    const right = new THREE.Vector3().crossVectors(this.camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const bounds = new THREE.Box3().setFromObject(this.model);
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    let distance = this.span;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const offset = new THREE.Vector3(x, y, z).sub(this.center);
      distance = Math.max(distance, offset.dot(direction) + Math.max(
        Math.abs(offset.dot(right)) / (tangent * this.camera.aspect), Math.abs(offset.dot(up)) / tangent));
    }
    distance *= 1.12;
    this.controls.target.copy(this.center);
    this.camera.near = this.span / 10000; this.camera.far = this.span * 100;
    this.controls.minDistance = this.span * .015; this.controls.maxDistance = this.span * 15;
    this.camera.position.copy(this.center).addScaledVector(direction, distance);
    this.camera.updateProjectionMatrix(); this.controls.update(); this.render();
  }
  rotate(angle: number): void {
    if (!this.controls) return;
    this.camera.position.sub(this.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(this.controls.target);
    this.controls.update(); this.render();
  }
  zoom(factor: number): void {
    if (!this.controls) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, this.controls.minDistance, this.controls.maxDistance));
    this.camera.position.copy(this.controls.target).add(offset); this.controls.update(); this.render();
  }
  key(event: KeyboardEvent): void {
    if (['+', '=', '-', 'Home'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Home') this.view('iso'); else this.zoom(event.key === '-' ? 1.25 : .8);
    }
  }
  setThickness(value: string): void { this.thickness = Math.max(1, Math.min(5, Number(value) || 2)); this.rebuild(false); }
  setPosition(value: string): void {
    if (!this.path) return;
    this.selectedMD = Math.max(0, Math.min(this.geometry.finalMD, depthToMetres(Number(value) || 0, this.depthUnit)));
    const p = this.position; this.marker?.position.set(p.east, -p.tvd, -p.north); this.render();
  }
  private readonly render = (): void => { this.renderer?.render(this.scene, this.camera); };
  contextLost(event: Event): void { event.preventDefault(); this.error = 'A visualização 3D foi interrompida.'; }
  contextRestored(): void { this.rebuild(false); }
  private disposeModel(): void {
    this.scene.remove(this.model);
    this.model.traverse(object => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
      for (const material of materials) {
        (material as THREE.MeshBasicMaterial).map?.dispose();
        material.dispose();
      }
    });
    this.model = new THREE.Group(); this.marker = undefined;
  }
  ngOnDestroy(): void {
    this.observer?.disconnect(); this.controls?.dispose(); this.disposeModel();
    this.renderer?.dispose(); this.renderer?.forceContextLoss(); this.renderer = undefined;
  }
}
