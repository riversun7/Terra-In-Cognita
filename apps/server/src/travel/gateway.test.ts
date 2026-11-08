// 2차맵 사이 이동 연결 처리 시험 — 차례 처리, 결과 메시지 모양, 로그인·세계 준비 전(프로토콜 16, docs/adr/2026-11-07-play-flow.md "WP9")
import { decodeServerMessage } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import type { Viewer } from "../trpc/context.ts";
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
    start: (userId, request) => {
      calls.push(
        `start:${userId}:${request.unitId}:${request.mapKey}:${request.x},${request.y}:${request.kind}`,
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

function connect(service: TravelService | undefined, who: Viewer | null) {
  const sent: unknown[] = [];
  const gateway = createTravelGateway({ service: () => service, now: () => 0, log: { error: () => {} } });
  const socket = gateway.open({
    send: (text) => sent.push(decodeServerMessage(text)),
    viewer: () => Promise.resolve(who),
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
    expect(calls).toEqual(["start:user-1:5:9:10,20:scout", "cancel:user-1:5"]);
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
});
