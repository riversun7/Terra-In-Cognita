// 다친 유닛의 자율 병원 판단 시험(league-2 D-590 2507 가, league-3 다른 도시 병원·요금 상한·NPC 휴먼 — labor/stewardCare.ts). 병원 서비스·이동·2차맵은 가짜다.
import { CELL_UNITS, createMotion } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { HEALTHY } from "../world/unitCondition.ts";
import {
  type CareNpcTravel,
  type CareQuoteRef,
  type CareTravel,
  type NpcCareSource,
  type StewardHospital,
  careBudget,
  createStewardCare,
  injuryWeightPm,
  stewardRisk,
  stewardTreats,
} from "./stewardCare.ts";

/** 7축 성향 배열(@terra/shared/unitTraits 축 차례) — 모두 같은 값 */
const flat = (value: number) => Array.from({ length: 7 }, () => value);
const NOW = 1_000_000;
const condition = (injury: number) => ({ ...HEALTHY, injury, injuryUntilMs: NOW + 86_400_000 });
const still = (x: number, y: number) =>
  createMotion({ waypoints: [{ x: x * CELL_UNITS, y: y * CELL_UNITS }], departAtMs: 0, speed: 1 });

interface FakeUnit {
  id: number;
  kind: number;
  ownerId: number;
  traits: number[] | undefined;
  condition: ReturnType<typeof condition>;
  mapKey: number;
  x: number;
  y: number;
}

/** 2차맵 1·2(도시 101·102)·3(도시 103) 위 가짜 유닛 */
function rig(units: FakeUnit[]) {
  const maps = new Map(
    [1, 2, 3].map((mapKey) => [
      mapKey,
      {
        mapKey,
        forEachUnit: (visit: (unit: FakeUnit) => void) =>
          units.filter((unit) => unit.mapKey === mapKey).forEach(visit),
        unitInfo: (id: number) => {
          const unit = units.find((entry) => entry.id === id && entry.mapKey === mapKey);
          return unit && { condition: unit.condition, motion: still(unit.x, unit.y), size: 1 as const };
        },
      },
    ]),
  );
  return maps;
}

/** 병원: 도시 102(2차맵 2) 건물 8(300), 도시 103(2차맵 3) 건물 9(200). quotes = 그 유닛이 선 2차맵 도시와 병원 목록 */
function fakeHospital(units: FakeUnit[], hospitals: readonly CareQuoteRef[]) {
  const treated: string[] = [];
  const hospital: StewardHospital = {
    careQuotes: async (unitId) => {
      const unit = units.find((entry) => entry.id === unitId);
      if (!unit || unit.condition.injury <= 0) return undefined;
      return { cityId: 100 + unit.mapKey, options: hospitals };
    },
    treat: async (userId, input) => {
      treated.push(`${userId}:${String(input.unit)}@${String(input.buildingId)}:${input.cost}`);
      const unit = units.find((entry) => entry.id === input.unit);
      if (unit) unit.condition = condition(0);
      return { ok: true };
    },
    treatBy: async (payer, input) => {
      treated.push(
        `npc${String(payer.account)}:${String(input.unit)}@${String(input.buildingId)}:${input.cost}`,
      );
      const unit = units.find((entry) => entry.id === input.unit);
      if (unit) unit.condition = condition(0);
      return { ok: true };
    },
  };
  return { hospital, treated };
}

const H8: CareQuoteRef = { buildingId: 8, cityId: 102, mapKey: 2, x: 5, y: 5, cost: 300n };
const H9: CareQuoteRef = { buildingId: 9, cityId: 103, mapKey: 3, x: 7, y: 7, cost: 200n };
const H7: CareQuoteRef = { buildingId: 7, cityId: 101, mapKey: 1, x: 1, y: 1, cost: 900n };

