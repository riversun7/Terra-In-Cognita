// 융합·유전자 환생 연결 처리 시험 — 로그인, 세계 준비 전, 개발 물자 받기 권한, 차례 처리, 결과 메시지 모양(D-470·D-478, 프로토콜 9)
import { decodeServerMessage } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import { createFusionGateway } from "./gateway.ts";
import type { FusionService } from "./service.ts";

const player: Viewer = { id: "user-1", loginId: "tester", roles: ["player"] };
const dev: Viewer = { id: "user-2", loginId: "dever", roles: ["dev"] };
/** 쌓인 약속(차례 처리 사슬)을 한 바퀴 돌린다 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const fuse = { t: "cyborg_fuse", id: 3, human: 41, cost: "5000" } as const;
const rebirth = { t: "unit_rebirth", id: 4, unit: 41, shards: 1 } as const;
const grant = { t: "dev_grant_goods", id: 5, item: "microchip", quantity: 20 } as const;

function fakeService(calls: string[]): FusionService {
  return {
    overview: () => Promise.reject(new Error("unused")),
    fuse: (userId, input) => {
      calls.push(`fuse:${userId}:${input.human}:${input.cost}`);
      return Promise.resolve({ ok: true, unitId: input.human, stats: [1, 2, 3, 4, 5, 6], bonusPm: 1100 });
    },
    rebirth: (userId, input) => {
      calls.push(`rebirth:${userId}:${input.unit}:${input.shards}`);
      return Promise.resolve({ ok: false, code: "alive" });
    },
    devGrant: (userId, input) => {
      calls.push(`grant:${userId}:${input.item}:${input.quantity}`);
      return Promise.resolve({ ok: true });
    },
    dropOnDeath: () => [],
  };
}

function open(service: FusionService | undefined, who: Viewer | null) {
  const sent: unknown[] = [];
  const gateway = createFusionGateway({ service: () => service, now: () => 0, log: { error: () => {} } });
  const socket = gateway.open({
    send: (text) => sent.push(decodeServerMessage(text)),
    viewer: () => Promise.resolve(who),
  });
  return { sent, socket };
}

describe("융합·유전자 연결 처리", () => {
  it("받은 차례대로 서비스에 넘기고 결과를 요청 id로 돌려준다", async () => {
    const calls: string[] = [];
    const { sent, socket } = open(fakeService(calls), dev);
    socket.handle(fuse);
    socket.handle(rebirth);
    socket.handle(grant);
    for (let i = 0; i < 4; i++) await settle();
    expect(calls).toEqual(["fuse:user-2:41:5000", "rebirth:user-2:41:1", "grant:user-2:microchip:20"]);
    expect(sent).toEqual([
      { t: "fusion_result", id: 3, ok: true, unitId: 41, stats: [1, 2, 3, 4, 5, 6], bonusPm: 1100 },
      { t: "fusion_result", id: 4, ok: false, code: "alive" },
      { t: "fusion_result", id: 5, ok: true },
    ]);
  });

  it("개발 물자 받기는 dev·admin만(플레이어는 forbidden), 로그인 안 함·세계 없음은 sign_in_required·busy", async () => {
    const calls: string[] = [];
    const asPlayer = open(fakeService(calls), player);
    asPlayer.socket.handle(grant);
    const signedOut = open(fakeService(calls), null);
    signedOut.socket.handle(fuse);
    const notReady = open(undefined, player);
    notReady.socket.handle(fuse);
    for (let i = 0; i < 4; i++) await settle();
    expect(calls).toEqual([]);
    expect(asPlayer.sent).toEqual([{ t: "fusion_result", id: 5, ok: false, code: "forbidden" }]);
    expect(signedOut.sent).toEqual([{ t: "fusion_result", id: 3, ok: false, code: "sign_in_required" }]);
    expect(notReady.sent).toEqual([{ t: "fusion_result", id: 3, ok: false, code: "busy" }]);
  });
});
