// 노동 계약 연결 처리 시험 — 로그인, 세계 준비 전, 차례 처리, 금액 글자 → BigInt, 결과 메시지 모양, 구인 게시 셋, 직무 배치 둘, 판별 코드(wrong_map)
import { decodeServerMessage } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import { OPERATOR_SPEED_FACTOR, fixedOperatorPace } from "../world/operatorPace.ts";
import { createTestMap } from "../world/testSupport.ts";
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
    afterSettle: () => {},
    unitBusy: () => false,
    unitAway: () => false,
    wageNeeds: () => [],
    fundDeposit: () => 0n,
    hourlyLabor: () => 0n,
    buildingInUse: () => false,
    assignedTo: () => undefined,
    building: notUsed,
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
    assign: (userId, buildingId, unitId) => {
      calls.push(`assign:${userId}:${buildingId}:${unitId}`);
      return Promise.resolve({ ok: true });
    },
    unassign: (userId, unitId) => {
      calls.push(`unassign:${userId}:${unitId}`);
      return Promise.resolve({ ok: false, code: "not_assigned" });
    },
    workersAt: () => [],
    rentOf: () => null,
    workplaceOf: () => undefined,
    attachProduction: () => {},
    attachStation: () => {},
    attachBusiness: () => {},
    overview: notUsed,
    jobs: notUsed,
    check: () => [],
  };
}

function open(service: LaborService | undefined, who: Viewer | null, protocolVersion?: number) {
  const sent: unknown[] = [];
  const gateway = createLaborGateway({ service: () => service, now: () => 0, log: { error: () => {} } });
  const socket = gateway.open({
    send: (text) => sent.push(decodeServerMessage(text)),
    viewer: () => Promise.resolve(who),
    protocolVersion,
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

  it("직무 배치·풀기(판 14)를 넘기고 결과 코드를 돌려준다", async () => {
    const calls: string[] = [];
    const { sent, socket } = open(fakeService(calls), viewer);
    socket.handle({ t: "labor_assign", id: 1, buildingId: 3, unitId: 9 });
    socket.handle({ t: "labor_unassign", id: 2, unitId: 9 });
    for (let i = 0; i < 8; i++) await settle();
    expect(calls).toEqual(["assign:user-1:3:9", "unassign:user-1:9"]);
    expect(sent).toEqual([
      { t: "labor_result", id: 1, ok: true },
      { t: "labor_result", id: 2, ok: false, code: "not_assigned" },
    ]);
  });

  it("wrong_map(판 15)은 15판 연결에만, 14판 연결은 invalid_terms(WP8 522 ①)", async () => {
    const service: LaborService = {
      ...fakeService([]),
      assign: () => Promise.resolve({ ok: false, code: "wrong_map" }),
    };
    const now = open(service, viewer, 15);
    const older = open(service, viewer, 14);
    now.socket.handle({ t: "labor_assign", id: 1, buildingId: 3, unitId: 9 });
    older.socket.handle({ t: "labor_assign", id: 2, buildingId: 3, unitId: 9 });
    for (let i = 0; i < 4; i++) await settle();
    expect(now.sent).toEqual([{ t: "labor_result", id: 1, ok: false, code: "wrong_map" }]);
    expect(older.sent).toEqual([{ t: "labor_result", id: 2, ok: false, code: "invalid_terms" }]);
  });

  it("멈춘 계약 기다림(판 54, 2237)은 서비스가 아니라 DB로 — DB가 없으면 busy", async () => {
    const calls: string[] = [];
    const { sent, socket } = open(fakeService(calls), viewer);
    socket.handle({ t: "labor_wait", id: 1, contractId: 4, dueAt: 1_000 });
    for (let i = 0; i < 4; i++) await settle();
    expect(calls).toEqual([]);
    expect(sent).toEqual([{ t: "labor_result", id: 1, ok: false, code: "busy" }]);
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

  it("운영자 모드(전체 보기 + dev·admin) 직무 배치·일자리 받기는 그 유닛에 운영자 빠르기 표시, 보통 연결의 풀기는 지운다", async () => {
    const { map } = createTestMap();
    map.addUnit({ id: 9, size: 1, speed: 437, cellX: 10, cellY: 10 });
    const dev: Viewer = { id: "dev-1", loginId: "dev", roles: ["player", "dev"] };
    const connect = (who: Viewer, observing: boolean) => {
      const gateway = createLaborGateway({
        service: () => fakeService([]),
        maps: () => [map],
        now: () => 0,
        log: { error: () => {} },
      });
      return gateway.open({
        send: () => {},
        viewer: () => Promise.resolve(who),
        observing: () => observing,
        operatorPace: fixedOperatorPace(OPERATOR_SPEED_FACTOR),
      });
    };
    connect(dev, true).handle({ t: "labor_assign", id: 1, buildingId: 3, unitId: 9 });
    for (let i = 0; i < 4; i++) await settle();
    expect(map.paceOf(9)).toBe(OPERATOR_SPEED_FACTOR);
    // 거절된 풀기(not_assigned)는 표시를 그대로 둔다. 된 명령(일자리 받기)은 보통 연결이면 지운다
    connect(viewer, false).handle({ t: "labor_unassign", id: 2, unitId: 9 });
    for (let i = 0; i < 4; i++) await settle();
    expect(map.paceOf(9)).toBe(OPERATOR_SPEED_FACTOR);
    connect(dev, false).handle({ t: "labor_accept_job", id: 3, jobId: 4, unitId: 9 });
    for (let i = 0; i < 4; i++) await settle();
    expect(map.paceOf(9)).toBe(1);
    // 유닛이 없는 명령(계약 끝내기)은 표시와 상관없다
    connect(dev, true).handle({ t: "labor_terminate", id: 4, contractId: 9 });
    for (let i = 0; i < 4; i++) await settle();
    expect(map.paceOf(9)).toBe(1);
    map.stop();
  });
});
