// 융합·유전자 연결 처리 시험 — 로그인, 세계 준비 전, 개발 시험 권한, 차례 처리, 결과 메시지 모양(D-470·D-478·D-516, 프로토콜 9·11)
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
const synth = { t: "gene_synthesize", id: 4, a: 7, b: 8 } as const;
const grant = { t: "dev_grant_goods", id: 5, item: "microchip", quantity: 20 } as const;
const inject = { t: "gene_inject", id: 6, gene: 9, unit: 41 } as const;
const incubate = { t: "gene_incubate", id: 7, gene: 7, apply: "total" } as const;
const devGene = { t: "dev_grant_gene", id: 8, kind: "stat" } as const;
const expire = { t: "dev_expire_unit", id: 9, unit: 41 } as const;

function fakeService(calls: string[]): FusionService {
  return {
    overview: () => Promise.reject(new Error("unused")),
    temple: {
      overview: () => Promise.reject(new Error("unused")),
      pray: () => Promise.reject(new Error("unused")),
      offer: () => Promise.reject(new Error("unused")),
      rite: () => Promise.reject(new Error("unused")),
      devInactivate: () => Promise.reject(new Error("unused")),
      devGuardianBuff: () => Promise.reject(new Error("unused")),
      isInactive: () => false,
      isAway: () => false,
      citySatisfaction: () => new Map(),
      buildingProductionPm: () => 0,
      sweep: () => Promise.resolve(0),
    },
    fuse: (userId, input) => {
      calls.push(`fuse:${userId}:${input.human}:${input.cost}`);
      return Promise.resolve({ ok: true, unitId: input.human, stats: [1, 2, 3, 4, 5, 6], bonusPm: 1100 });
    },
    devGrant: (userId, input) => {
      calls.push(`grant:${userId}:${input.item}:${input.quantity}`);
      return Promise.resolve({ ok: true });
    },
    synthesize: (userId, input) => {
      calls.push(`synth:${userId}:${input.a}:${input.b}`);
      return Promise.resolve({ ok: true, gene: 10, outcome: "up", total: 63 });
    },
    inject: (userId, input) => {
      calls.push(`inject:${userId}:${input.gene}:${input.unit}`);
      return Promise.resolve({ ok: false, code: "no_skill_slot" });
    },
    incubate: (userId, input) => {
      calls.push(
        `incubate:${userId}:${input.gene}:${input.apply}${input.lab ? `:${input.lab.buildingId}:${input.lab.cost}` : ""}`,
      );
      return Promise.resolve({ ok: true, unitId: 50, stats: [10, 10, 10, 10, 10, 10] });
    },
    devGrantGene: (userId, input) => {
      calls.push(`devGene:${userId}:${input.kind}`);
      return Promise.resolve({ ok: true, gene: 11 });
    },
    convert: (userId, input) => {
      calls.push(`convert:${userId}:${input.buildingId}:${input.unit}:${input.cost}`);
      return Promise.resolve({ ok: true, unitId: input.unit, genes: [14] });
    },
    devExpire: (userId, input) => {
      calls.push(`expire:${userId}:${input.unit}`);
      return Promise.resolve({ ok: true, unitId: input.unit, genes: [12, 13] });
    },
    expireDue: () => Promise.resolve(0),
    stop: () => {},
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
    for (const message of [fuse, synth, grant, inject, incubate, devGene, expire]) socket.handle(message);
    for (let i = 0; i < 10; i++) await settle();
    expect(calls).toEqual([
      "fuse:user-2:41:5000",
      "synth:user-2:7:8",
      "grant:user-2:microchip:20",
      "inject:user-2:9:41",
      "incubate:user-2:7:total",
      "devGene:user-2:stat",
      "expire:user-2:41",
    ]);
    expect(sent).toEqual([
      { t: "fusion_result", id: 3, ok: true, unitId: 41, stats: [1, 2, 3, 4, 5, 6], bonusPm: 1100 },
      { t: "fusion_result", id: 4, ok: true, gene: 10, outcome: "up", total: 63 },
      { t: "fusion_result", id: 5, ok: true },
      { t: "fusion_result", id: 6, ok: false, code: "no_skill_slot" },
      { t: "fusion_result", id: 7, ok: true, unitId: 50, stats: [10, 10, 10, 10, 10, 10] },
      { t: "fusion_result", id: 8, ok: true, gene: 11 },
      { t: "fusion_result", id: 9, ok: true, unitId: 41, genes: [12, 13] },
    ]);
  });

  it("개발 시험·인큐베이터는 dev·admin만(플레이어는 forbidden), 로그인 안 함·세계 없음은 sign_in_required·busy", async () => {
    const calls: string[] = [];
    const asPlayer = open(fakeService(calls), player);
    asPlayer.socket.handle(grant);
    asPlayer.socket.handle(devGene);
    asPlayer.socket.handle(expire);
    asPlayer.socket.handle(incubate);
    const signedOut = open(fakeService(calls), null);
    signedOut.socket.handle(fuse);
    const notReady = open(undefined, player);
    notReady.socket.handle(fuse);
    for (let i = 0; i < 6; i++) await settle();
    expect(calls).toEqual([]);
    expect(asPlayer.sent).toEqual([
      { t: "fusion_result", id: 5, ok: false, code: "forbidden" },
      { t: "fusion_result", id: 8, ok: false, code: "forbidden" },
      { t: "fusion_result", id: 9, ok: false, code: "forbidden" },
      { t: "fusion_result", id: 7, ok: false, code: "forbidden" },
    ]);
    expect(signedOut.sent).toEqual([{ t: "fusion_result", id: 3, ok: false, code: "sign_in_required" }]);
    expect(notReady.sent).toEqual([{ t: "fusion_result", id: 3, ok: false, code: "busy" }]);
  });

  it("연구소 인큐베이터(연구소 칸, 판 13 — 기획 답 459 가)는 플레이어도 연구소·본 값과 함께 넘긴다", async () => {
    const calls: string[] = [];
    const asPlayer = open(fakeService(calls), player);
    asPlayer.socket.handle({ ...incubate, buildingId: 12, cost: "5000" });
    for (let i = 0; i < 4; i++) await settle();
    expect(calls).toEqual(["incubate:user-1:7:total:12:5000"]);
    expect(asPlayer.sent).toEqual([
      { t: "fusion_result", id: 7, ok: true, unitId: 50, stats: [10, 10, 10, 10, 10, 10] },
    ]);
  });
});