describe("다친 유닛 자율 병원 판단(stewardCare.ts)", () => {
  it("부상 무게 > 위험 감수면 병원, 아니면 계속 일한다(성향 없으면 가운데 500). 요금 상한 = 지갑 × ‰", () => {
    expect(injuryWeightPm(1)).toBe(333);
    expect(injuryWeightPm(3)).toBe(1000);
    expect(stewardRisk(undefined)).toBe(500);
    expect(stewardTreats(0, 0)).toBe(false);
    expect(stewardTreats(1, 500)).toBe(false);
    expect(stewardTreats(2, 500)).toBe(true);
    expect(stewardTreats(2, 900)).toBe(false);
    expect(stewardTreats(3, 900)).toBe(true);
    expect(stewardTreats(1, 100)).toBe(true);
    expect(careBudget(1_000n, 500)).toBe(500n);
    expect(careBudget(1_000n, 2_000)).toBe(1_000n);
    expect(careBudget(-5n, 500)).toBe(0n);
  });

  it("관리인이 맡은 다친 유닛만, 그 도시 병원 가운데 상한 안 첫 견적으로 치료한다", async () => {
    // 1: 관리인 일·중상(병원), 2: 관리인 일·경상(가운데 → 일), 3: 관리인 일 아님, 4: 다른 사람
    const units: FakeUnit[] = [
      { id: 1, kind: 1, ownerId: 10, traits: undefined, condition: condition(2), mapKey: 2, x: 0, y: 0 },
      { id: 2, kind: 1, ownerId: 10, traits: flat(500), condition: condition(1), mapKey: 2, x: 0, y: 0 },
      { id: 3, kind: 1, ownerId: 10, traits: undefined, condition: condition(2), mapKey: 2, x: 0, y: 0 },
      { id: 4, kind: 1, ownerId: 11, traits: undefined, condition: condition(2), mapKey: 2, x: 0, y: 0 },
    ];
    // 도시 102 병원 둘: 빠른 6(900 — 상한 넘음)·8(300)
    const H6 = { ...H8, buildingId: 6, cost: 900n };
    const { hospital, treated } = fakeHospital(units, [H6, H8]);
    const care = createStewardCare({
      maps: rig(units),
      hospital: () => hospital,
      playerPayer: (ownerId) => ({ ownerId, account: ownerId, asset: "c" }),
      balance: () => 1_000n,
    });
    const input = {
      owners: new Map([[10, "u10"]]),
      stewarded: (unitId: number) => unitId !== 3,
      kinds: new Set([1]),
      nowMs: NOW,
      costCapPm: 500,
    };
    expect(await care.run(input)).toBe(1);
    expect(treated).toEqual(["u10:1@8:300"]);
    // 병원 서비스가 없으면 아무것도 안 한다
    expect(await createStewardCare({ maps: rig(units), hospital: () => undefined }).run(input)).toBe(0);
  });

  it("그 도시에 쓸 병원이 없으면 상한 안 가장 가까운 다른 도시 병원으로 걸어가 치료하고 떠난 자리로 돌아온다(D-591 순간이동 없음)", async () => {
    const units: FakeUnit[] = [
      { id: 1, kind: 1, ownerId: 10, traits: undefined, condition: condition(3), mapKey: 1, x: 4, y: 6 },
    ];
    // 도시 101 병원 7은 상한(500)을 넘는다 → 다른 도시: 8(2차맵 2)·9(2차맵 3). 시험 2차맵 키는 셀 키가 아니라 같은 거리 → 작은 ID(8)
    const { hospital, treated } = fakeHospital(units, [H7, H8, H9]);
    const starts: string[] = [];
    let state: "going" | "arrived" | "stopped" = "going";
    const travel: CareTravel = {
      start: async (userId, request) => {
        starts.push(
          `${userId}:${String(request.unitId)}->${String(request.mapKey)}(${String(request.x)},${String(request.y)})`,
        );
        return { ok: true };
      },
      list: () => [{ unitId: 1, state }],
    };
    const care = createStewardCare({
      maps: rig(units),
      hospital: () => hospital,
      travel: () => travel,
      playerPayer: (ownerId) => ({ ownerId, account: ownerId, asset: "c" }),
      balance: () => 1_000n,
    });
    const input = {
      owners: new Map([[10, "u10"]]),
      stewarded: () => true,
      kinds: new Set([1]),
      nowMs: NOW,
      costCapPm: 500,
    };
    expect(await care.run(input)).toBe(0);
    expect(starts).toEqual(["u10:1->2(5,5)"]);
    expect(care.busy(1)).toBe(true);
    // 가는 중이면 그대로(관리인은 새 일자리에 넣지 않는다 — busy)
    expect(await care.run(input)).toBe(0);
    expect(starts).toHaveLength(1);
    // 닿았다: 그 도시(102) 병원에서 치료하고 떠난 자리로 돌아간다
    const unit = units[0];
    if (unit) unit.mapKey = 2;
    state = "arrived";
    await care.run(input);
    expect(treated).toEqual(["u10:1@8:300"]);
    expect(starts).toEqual(["u10:1->2(5,5)", "u10:1->1(4,6)"]);
    expect(care.busy(1)).toBe(true);
    // 돌아왔다: 잊는다
    if (unit) unit.mapKey = 1;
    await care.run(input);
    expect(care.busy(1)).toBe(false);
    expect(starts).toHaveLength(2);
  });

  it("병원 가는 중에 유저가 접속하면 그 길은 유저에게 맡긴다. 상한 안 병원이 어디에도 없으면 가지 않는다", async () => {
    const units: FakeUnit[] = [
      { id: 1, kind: 1, ownerId: 10, traits: undefined, condition: condition(3), mapKey: 1, x: 0, y: 0 },
    ];
    const { hospital } = fakeHospital(units, [H7, H8]);
    const travel: CareTravel = {
      start: async () => ({ ok: true }),
      list: () => [{ unitId: 1, state: "going" }],
    };
    const parts = {
      maps: rig(units),
      hospital: () => hospital,
      travel: () => travel,
      playerPayer: (ownerId: number) => ({ ownerId, account: ownerId, asset: "c" }),
    };
    const input = { owners: new Map([[10, "u10"]]), stewarded: () => true, kinds: new Set([1]), nowMs: NOW };
    const care = createStewardCare({ ...parts, balance: () => 1_000n });
    await care.run({ ...input, costCapPm: 500 });
    expect(care.busy(1)).toBe(true);
    await care.run({ ...input, owners: new Map() });
    expect(care.busy(1)).toBe(false);
    // 지갑 400 × 500‰ = 200 < 300 → 어디에도 못 간다
    const poor = createStewardCare({ ...parts, balance: () => 400n });
    await poor.run({ ...input, costCapPm: 500 });
    expect(poor.busy(1)).toBe(false);
  });

  it("NPC 휴먼(D-555 1509): 그 휴먼 지갑으로 같은 도시 병원, NPC 이동이 없으면 걸어가지 않고, 있으면 다녀온다", async () => {
    // 21: 같은 도시(102)에 병원, 22: 도시 101(병원 7은 상한 넘음), 23: NPC 휴먼 아님
    const units: FakeUnit[] = [
      { id: 21, kind: 0, ownerId: 40, traits: undefined, condition: condition(2), mapKey: 2, x: 0, y: 0 },
      { id: 22, kind: 0, ownerId: 40, traits: undefined, condition: condition(2), mapKey: 1, x: 3, y: 3 },
      { id: 23, kind: 0, ownerId: 41, traits: undefined, condition: condition(2), mapKey: 2, x: 0, y: 0 },
    ];
    const { hospital, treated } = fakeHospital(units, [H7, H8]);
    let npcTravel: CareNpcTravel | undefined;
    const npc: NpcCareSource = {
      isHuman: (_unitId, ownerId, kind) => kind === 0 && ownerId === 40,
      traitsOf: () => undefined,
      purseOf: (unitId, ownerId) => ({ ownerId, account: 1000 + unitId, asset: "nat" }),
      travel: () => npcTravel,
    };
    const care = createStewardCare({
      maps: rig(units),
      hospital: () => hospital,
      npc: () => npc,
      balance: () => 1_000n,
    });
    const input = {
      owners: new Map(),
      stewarded: () => false,
      kinds: new Set([1]),
      nowMs: NOW,
      costCapPm: 500,
    };
    expect(await care.run(input)).toBe(1);
    expect(treated).toEqual(["npc1021:21@8:300"]);
    expect(care.busy(22)).toBe(false);
    // NPC 이동이 생기면(no-teleport-b) 걸어가고, 닿았다는 알림에 바로 치료하고 돌아온다
    const sent: string[] = [];
    let arrive: (() => void) | undefined;
    npcTravel = {
      send: async (unitId, to, onDone) => {
        sent.push(`${String(unitId)}->${String(to.mapKey)}`);
        arrive = () => onDone?.({ unitId, state: "arrived", stop: null, mapKey: to.mapKey });
        return { ok: true, arriveAt: NOW + 1 };
      },
    };
    await care.run(input);
    expect(sent).toEqual(["22->2"]);
    expect(care.busy(22)).toBe(true);
    const unit = units[1];
    if (unit) unit.mapKey = 2;
    arrive?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(treated).toEqual(["npc1021:21@8:300", "npc1022:22@8:300"]);
    expect(sent).toEqual(["22->2", "22->1"]);
    if (unit) unit.mapKey = 1;
    arrive?.();
    expect(care.busy(22)).toBe(false);
  });
});
