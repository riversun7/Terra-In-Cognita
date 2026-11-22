// 병원 연결 처리 시험 — 차례 처리, 결과 메시지 모양, 개발 시험 권한, 로그인·세계 준비 전(프로토콜 17, docs/adr/2026-11-08-injury.md)
import { decodeServerMessage } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import { createHospitalGateway } from "./gateway.ts";
import type { HospitalService } from "./service.ts";

const player: Viewer = { id: "user-1", loginId: "tester", roles: ["player"] };
const dev: Viewer = { id: "user-2", loginId: "dever", roles: ["dev"] };
/** 쌓인 약속(차례 처리 사슬)을 한 바퀴 돌린다 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const treat = { t: "hospital_treat", id: 1, buildingId: 9, unit: 41, cost: "1200" } as const;
const injure = { t: "dev_injure_unit", id: 2, unit: 41, stage: 3 } as const;

function fakeService(calls: string[]): HospitalService {
  return {
    overview: () => Promise.reject(new Error("unused")),
    treat: (userId, input) => {
      calls.push(`treat:${userId}:${input.buildingId}:${input.unit}:${input.cost}`);
      return Promise.resolve({
        ok: true,
        unitId: input.unit,
        stage: 3,
        untilMs: 10,
        greenAtMs: 20,
        paid: "1200",
      });
    },
    devInjure: (userId, input) => {
      calls.push(`injure:${userId}:${input.unit}:${input.stage}`);
      return Promise.resolve({ ok: false, code: "unknown_unit" });
    },
    careQuotes: () => Promise.reject(new Error("unused")),
    treatBy: () => Promise.reject(new Error("unused")),
  };
}

function open(service: HospitalService | undefined, who: Viewer | null) {
  const sent: unknown[] = [];
  const gateway = createHospitalGateway({ service: () => service, now: () => 0, log: { error: () => {} } });
  const socket = gateway.open({
    send: (text) => sent.push(decodeServerMessage(text)),
    viewer: () => Promise.resolve(who),
  });
  return { sent, socket };
}

describe("병원 연결 처리", () => {
  it("받은 차례대로 서비스에 넘기고 결과를 요청 id로 돌려준다", async () => {
    const calls: string[] = [];
    const { sent, socket } = open(fakeService(calls), dev);
    socket.handle(treat);
    socket.handle(injure);
    for (let i = 0; i < 6; i++) await settle();
    expect(calls).toEqual(["treat:user-2:9:41:1200", "injure:user-2:41:3"]);
    expect(sent).toEqual([
      {
        t: "hospital_result",
        id: 1,
        ok: true,
        unitId: 41,
        stage: 3,
        untilMs: 10,
        greenAtMs: 20,
        paid: "1200",
      },
      { t: "hospital_result", id: 2, ok: false, code: "unknown_unit" },
    ]);
  });

  it("개발 시험 부상은 dev·admin만, 로그인 안 함·세계 없음은 sign_in_required·busy", async () => {
    const calls: string[] = [];
    const asPlayer = open(fakeService(calls), player);
    asPlayer.socket.handle(injure);
    const signedOut = open(fakeService(calls), null);
    signedOut.socket.handle(treat);
    const notReady = open(undefined, player);
    notReady.socket.handle(treat);
    for (let i = 0; i < 6; i++) await settle();
    expect(calls).toEqual([]);
    expect(asPlayer.sent).toEqual([{ t: "hospital_result", id: 2, ok: false, code: "forbidden" }]);
    expect(signedOut.sent).toEqual([{ t: "hospital_result", id: 1, ok: false, code: "sign_in_required" }]);
    expect(notReady.sent).toEqual([{ t: "hospital_result", id: 1, ok: false, code: "busy" }]);
  });
});
