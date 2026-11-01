// 전투 효과 층 — 2차맵 엔진 덧그림 층(render/engineLayers.ts)으로 전투 그림을 그린다. docs/adr/2026-11-01-battle-replay.md 6절.
// 받는 것은 그릴 목록뿐이다(배치 칸 좌표·진행 0~1·색). 리플레이 형식·스킬 ID를 모른다(해석은 게임 앱 replayTimeline.ts).
// - 유닛 발밑: 편 색 고리 + 바라보는 쪽 표(삼각). 쓰러지면 회색, 고른 유닛은 고리가 크다.
// - 효과: 투사체(구), 범위 고리(퍼지며 옅어짐), 빛기둥(회복·강화), 빔(연쇄 선), 번쩍임(맞음).
// 물체는 미리 만든 묶음(pool)을 돌려 쓴다(프레임마다 만들지 않는다). 그리기 호출은 보이는 물체 수만큼(수십 개).
import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import type { EngineLayer, EngineLayerView } from "../render/engineLayers.ts";

/** 세계 색(테마와 무관, D-070): 편 색, 효과 색 */
export const BATTLE_TEAM_COLORS = [0x3d7bff, 0xff5a4e, 0x47c26a, 0xffb02e] as const;
export const BATTLE_FX_COLORS = {
  physical: 0xfff3d6,
  heal: 0x5ee38b,
  buff: 0xffd166,
  debuff: 0xb06bff,
  down: 0x6b6f76,
  neutral: 0xd9dde3,
} as const;
/** 속성 12개(물·빙결·불·폭렬·바람·번개·땅·크리스탈·빛·성·어둠·사령, 기획 45 §5.3 차례) */
export const BATTLE_ELEMENT_COLORS = [
  0x3fa7ff, 0x9fe8ff, 0xff6a2b, 0xffa62b, 0x7fe08a, 0xf5f06a, 0xb58a52, 0xd29bff, 0xfff6c9, 0xffe27a,
  0x9b5cff, 0x6a7f6e,
] as const;

export function teamColor(team: number): number {
  return (
    BATTLE_TEAM_COLORS[
      ((team % BATTLE_TEAM_COLORS.length) + BATTLE_TEAM_COLORS.length) % BATTLE_TEAM_COLORS.length
    ] ?? 0xffffff
  );
}

export function elementColor(element: number): number {
  return element >= 0
    ? (BATTLE_ELEMENT_COLORS[element] ?? BATTLE_FX_COLORS.neutral)
    : BATTLE_FX_COLORS.neutral;
}

export interface BattleFxUnit {
  /** 배치 칸 좌표(칸 가운데 = 정수 + 0.5) */
  readonly x: number;
  readonly y: number;
  /** 편 색 번호(BATTLE_TEAM_COLORS) */
  readonly team: number;
  /** 0 북 → 시계 방향 8방향 */
  readonly facing: number;
  readonly alive: boolean;
  /** 감춤(퇴각·참전 전) */
  readonly hidden: boolean;
  readonly selected: boolean;
}

export type BattleFxItem =
  | {
      readonly kind: "projectile";
      readonly fromX: number;
      readonly fromY: number;
      readonly toX: number;
      readonly toY: number;
      readonly progress: number;
      readonly color: number;
      /** 지름(m) */
      readonly size: number;
    }
  | {
      readonly kind: "ring";
      readonly x: number;
      readonly y: number;
      readonly radiusCells: number;
      readonly progress: number;
      readonly color: number;
    }
  | {
      readonly kind: "glow";
      readonly x: number;
      readonly y: number;
      readonly progress: number;
      readonly color: number;
    }
  | {
      readonly kind: "beam";
      readonly fromX: number;
      readonly fromY: number;
      readonly toX: number;
      readonly toY: number;
      readonly progress: number;
      readonly color: number;
    }
  | {
      readonly kind: "flash";
      readonly x: number;
      readonly y: number;
      readonly progress: number;
      readonly color: number;
    };

