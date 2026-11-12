// 채집·들어가기 연결 처리 시험 — 운영자 빠르기 표시(world/operatorPace.ts, 사용자 지적 2026-11-12 "작업이나 다른 명령시엔 원래느린속도다").
// 가짜 서비스가 진짜 서비스처럼 빠르기 없이 2차맵 이동(moveUnit)을 부른다: 운영자 모드 연결의 명령이면 그 걸음이 100배, 아니면 보통인지 본다.
import { decodeServerMessage } from "@terra/protocol";
import { WALK_SPEED, anchorCenter } from "@terra/sim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import { OPERATOR_SPEED_FACTOR } from "../world/operatorPace.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { createTestMap } from "../world/testSupport.ts";
import { createGatherGateway } from "./gateway.ts";
import type { GatherCommandResult, GatherService } from "./service.ts";

const DEV: Viewer = { id: "dev-1", loginId: "dev", roles: ["player", "dev"] };
const PLAYER: Viewer = { id: "user-1", loginId: "tester", roles: ["player"] };
const FAST = WALK_SPEED * OPERATOR_SPEED_FACTOR;

beforeEach(() => {
  vi.useFakeTimers({ now: 1_798_000_000_000 });
});
afterEach(() => {
  vi.useRealTimers();
});

/** 유닛 1만 내 유닛인 가짜 서비스: 채집·들어가기는 (x, 10)으로 걷게 한다(빠르기 없이 — 진짜 서비스와 같다) */
function fakeService(map: SecondMap): GatherService {
  let x = 20;
  const walk = async (unitId: number): Promise<GatherCommandResult> => {
    if (unitId !== 1) return { ok: false, code: "forbidden" };
    x += 10;
    const moved = await map.moveUnit(unitId, anchorCenter(x, 10, 1));
    return moved.ok ? { ok: true } : { ok: false, code: "no_path" };
  };
  return {
    start: (_userId, input) => walk(input.unitId),
    halt: () => ({ ok: true }),
    enter: (_userId, input) => walk(input.unitId),
    objects: () => undefined,
    loops: () => [],
    insideOf: () => [],
    runDue: () => {},
    active: 0,
    acting: () => false,
    stop: () => {},
  };
}

function connect(map: SecondMap, who: Viewer, observing: boolean) {
  const sent: unknown[] = [];
  const gateway = createGatherGateway({
    service: () => fakeService(map),
    maps: () => [map],
    now: () => Date.now(),
    log: { error: () => {} },
  });
  const socket = gateway.open({
    send: (text) => sent.push(decodeServerMessage(text)),
    viewer: () => Promise.resolve(who),
    observing: () => observing,
  });
  return { sent, socket };
}

describe("채집·들어가기 운영자 빠르기", () => {
  it("운영자 모드(전체 보기 + dev·admin) 채집·들어가기는 100배, 플레이어·전체 보기 아닌 연결은 보통", async () => {
    const { map } = createTestMap();
    map.addUnit({ id: 1, size: 1, speed: WALK_SPEED, cellX: 10, cellY: 10 });
    const operator = connect(map, DEV, true);
    operator.socket.handle({ t: "gather_start", id: 1, unitId: 1, mapKey: 9, objectId: 5 });
    await vi.advanceTimersByTimeAsync(0);
    expect(operator.sent).toEqual([{ t: "gather_result", id: 1, ok: true }]);
    expect(map.unitInfo(1)?.motion.speed).toBe(FAST);
    operator.socket.handle({ t: "unit_enter", id: 2, unitId: 1, buildingId: 3 });
    await vi.advanceTimersByTimeAsync(0);
    expect(map.unitInfo(1)?.motion.speed).toBe(FAST);

    // 같은 dev라도 전체 보기가 아니면 보통(표시를 지운다)
    const notObserving = connect(map, DEV, false);
    notObserving.socket.handle({ t: "unit_enter", id: 1, unitId: 1, buildingId: 3 });
    await vi.advanceTimersByTimeAsync(0);
    expect(map.unitInfo(1)?.motion.speed).toBe(WALK_SPEED);
    expect(map.paceOf(1)).toBe(1);

    // 플레이어는 전체 보기 구독이라도 운영자 모드가 아니다
    operator.socket.handle({ t: "gather_start", id: 3, unitId: 1, mapKey: 9, objectId: 5 });
    await vi.advanceTimersByTimeAsync(0);
    expect(map.paceOf(1)).toBe(OPERATOR_SPEED_FACTOR);
    const player = connect(map, PLAYER, true);
    player.socket.handle({ t: "gather_start", id: 1, unitId: 1, mapKey: 9, objectId: 5 });
    await vi.advanceTimersByTimeAsync(0);
    expect(map.unitInfo(1)?.motion.speed).toBe(WALK_SPEED);
    map.stop();
  });

  it("거절된 명령은 표시를 바꾸지 않는다", async () => {
    const { map } = createTestMap();
    map.addUnit({ id: 2, size: 1, speed: WALK_SPEED, cellX: 10, cellY: 10 });
    const operator = connect(map, DEV, true);
    operator.socket.handle({ t: "gather_start", id: 1, unitId: 2, mapKey: 9, objectId: 5 });
    await vi.advanceTimersByTimeAsync(0);
    expect(operator.sent).toEqual([{ t: "gather_result", id: 1, ok: false, code: "forbidden" }]);
    expect(map.paceOf(2)).toBe(1);
    map.stop();
  });
});
