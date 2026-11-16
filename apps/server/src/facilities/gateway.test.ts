// 건물 연결 처리 시험 — 로그인, 세계 준비 전, 차례 처리, 개발 명령 권한, 결과 메시지 모양(docs/adr/2026-11-07-buildings-runtime.md)
import { decodeServerMessage } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import { createFacilityGateway } from "./gateway.ts";
import type { BuildingAttack } from "./attack.ts";
import type { FacilityService } from "./service.ts";
import { fixedOperatorPace } from "../world/operatorPace.ts";

const player: Viewer = { id: "user-1", loginId: "tester", roles: ["player"] };
const dev: Viewer = { id: "dev-1", loginId: "dev", roles: ["dev"] };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const notUsed = (): never => {
  throw new Error("not used");
};

function fakeService(calls: string[]): FacilityService {
  return {
    facilities: new Map(),
    jobs: new Map(),
    finishDue: () => 0,
    age: () => 0,
    works: () => true,
    holdingLocked: () => false,
    unitInJob: () => false,
    pausesFor: () => undefined,
    outsourceQuote: () => "no_shop_worker",
    shopWorkers: () => [],
    damage: () => false,
    attachGovernment: () => {},
    attachStorageOut: () => {},
    attachExchangeIn: () => {},
    carryOut: () => undefined,
    ownerSale: (_owner, _building, _asset, qty) => qty,
    attachBusiness: () => {},
    businessCommand: () => Promise.resolve({ ok: true }),
    seedBuilt: () => {},
    haltBuild: () => false,
    npcBuild: notUsed,
    npcJob: notUsed,
    places: { maps: new Map(), facilities: new Map(), catalog: notUsed, cities: () => [] },
    storageMove: (userId, input) => {
      calls.push(`move:${userId}:${input.buildingId}:${input.asset}:${input.qty}:${input.direction}`);
      return Promise.resolve({ ok: false, code: "storage_full" });
    },
    stop: () => {},
    build: (userId, input) => {
      calls.push(
        `build:${userId}:${input.facility}:${input.x}:${input.y}:${input.rotation}:${input.unitIds?.length ?? 0}${input.operator ? `:operator×${input.operator.pace}` : ""}`,
      );
      return Promise.resolve({ ok: true, buildingId: 7, doneAtMs: 1_000 });
    },
    upgrade: (userId, buildingId, unitIds, operator) => {
      calls.push(
        `upgrade:${userId}:${buildingId}:${unitIds.length}${operator ? `:operator×${operator.pace}` : ""}`,
      );
      return Promise.resolve({ ok: false, code: "insufficient_materials" });
    },
    plot: (userId, buildingId, unitIds) => {
      calls.push(`plot:${userId}:${buildingId}:${unitIds.join(",")}`);
      return Promise.resolve({ ok: false, code: "plot_full" });
    },
    plotRemove: (userId, buildingId) => {
      calls.push(`unplot:${userId}:${buildingId}`);
      return Promise.resolve({ ok: false, code: "no_plot" });
    },
    gatherTier: (userId, buildingId, tier) => {
      calls.push(`tier:${userId}:${buildingId}:${String(tier)}`);
      return Promise.resolve({ ok: false, code: "tier_locked" });
    },
    repair: (userId, target, steps, unitIds) => {
      calls.push(`repair:${userId}:${JSON.stringify(target)}:${steps}:${unitIds.join(",")}`);
      return Promise.resolve({ ok: true, doneAtMs: 2_000 });
    },
    repairEquipment: (userId, buildingId, holdingId, unitIds) => {
      calls.push(`equipment:${userId}:${buildingId}:${holdingId}:${unitIds.join(",")}`);
      return Promise.resolve({ ok: false, code: "equipped" });
    },
    devFacilityGrant: (userId, item, qty, at) => {
      calls.push(`grant:${userId}:${item}:${qty}${at ? `@${at.mapKey}:${at.x}:${at.y}` : ""}`);
      return Promise.resolve({ ok: true });
    },
    devFinish: (userId, target) => {
      calls.push(`finish:${userId}:${JSON.stringify(target)}`);
      return Promise.resolve({ ok: true });
    },
  };
}

/** 행정 건물 짓기가 늘 그 코드로 실패하는 서비스 */
const ruinService = (code: "not_ruin" | "ruin_claimed" | "needs_water"): FacilityService => ({
  ...fakeService([]),
  build: () => Promise.resolve({ ok: false, code }),
});