/** 몸 가운데 높이(m, 유닛 키 2.4의 반쯤) */
const BODY_LIFT_M = 1.2;
const POOL = 48;

class Pool {
  readonly meshes: Mesh[] = [];
  private used = 0;
  constructor(group: Group, geometry: BufferGeometry, make: () => MeshBasicMaterial, size: number) {
    for (let i = 0; i < size; i++) {
      const mesh = new Mesh(geometry, make());
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 30;
      group.add(mesh);
      this.meshes.push(mesh);
    }
  }
  begin(): void {
    this.used = 0;
  }
  next(color: number, opacity: number): Mesh | null {
    const mesh = this.meshes[this.used];
    if (!mesh) return null;
    this.used += 1;
    mesh.visible = true;
    const material = mesh.material;
    if (material instanceof MeshBasicMaterial) {
      material.color.setHex(color);
      material.opacity = opacity;
    }
    return mesh;
  }
  end(): void {
    for (let i = this.used; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      if (mesh) mesh.visible = false;
    }
  }
}

const fxMaterial = (additive: boolean) => (): MeshBasicMaterial =>
  new MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    ...(additive ? { blending: AdditiveBlending } : {}),
  });

export class BattleFxLayer implements EngineLayer {
  readonly object = new Group();
  private units: readonly BattleFxUnit[] = [];
  private items: readonly BattleFxItem[] = [];
  private readonly geometries: BufferGeometry[];
  private readonly materials: Material[] = [];
  private readonly ringGeometry = new RingGeometry(0.72, 1, 40).rotateX(-Math.PI / 2);
  private readonly markGeometry: ShapeGeometry;
  private readonly sphereGeometry = new SphereGeometry(0.5, 12, 8);
  private readonly glowGeometry = new CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0);
  private readonly beamGeometry = new BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
  private readonly unitRings: Pool;
  private readonly unitMarks: Pool;
  private readonly projectiles: Pool;
  private readonly rings: Pool;
  private readonly glows: Pool;
  private readonly beams: Pool;
  private readonly flashes: Pool;
  private readonly from = new Vector3();
  private readonly to = new Vector3();

  constructor(unitCapacity = 64) {
    // 바라보는 쪽 표: 고리 바깥의 작은 삼각(북쪽을 가리키게 만들고 돌린다)
    const shape = new Shape();
    shape.moveTo(0, -1.25);
    shape.lineTo(0.28, -0.92);
    shape.lineTo(-0.28, -0.92);
    shape.closePath();
    this.markGeometry = new ShapeGeometry(shape).rotateX(Math.PI / 2);
    this.geometries = [
      this.ringGeometry,
      this.markGeometry,
      this.sphereGeometry,
      this.glowGeometry,
      this.beamGeometry,
    ];
    const plain = (): MeshBasicMaterial => {
      const material = new MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        side: DoubleSide,
      });
      this.materials.push(material);
      return material;
    };
    const glow = (additive: boolean) => (): MeshBasicMaterial => {
      const material = fxMaterial(additive)();
      this.materials.push(material);
      return material;
    };
    this.unitRings = new Pool(this.object, this.ringGeometry, plain, unitCapacity);
    this.unitMarks = new Pool(this.object, this.markGeometry, plain, unitCapacity);
    this.projectiles = new Pool(this.object, this.sphereGeometry, glow(false), POOL);
    this.rings = new Pool(this.object, this.ringGeometry, glow(true), POOL);
    this.glows = new Pool(this.object, this.glowGeometry, glow(true), POOL);
    this.beams = new Pool(this.object, this.beamGeometry, glow(true), POOL);
    this.flashes = new Pool(this.object, this.sphereGeometry, glow(true), POOL);
  }

  setUnits(units: readonly BattleFxUnit[]): void {
    this.units = units;
  }

  setItems(items: readonly BattleFxItem[]): void {
    this.items = items;
  }

  after(view: EngineLayerView): void {
    const cell = view.cellM;
    const ground = (x: number, y: number): number => view.groundAt(x * cell, y * cell);
    this.unitRings.begin();
    this.unitMarks.begin();
    for (const unit of this.units) {
      if (unit.hidden) continue;
      const color = unit.alive ? teamColor(unit.team) : BATTLE_FX_COLORS.down;
      const radius = (unit.selected ? 0.62 : 0.48) * cell;
      const y = ground(unit.x, unit.y) + 0.06;
      const ring = this.unitRings.next(color, unit.alive ? 0.95 : 0.5);
      if (ring) {
        ring.position.set(unit.x * cell, y, unit.y * cell);
        ring.scale.set(radius, 1, radius);
      }
      if (!unit.alive) continue;
      const mark = this.unitMarks.next(color, 0.95);
      if (mark) {
        mark.position.set(unit.x * cell, y, unit.y * cell);
        mark.scale.set(radius, 1, radius);
        // 0 북(−z) → 시계 방향: three의 y축 회전은 반시계라 음수로
        mark.rotation.set(0, (-unit.facing * Math.PI) / 4, 0);
      }
    }
    this.unitRings.end();
    this.unitMarks.end();

    for (const pool of [this.projectiles, this.rings, this.glows, this.beams, this.flashes]) pool.begin();
    for (const item of this.items) this.place(item, cell, ground);
    for (const pool of [this.projectiles, this.rings, this.glows, this.beams, this.flashes]) pool.end();
  }

  private place(item: BattleFxItem, cell: number, ground: (x: number, y: number) => number): void {
    const p = Math.min(1, Math.max(0, item.progress));
    switch (item.kind) {
      case "projectile": {
        const x = item.fromX + (item.toX - item.fromX) * p;
        const y = item.fromY + (item.toY - item.fromY) * p;
        // 낮은 포물선(가운데에서 칸 반쯤 위)
        const arc = Math.sin(p * Math.PI) * cell * 0.35;
        const mesh = this.projectiles.next(item.color, 1);
        if (!mesh) return;
        mesh.position.set(x * cell, ground(x, y) + BODY_LIFT_M + arc, y * cell);
        mesh.scale.setScalar(item.size);
        return;
      }
      case "ring": {
        const mesh = this.rings.next(item.color, 0.85 * (1 - p));
        if (!mesh) return;
        const radius = Math.max(0.5, item.radiusCells + 0.5) * cell * (0.35 + 0.65 * p);
        mesh.position.set(item.x * cell, ground(item.x, item.y) + 0.12, item.y * cell);
        mesh.scale.set(radius, 1, radius);
        return;
      }
      case "glow": {
        const mesh = this.glows.next(item.color, 0.55 * (1 - p));
        if (!mesh) return;
        const radius = cell * 0.28;
        mesh.position.set(item.x * cell, ground(item.x, item.y), item.y * cell);
        mesh.scale.set(radius, 2.4 + 2.2 * p, radius);
        return;
      }
      case "beam": {
        const mesh = this.beams.next(item.color, 0.9 * (1 - p));
        if (!mesh) return;
        this.from.set(item.fromX * cell, ground(item.fromX, item.fromY) + BODY_LIFT_M, item.fromY * cell);
        this.to.set(item.toX * cell, ground(item.toX, item.toY) + BODY_LIFT_M, item.toY * cell);
        mesh.position.copy(this.from);
        mesh.lookAt(this.to);
        const thick = 0.35 * (1 - p * 0.5);
        mesh.scale.set(thick, thick, Math.max(0.01, this.from.distanceTo(this.to)));
        return;
      }
      case "flash": {
        const mesh = this.flashes.next(item.color, 0.9 * (1 - p));
        if (!mesh) return;
        mesh.position.set(item.x * cell, ground(item.x, item.y) + BODY_LIFT_M, item.y * cell);
        mesh.scale.setScalar(1.2 + 2.2 * p);
        return;
      }
      default: {
        const unknown: never = item;
        throw new RangeError(`unknown fx ${String(unknown)}`);
      }
    }
  }

  dispose(): void {
    this.object.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}
