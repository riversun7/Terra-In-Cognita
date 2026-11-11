// 유닛 그리기 — 인스턴싱. ADR 2026-10-28-unit-display-real-size(25): 늘 실제 크기, 외곽선·선택 링, 멀면 아이콘.
// - 실제 크기(model): 캡슐 인스턴스 1개 + 외곽선 인스턴스 1개(같은 인스턴스 행렬을 함께 쓴다). 그리기 2번.
//   화면(시야 절두체) 안 유닛만 인스턴스 버퍼 앞쪽에 차례로 담는다 — 가까이 볼 때 1,000개를 다 그리지 않는다.
//   그래서 인스턴스 번호는 유닛 칸(slot)과 다르다. 고르기·위치는 칸(UnitMotionStore)으로 한다.
// - 아이콘(icon): 화면 픽셀 크기가 같은 점(Points) 1개. 그리기 1번. 묶음(부대) 표시는 아직 없다(TODO).
// - 고른 유닛: 실제 크기면 발밑 링 + 강조 외곽선, 아이콘이면 큰 강조 점.
import {
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  DynamicDrawUsage,
  type Frustum,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Points,
  RingGeometry,
  type ShaderMaterial,
  Sphere,
} from "three";
import {
  HIGHLIGHT_COLOR,
  OUTLINE_COLOR,
  UnitBodyMaterial,
  applyPixelScale,
  createDotMaterial,
  createOutlineMaterial,
} from "./unitMaterials.ts";

export type UnitDisplayMode = "model" | "icon";

export interface UnitLook {
  /** 키(m) */
  heightM: number;
  /** 몸 반지름(m) */
  radiusM: number;
  /** 색 0xRRGGBB */
  color: number;
}

/** 기본 캡슐: 반지름 0.5m, 전체 키 2m(가운데 1m + 위아래 반구). 유닛마다 크기를 늘리고 줄인다 */
const BASE_RADIUS = 0.5;
const BASE_HEIGHT = 2;
/** 캡슐 반구 단 수·둘레 조각 수 */
const CAPSULE_CAP_SEGMENTS = 6;
const CAPSULE_RADIAL_SEGMENTS = 20;
/** 외곽선 두께(CSS px) */
const OUTLINE_PX = 1.25;
const HIGHLIGHT_PX = 3;
/** 아이콘 점 지름(CSS px) */
const DOT_PX = 7;
const SELECTED_DOT_PX = 13;
/** 선택 링이 화면에서 가장 작을 때의 반지름(CSS px) */
const RING_MIN_PX = 14;
/**
 * 선택 링 그리는 차례: 깊이를 쓰지 않으므로 땅을 다 그린 뒤에 그린다. 불투명 물체는 renderOrder가 같으면 재질 번호 차례라, 링보다 나중에 만든
 * 지형 재질(이웃 2차맵 지형, 걸어 넘은 뒤 지금 지형으로 들인 이웃 지형)이 링을 덮었다(화소로 확인 — docs/adr/2026-11-11-character-3d.md
 * "바뀜 (2026-11-11, 962)"). 나라 색 고리(18, nationRings.ts)보다 뒤, 경로 고리(19, routeView.ts)보다 앞
 */
export const SELECTION_RING_RENDER_ORDER = 18.5;
/** 화면 밖 거르기에서 경계 구를 넉넉히(m) — 외곽선 두께 등 */
const CULL_MARGIN_M = 0.5;

