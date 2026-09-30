import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, ViewChild, inject } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DepthUnit, depthFromMetres, depthToMetres, formatDepth } from '../../models/depth-unit';
import { WellGeometry, WellOverlay } from '../../models/well-geometry.model';
import { WellSpatialPath } from '../../services/well-spatial-path';
import {
  CASING_COLOR, FORMATION_BAND, SHOE_COLOR, STRING_COLOR, WELL_FLUID_COLOR, WellLayer, WorkString3d, frameAt, operationFocus,
  radialDirection, subtractRanges, sweptLayerGeometry, toScene, wellLayers,
} from './well-3d-layers';

const COLORS = ['#2563eb', '#0d9488', '#7c3aed', '#d97706', '#64748b'];
/** Tom de rocha com um toque da cor da fase: a formação fica de fundo e não compete com os fluidos. */
const ROCK = new THREE.Color('#e4d8bd');
/**
 * Ampliação do diâmetro. Com zona da operação, a camada mais larga dela ocupa 45% do
 * comprimento da zona; sem zona, a mais larga do poço ocupa 4% do tamanho do poço. O
 * controle multiplica isso de 0,2 a 2,4 vezes (5 = 1 vez).
 */
const ZONE_WIDTH = 0.45;
const WELL_WIDTH = 0.04;
const MAX_WELL_WIDTH = 0.3;
const DEFAULT_THICKNESS = 5;
/** Altura dos rótulos na tela (fração de 2·tan(fov/2), o tamanho de sprite sem atenuação). */
const LABEL_HEIGHT = 0.034;
type Framing = 'zone' | 'well';

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
          @if (focus) {
            <button type="button" [class.on]="framing === 'zone'" (click)="pick('zone')">Zona da operação</button>
          }
          <button type="button" [class.on]="framing === 'well'" (click)="pick('well')">Poço inteiro</button>
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
        <label>Ampliação do diâmetro
          <input type="range" min="1" max="12" step="0.5" [value]="thickness" (input)="setThickness($any($event.target).value)">
          <output>×{{ exaggeration }}</output>
        </label>
        <label title="Remove a metade da frente do poço para mostrar os fluidos dentro do revestimento e da coluna">
          <input type="checkbox" [checked]="half" (change)="half = $any($event.target).checked; rebuild(false)"> Meia seção (corte)</label>
        <label><input type="checkbox" [checked]="showOverlays" (change)="showOverlays = $any($event.target).checked; rebuild(false)"> Mostrar operação / fluidos</label>
        <label><input type="checkbox" [checked]="showLabels" [disabled]="!showOverlays" (change)="showLabels = $any($event.target).checked; rebuild(false)"> Rótulos</label>
        <span>Só os diâmetros são ampliados, todos pelo mesmo fator: furo, aço e coluna guardam as proporções reais. Comprimentos e eixos em escala real.</span>
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
      <div class="legend" aria-label="Legenda do poço">
        @for (phase of geometry.phases; track phase.id; let i = $index) {
          <span><i [style.background]="rockColor(i)" [style.border-color]="color(i)"></i>{{ phase.name }} · {{ depth(phase.topMD) }} a {{ depth(phase.bottomMD) }}</span>
        }
        <span><i [style.background]="casingColor"></i>Revestimento</span>
        <span><i [style.background]="shoeColor"></i>Sapatas</span>
        @if (hasWellFluid) { <span><i [style.background]="wellFluidColor"></i>Fluido do poço</span> }
        @if (showOverlays) {
          @for (overlay of overlays; track $index) {
            <span><i [style.background]="overlayColor(overlay)"></i>{{ overlay.label }}@if (overlay.sub) { · {{ overlay.sub }} }</span>
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
    button:hover { background: #e0edff; } button.on { background: #dbeafe; border-color: #93c5fd; color: #1e3a8a; }
    button:focus-visible, canvas:focus-visible { outline: 2px solid #2563eb; outline-offset: -2px; }
    .viewport { position: relative; background: #eef3f8; height: clamp(380px, 66vh, 720px); }
    canvas { display: block; width: 100%; height: 100%; touch-action: none; }
    .hint { position: absolute; bottom: 10px; left: 12px; pointer-events: none; color: #64748b; font-size: .68rem; background: #ffffffd9; border-radius: 5px; padding: 5px 8px; }
    .fallback { position: absolute; inset: 0; display: grid; place-content: center; padding: 24px; color: #475569; text-align: center; font-size: .9rem; }
    .settings, .probe { padding: 10px 16px; border-top: 1px solid #e2e8f0; color: #475569; font-size: .75rem; }
    .settings > span { color: #64748b; font-size: .68rem; flex-basis: 100%; } .settings label { display: flex; align-items: center; gap: 7px; }
    output { min-width: 3.5em; color: #1e293b; font-variant-numeric: tabular-nums; }
    input[type=range] { accent-color: #2563eb; max-width: 100%; }
    .probe label { display: grid; gap: 5px; flex: 1; min-width: 200px; } .probe input { width: 100%; }
    .legend { padding: 12px 16px; font-size: .7rem; color: #475569; border-top: 1px solid #e2e8f0; }
    .legend span { display: inline-flex; align-items: center; gap: 5px; }
    i { width: 10px; height: 10px; border-radius: 50%; background: #334155; flex-shrink: 0; border: 2px solid transparent; box-sizing: border-box; }
    @media (max-width: 600px) { header { padding: 12px; } .hint { max-width: calc(100% - 40px); } }
  `],
})
export class Well3dComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) geometry!: WellGeometry;
  @Input() overlays: WellOverlay[] = [];
  @Input() depthUnit: DepthUnit = 'm';
  /** Coluna de trabalho (tampão, squeeze): o aço e o interior dela nos diâmetros reais. */
  @Input() workString: WorkString3d | null = null;
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
  /** Rótulos dos fluidos: refeitos a cada enquadramento, com o espaçamento do trecho visto. */
  private labels = new THREE.Group();
  private layers: WellLayer[] = [];
  private center = new THREE.Vector3();
  private span = 1;
  /** Metros desenhados por polegada real (no raio e no diâmetro). */
  private scale = 1;
  /** Enquadramento escolhido por quem vê; até lá, a zona da operação assim que ela existe. */
  private userFramed = false;
  private ready = false;
  path?: WellSpatialPath;
  error = '';
  selectedMD = 0;
  thickness = DEFAULT_THICKNESS;
  hasWellFluid = false;
  showOverlays = true;
  showLabels = true;
  /** Meia seção: a metade da frente sai e os fluidos aparecem no corte. */
  half = true;
  framing: Framing = 'well';
  focus: readonly [number, number] | null = null;
  readonly casingColor = CASING_COLOR;
  readonly shoeColor = SHOE_COLOR;
  readonly wellFluidColor = WELL_FLUID_COLOR;
  color(index: number): string { return COLORS[index % COLORS.length]; }
  rockColor(index: number): string { return '#' + new THREE.Color(this.color(index)).lerp(ROCK, 0.88).getHexString(); }
  overlayColor(overlay: WellOverlay): string {
    return overlay.color || ({ CEMENT: '#f97316', SPACER: '#a855f7', DISPLACEMENT: '#38bdf8',
      PERFORATION: '#ef4444', SQUEEZE: '#dc2626', TUBING: STRING_COLOR }[overlay.type]);
  }
  depth(value: number): string { return formatDepth(value, this.depthUnit, 1); }
  /** Quantas vezes o diâmetro desenhado é maior que o real. */
  get exaggeration(): number { return Math.round(this.scale / 0.0254); }
  get displayFinalMD(): number { return depthFromMetres(this.geometry.finalMD, this.depthUnit); }
  get displaySelectedMD(): number { return depthFromMetres(this.selectedMD, this.depthUnit); }
  get position() { return this.path!.at(this.selectedMD); }

  ngAfterViewInit(): void {
    this.ready = true;
    this.zone.runOutsideAngular(() => {
      try {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas.nativeElement, antialias: true, alpha: false,
          logarithmicDepthBuffer: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.scene.background = new THREE.Color('#eef3f8');
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8391a5, 2.2));
        const key = new THREE.DirectionalLight(0xffffff, 2.4);
        key.position.set(0.6, 1, 2); this.scene.add(key);
        const fill = new THREE.DirectionalLight(0xffffff, 0.8);
        fill.position.set(-1.5, -0.4, 0.6); this.scene.add(fill);
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
      const path = this.path = new WellSpatialPath(this.geometry);
      const finalMD = this.geometry.finalMD;
      const points = path.samples().map(toScene);
      const bounds = new THREE.Box3().setFromPoints(points);
      this.center = bounds.getCenter(new THREE.Vector3());
      this.span = Math.max(bounds.getSize(new THREE.Vector3()).length(), 1);
      const overlays = this.showOverlays ? this.overlays : [];
      this.focus = operationFocus(this.overlays, finalMD);
      const layers = wellLayers(this.geometry, overlays, this.workString, i => this.rockColor(i), o => this.overlayColor(o),
        Math.max(1, this.span * 0.004));
      this.hasWellFluid = layers.some(l => l.kind === 'well-fluid');
      this.scale = this.baseScale(layers) * this.thickness / DEFAULT_THICKNESS;
      for (const layer of layers) this.layer(path, layer, finalMD);

      // Linha central só onde não há fase desenhada (trechos sem fase cadastrada).
      for (const [top, bottom] of subtractRanges([0, finalMD], this.geometry.phases.map(p => [p.topMD, p.bottomMD] as const))) {
        const line = Array.from({ length: 33 }, (_, i) => toScene(path.at(top + (bottom - top) * i / 32)));
        this.model.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), new THREE.LineBasicMaterial({ color: '#334155' })));
      }
      this.layers = layers;
      this.model.add(this.labels);

      // Os eixos saem de um ponto ao lado da cabeça do poço, para o eixo vertical não correr dentro dele.
      const axisLength = this.span * 0.25;
      const origin = new THREE.Vector3(this.radiusOf(this.widestIn(0, finalMD)) * 2.2, 0, 0);
      for (const [direction, color, label] of [
        [new THREE.Vector3(1, 0, 0), '#dc2626', 'Leste'],
        [new THREE.Vector3(0, 0, -1), '#059669', 'Norte'],
        [new THREE.Vector3(0, -1, 0), '#2563eb', path.mode === 'survey' ? 'TVD' : 'MD'],
      ] as const) {
        this.model.add(new THREE.ArrowHelper(direction, origin, axisLength, color, axisLength * .06, axisLength * .03));
        this.label(this.model, `${label} · ${this.depth(axisLength)}`, origin.clone().addScaledVector(direction, axisLength * 1.15), 'center');
      }
      this.model.add(new THREE.GridHelper(this.span * 0.75, 10, '#94a3b8', '#d5dee8'));
      this.label(this.model, 'Superfície', new THREE.Vector3(0, this.span * .07, 0), 'center');
      this.selectedMD = Math.max(0, Math.min(this.selectedMD, finalMD));
      this.placeMarker();
      this.scene.add(this.model);
      if (reset) this.userFramed = false;
      const wanted: Framing = this.userFramed ? this.framing : this.focus ? 'zone' : 'well';
      if (reset || wanted !== this.framing || (this.framing === 'zone' && !this.focus)) this.frame(this.focus ? wanted : 'well');
      else this.refreshLabels();
      this.render();
    } catch (e) {
      this.path = undefined;
      this.error = e instanceof Error ? e.message : 'Geometria indisponível.';
      this.disposeModel();
      this.render();
    }
  }
  private radiusOf(diameterIn: number): number { return diameterIn / 2 * this.scale; }
  private widestIn(top: number, bottom: number): number {
    return Math.max(1, ...this.geometry.phases.filter(p => p.bottomMD > top && p.topMD < bottom)
      .map(p => p.holeDiameterIn * (1 + FORMATION_BAND)));
  }
  /** Comprimento desenhado por polegada de diâmetro, antes do controle de ampliação. */
  private baseScale(layers: WellLayer[]): number {
    const widest = Math.max(this.widestIn(0, this.geometry.finalMD), ...layers.map(l => l.outerIn));
    const well = this.span * WELL_WIDTH / widest;
    if (!this.focus) return well;
    const [top, bottom] = this.focus;
    return Math.max(well, Math.min((bottom - top) * ZONE_WIDTH / this.widestIn(top, bottom), this.span * MAX_WELL_WIDTH / widest));
  }
  private layer(path: WellSpatialPath, layer: WellLayer, finalMD: number): void {
    const top = Math.max(0, layer.topMD); const bottom = Math.min(finalMD, layer.bottomMD);
    if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= top) return;
    // Sem o corte, as cascas por fora ficam translúcidas para os fluidos aparecerem por dentro.
    const see = !this.half;
    const style: Record<WellLayer['kind'], { opacity: number; roughness: number; metalness: number }> = {
      formation: { opacity: see ? 0.16 : 1, roughness: 0.95, metalness: 0 },
      casing: { opacity: see ? 0.32 : 1, roughness: 0.42, metalness: 0.25 },
      shoe: { opacity: see ? 0.5 : 1, roughness: 0.45, metalness: 0.2 },
      string: { opacity: see ? 0.45 : 1, roughness: 0.4, metalness: 0.3 },
      fluid: { opacity: 1, roughness: 0.55, metalness: 0 },
      'well-fluid': { opacity: see ? 0.2 : 0.45, roughness: 0.3, metalness: 0 },
      perforation: { opacity: 1, roughness: 0.5, metalness: 0 },
      squeeze: { opacity: 1, roughness: 0.5, metalness: 0 },
    };
    const { opacity, roughness, metalness } = style[layer.kind];
    const material = new THREE.MeshStandardMaterial({ color: layer.color, roughness, metalness, side: THREE.FrontSide,
      transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    const mesh = new THREE.Mesh(sweptLayerGeometry(path, top, bottom, this.radiusOf(layer.innerIn), this.radiusOf(layer.outerIn),
      this.half, finalMD), material);
    // Transparentes por último, de fora para dentro.
    if (opacity < 1) mesh.renderOrder = 1;
    this.model.add(mesh);
  }
  /**
   * Um rótulo por fluido, ao lado do poço, ligado ao corte por uma linha: os do interior
   * da coluna ou do revestimento de um lado, os do anular do outro. Rótulos próximos no
   * mesmo lado se afastam em MD para não se sobrepor.
   */
  /**
   * Rótulos que dependem da câmera: o do fundo, logo abaixo da ponta do poço, e os dos
   * fluidos, espaçados pela altura que um rótulo tem no mundo na distância atual.
   */
  private refreshLabels(): void {
    this.dispose(this.labels);
    this.labels.clear();
    if (!this.path) return;
    const finalMD = this.geometry.finalMD;
    const height = LABEL_HEIGHT * (this.controls ? this.camera.position.distanceTo(this.controls.target) : this.span);
    const radius = this.radiusOf(this.widestIn(finalMD - 1, finalMD));
    const bottom = frameAt(this.path, finalMD, finalMD);
    this.label(this.labels, `Fundo · MD ${this.depth(finalMD)}`, bottom.p.clone().addScaledVector(bottom.t, radius + height * 0.9), 'center');
    // Os rótulos dos lados param acima do rótulo do fundo.
    if (this.showOverlays && this.showLabels)
      this.fluidLabels(this.path, this.layers, finalMD, height, Math.min(finalMD, finalMD + radius - height * 0.2));
  }
  private fluidLabels(path: WellSpatialPath, layers: WellLayer[], finalMD: number, height: number, lowest: number): void {
    const range = this.framing === 'zone' && this.focus ? this.focus : [0, finalMD] as const;
    const minGap = Math.max(height * 1.3, (range[1] - range[0]) * 0.02);
    const holeAt = (md: number) => this.geometry.phases.find(p => p.topMD <= md && p.bottomMD > md)?.holeDiameterIn
      ?? this.geometry.phases.at(-1)?.holeDiameterIn ?? 0;
    const anchors = this.overlays.map((overlay, index) => {
      if (overlay.type === 'TUBING') return null;
      const own = layers.filter(l => l.overlay === index);
      if (!own.length) return null;
      const md = (Math.max(overlay.topMD, 0) + Math.min(overlay.bottomMD, finalMD)) / 2;
      const at = own.find(l => l.topMD <= md && l.bottomMD >= md) ?? own[0];
      const inside = overlay.zone === 'tubing' || overlay.type === 'PERFORATION' || overlay.type === 'SQUEEZE';
      return { overlay, md: Math.max(at.topMD, Math.min(at.bottomMD, md)), radius: (at.innerIn + at.outerIn) / 2,
        theta: inside ? Math.PI : 0, labelMD: md };
    }).filter((a): a is NonNullable<typeof a> => !!a);
    for (const theta of [0, Math.PI]) {
      const side = anchors.filter(a => a.theta === theta).sort((a, b) => a.labelMD - b.labelMD);
      side.forEach((a, i) => { if (i && a.labelMD - side[i - 1].labelMD < minGap) a.labelMD = side[i - 1].labelMD + minGap; });
      for (let i = side.length - 1; i >= 0; i--)
        side[i].labelMD = Math.max(0, Math.min(side[i].labelMD, i === side.length - 1 ? lowest : side[i + 1].labelMD - minGap));
    }
    const lift = this.radiusOf(holeAt(range[0])) * 0.03;
    for (const a of anchors) {
      const from = frameAt(path, a.md, finalMD);
      const to = frameAt(path, a.labelMD, finalMD);
      const start = from.p.clone().addScaledVector(radialDirection(from, a.theta), this.radiusOf(a.radius)).addScaledVector(from.n, lift);
      const end = to.p.clone().addScaledVector(radialDirection(to, a.theta),
        this.radiusOf(holeAt(Math.min(a.labelMD, finalMD)) * (1 + FORMATION_BAND)) * 1.18).addScaledVector(to.n, lift);
      this.labels.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]),
        new THREE.LineBasicMaterial({ color: '#334155', depthTest: false, transparent: true, opacity: 0.8 })));
      const dot = new THREE.Mesh(new THREE.SphereGeometry(lift * 1.6, 12, 8),
        new THREE.MeshBasicMaterial({ color: '#1e293b', depthTest: false }));
      dot.position.copy(start); dot.renderOrder = 3; this.labels.add(dot);
      // θ = 0 fica à esquerda na vista de frente: o texto cresce para a esquerda.
      this.label(this.labels, a.overlay.label + (a.overlay.sub ? ` · ${a.overlay.sub}` : ''), end, a.theta === 0 ? 'right' : 'left',
        this.overlayColor(a.overlay));
    }
  }
  /** Marcador da posição do controle deslizante: um arco em volta do poço, do lado que fica no corte. */
  private placeMarker(): void {
    if (!this.path) return;
    if (this.marker) { this.model.remove(this.marker); this.marker.geometry.dispose(); (this.marker.material as THREE.Material).dispose(); }
    const md = this.selectedMD; const finalMD = this.geometry.finalMD;
    const hole = this.geometry.phases.find(p => p.topMD <= md && p.bottomMD > md)?.holeDiameterIn ?? this.geometry.phases.at(-1)?.holeDiameterIn ?? 8.5;
    const radius = this.radiusOf(hole * (1 + FORMATION_BAND)) * 1.08;
    const frame = frameAt(this.path, md, finalMD);
    const marker = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.045, 10, 48, this.half ? Math.PI : Math.PI * 2),
      new THREE.MeshStandardMaterial({ color: '#06b6d4', emissive: '#0e7490', emissiveIntensity: 0.4, roughness: 0.4 }));
    marker.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.b, frame.n.clone().negate(), frame.t));
    marker.position.copy(frame.p);
    this.marker = marker; this.model.add(marker);
  }
  /** Rótulo de tamanho fixo na tela, com a cor do fluido quando houver. */
  private label(target: THREE.Object3D, text: string, position: THREE.Vector3, align: 'left' | 'right' | 'center', swatch?: string): void {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const font = '600 30px system-ui, sans-serif';
    ctx.font = font;
    const pad = 14; const dot = swatch ? 30 : 0;
    canvas.width = Math.ceil(ctx.measureText(text).width + pad * 2 + dot); canvas.height = 52;
    ctx.font = font;
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect?.(1, 1, canvas.width - 2, canvas.height - 2, 10); ctx.fill(); ctx.stroke();
    if (swatch) { ctx.fillStyle = swatch; ctx.beginPath(); ctx.arc(pad + 10, canvas.height / 2, 10, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#1e293b'; ctx.textBaseline = 'middle';
    ctx.fillText(text, pad + dot, canvas.height / 2 + 1);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, sizeAttenuation: false }));
    sprite.scale.set(LABEL_HEIGHT * canvas.width / canvas.height, LABEL_HEIGHT, 1);
    sprite.center.set(align === 'right' ? 1 : align === 'left' ? 0 : 0.5, 0.5);
    sprite.position.copy(position); sprite.renderOrder = 4;
    target.add(sprite);
  }
  pick(framing: Framing): void { this.userFramed = true; this.frame(framing); }
  /** Enquadra a zona da operação ou o poço inteiro, de um ângulo que mostra o corte. */
  frame(framing: Framing): void {
    this.framing = framing === 'zone' && this.focus ? 'zone' : 'well';
    // A câmera primeiro: o espaçamento dos rótulos depende da distância dela.
    this.view(this.framing === 'zone' ? 'zone' : 'iso');
    this.refreshLabels();
    this.render();
  }
  view(view: 'iso' | 'front' | 'top' | 'zone'): void {
    if (!this.controls || !this.path) return;
    const direction = view === 'top' ? new THREE.Vector3(0, 1, .001)
      : view === 'front' ? new THREE.Vector3(0, 0, 1)
      : view === 'zone' ? new THREE.Vector3(.75, .3, 1) : new THREE.Vector3(1, .45, 1.4);
    direction.normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const bounds = this.frameBounds();
    const center = bounds.getCenter(new THREE.Vector3());
    const size = Math.max(bounds.getSize(new THREE.Vector3()).length(), 1);
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // Na horizontal, folga para os rótulos, que têm tamanho fixo na tela e ficam dos lados.
    const sides = this.framing === 'zone' && this.showOverlays && this.showLabels ? 2.2 : 1;
    let distance = size * 0.2;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const offset = new THREE.Vector3(x, y, z).sub(center);
      distance = Math.max(distance, offset.dot(direction) + Math.max(
        Math.abs(offset.dot(right)) * sides / (tangent * this.camera.aspect), Math.abs(offset.dot(up)) / tangent));
    }
    distance *= this.framing === 'zone' ? 1.1 : 1.12;
    this.controls.target.copy(center);
    this.camera.near = this.span / 20000; this.camera.far = this.span * 100;
    this.controls.minDistance = this.span * .002; this.controls.maxDistance = this.span * 15;
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.camera.updateProjectionMatrix(); this.controls.update(); this.render();
  }
  /** Caixa do trecho enquadrado: as seções do poço na zona, no raio desenhado, ou o modelo todo. */
  private frameBounds(): THREE.Box3 {
    if (this.framing !== 'zone' || !this.focus || !this.path) return new THREE.Box3().setFromObject(this.model);
    const [top, bottom] = this.focus;
    const radius = this.radiusOf(this.widestIn(top, bottom));
    const points = Array.from({ length: 25 }, (_, i) => frameAt(this.path!, top + (bottom - top) * i / 24, this.geometry.finalMD))
      .flatMap(f => [f.b, f.n].flatMap(d => [f.p.clone().addScaledVector(d, radius), f.p.clone().addScaledVector(d, -radius)]));
    return new THREE.Box3().setFromPoints(points);
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
      if (event.key === 'Home') this.frame(this.framing); else this.zoom(event.key === '-' ? 1.25 : .8);
    }
  }
  setThickness(value: string): void { this.thickness = Math.max(1, Math.min(12, Number(value) || DEFAULT_THICKNESS)); this.rebuild(false); }
  setPosition(value: string): void {
    if (!this.path) return;
    this.selectedMD = Math.max(0, Math.min(this.geometry.finalMD, depthToMetres(Number(value) || 0, this.depthUnit)));
    this.placeMarker(); this.render();
  }
  private readonly render = (): void => { this.renderer?.render(this.scene, this.camera); };
  contextLost(event: Event): void { event.preventDefault(); this.error = 'A visualização 3D foi interrompida.'; }
  contextRestored(): void { this.rebuild(false); }
  private disposeModel(): void {
    this.scene.remove(this.model);
    this.dispose(this.model);
    this.model = new THREE.Group(); this.marker = undefined; this.labels = new THREE.Group();
  }
  private dispose(root: THREE.Object3D): void {
    root.traverse(object => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
      for (const material of materials) {
        (material as THREE.MeshBasicMaterial).map?.dispose();
        material.dispose();
      }
    });
  }
  ngOnDestroy(): void {
    this.observer?.disconnect(); this.controls?.dispose(); this.disposeModel();
    this.renderer?.dispose(); this.renderer?.forceContextLoss(); this.renderer = undefined;
  }
}
