// 노동 계약 연결 처리 시험 — 로그인, 세계 준비 전, 차례 처리, 금액 글자 → BigInt, 결과 메시지 모양, 구인 게시 셋
import { decodeServerMessage } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import { createLaborGateway } from "./gateway.ts";
import type { LaborService } from "./service.ts";

const viewer: Viewer = { id: "user-1", loginId: "tester", roles: ["player"] };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const notUsed = (): never => {
  throw new Error("not used");
};

function fakeService(calls: string[]): LaborService {
  return {
    contracts: new Map(),
    outputsFor: () => undefined,
    unitBusy: () => false,
    buildingInUse: () => false,
    create: (userId, input) => {
      calls.push(
        `create:${userId}:${input.kind}:${input.buildingId}:${input.unitId}:${input.adjustPm ?? "-"}`,
      );
      return Promise.resolve({ ok: true, contractId: 9 });
    },
    terminate: (userId, id) => {
      calls.push(`terminate:${userId}:${id}`);
      return Promise.resolve({ ok: false, code: "not_open" });
    },
    topUp: (userId, id, amount) => {
      calls.push(`topUp:${userId}:${id}:${typeof amount}:${amount}`);
      return Promise.resolve({ ok: true });
    },
    setRent: (userId, id, rent) => {
      calls.push(`rent:${userId}:${id}:${rent}`);
      return Promise.resolve({ ok: true });
    },
    postJob: (userId, input) => {
      calls.push(
        `post:${userId}:${input.buildingId}:${input.adjustPm}:${input.slots}:${input.termHours ?? "-"}`,
      );
      return Promise.resolve({ ok: true, jobId: 4 });
    },
    withdrawJob: (userId, jobId) => {
      calls.push(`withdraw:${userId}:${jobId}`);
      return Promise.resolve({ ok: false, code: "job_not_open" });
    },
    acceptJob: (userId, jobId, unitId) => {
      calls.push(`accept:${userId}:${jobId}:${unitId}`);
      return Promise.resolve({ ok: true, contractId: 12 });
    },
    overview: notUsed,
    jobs: notUsed,
    check: () => [],
  };
}

function open(service: LaborService | undefined, who: Viewer | null) {
  const sent: unknown[] = [];
  const gateway = createLaborGateway({ service: () => service, now: () => 0, log: { error: () => {} } });
  const socket = gateway.open({
    send: (text) => sent.push(decodeServerMessage(text)),
    viewer: () => Promise.resolve(who),
  });
  return { sent, socket };
}

describe("노동 계약 연결 처리", () => {
  it("명령을 받은 차례대로 넘기고(금액은 BigInt로) 결과를 요청 id로 돌려준다", async () => {
    const calls: string[] = [];
    const { sent, socket } = open(fakeService(calls), viewer);
    socket.handle({ t: "labor_create", id: 1, kind: "wage", buildingId: 3, unitId: 4, adjustPm: 1200 });
    socket.handle({ t: "labor_top_up", id: 2, contractId: 9, amount: "123456789012345678" });
    socket.handle({ t: "labor_set_rent", id: 3, buildingId: 3, rent: "0" });
    socket.handle({ t: "labor_terminate", id: 4, contractId: 9 });
    for (let i = 0; i < 8; i++) await settle();
    expect(calls).toEqual([
      "create:user-1:wage:3:4:1200",
      "topUp:user-1:9:bigint:123456789012345678",
      "rent:user-1:3:0",
      "terminate:user-1:9",
    ]);
    expect(sent).toEqual([
      { t: "labor_result", id: 1, ok: true, contractId: 9 },
      { t: "labor_result", id: 2, ok: true },
      { t: "labor_result", id: 3, ok: true },
      { t: "labor_result", id: 4, ok: false, code: "not_open" },
    ]);
  });

  it("구인 내기·거두기·받기를 넘기고 결과에 새 게시·계약 ID를 싣는다", async () => {
    const calls: string[] = [];
    const { sent, socket } = open(fakeService(calls), viewer);
    socket.handle({ t: "labor_post_job", id: 1, buildingId: 3, adjustPm: 1200, slots: 2, termHours: 48 });
    socket.handle({ t: "labor_withdraw_job", id: 2, jobId: 4 });
    socket.handle({ t: "labor_accept_job", id: 3, jobId: 4, unitId: 9 });
    for (let i = 0; i < 8; i++) await settle();
    expect(calls).toEqual(["post:user-1:3:1200:2:48", "withdraw:user-1:4", "accept:user-1:4:9"]);
    expect(sent).toEqual([
      { t: "labor_result", id: 1, ok: true, jobId: 4 },
      { t: "labor_result", id: 2, ok: false, code: "job_not_open" },
      { t: "labor_result", id: 3, ok: true, contractId: 12 },
    ]);
  });

  it("로그인하지 않았으면 sign_in_required, 세계가 준비 전이면 busy", async () => {
    const signedOut = open(fakeService([]), null);
    signedOut.socket.handle({ t: "labor_terminate", id: 1, contractId: 1 });
    const booting = open(undefined, viewer);
    booting.socket.handle({ t: "labor_terminate", id: 2, contractId: 1 });
    for (let i = 0; i < 4; i++) await settle();
    expect(signedOut.sent).toEqual([{ t: "labor_result", id: 1, ok: false, code: "sign_in_required" }]);
    expect(booting.sent).toEqual([{ t: "labor_result", id: 2, ok: false, code: "busy" }]);
  });
});
