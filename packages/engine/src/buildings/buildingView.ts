// 건물 그리기 — 시설 종류별 로우폴리 모델(buildingModels.ts)을 도형마다 InstancedMesh 하나로 그린다(ADR 2026-11-08-building-art).
// - 그리기 호출 = 쓰는 도형 수(최대 7: 상자·박공·사각뿔·원기둥·원뿔·반구·창문 빛). 건물 수와 상관없다.
// - 재질 둘을 모든 건물이 함께 쓴다: 몸(Lambert, 각진 면 + 밤 빛), 창문 빛(빛을 받지 않는 색: 낮 유리 ~ 밤 불빛).
// - 건물은 정적이라 행렬·색은 목록이 바뀔 때(set) 한 번만 쓴다. 프레임마다 하는 일은 없다(밤 정도가 바뀌면 재질 값 둘).
// - 비탈: 모델은 가장 높은 모서리 땅에 서고, 바닥 판은 가장 낮은 모서리보다 조금 아래까지 내려 기단처럼 보인다.
// - 누르기: 조각마다 세계 경계 상자를 두고 시선과 가장 먼저 만나는 건물을 찾는다(pick). 바닥 판도 들어 판 위를 누르면 그 건물이다.
import {
  type BufferGeometry,
  Color,
  Group,
  type IUniform,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "three";
import { UNIT_BODY_SHADER_INSERT } from "../units/unitMaterials.ts";
import type { Vec3 } from "../camera/cameraMath.ts";
import { rayBoxDistance } from "../picking.ts";
import { createPartGeometry } from "./buildingGeometry.ts";
import { resolveLook } from "./buildingLook.ts";
import { buildingModel } from "./buildingModels.ts";
import { BUILDING_NIGHT_LIFT, type Rgb, WINDOW_DAY, WINDOW_NIGHT } from "./buildingPalette.ts";
import { type BuildingPart, PART_SHAPES, type PartShape } from "./buildingParts.ts";
import { type BuildingFootprint, footprintRect } from "./footprint.ts";

/** 비탈에서 바닥 판을 가장 낮은 모서리보다 더 내리는 깊이(m) */
const SINK_M = 0.5;
/** three 프로그램 캐시 키 — 유닛 몸(같은 Lambert + 밤 빛)과 나눠 쓰지 않게 따로 준다 */
const BODY_PROGRAM_KEY = "terra-building-body";
const HALF_TURN = Math.PI / 2;

/** 누른 건물: ID, 판 안 자리(세계 m, 판 가장자리에서 조금 안), 시선 거리(m) */
export interface BuildingHit {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly distance: number;
}

/** 건물 몸 재질: 인스턴스 색 Lambert(각진 면) + 밤 빛(자기 색 × 값) */
class BuildingBodyMaterial {
  readonly material = new MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  private readonly uniforms: { uNightLift: IUniform<number> } = { uNightLift: { value: 0 } };

  constructor() {
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      const { anchor, code, pars } = UNIT_BODY_SHADER_INSERT;
      shader.fragmentShader = shader.fragmentShader
        .replace(pars[0], `${pars[0]}\n${pars[1]}`)
        .replace(anchor, `${anchor}\n${code}`);
    };
    this.material.customProgramCacheKey = () => BODY_PROGRAM_KEY;
  }

  setNightLift(value: number): void {
    this.uniforms.uNightLift.value = Math.max(0, value);
  }
}

export class BuildingView {
  readonly group = new Group();
  private readonly geometries = new Map<PartShape, BufferGeometry>();
  private readonly body = new BuildingBodyMaterial();
  private readonly glow = new MeshBasicMaterial({ color: 0xffffff });
  private readonly meshes: InstancedMesh[] = [];
  /** 누르기: 조각마다 세계 경계 상자(minX, minY, minZ, maxX, maxY, maxZ)와 그 건물 차례 */
  private boxes = new Float32Array(0);
  private owners = new Int32Array(0);
  /** 건물 차례마다 ID와 판(세계 m: x0, z0, x1, z1) */
  private ids: number[] = [];
  private rects = new Float32Array(0);
  private partCount = 0;
  private night = -1;

  constructor() {
    for (const shape of PART_SHAPES) this.geometries.set(shape, createPartGeometry(shape));
    this.setNight(0);
  }

