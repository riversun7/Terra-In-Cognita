// 신전 연결 처리 시험 — 차례 처리, 결과 메시지 모양, 개발 시험·편집 권한, 로그인·세계 준비 전(프로토콜 12·13, docs/adr/2026-11-07-temple-religion.md)
import { decodeServerMessage } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import { createTempleGateway } from "./gateway.ts";
import type { TempleService } from "./service.ts";

const player: Viewer = { id: "user-1", loginId: "tester", roles: ["player"] };
const dev: Viewer = { id: "user-2", loginId: "dever", roles: ["dev"] };
/** 쌓인 약속(차례 처리 사슬)을 한 바퀴 돌린다 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const pray = { t: "temple_pray", id: 1, buildingId: 9 } as const;
const offer = { t: "temple_offer", id: 2, buildingId: 9, amount: "250" } as const;
const rite = { t: "temple_rite", id: 3, buildingId: 9, unit: 41, rite: "rebirth", cost: "10000" } as const;
const ghost = { t: "dev_inactivate_unit", id: 4, unit: 41 } as const;
const buff = { t: "dev_guardian_buff", id: 5, unit: 41, buff: "production" } as const;

function fakeService(calls: string[]): TempleService {
  return {
    overview: () => Promise.reject(new Error("unused")),
    pray: (userId, input) => {
      calls.push(`pray:${userId}:${input.buildingId}`);
      return Promise.resolve({ ok: true, faith: 1, gained: 1 });
    },
    offer: (userId, input) => {
      calls.push(`offer:${userId}:${input.buildingId}:${input.amount}`);
      return Promise.resolve({ ok: true, faith: 6, gained: 5 });
    },
    rite: (userId, input) => {
      calls.push(`rite:${userId}:${input.buildingId}:${input.unit}:${input.rite}:${input.cost}`);
      return Promise.resolve({ ok: false, code: "faith_low" });
    },
    devInactivate: (userId, input) => {
      calls.push(`inactivate:${userId}:${input.unit}`);
      return Promise.resolve({ ok: true, unitId: input.unit });
    },
    devGuardianBuff: (input) => {
      calls.push(`buff:${input.unit}:${input.buff}`);
      return Promise.resolve({ ok: true, unitId: input.unit });
    },
    isInactive: () => false,
    isAway: () => false,
    citySatisfaction: () => new Map(),
    buildingProductionPm: () => 0,
    hasFightingGuardian: () => false,
    sweep: () => Promise.resolve(0),
  };
}

function open(service: TempleService | undefined, who: Viewer | null) {
  const sent: unknown[] = [];
  const gateway = createTempleGateway({ service: () => service, now: () => 0, log: { error: () => {} } });
  const socket = gateway.open({
    send: (text) => sent.push(decodeServerMessage(text)),
    viewer: () => Promise.resolve(who),
  });
  return { sent, socket };
}

describe("신전 연결 처리", () => {
  it("받은 차례대로 서비스에 넘기고 결과를 요청 id로 돌려준다", async () => {
    const calls: string[] = [];
    const { sent, socket } = open(fakeService(calls), dev);
    for (const message of [pray, offer, rite, ghost, buff]) socket.handle(message);
    for (let i = 0; i < 10; i++) await settle();
    expect(calls).toEqual([
      "pray:user-2:9",
      "offer:user-2:9:250",
      "rite:user-2:9:41:rebirth:10000",
      "inactivate:user-2:41",
      "buff:41:production",
    ]);
    expect(sent).toEqual([
      { t: "temple_result", id: 1, ok: true, faith: 1, gained: 1 },
      { t: "temple_result", id: 2, ok: true, faith: 6, gained: 5 },
      { t: "temple_result", id: 3, ok: false, code: "faith_low" },
      { t: "temple_result", id: 4, ok: true, unitId: 41 },
      { t: "temple_result", id: 5, ok: true, unitId: 41 },
    ]);
  });

  it("비활성 만들기·수호신 버프 편집은 dev·admin만, 로그인 안 함·세계 없음은 sign_in_required·busy", async () => {
    const calls: string[] = [];
    const asPlayer = open(fakeService(calls), player);
    asPlayer.socket.handle(ghost);
    asPlayer.socket.handle(buff);
    const signedOut = open(fakeService(calls), null);
    signedOut.socket.handle(pray);
    const notReady = open(undefined, player);
    notReady.socket.handle(pray);
    for (let i = 0; i < 6; i++) await settle();
    expect(calls).toEqual([]);
    expect(asPlayer.sent).toEqual([
      { t: "temple_result", id: 4, ok: false, code: "forbidden" },
      { t: "temple_result", id: 5, ok: false, code: "forbidden" },
    ]);
    expect(signedOut.sent).toEqual([{ t: "temple_result", id: 1, ok: false, code: "sign_in_required" }]);
    expect(notReady.sent).toEqual([{ t: "temple_result", id: 1, ok: false, code: "busy" }]);
  });
});