function open(
  service: FacilityService | undefined,
  who: Viewer | null,
  attack?: BuildingAttack,
  protocolVersion?: number,
  operator?: { observing: boolean; pace: number },
) {
  const sent: unknown[] = [];
  const gateway = createFacilityGateway({
    service: () => service,
    attack: () => attack,
    now: () => 0,
    log: { error: () => {} },
  });
  const socket = gateway.open({
    send: (text) => sent.push(decodeServerMessage(text)),
    viewer: () => Promise.resolve(who),
    protocolVersion,
    ...(operator
      ? { observing: () => operator.observing, operatorPace: fixedOperatorPace(operator.pace) }
      : {}),
  });
  return { sent, socket };
}

describe("건물 연결 처리", () => {
  it("판매만·운반꾼 없음(46, D-569 1781·1784): 새 코드는 46판에만, 45판은 forbidden·busy로", async () => {
    const service: FacilityService = {
      ...fakeService([]),
      storageMove: () => Promise.resolve({ ok: false, code: "sale_only" }),
      businessCommand: () => Promise.resolve({ ok: false, code: "no_carrier" }),
    };
    for (const [version, move, buy] of [
      [46, "sale_only", "no_carrier"],
      [45, "forbidden", "busy"],
    ] as const) {
      const { sent, socket } = open(service, player, undefined, version);
      socket.handle({
        t: "storage_move",
        id: 1,
        buildingId: 8,
        asset: "item:plank",
        qty: 3,
        direction: "out",
      });
      socket.handle({ t: "business_buy", id: 2, buildingId: 8, item: "item:plank", qty: 3 });
      for (let i = 0; i < 6; i++) await settle();
      expect(sent).toEqual([
        { t: "facility_result", id: 1, ok: false, code: move },
        { t: "business_result", id: 2, ok: false, code: buy },
      ]);
    }
  });

  it("거래소 건물 짓기(47, D-561): exchange_locked·exchange_exists는 47판에만, 46판은 forbidden으로", async () => {
    for (const code of ["exchange_locked", "exchange_exists"] as const) {
      const service: FacilityService = {
        ...fakeService([]),
        build: () => Promise.resolve({ ok: false, code }),
      };
      for (const [version, shown] of [
        [47, code],
        [46, "forbidden"],
      ] as const) {
        const { sent, socket } = open(service, player, undefined, version);
        socket.handle({
          t: "facility_build",
          id: 1,
          mapKey: 9,
          facility: "stock_exchange",
          x: 3,
          y: 4,
          rotation: 0,
        });
        for (let i = 0; i < 6; i++) await settle();
        expect(sent).toEqual([{ t: "facility_result", id: 1, ok: false, code: shown }]);
      }
    }
  });

  it("외주 수리(48, D-570 1785): 빈 unitIds를 받고, no_shop_worker·service_closed는 48판에만, 47판은 unit_busy·cannot_repair로", async () => {
    for (const [code, legacy] of [
      ["no_shop_worker", "unit_busy"],
      ["service_closed", "cannot_repair"],
    ] as const) {
      const seen: (readonly number[])[] = [];
      const service: FacilityService = {
        ...fakeService([]),
        repairEquipment: (_userId, _buildingId, _holdingId, unitIds) => {
          seen.push(unitIds);
          return Promise.resolve({ ok: false, code });
        },
      };
      for (const [version, shown] of [
        [48, code],
        [47, legacy],
      ] as const) {
        const { sent, socket } = open(service, player, undefined, version);
        socket.handle({ t: "equipment_repair", id: 1, buildingId: 8, holdingId: 3, unitIds: [] });
        for (let i = 0; i < 6; i++) await settle();
        expect(sent).toEqual([{ t: "facility_result", id: 1, ok: false, code: shown }]);
      }
      expect(seen).toEqual([[], []]);
    }
  });

  it("명령을 받은 차례대로 넘기고 결과를 요청 id로 돌려준다(수리 대상은 건물·비콘 가운데 하나)", async () => {
    const calls: string[] = [];
    const { sent, socket } = open(fakeService(calls), player);
    socket.handle({
      t: "facility_build",
      id: 1,
      mapKey: 9,
      facility: "farm",
      x: 3,
      y: 4,
      rotation: 90,
      unitIds: [5],
    });
    socket.handle({ t: "facility_upgrade", id: 2, buildingId: 7 });
    socket.handle({ t: "facility_repair", id: 3, beaconId: 2, steps: 10, unitIds: [5, 6] });
    socket.handle({ t: "equipment_repair", id: 4, buildingId: 7, holdingId: 11, unitIds: [5] });
    socket.handle({ t: "storage_move", id: 5, buildingId: 8, asset: "item:plank", qty: 3, direction: "in" });
    // 면적 모듈 붙이기(41, D-567)
    socket.handle({ t: "facility_plot", id: 6, buildingId: 7, unitIds: [5] });
    // 모듈 떼기·기를 티어(45, D-569 1761·1765)
    socket.handle({ t: "facility_plot_remove", id: 7, buildingId: 7 });
    socket.handle({ t: "facility_gather_tier", id: 8, buildingId: 7, tier: 3 });
    for (let i = 0; i < 12; i++) await settle();
    expect(calls).toEqual([
      "build:user-1:farm:3:4:90:1",
      "upgrade:user-1:7:0",
      'repair:user-1:{"beaconId":2}:10:5,6',
      "equipment:user-1:7:11:5",
      "move:user-1:8:item:plank:3:in",
      "plot:user-1:7:5",
      "unplot:user-1:7",
      "tier:user-1:7:3",
    ]);
    expect(sent).toEqual([
      { t: "facility_result", id: 1, ok: true, buildingId: 7, doneAtMs: 1_000 },
      { t: "facility_result", id: 2, ok: false, code: "insufficient_materials" },
      { t: "facility_result", id: 3, ok: true, doneAtMs: 2_000 },
      { t: "facility_result", id: 4, ok: false, code: "equipped" },
      { t: "facility_result", id: 5, ok: false, code: "storage_full" },
      { t: "facility_result", id: 6, ok: false, code: "plot_full" },
      { t: "facility_result", id: 7, ok: false, code: "no_plot" },
      { t: "facility_result", id: 8, ok: false, code: "tier_locked" },
    ]);
  });

  it("개발 시험 명령은 dev·admin만(player는 forbidden), 로그인하지 않았으면 sign_in_required, 세계 준비 전이면 busy", async () => {
    const calls: string[] = [];
    const asPlayer = open(fakeService(calls), player);
    asPlayer.socket.handle({ t: "dev_facility_grant", id: 1, item: "pine_log", qty: 3 });
    const asDev = open(fakeService(calls), dev);
    asDev.socket.handle({ t: "dev_facility_grant", id: 2, item: "pine_log", qty: 3, mapKey: 9, x: 40 });
    asDev.socket.handle({ t: "dev_facility_finish", id: 3, buildingId: 7 });
    const signedOut = open(fakeService(calls), null);
    signedOut.socket.handle({ t: "facility_upgrade", id: 4, buildingId: 7 });
    const booting = open(undefined, player);
    booting.socket.handle({ t: "facility_upgrade", id: 5, buildingId: 7 });
    for (let i = 0; i < 10; i++) await settle();
    expect(asPlayer.sent).toEqual([{ t: "facility_result", id: 1, ok: false, code: "forbidden" }]);
    expect(asDev.sent).toEqual([
      { t: "facility_result", id: 2, ok: true },
      { t: "facility_result", id: 3, ok: true },
    ]);
    // 자리 칸(12): y가 없으면 가운데 칸
    expect(calls).toEqual(["grant:dev-1:pine_log:3@9:40:128", 'finish:dev-1:{"buildingId":7}']);
    expect(signedOut.sent).toEqual([{ t: "facility_result", id: 4, ok: false, code: "sign_in_required" }]);
    expect(booting.sent).toEqual([{ t: "facility_result", id: 5, ok: false, code: "busy" }]);
  });

  it("건물·비콘 공격(12)은 공격 서비스로 넘기고, 공격 서비스가 없으면 busy", async () => {
    const calls: string[] = [];
    const attack: BuildingAttack = {
      attack: (userId, target, unitIds) => {
        calls.push(`attack:${userId}:${JSON.stringify(target)}:${unitIds.join(",")}`);
        return Promise.resolve(
          "beaconId" in target ? { ok: false, code: "own_target" } : { ok: true, doneAtMs: 9 },
        );
      },
    };
    const armed = open(fakeService(calls), player, attack);
    armed.socket.handle({ t: "facility_attack", id: 1, buildingId: 7, unitIds: [5, 6] });
    armed.socket.handle({ t: "facility_attack", id: 2, beaconId: 3, unitIds: [5] });
    const unarmed = open(fakeService(calls), player);
    unarmed.socket.handle({ t: "facility_attack", id: 3, buildingId: 7, unitIds: [5] });
    for (let i = 0; i < 10; i++) await settle();
    expect(calls).toEqual(['attack:user-1:{"buildingId":7}:5,6', 'attack:user-1:{"beaconId":3}:5']);
    expect(armed.sent).toEqual([
      { t: "facility_result", id: 1, ok: true, doneAtMs: 9 },
      { t: "facility_result", id: 2, ok: false, code: "own_target" },
    ]);
    expect(unarmed.sent).toEqual([{ t: "facility_result", id: 3, ok: false, code: "busy" }]);
  });

  it("행정 건물(폐허 정부)의 새 코드 not_ruin·ruin_claimed는 13판 연결에만, 12판은 not_buildable(docs/adr/2026-11-07-ruins-restoration.md)", async () => {
    const build = {
      t: "facility_build",
      id: 1,
      mapKey: 9,
      facility: "government_hall",
      x: 3,
      y: 4,
      rotation: 0,
    } as const;
    const now = open(ruinService("not_ruin"), player, undefined, 13);
    now.socket.handle(build);
    const claimed = open(ruinService("ruin_claimed"), player);
    claimed.socket.handle(build);
    const old = open(ruinService("ruin_claimed"), player, undefined, 12);
    old.socket.handle(build);
    for (let i = 0; i < 10; i++) await settle();
    expect(now.sent).toEqual([{ t: "facility_result", id: 1, ok: false, code: "not_ruin" }]);
    expect(claimed.sent).toEqual([{ t: "facility_result", id: 1, ok: false, code: "ruin_claimed" }]);
    expect(old.sent).toEqual([{ t: "facility_result", id: 1, ok: false, code: "not_buildable" }]);
  });

  it("물가 조건의 새 코드 needs_water는 21판 연결에만, 20판은 blocked_terrain(질문 947 나)", async () => {
    const build = {
      t: "facility_build",
      id: 1,
      mapKey: 9,
      facility: "fishing_spot",
      x: 3,
      y: 4,
      rotation: 0,
    } as const;
    const now = open(ruinService("needs_water"), player, undefined, 21);
    now.socket.handle(build);
    const old = open(ruinService("needs_water"), player, undefined, 20);
    old.socket.handle(build);
    for (let i = 0; i < 10; i++) await settle();
    expect(now.sent).toEqual([{ t: "facility_result", id: 1, ok: false, code: "needs_water" }]);
    expect(old.sent).toEqual([{ t: "facility_result", id: 1, ok: false, code: "blocked_terrain" }]);
  });

  it("운영자 모드(전체 보기 + dev·admin) 짓기·레벨 올리기는 제한 없이 — 표지와 배율을 서비스로 넘긴다. 플레이어·전체 보기 아님은 보통(D-560 1239)", async () => {
    const calls: string[] = [];
    const build = {
      t: "facility_build",
      id: 1,
      mapKey: 9,
      facility: "farm",
      x: 3,
      y: 4,
      rotation: 0,
    } as const;
    const upgrade = { t: "facility_upgrade", id: 2, buildingId: 7 } as const;
    const devOperator = open(fakeService(calls), dev, undefined, undefined, { observing: true, pace: 10 });
    devOperator.socket.handle(build);
    devOperator.socket.handle(upgrade);
    for (let i = 0; i < 6; i++) await settle();
    // 플레이어는 전체 보기 구독을 못 한다 — 그래도 권한을 서버가 다시 본다
    open(fakeService(calls), player, undefined, undefined, { observing: true, pace: 10 }).socket.handle(
      build,
    );
    open(fakeService(calls), dev, undefined, undefined, { observing: false, pace: 10 }).socket.handle(build);
    for (let i = 0; i < 6; i++) await settle();
    expect(calls).toEqual([
      "build:dev-1:farm:3:4:0:0:operator×10",
      "upgrade:dev-1:7:0:operator×10",
      "build:user-1:farm:3:4:0:0",
      "build:dev-1:farm:3:4:0:0",
    ]);
  });
});
