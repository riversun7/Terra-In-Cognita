// 운영자 빠르기 표시 시험(operatorPace.ts) — 사용자 지적(2026-11-12) "작업이나 다른 명령시엔 원래느린속도다".
// 2차맵이 유닛마다 표시를 들고, 빠르기를 따로 주지 않은 이동(채집 줄·들어가기·운반꾼 걸음 등)이 그 표시를 읽는지, 명령 규칙(운영자 모드면 달고
// 아니면 지우고, 거절되면 되돌림)을 본다.
import { WALK_SPEED, anchorCenter } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPERATOR_SPEED_FACTOR, isOperatorMode, markPace, withPace } from "./operatorPace.ts";
import { createTestMap } from "./testSupport.ts";

const START = 1_798_000_000_000;
const center = (x: number, y: number) => anchorCenter(x, y, 1);
const FAST = WALK_SPEED * OPERATOR_SPEED_FACTOR;

beforeEach(() => {
  vi.useFakeTimers({ now: START });
});
afterEach(() => {
  vi.useRealTimers();
});

/** 유닛 1을 (x, 10)으로 옮기고(빠르기는 2차맵이 정한다) 그 움직임 빠르기 */
async function walkSpeed(
  map: ReturnType<typeof createTestMap>["map"],
  x: number,
): Promise<number | undefined> {
  const result = map.moveUnit(1, center(x, 10));
  await vi.advanceTimersByTimeAsync(0);
  expect(await result).toEqual({ ok: true });
  return map.unitInfo(1)?.motion.speed;
}

describe("운영자 모드 판정", () => {
  it("전체 보기 구독 + 모든 유닛 명령 권한(dev·admin)일 때만", () => {
    expect(isOperatorMode(true, ["player", "admin"])).toBe(true);
    expect(isOperatorMode(true, ["dev"])).toBe(true);
    expect(isOperatorMode(true, ["player"])).toBe(false);
    expect(isOperatorMode(false, ["player", "admin"])).toBe(false);
  });
});

