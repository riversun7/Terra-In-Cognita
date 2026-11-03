import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";
import {
  CAMERA_FOV_RAD,
  type CameraState,
  type Viewport,
  cameraLimitsFor,
  cameraPosition,
  initialCamera,
} from "../camera/cameraMath.ts";
import { type RosterUnitView, UnitRoster } from "./unitRoster.ts";
import type { UnitDisplayMode, UnitLook } from "./unitView.ts";

const LOOK: UnitLook = { heightM: 1.8, radiusM: 0.4, color: 0x336699 };

// 유닛 그림 대신: 칸 수·모습만 적어 둔다(GPU 자원 없이 명단만 본다)
function fakeView(mode: UnitDisplayMode = "icon"): RosterUnitView & { count: number; looks: UnitLook[] } {
  return {
    mode,
    count: 0,
    looks: [],
    setCount(count: number) {
      this.count = count;
    },
    setLook(slot: number, look: UnitLook) {
      this.looks[slot] = look;
    },
    heightOf: () => 2,
  };
}

function spawn(id: number, x: number, y: number) {
  return { id, look: LOOK, x, y };
}

describe("UnitRoster", () => {
  it("명단을 바꾸면 id ↔ 슬롯을 다시 잇고, 모두 서 있고, 고른 유닛을 지운다", () => {
    const view = fakeView();
    const roster = new UnitRoster(view, 4, () => 1000);
    roster.set([spawn(7, 1, 2), spawn(9, 3, 4)]);
    roster.select(9);
    expect(roster.selectedId()).toBe(9);
    roster.set([spawn(9, 5, 6)]);
    expect(view.count).toBe(1);
    expect(roster.slotOf(9)).toBe(0);
    expect(roster.slotOf(7)).toBe(-1);
    expect(roster.idAt(0)).toBe(9);
    expect(roster.idAt(1)).toBeNull();
    expect(roster.selectedId()).toBeNull();
    expect(roster.state(9)).toEqual({ x: 5, y: 6, moving: false });
  });

  it("칸 수를 넘는 명단은 받지 않는다", () => {
    const roster = new UnitRoster(fakeView(), 1, () => 0);
    expect(() => roster.set([spawn(1, 0, 0), spawn(2, 0, 0)])).toThrow(RangeError);
  });

  it("명단에 없는 유닛에는 아무것도 하지 않는다(엔진이 다시 그리지 않게 false)", () => {
    const roster = new UnitRoster(fakeView(), 2, () => 0);
    roster.set([spawn(1, 0, 0)]);
    expect(roster.setPath(2, { points: [0, 0, 1, 0], departAtMs: 0, speedCellsPerSec: 1 })).toBe(false);
    expect(roster.stop(2)).toBe(false);
    expect(roster.setLook(2, LOOK)).toBe(false);
    expect(roster.state(2)).toBeNull();
    roster.select(2);
    expect(roster.selectedSlot).toBe(-1);
  });

  it("세우면 지금 자리(서버 시계)에 멈춘다", () => {
    let now = 0;
    const roster = new UnitRoster(fakeView(), 2, () => now);
    roster.set([spawn(1, 0, 0)]);
    expect(roster.setPath(1, { points: [0, 0, 10, 0], departAtMs: 0, speedCellsPerSec: 2 })).toBe(true);
    now = 2000;
    expect(roster.state(1)).toEqual({ x: 4, y: 0, moving: true });
    expect(roster.stop(1)).toBe(true);
    now = 5000;
    expect(roster.state(1)).toEqual({ x: 4, y: 0, moving: false });
  });

  it("누른 곳 반경 안의 가장 가까운 유닛을 고르고, 없으면 -1", () => {
    const viewport: Viewport = { width: 400, height: 400 };
    const mapSize = 300;
    const state: CameraState = initialCamera(mapSize, cameraLimitsFor(mapSize, viewport));
    const camera = new PerspectiveCamera((CAMERA_FOV_RAD * 180) / Math.PI, 1, 1, 10_000);
    const position = cameraPosition(state);
    camera.position.set(position.x, position.y, position.z);
    camera.lookAt(state.targetX, state.targetY, state.targetZ);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    const roster = new UnitRoster(fakeView(), 4, () => 0);
    // 배치 칸 1m: 가운데(목표점) 유닛과 오른쪽으로 10m 떨어진 유닛
    roster.set([spawn(7, 160, 150), spawn(9, 150, 150)]);
    const at = { camera, state, viewport, cellM: 1, groundAt: () => 0 };
    expect(roster.idAt(roster.pick({ x: 200, y: 200 }, at))).toBe(9);
    expect(roster.pick({ x: 0, y: 0 }, at)).toBe(-1);
  });
});
