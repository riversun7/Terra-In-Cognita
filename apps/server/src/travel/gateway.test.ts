// 2차맵 사이 이동 연결 처리 시험 — 차례 처리, 결과 메시지 모양, 로그인·세계 준비 전(프로토콜 16, docs/adr/2026-11-07-play-flow.md "WP9")
import { decodeServerMessage } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import { OPERATOR_SPEED_FACTOR, type PaceMap } from "../world/operatorPace.ts";
import { createTestMap } from "../world/testSupport.ts";
import { createTravelGateway } from "./gateway.ts";
import type { TravelService } from "./service.ts";

const player: Viewer = { id: "user-1", loginId: "tester", roles: ["player"] };
/** 쌓인 약속(차례 처리 사슬)을 한 바퀴 돌린다 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const start = { t: "travel_start", id: 1, unitId: 5, mapKey: 9, x: 10, y: 20, kind: "scout" } as const;
const cancel = { t: "travel_cancel", id: 2, unitId: 5 } as const;

function fakeService(calls: string[]): TravelService {
  return {
    plan: () => ({ ok: false, problem: "no_route" }),
    start: (userId, request, options) => {
      calls.push(
        `start:${userId}:${request.unitId}:${request.mapKey}:${request.x},${request.y}:${request.kind}:x${options?.speedFactor ?? 1}`,
      );
      return Promise.resolve({ ok: true, maps: 3, arriveAt: 1234 });
    },
    cancel: (userId, unitId) => {
      calls.push(`cancel:${userId}:${unitId}`);
      return { ok: false, code: "not_traveling" };
    },
    list: () => [],
    hiddenAt: () => undefined,
    attachRaids: () => {},
    attachSpawn: () => {},
    touches: () => false,
    restore: () => Promise.resolve(0),
    runDue: () => {},
    active: 0,
    stop: () => {},
  };
}

function connect(
  service: TravelService | undefined,
  who: Viewer | null,
  observing = false,
  maps?: () => Iterable<PaceMap>,
) {
  const sent: unknown[] = [];
  const gateway = createTravelGateway({
    service: () => service,
    maps,
    now: () => 0,
    log: { error: () => {} },
  });
  const socket = gateway.open({
    send: (text) => sent.push(decodeServerMessage(text)),
    viewer: () => Promise.resolve(who),
    observing: () => observing,
  });
  return { sent, socket };
}

describe("2차맵 사이 이동 연결 처리", () => {
  it("받은 차례대로 서비스에 넘기고 결과를 요청 id로 돌려준다", async () => {
    const calls: string[] = [];
    const { sent, socket } = connect(fakeService(calls), player);
    socket.handle(start);
    socket.handle(cancel);
    for (let i = 0; i < 8; i++) await settle();
    expect(calls).toEqual(["start:user-1:5:9:10,20:scout:x1", "cancel:user-1:5"]);
    expect(sent).toEqual([
      { t: "travel_result", id: 1, ok: true, maps: 3, arriveAt: 1234 },
      { t: "travel_result", id: 2, ok: false, code: "not_traveling" },
    ]);
  });

  it("로그인하지 않았으면 sign_in_required, 세계 준비 전이면 busy", async () => {
    const calls: string[] = [];
    const signedOut = connect(fakeService(calls), null);
    signedOut.socket.handle(start);
    const booting = connect(undefined, player);
    booting.socket.handle(cancel);
    for (let i = 0; i < 8; i++) await settle();
    expect(calls).toEqual([]);
    expect(signedOut.sent).toEqual([{ t: "travel_result", id: 1, ok: false, code: "sign_in_required" }]);
    expect(booting.sent).toEqual([{ t: "travel_result", id: 2, ok: false, code: "busy" }]);
  });
  it("운영자 모드(전체 보기 구독)인 운영자가 보낸 길은 운영자 빠르기, 플레이어는 전체 보기라도 1배", async () => {
    const calls: string[] = [];
    const dev: Viewer = { id: "dev-1", loginId: "dev", roles: ["dev"] };
    const operator = connect(fakeService(calls), dev, true);
    operator.socket.handle(start);
    const notObserving = connect(fakeService(calls), dev, false);
    notObserving.socket.handle(start);
    const playerObserving = connect(fakeService(calls), player, true);
    playerObserving.socket.handle(start);
    for (let i = 0; i < 8; i++) await settle();
    expect(calls).toEqual([
      `start:dev-1:5:9:10,20:scout:x${OPERATOR_SPEED_FACTOR}`,
      "start:dev-1:5:9:10,20:scout:x1",
      "start:user-1:5:9:10,20:scout:x1",
    ]);
  });

  it("보내기·멈추기도 다른 유닛 명령처럼 그 유닛의 운영자 빠르기 표시를 단다·지운다(world/operatorPace.ts)", async () => {
    const { map } = createTestMap();
    map.addUnit({ id: 5, size: 1, speed: 437, cellX: 10, cellY: 10 });
    const dev: Viewer = { id: "dev-1", loginId: "dev", roles: ["dev"] };
    connect(fakeService([]), dev, true, () => [map]).socket.handle(start);
    for (let i = 0; i < 8; i++) await settle();
    expect(map.paceOf(5)).toBe(OPERATOR_SPEED_FACTOR);
    // 거절된 멈추기(not_traveling)는 그대로, 된 보통 보내기는 지운다
    connect(fakeService([]), player, false, () => [map]).socket.handle(cancel);
    for (let i = 0; i < 8; i++) await settle();
    expect(map.paceOf(5)).toBe(OPERATOR_SPEED_FACTOR);
    connect(fakeService([]), player, false, () => [map]).socket.handle(start);
    for (let i = 0; i < 8; i++) await settle();
    expect(map.paceOf(5)).toBe(1);
    map.stop();
  });
});
