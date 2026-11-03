// 2차맵 유닛 명단 — 서버 유닛 id ↔ 슬롯(움직임 저장소·유닛 그림의 칸), 고른 유닛, 화면에서 누른 유닛 찾기.
// 다시 그리기 예약은 엔진이 한다. secondMapEngine.ts가 쓴다(파일 크기를 나눈 것).
import { type Camera, Vector3 } from "three";
import { type CameraState, type ScreenPoint, type Viewport, pixelsPerMetre } from "../camera/cameraMath.ts";
import type { UnitSpawn, UnitState } from "../engineTypes.ts";
import { pickNearest } from "../picking.ts";
import { type UnitPath, UnitMotionStore } from "./unitMotion.ts";
import type { UnitLook, UnitView } from "./unitView.ts";

/** 누르는 반경(CSS px) — 누름 영역 44px의 반 */
const TAP_RADIUS_PX = 22;

/** 명단이 쓰는 유닛 그림 부분(칸 수·모습·키·표현 단계) */
export type RosterUnitView = Pick<UnitView, "mode" | "setCount" | "setLook" | "heightOf">;

/** 누른 유닛을 찾을 때 쓰는 지금 화면 값 */
export interface UnitPickView {
  readonly camera: Camera;
  readonly state: CameraState;
  readonly viewport: Viewport;
  readonly cellM: number;
  readonly groundAt: (x: number, z: number) => number;
}

export class UnitRoster {
  readonly motion: UnitMotionStore;
  /** 고른 유닛의 슬롯(-1 = 없음) */
  selectedSlot = -1;
  private readonly view: RosterUnitView;
  private readonly capacity: number;
  private readonly now: () => number;
  private readonly slots = new Map<number, number>();
  private ids: number[] = [];
  // 누르기 계산 버퍼(유닛마다 화면 자리·보이는지·늘린 반경)
  private readonly projected = new Vector3();
  private readonly screenX: Float32Array;
  private readonly screenY: Float32Array;
  private readonly onScreen: Uint8Array;
  private readonly pickExtra: Float32Array;

  /** now = 서버 시계(ms, 유닛 경로의 출발 시각과 같은 시계) */
  constructor(view: RosterUnitView, capacity: number, now: () => number) {
    this.view = view;
    this.capacity = capacity;
    this.now = now;
    this.motion = new UnitMotionStore(capacity);
    this.screenX = new Float32Array(capacity);
    this.screenY = new Float32Array(capacity);
    this.onScreen = new Uint8Array(capacity);
    this.pickExtra = new Float32Array(capacity);
  }

  /** 명단을 통째로 바꾼다: 모두 그 자리에 서 있고 고른 유닛은 없다 */
  set(units: readonly UnitSpawn[]): void {
    if (units.length > this.capacity)
      throw new RangeError(`too many units: ${units.length} > ${this.capacity}`);
    this.slots.clear();
    this.ids = units.map((unit) => unit.id);
    this.motion.resize(units.length);
    this.view.setCount(units.length);
    const now = this.now();
    units.forEach((unit, slot) => {
      this.slots.set(unit.id, slot);
      this.view.setLook(slot, unit.look);
      this.motion.setPath(slot, { points: [unit.x, unit.y], departAtMs: now, speedCellsPerSec: 0 });
    });
    this.selectedSlot = -1;
  }

  slotOf(id: number): number {
    return this.slots.get(id) ?? -1;
  }

  idAt(slot: number): number | null {
    return this.ids[slot] ?? null;
  }

  /** 고른 유닛의 id(없으면 null) */
  selectedId(): number | null {
    return this.selectedSlot >= 0 ? this.idAt(this.selectedSlot) : null;
  }

  select(id: number | null): void {
    this.selectedSlot = id === null ? -1 : this.slotOf(id);
  }

  /** 경로를 준다. 명단에 없는 유닛이면 false */
  setPath(id: number, path: UnitPath): boolean {
    const slot = this.slotOf(id);
    if (slot < 0) return false;
    this.motion.setPath(slot, path);
    return true;
  }

  /** 지금 자리에 세운다. 명단에 없는 유닛이면 false */
  stop(id: number): boolean {
    const slot = this.slotOf(id);
    if (slot < 0) return false;
    const now = this.now();
    this.motion.compute(slot, now);
    this.motion.setPath(slot, {
      points: [this.motion.x[slot] ?? 0, this.motion.y[slot] ?? 0],
      departAtMs: now,
      speedCellsPerSec: 0,
    });
    return true;
  }

  state(id: number): UnitState | null {
    const slot = this.slotOf(id);
    if (slot < 0) return null;
    const isMoving = this.motion.compute(slot, this.now());
    return { x: this.motion.x[slot] ?? 0, y: this.motion.y[slot] ?? 0, moving: isMoving };
  }

  /** 모습을 바꾼다. 명단에 없는 유닛이면 false */
  setLook(id: number, look: UnitLook): boolean {
    const slot = this.slotOf(id);
    if (slot < 0) return false;
    this.view.setLook(slot, look);
    return true;
  }

  /** 누른 곳(CSS px)에서 가장 가까운 유닛 슬롯(화면 거리). 없으면 -1 */
  pick(point: ScreenPoint, at: UnitPickView): number {
    const n = this.motion.size;
    const ppm = pixelsPerMetre(at.state.distance, at.viewport);
    const model = this.view.mode === "model";
    for (let slot = 0; slot < n; slot++) {
      const wx = (this.motion.x[slot] ?? 0) * at.cellM;
      const wz = (this.motion.y[slot] ?? 0) * at.cellM;
      const height = this.view.heightOf(slot);
      this.projected.set(wx, at.groundAt(wx, wz) + height / 2, wz).project(at.camera);
      const visible = this.projected.z > -1 && this.projected.z < 1;
      this.onScreen[slot] = visible ? 1 : 0;
      this.screenX[slot] = ((this.projected.x + 1) / 2) * at.viewport.width;
      this.screenY[slot] = ((1 - this.projected.y) / 2) * at.viewport.height;
      // 실제 크기로 크게 보이는 유닛은 몸 전체를 누를 수 있게 반경을 늘린다
      this.pickExtra[slot] = model ? (height * ppm * Math.cos(at.state.pitch)) / 2 : 0;
    }
    return pickNearest(this.screenX, this.screenY, this.onScreen, n, point, TAP_RADIUS_PX, this.pickExtra);
  }
}