describe("2차맵 유닛 표시", () => {
  it("표시가 달린 유닛은 빠르기를 따로 주지 않은 이동이 모두 운영자 빠르기. 따로 준 빠르기가 먼저, 유닛 속도는 그대로", async () => {
    const { map } = createTestMap();
    map.addUnit({ id: 1, size: 1, speed: WALK_SPEED, cellX: 10, cellY: 10 });
    expect(map.paceOf(1)).toBe(1);
    expect(await walkSpeed(map, 20)).toBe(WALK_SPEED);
    expect(map.setPace(1, OPERATOR_SPEED_FACTOR)).toBe(1);
    expect(map.paceOf(1)).toBe(OPERATOR_SPEED_FACTOR);
    expect(await walkSpeed(map, 30)).toBe(FAST);
    expect(await walkSpeed(map, 40)).toBe(FAST);
    expect(map.unitInfo(1)?.speed).toBe(WALK_SPEED);
    // 길(2차맵 사이 이동)처럼 빠르기를 따로 주면 그것을 쓴다
    const explicit = map.moveUnit(1, center(50, 10), { speedFactor: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(await explicit).toEqual({ ok: true });
    expect(map.unitInfo(1)?.motion.speed).toBe(WALK_SPEED);
    // 1이면 지운다. 없는 유닛은 undefined
    expect(map.setPace(1, 1)).toBe(OPERATOR_SPEED_FACTOR);
    expect(await walkSpeed(map, 60)).toBe(WALK_SPEED);
    expect(map.setPace(99, OPERATOR_SPEED_FACTOR)).toBeUndefined();
    map.stop();
  });

  it("유닛이 2차맵을 떠나면(지움·넘김) 표시도 지운다", () => {
    const { map } = createTestMap();
    map.addUnit({ id: 1, size: 1, speed: WALK_SPEED, cellX: 10, cellY: 10 });
    map.addUnit({ id: 2, size: 1, speed: WALK_SPEED, cellX: 20, cellY: 20 });
    map.setPace(1, OPERATOR_SPEED_FACTOR);
    map.setPace(2, OPERATOR_SPEED_FACTOR);
    expect(map.removeUnit(1)).toBe(true);
    const row = map.transferOut(2);
    expect(row).toBeDefined();
    expect(map.paceOf(1)).toBe(1);
    expect(map.paceOf(2)).toBe(1);
    if (!row) throw new Error("no row");
    expect(map.transferIn(row, 20, 20)).toBe(true);
    expect(map.paceOf(2)).toBe(1);
    map.stop();
  });

  it("건물이 남은 길을 막아 다시 찾은 길도 하던 이동의 빠르기 그대로", async () => {
    const { map, stats } = createTestMap();
    map.addUnit({ id: 1, size: 1, speed: WALK_SPEED, cellX: 10, cellY: 10 });
    const moved = map.moveUnit(1, center(40, 10), { speedFactor: 10 });
    await vi.advanceTimersByTimeAsync(0);
    expect(await moved).toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(map.placeBuilding({ x: 25, y: 5, width: 2, height: 10, rotation: 0 })).toMatchObject({ ok: true });
    expect(stats.paths.blockedReplans).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    const motion = map.unitInfo(1)?.motion;
    expect(motion?.waypoints.at(-1)).toEqual(center(40, 10));
    expect(motion?.speed).toBe(WALK_SPEED * 10);
    map.stop();
  });
});

describe("명령 규칙(markPace·withPace)", () => {
  it("운영자 모드 명령은 달고, 아닌 명령은 지운다. 유닛이 선 2차맵을 찾아 단다", () => {
    const a = createTestMap();
    const b = createTestMap({ mapKey: 10 });
    b.map.addUnit({ id: 1, size: 1, speed: WALK_SPEED, cellX: 10, cellY: 10 });
    markPace([a.map, b.map], 1, true);
    expect(b.map.paceOf(1)).toBe(OPERATOR_SPEED_FACTOR);
    markPace([a.map, b.map], 1, false);
    expect(b.map.paceOf(1)).toBe(1);
    // 없는 유닛은 아무것도 하지 않는다
    markPace([a.map, b.map], 99, true).undo();
    a.map.stop();
    b.map.stop();
  });

  it("거절되거나 던진 명령은 되돌린다(앞 표시 그대로)", async () => {
    const { map } = createTestMap();
    map.addUnit({ id: 1, size: 1, speed: WALK_SPEED, cellX: 10, cellY: 10 });
    // 운영자의 거절된 명령 → 표시 없음 그대로
    expect(await withPace([map], 1, true, () => Promise.resolve({ ok: false }))).toEqual({ ok: false });
    expect(map.paceOf(1)).toBe(1);
    // 된 명령 → 표시. 플레이어의 거절된 명령은 지우지 않는다
    await withPace([map], 1, true, () => Promise.resolve({ ok: true }));
    await withPace([map], 1, false, () => Promise.resolve({ ok: false }));
    expect(map.paceOf(1)).toBe(OPERATOR_SPEED_FACTOR);
    // 던지면 되돌리고 다시 던진다
    await expect(withPace([map], 1, false, () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(map.paceOf(1)).toBe(OPERATOR_SPEED_FACTOR);
    map.stop();
  });

  it("늦게 거절된 명령(다른 연결의 새 명령에 밀림)은 그 뒤 명령이 단 표시를 되돌리지 않는다", () => {
    const { map } = createTestMap();
    map.addUnit({ id: 1, size: 1, speed: WALK_SPEED, cellX: 10, cellY: 10 });
    // 운영자 명령 A가 달고, 끝나기 전에 운영자 명령 B가 단다. A가 superseded로 거절되어도 B의 표시는 그대로
    const first = markPace([map], 1, true);
    const second = markPace([map], 1, true);
    first.undo();
    expect(map.paceOf(1)).toBe(OPERATOR_SPEED_FACTOR);
    second.release();
    // 보통 명령 C가 지운 뒤 늦게 거절된 운영자 명령 D도 C의 지움을 되돌리지 않는다
    const late = markPace([map], 1, true);
    markPace([map], 1, false).release();
    late.undo();
    expect(map.paceOf(1)).toBe(1);
    map.stop();
  });
});
