// 2차맵 유닛 발밑 나라 색 고리 — 질문 963 나(docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-11, 961·963)").
// - 나라가 있는 유닛(내 것·남의 것 모두)의 발밑에 그 나라 색 고리를 그린다. 캡슐로 그린 유닛도, 캐릭터 모델로 그린 유닛도 같은 고리다.
//   점(아이콘) 표현일 때는 그리지 않는다(점 하나보다 작아 읽히지 않는다).
// - 색 = 건물 깃발·용마루와 같은 국가 색 번호(buildings/buildingPalette.ts nationAccent — 기기가 같은 차례로 번호를 정한다).
// - 그리기 호출 1번: 고리 하나를 인스턴스로 그린다(화면 안 고리만 버퍼 앞쪽에 차례로 담는다 — 유닛 그림 unitView.ts와 같은 방식).
//   고리 하나 = 삼각형 48(둘레 24조각).
// - 고른 표시 고리(unitView.ts, 반지름 2.4 × 몸)보다 안쪽(1.7 × 몸)이라 둘이 겹쳐도 읽힌다. 멀리서도 보이게 화면 반지름 하한을 둔다.
import {
  Color,
  DynamicDrawUsage,
  type Frustum,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
  RingGeometry,
  SRGBColorSpace,
  Sphere,
} from "three";
import { nationAccent } from "../buildings/buildingPalette.ts";

/** 유닛 하나의 나라 색 번호(건물 국가 색과 같은 번호, 0 이상 정수) */
export interface UnitRing {
  readonly id: number;
  readonly accent: number;
}

/** 고리 바깥 반지름 = 몸 반지름 × 이 값(고른 표시 고리 2.4보다 안쪽) */
export const NATION_RING_SCALE = 1.7;
/** 고리 안쪽 반지름 / 바깥 반지름 */
const RING_INNER = 0.74;
/** 둘레 조각 수(삼각형 = 2 × 조각) */
const RING_SEGMENTS = 24;
/** 화면에서 가장 작을 때의 바깥 반지름(CSS px) — 멀리 캡슐로 그릴 때도 색이 읽히게 */
export const NATION_RING_MIN_PX = 5;
/** 땅 위로 띄우는 높이(m) — 고른 표시 고리(0.08)보다 낮게 */
const RING_LIFT_M = 0.05;

/** 고리가 프레임마다 읽는 값(유닛 명단·움직임 저장소·유닛 그림) */
export interface NationRingView {
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly cellM: number;
  readonly groundAt: (wx: number, wz: number) => number;
  readonly frustum: Frustum;
  /** 칸마다 몸 반지름(m) */
  readonly radiusOf: (slot: number) => number;
  /** 목표점에서 1m의 CSS 픽셀 */
  readonly pixelsPerMetre: number;
  /** 유닛 표현 단계가 점(아이콘)인가 */
  readonly icons: boolean;
}