  /** 건물 목록을 통째로 바꾼다(정적이라 행렬·색은 이때 한 번만 쓴다) */
  set(
    buildings: readonly BuildingFootprint[],
    cellM: number,
    groundAt: (wx: number, wz: number) => number,
  ): void {
    this.clear();
    if (buildings.length === 0) return;
    // 모델을 먼저 모두 만들어 도형별 수를 센다(InstancedMesh 크기)
    const models = buildings.map((building) => {
      const look = resolveLook(building.look);
      return buildingModel({
        kind: look.kind,
        widthM: building.width * cellM,
        depthM: building.depth * cellM,
        level: look.level,
        state: look.state,
        upgrading: look.upgrading,
        accent: look.accent,
        seed: building.id,
        wall: look.wall,
        roof: look.roof,
        heightPm: look.heightPm,
      });
    });
    const counts = new Map<PartShape, number>(PART_SHAPES.map((shape) => [shape, 0]));
    let total = 0;
    for (const parts of models)
      for (const part of parts) {
        counts.set(part.shape, (counts.get(part.shape) ?? 0) + 1);
        total++;
      }
    const meshes = new Map<PartShape, InstancedMesh>();
    for (const shape of PART_SHAPES) {
      const count = counts.get(shape) ?? 0;
      const geometry = this.geometries.get(shape);
      if (count === 0 || !geometry) continue;
      const mesh = new InstancedMesh(geometry, shape === "glow" ? this.glow : this.body.material, count);
      mesh.count = 0;
      meshes.set(shape, mesh);
    }
    this.boxes = new Float32Array(total * 6);
    this.owners = new Int32Array(total);
    this.rects = new Float32Array(buildings.length * 4);
    this.ids = buildings.map((building) => building.id);
    this.partCount = 0;

    const writer = new PartWriter(meshes);
    buildings.forEach((building, index) => {
      const rect = footprintRect(building);
      const x0 = rect.x0 * cellM;
      const z0 = rect.y0 * cellM;
      const x1 = rect.x1 * cellM;
      const z1 = rect.y1 * cellM;
      this.rects.set([x0, z0, x1, z1], index * 4);
      const corners = [groundAt(x0, z0), groundAt(x1, z0), groundAt(x0, z1), groundAt(x1, z1)];
      const base = Math.max(...corners);
      const low = Math.min(...corners) - SINK_M;
      writer.begin((x0 + x1) / 2, base, (z0 + z1) / 2, -building.rotation * HALF_TURN, low - base);
      for (const part of models[index] ?? []) {
        writer.write(part, this.boxes, this.partCount * 6);
        this.owners[this.partCount] = index;
        this.partCount++;
      }
    });
    for (const mesh of meshes.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // 움직이지 않으므로 경계 구를 한 번 계산해 화면 밖이면 거른다
      mesh.computeBoundingSphere();
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
  }

  /** 밤 정도(0 낮 ~ 1 밤): 몸 밤 빛과 창문 색. 바뀌었을 때만 값을 넣는다 */
  setNight(amount: number): void {
    const night = Math.min(1, Math.max(0, Number.isFinite(amount) ? amount : 0));
    if (Math.abs(night - this.night) < 1e-3) return;
    this.night = night;
    this.body.setNightLift(BUILDING_NIGHT_LIFT * night);
    const mix = (i: 0 | 1 | 2): number => WINDOW_DAY[i] + (WINDOW_NIGHT[i] - WINDOW_DAY[i]) * night;
    this.glow.color.setRGB(mix(0), mix(1), mix(2), SRGBColorSpace);
  }

  /** 시선(원점·방향)과 처음 만나는 건물. 없으면 null */
  pick(origin: Vec3, dir: Vec3): BuildingHit | null {
    const length = Math.hypot(dir.x, dir.y, dir.z);
    if (length === 0 || this.partCount === 0) return null;
    const unit = { x: dir.x / length, y: dir.y / length, z: dir.z / length };
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    const b = this.boxes;
    for (let i = 0; i < this.partCount; i++) {
      const o = i * 6;
      const distance = rayBoxDistance(
        origin,
        unit,
        b[o] ?? 0,
        b[o + 1] ?? 0,
        b[o + 2] ?? 0,
        b[o + 3] ?? 0,
        b[o + 4] ?? 0,
        b[o + 5] ?? 0,
      );
      if (distance !== null && distance < bestDistance) {
        bestDistance = distance;
        best = this.owners[i] ?? -1;
      }
    }
    if (best < 0) return null;
    const r = this.rects;
    const inset = 0.05;
    const hitX = origin.x + unit.x * bestDistance;
    const hitZ = origin.z + unit.z * bestDistance;
    const x0 = (r[best * 4] ?? 0) + inset;
    const z0 = (r[best * 4 + 1] ?? 0) + inset;
    const x1 = (r[best * 4 + 2] ?? 0) - inset;
    const z1 = (r[best * 4 + 3] ?? 0) - inset;
    return {
      id: this.ids[best] ?? 0,
      x: Math.min(x1, Math.max(x0, hitX)),
      z: Math.min(z1, Math.max(z0, hitZ)),
      distance: bestDistance,
    };
  }

  /** 건물 수 */
  get count(): number {
    return this.ids.length;
  }

  /** 그리는 조각 수(모든 도형 인스턴스 합) */
  get parts(): number {
    return this.partCount;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.geometries.clear();
    this.body.material.dispose();
    this.glow.dispose();
  }

  private clear(): void {
    for (const mesh of this.meshes) {
      mesh.removeFromParent();
      // 지오메트리·재질은 함께 쓰므로 인스턴스 버퍼만 버린다
      mesh.dispose();
    }
    this.meshes.length = 0;
    this.ids = [];
    this.partCount = 0;
  }
}

/** 조각 하나를 인스턴스 행렬·색과 누르기 경계 상자로 쓴다(건물마다 begin으로 자리·돌림을 정한다) */
class PartWriter {
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly local = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly lay = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), HALF_TURN);
  private readonly up = new Vector3(0, 1, 0);
  private readonly scale = new Vector3();
  private readonly color = new Color();
  private readonly corner = new Vector3();
  private cx = 0;
  private cy = 0;
  private cz = 0;
  private angle = 0;
  /** 바닥 판 아래 끝(로컬 y, 0 이하) */
  private padBottom = 0;

  private readonly meshes: ReadonlyMap<PartShape, InstancedMesh>;

  constructor(meshes: ReadonlyMap<PartShape, InstancedMesh>) {
    this.meshes = meshes;
  }

  begin(cx: number, cy: number, cz: number, angle: number, padBottom: number): void {
    this.cx = cx;
    this.cy = cy;
    this.cz = cz;
    this.angle = angle;
    this.padBottom = Math.min(0, padBottom);
  }

  write(part: BuildingPart, boxes: Float32Array, offset: number): void {
    const mesh = this.meshes.get(part.shape);
    if (!mesh) return;
    // 세로 범위(로컬): 바닥 판은 아래 끝까지 늘린다
    const y0 = part.ground ? this.padBottom : part.y;
    const y1 = part.y + part.sy;
    this.local.set(part.x, (y0 + y1) / 2, part.z).applyAxisAngle(this.up, this.angle);
    this.position.set(this.cx + this.local.x, this.cy + this.local.y, this.cz + this.local.z);
    this.quaternion.setFromAxisAngle(this.up, this.angle + part.turn);
    if (part.lay) {
      this.quaternion.multiply(this.lay);
      this.scale.set(y1 - y0, part.sx, part.sz);
    } else {
      this.scale.set(part.sx, y1 - y0, part.sz);
    }
    this.matrix.compose(this.position, this.quaternion, this.scale);
    const index = mesh.count;
    mesh.setMatrixAt(index, this.matrix);
    mesh.setColorAt(index, setColor(this.color, part.color));
    mesh.count = index + 1;
    this.writeBox(part, y0, y1, boxes, offset);
  }

  /** 세계 경계 상자: 조각의 로컬 경계(돌림 포함)를 건물 돌림(90°의 배수)으로 옮긴다 */
  private writeBox(part: BuildingPart, y0: number, y1: number, boxes: Float32Array, offset: number): void {
    const c = Math.abs(Math.cos(part.turn));
    const s = Math.abs(Math.sin(part.turn));
    const hx = (c * part.sx + s * part.sz) / 2;
    const hz = (s * part.sx + c * part.sz) / 2;
    let minX = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const dx of [-hx, hx])
      for (const dz of [-hz, hz]) {
        this.corner.set(part.x + dx, 0, part.z + dz).applyAxisAngle(this.up, this.angle);
        minX = Math.min(minX, this.corner.x);
        maxX = Math.max(maxX, this.corner.x);
        minZ = Math.min(minZ, this.corner.z);
        maxZ = Math.max(maxZ, this.corner.z);
      }
    boxes[offset] = this.cx + minX;
    boxes[offset + 1] = this.cy + y0;
    boxes[offset + 2] = this.cz + minZ;
    boxes[offset + 3] = this.cx + maxX;
    boxes[offset + 4] = this.cy + y1;
    boxes[offset + 5] = this.cz + maxZ;
  }
}

/** 색 표 값(sRGB 0~1) → three 색. 색 표를 화면에 보이는 그대로 쓰려고 sRGB로 넣는다 */
function setColor(target: Color, rgb: Rgb): Color {
  return target.setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace);
}