export class UnitView {
  readonly group = new Group();
  readonly capacity: number;
  mode: UnitDisplayMode = "model";
  /** 마지막 프레임에 실제 크기로 그린 유닛 수(화면 안) */
  drawnModels = 0;
  private count = 0;
  private readonly heights: Float32Array;
  private readonly radii: Float32Array;
  /** 유닛 칸마다 색(0~1) — 인스턴스 색은 프레임마다 화면 안 유닛만 차례로 담는다 */
  private readonly slotColors: Float32Array;
  /** 인스턴스 행렬(16칸, 열 우선)·색 — 몸·외곽선이 같은 행렬 버퍼를 쓴다 */
  private readonly matrices: Float32Array;
  private readonly matrixAttribute: InstancedBufferAttribute;
  private readonly instanceColors: Float32Array;
  private readonly colorAttribute: InstancedBufferAttribute;
  // 반구 6단 × 둘레 20(꼭짓점 약 300개): 가까이 보면 3 × 10은 각이 보였다. 인스턴스라 화면 안 유닛만 그려 부담이 작다
  private readonly geometry = new CapsuleGeometry(
    BASE_RADIUS,
    BASE_HEIGHT - 2 * BASE_RADIUS,
    CAPSULE_CAP_SEGMENTS,
    CAPSULE_RADIAL_SEGMENTS,
  );
  private readonly body = new UnitBodyMaterial();
  private readonly outlineMaterial = createOutlineMaterial(OUTLINE_COLOR, OUTLINE_PX);
  private readonly highlightMaterial = createOutlineMaterial(HIGHLIGHT_COLOR, HIGHLIGHT_PX);
  private readonly bodies: InstancedMesh;
  private readonly outlines: InstancedMesh;
  private readonly dotGeometry = new BufferGeometry();
  private readonly dotPositions: Float32Array;
  private readonly dotColors: Uint8Array;
  private readonly dotMaterial = createDotMaterial(DOT_PX);
  private readonly dots: Points;
  private readonly ringGeometry = new RingGeometry(0.78, 1, 40).rotateX(-Math.PI / 2);
  private readonly ringMaterial = new MeshBasicMaterial({
    color: HIGHLIGHT_COLOR,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  private readonly ring: Mesh;
  private readonly selectedHull: Mesh;
  private readonly selectedDotGeometry = new BufferGeometry();
  private readonly selectedDotMaterial = createDotMaterial(SELECTED_DOT_PX);
  private readonly selectedDot: Points;
  private readonly color = new Color();
  private readonly sphere = new Sphere();

  constructor(capacity: number) {
    this.capacity = capacity;
    this.heights = new Float32Array(capacity);
    this.radii = new Float32Array(capacity);
    this.slotColors = new Float32Array(capacity * 3);

    this.matrices = new Float32Array(capacity * 16);
    this.matrixAttribute = new InstancedBufferAttribute(this.matrices, 16).setUsage(DynamicDrawUsage);
    this.instanceColors = new Float32Array(capacity * 3);
    this.colorAttribute = new InstancedBufferAttribute(this.instanceColors, 3).setUsage(DynamicDrawUsage);
    this.bodies = new InstancedMesh(this.geometry, this.body.material, capacity);
    this.bodies.instanceMatrix = this.matrixAttribute;
    this.bodies.instanceColor = this.colorAttribute;
    this.outlines = new InstancedMesh(this.geometry, this.outlineMaterial, capacity);
    // 외곽선은 몸과 같은 행렬을 쓴다(한 번 올리면 둘 다 그린다)
    this.outlines.instanceMatrix = this.matrixAttribute;

    this.dotPositions = new Float32Array(capacity * 3);
    this.dotColors = new Uint8Array(capacity * 3);
    this.dotGeometry.setAttribute(
      "position",
      new BufferAttribute(this.dotPositions, 3).setUsage(DynamicDrawUsage),
    );
    this.dotGeometry.setAttribute("aColor", new BufferAttribute(this.dotColors, 3, true));
    this.dots = new Points(this.dotGeometry, this.dotMaterial);
    // 아이콘은 물 판(반투명)보다 뒤에 그린다 — 반투명 목록에 넣는다
    this.dotMaterial.transparent = true;
    this.dots.renderOrder = 20;

    this.ring = new Mesh(this.ringGeometry, this.ringMaterial);
    this.ring.renderOrder = SELECTION_RING_RENDER_ORDER;
    this.selectedHull = new Mesh(this.geometry, this.highlightMaterial);
    this.selectedHull.matrixAutoUpdate = false;

    this.selectedDotGeometry.setAttribute("position", new BufferAttribute(new Float32Array(3), 3));
    const highlight = new Color(HIGHLIGHT_COLOR);
    this.selectedDotGeometry.setAttribute(
      "aColor",
      new BufferAttribute(
        new Uint8Array([highlight.r * 255, highlight.g * 255, highlight.b * 255].map(Math.round)),
        3,
        true,
      ),
    );
    this.selectedDot = new Points(this.selectedDotGeometry, this.selectedDotMaterial);
    this.selectedDotMaterial.transparent = true;
    this.selectedDot.renderOrder = 21;

    // 화면 밖 거르기는 이 파일이 유닛마다 한다(three.js의 물체 단위 거르기는 끈다)
    for (const object of [
      this.bodies,
      this.outlines,
      this.dots,
      this.ring,
      this.selectedHull,
      this.selectedDot,
    ]) {
      object.frustumCulled = false;
      this.group.add(object);
    }
    this.setCount(0);
    this.applyMode();
  }

  get size(): number {
    return this.count;
  }

  setCount(count: number): void {
    if (count < 0 || count > this.capacity) throw new RangeError(`unit count out of range: ${count}`);
    this.count = count;
    this.bodies.count = 0;
    this.outlines.count = 0;
    this.dotGeometry.setDrawRange(0, count);
  }

  /** 유닛 하나의 키·굵기·색 */
  setLook(slot: number, look: UnitLook): void {
    this.heights[slot] = look.heightM;
    this.radii[slot] = look.radiusM;
    this.color.setHex(look.color);
    this.slotColors[slot * 3] = this.color.r;
    this.slotColors[slot * 3 + 1] = this.color.g;
    this.slotColors[slot * 3 + 2] = this.color.b;
    this.dotColors[slot * 3] = Math.round(this.color.r * 255);
    this.dotColors[slot * 3 + 1] = Math.round(this.color.g * 255);
    this.dotColors[slot * 3 + 2] = Math.round(this.color.b * 255);
    this.dotGeometry.getAttribute("aColor").needsUpdate = true;
  }

  heightOf(slot: number): number {
    return this.heights[slot] ?? 0;
  }

  radiusOf(slot: number): number {
    return this.radii[slot] ?? 0;
  }

  setMode(mode: UnitDisplayMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.applyMode();
  }

  /** 밤 빛: 몸이 자기 색 × 값만큼 스스로 낸다(2차맵 낮밤. 0이면 낮과 같다) */
  setNightLift(value: number): void {
    this.body.setNightLift(value);
  }

  /** 그리기 버퍼 크기·픽셀 비율이 바뀌면(외곽선 두께·점 크기를 화면 픽셀로 맞춘다) */
  setPixelScale(drawingWidth: number, drawingHeight: number, pixelRatio: number): void {
    const materials: ShaderMaterial[] = [
      this.outlineMaterial,
      this.highlightMaterial,
      this.dotMaterial,
      this.selectedDotMaterial,
    ];
    for (const material of materials) applyPixelScale(material, drawingWidth, drawingHeight, pixelRatio);
  }

  /**
   * 위치를 반영한다. x·y는 배치 칸 좌표, cellM은 배치 칸 한 변(m), groundAt은 땅 높이(m), frustum은 카메라 시야.
   * selected는 고른 칸(없으면 -1), pixelsPerMetre는 목표점에서 1m의 CSS 픽셀(선택 링 최소 크기용).
   * skip[칸]이 0이 아닌 유닛은 캡슐을 그리지 않는다(캐릭터 모델로 그린 유닛 — characters/characterLayer.ts). 고른 표시는 발밑 고리만 그린다.
   */
  update(
    x: Float32Array,
    y: Float32Array,
    cellM: number,
    groundAt: (wx: number, wz: number) => number,
    frustum: Frustum,
    selected: number,
    pixelsPerMetre: number,
    skip?: Uint8Array,
  ): void {
    const n = this.count;
    if (this.mode === "model") {
      const m = this.matrices;
      const c = this.instanceColors;
      let drawn = 0;
      for (let i = 0; i < n; i++) {
        if (skip !== undefined && skip[i] !== 0) continue;
        const wx = (x[i] ?? 0) * cellM;
        const wz = (y[i] ?? 0) * cellM;
        const height = this.heights[i] ?? 0;
        const radius = this.radii[i] ?? 0;
        const wy = groundAt(wx, wz) + height / 2;
        this.sphere.center.set(wx, wy, wz);
        this.sphere.radius = Math.max(height / 2, radius) + CULL_MARGIN_M;
        if (!frustum.intersectsSphere(this.sphere)) continue;
        writeMatrix(m, drawn * 16, radius, height, wx, wy, wz);
        c[drawn * 3] = this.slotColors[i * 3] ?? 1;
        c[drawn * 3 + 1] = this.slotColors[i * 3 + 1] ?? 1;
        c[drawn * 3 + 2] = this.slotColors[i * 3 + 2] ?? 1;
        drawn += 1;
      }
      this.drawnModels = drawn;
      this.bodies.count = drawn;
      this.outlines.count = drawn;
      // 쓴 앞부분만 올린다
      this.matrixAttribute.clearUpdateRanges();
      this.matrixAttribute.addUpdateRange(0, drawn * 16);
      this.matrixAttribute.needsUpdate = true;
      this.colorAttribute.clearUpdateRanges();
      this.colorAttribute.addUpdateRange(0, drawn * 3);
      this.colorAttribute.needsUpdate = true;
    } else {
      this.drawnModels = 0;
      const p = this.dotPositions;
      for (let i = 0; i < n; i++) {
        const wx = (x[i] ?? 0) * cellM;
        const wz = (y[i] ?? 0) * cellM;
        p[i * 3] = wx;
        p[i * 3 + 1] = groundAt(wx, wz) + (this.heights[i] ?? 0) / 2;
        p[i * 3 + 2] = wz;
      }
      this.dotGeometry.getAttribute("position").needsUpdate = true;
    }
    this.updateSelection(x, y, cellM, groundAt, selected, pixelsPerMetre);
    // 모델로 그린 유닛에는 캡슐 강조 외곽선을 씌우지 않는다(발밑 고리만)
    if (skip !== undefined && selected >= 0 && skip[selected] !== 0) this.selectedHull.visible = false;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geometry.dispose();
    this.dotGeometry.dispose();
    this.ringGeometry.dispose();
    this.selectedDotGeometry.dispose();
    for (const material of [
      this.body.material,
      this.outlineMaterial,
      this.highlightMaterial,
      this.dotMaterial,
      this.ringMaterial,
      this.selectedDotMaterial,
    ]) {
      material.dispose();
    }
    this.bodies.dispose();
    this.outlines.dispose();
  }

  private applyMode(): void {
    const model = this.mode === "model";
    this.bodies.visible = model;
    this.outlines.visible = model;
    this.dots.visible = !model;
  }

  private updateSelection(
    x: Float32Array,
    y: Float32Array,
    cellM: number,
    groundAt: (wx: number, wz: number) => number,
    selected: number,
    pixelsPerMetre: number,
  ): void {
    const has = selected >= 0 && selected < this.count;
    const model = this.mode === "model";
    this.ring.visible = has && model;
    this.selectedHull.visible = has && model;
    this.selectedDot.visible = has && !model;
    if (!has) return;
    const wx = (x[selected] ?? 0) * cellM;
    const wz = (y[selected] ?? 0) * cellM;
    const ground = groundAt(wx, wz);
    const height = this.heights[selected] ?? 0;
    if (model) {
      const radius = this.radii[selected] ?? 0.3;
      const outer = Math.max(radius * 2.4, pixelsPerMetre > 0 ? RING_MIN_PX / pixelsPerMetre : 0);
      this.ring.position.set(wx, ground + 0.08, wz);
      this.ring.scale.set(outer, 1, outer);
      writeMatrix(this.selectedHull.matrix.elements, 0, radius, height, wx, ground + height / 2, wz);
      this.selectedHull.matrixWorldNeedsUpdate = true;
    } else {
      const position = this.selectedDotGeometry.getAttribute("position");
      position.setXYZ(0, wx, ground + height / 2, wz);
      position.needsUpdate = true;
    }
  }
}

/** 크기(반지름·키)와 위치만 있는 행렬(열 우선)을 out[o…o+15]에 쓴다 */
function writeMatrix(
  out: Float32Array | number[],
  o: number,
  radius: number,
  height: number,
  x: number,
  y: number,
  z: number,
): void {
  const horizontal = radius / BASE_RADIUS;
  out[o] = horizontal;
  out[o + 1] = 0;
  out[o + 2] = 0;
  out[o + 3] = 0;
  out[o + 4] = 0;
  out[o + 5] = height / BASE_HEIGHT;
  out[o + 6] = 0;
  out[o + 7] = 0;
  out[o + 8] = 0;
  out[o + 9] = 0;
  out[o + 10] = horizontal;
  out[o + 11] = 0;
  out[o + 12] = x;
  out[o + 13] = y;
  out[o + 14] = z;
  out[o + 15] = 1;
}