export class NationRings {
  readonly group = new Group();
  /** 마지막 프레임에 그린 고리 수 */
  drawn = 0;
  private readonly capacity: number;
  private accents = new Map<number, number>();
  /** 칸마다 나라 색 번호(-1 = 나라 없음) */
  private readonly slotAccent: Int16Array;
  private bound = 0;
  private readonly geometry = new RingGeometry(RING_INNER, 1, RING_SEGMENTS, 1).rotateX(-Math.PI / 2);
  private readonly material = new MeshBasicMaterial({
    color: 0xffffff,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  private readonly mesh: InstancedMesh;
  private readonly matrices: Float32Array;
  private readonly matrixAttribute: InstancedBufferAttribute;
  private readonly colors: Float32Array;
  private readonly colorAttribute: InstancedBufferAttribute;
  private readonly sphere = new Sphere();
  private readonly color = new Color();

  constructor(capacity: number) {
    this.capacity = capacity;
    this.slotAccent = new Int16Array(capacity).fill(-1);
    this.matrices = new Float32Array(capacity * 16);
    this.matrixAttribute = new InstancedBufferAttribute(this.matrices, 16).setUsage(DynamicDrawUsage);
    this.colors = new Float32Array(capacity * 3);
    this.colorAttribute = new InstancedBufferAttribute(this.colors, 3).setUsage(DynamicDrawUsage);
    this.mesh = new InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.instanceMatrix = this.matrixAttribute;
    this.mesh.instanceColor = this.colorAttribute;
    this.mesh.count = 0;
    // 화면 밖 거르기는 이 파일이 고리마다 한다. 고른 표시 고리(renderOrder 0)보다 먼저 그린다
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.group.add(this.mesh);
  }

  /** 나라 색 목록을 통째로 바꾼다(유닛 ID → 번호). 틀린 번호는 버린다. 그 뒤 bind를 다시 부른다 */
  setRings(rows: readonly UnitRing[]): void {
    const next = new Map<number, number>();
    for (const row of rows) if (nationAccent(row.accent) !== null) next.set(row.id, row.accent);
    this.accents = next;
  }

  /** 유닛 명단이 바뀌었을 때: 칸 ↔ 나라 색을 다시 잇는다 */
  bind(count: number, idAt: (slot: number) => number | null): void {
    const n = Math.min(count, this.capacity);
    for (let slot = 0; slot < n; slot++) {
      const id = idAt(slot);
      this.slotAccent[slot] = id === null ? -1 : (this.accents.get(id) ?? -1);
    }
    for (let slot = n; slot < this.bound; slot++) this.slotAccent[slot] = -1;
    this.bound = n;
  }

  /** 그 칸의 나라 색 번호(없으면 null) */
  accentAt(slot: number): number | null {
    if (slot < 0 || slot >= this.bound) return null;
    const accent = this.slotAccent[slot] ?? -1;
    return accent >= 0 ? accent : null;
  }

  update(view: NationRingView): void {
    let drawn = 0;
    if (!view.icons) {
      const n = Math.min(view.count, this.bound);
      const minOuter = view.pixelsPerMetre > 0 ? NATION_RING_MIN_PX / view.pixelsPerMetre : 0;
      const m = this.matrices;
      const c = this.colors;
      for (let i = 0; i < n; i++) {
        const rgb = nationAccent(this.slotAccent[i]);
        if (rgb === null) continue;
        const wx = (view.x[i] ?? 0) * view.cellM;
        const wz = (view.y[i] ?? 0) * view.cellM;
        const outer = Math.max(view.radiusOf(i) * NATION_RING_SCALE, minOuter);
        const wy = view.groundAt(wx, wz) + RING_LIFT_M;
        this.sphere.center.set(wx, wy, wz);
        this.sphere.radius = outer;
        if (!view.frustum.intersectsSphere(this.sphere)) continue;
        const o = drawn * 16;
        m[o] = outer;
        m[o + 1] = 0;
        m[o + 2] = 0;
        m[o + 3] = 0;
        m[o + 4] = 0;
        m[o + 5] = 1;
        m[o + 6] = 0;
        m[o + 7] = 0;
        m[o + 8] = 0;
        m[o + 9] = 0;
        m[o + 10] = outer;
        m[o + 11] = 0;
        m[o + 12] = wx;
        m[o + 13] = wy;
        m[o + 14] = wz;
        m[o + 15] = 1;
        // 국가 색은 sRGB 값이다(건물 깃발과 같은 셈 — buildingView.ts setColor)
        this.color.setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace);
        c[drawn * 3] = this.color.r;
        c[drawn * 3 + 1] = this.color.g;
        c[drawn * 3 + 2] = this.color.b;
        drawn += 1;
      }
    }
    this.drawn = drawn;
    this.mesh.count = drawn;
    this.mesh.visible = drawn > 0;
    // 쓴 앞부분만 올린다
    this.matrixAttribute.clearUpdateRanges();
    this.matrixAttribute.addUpdateRange(0, drawn * 16);
    this.matrixAttribute.needsUpdate = true;
    this.colorAttribute.clearUpdateRanges();
    this.colorAttribute.addUpdateRange(0, drawn * 3);
    this.colorAttribute.needsUpdate = true;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
