import type { PrimaryConfiguration, PrimaryPathZone } from '../models/primary-cementing.model';
import type { PrimaryGeometrySegment, PrimaryResolvedAccessory } from '../models/primary-geometry.model';
import type { WellGeometryIssue } from '../models/well-geometry.model';

/** Cavidades em série: volume adicional ao tubo, com localização e lado explícitos. */
export function resolvePrimaryAccessories(primary: PrimaryConfiguration, segments: PrimaryGeometrySegment[]): {
  accessories: PrimaryResolvedAccessory[]; issues: WellGeometryIssue[];
} {
  const accessories: PrimaryResolvedAccessory[] = [];
  const issues: WellGeometryIssue[] = [];
  const ids = new Set<string>();
  const error = (code: string, message: string) => issues.push({ code, message, level: 'error' as const });
  for (const retained of primary.retainedVolumes) {
    if (!retained.id.trim() || ids.has(retained.id)) error('PRIMARY_RETAINED_ID', 'Volumes retidos precisam de IDs distintos.');
    ids.add(retained.id);
    if (retained.kind === 'shoe-track') {
      if (retained.zone !== 'internal' || retained.assemblyId !== primary.target?.casingAssemblyId ||
        retained.topMD !== primary.target?.floatCollarMD || retained.bottomMD !== primary.target?.shoeMD)
        error('PRIMARY_TRACK_GEOMETRY', `${retained.id}: o shoe track deve coincidir com o trecho interno entre colar e sapata.`);
      continue; // Já incluído no volume tubular: nunca adicionar novamente.
    }
    if (!Number.isFinite(retained.md) || !Number.isFinite(retained.volumeBbl) || retained.volumeBbl <= 0 ||
      (retained.connectionSide !== undefined && !['shallower', 'deeper'].includes(retained.connectionSide))) {
      error('PRIMARY_ACCESSORY_VALUE', `${retained.id}: informe posição finita, volume adicional positivo e lado válido.`);
      continue;
    }
    let owners = segments.filter(s => s.equipmentId === retained.assemblyId &&
      retained.md >= s.topMD && retained.md <= s.bottomMD);
    if (retained.connectionSide === 'shallower') owners = owners.filter(s => s.bottomMD === retained.md);
    if (retained.connectionSide === 'deeper') owners = owners.filter(s => s.topMD === retained.md);
    // Em uma continuidade simples, o ponto fica no início do trecho mais profundo.
    // No assento/porta, essa escolha mudaria a conectividade e exige declaração.
    if (owners.length === 2 && retained.connectionSide === undefined &&
      !primary.devices.some(d => d.seatMD === retained.md || d.outletMD === retained.md))
      owners = owners.filter(s => s.topMD === retained.md);
    if (owners.length !== 1) {
      error('PRIMARY_ACCESSORY_LOCATION', `${retained.id}: informe a montagem e o lado da conexão (acima/abaixo) na profundidade do acessório.`);
      continue;
    }
    const owner = owners[0];
    if (retained.md !== owner.topMD && retained.md !== owner.bottomMD) {
      error('PRIMARY_ACCESSORY_CUT', `${retained.id}: falta segmentação na posição do acessório.`);
      continue;
    }
    accessories.push({ id: retained.id, assemblyId: retained.assemblyId, zone: retained.zone,
      md: retained.md, volumeBbl: retained.volumeBbl, ownerSegmentId: owner.id });
  }
  return { accessories: issues.length ? [] : accessories, issues };
}

/** Intervalos devem estar cortados nas extremidades; posse resolve pontos na fronteira. */
export function accessoryVolumeBetween(accessories: PrimaryResolvedAccessory[], segments: PrimaryGeometrySegment[],
  zone: PrimaryPathZone, topMD: number, bottomMD: number): number {
  const owners = new Set(segments.filter(s => s.topMD >= topMD && s.bottomMD <= bottomMD).map(s => s.id));
  return accessories.filter(a => a.zone === zone && owners.has(a.ownerSegmentId)).reduce((sum, a) => sum + a.volumeBbl, 0);
}
