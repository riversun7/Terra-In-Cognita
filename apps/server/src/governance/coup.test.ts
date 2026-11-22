// 군사 쿠데타 시험(coup.ts — 바뀜 gov-fix-2: 기획 답 2542·2545·2549). 가짜 포트·표(메모리)로 본다. 계정 ID는 가짜 값이다.
// - 2545: 플레이어 가문 나라도 대상(그 나라의 다른 플레이어 가문 장이 일으킨다), 정부군의 지배 가문 유닛 = 그 나라 소유 주체 유닛.
// - 2542: 시작 도시·수도에서 이겨도 그 도시만 떨어져 나간다(옛 나라 전체 없음), 못 떼면 아무것도 바뀌지 않는다.
// - 2549: 편을 든 쪽은 병력을 어디에 있든 보낸다(정부군도 같은 길).
// - 바뀜 no-teleport(D-591): 보낸 병력은 실제로 걸어가 쿠데타 도시 2차맵에 닿아야 싸운다(가짜 포트는 보내기만 적고, 시험이 닿은 유닛을 옮긴다).
import type { HouseKey } from "@terra/shared/governance";
import { describe, expect, it } from "vitest";
import { type CoupPort, createCoupService } from "./coup.ts";
import type { CoupRow, CoupSideRow, ShareHouseRow } from "./coupStore.ts";
import type { GovernanceNation } from "./port.ts";
import { TEST_GOVERNANCE_RULES } from "./rules.ts";
import type { StateRow } from "./store.ts";

const TRAITS = { aggression: 500, commerce: 500, faith: 500 };
/** 플레이어 가문 나라(세력 행 10 = 가문 p:10, 소유 주체 100). 도시 1 = 수도(시작 도시), 도시 2 */
const PLAYER_NATION: GovernanceNation = {
  rowId: 10,
  ownerId: 100,
  code: "house_10",
  playerHouse: true,
  regime: "capitalism",
  traits: TRAITS,
  cities: [1, 2],
};

function fake(options: { split?: boolean; away?: readonly number[]; ruling?: HouseKey } = {}) {
  const nations = new Map<number, GovernanceNation>([[10, PLAYER_NATION]]);
  const coups: CoupRow[] = [];
  const sides: CoupSideRow[] = [];
  const states: StateRow[] = [];
  const shareHouses: ShareHouseRow[] = [];
  const regimes: [number, string][] = [];
  const splits: [number, boolean | undefined][] = [];
  const battles: { rebels: readonly number[]; loyal: readonly number[] }[] = [];
  /** 가문 → 유닛: 지배 가문 p:10 = 나라 소유 주체 유닛 50·51, 쿠데타 가문 p:30 = 60 */
  const houseUnits: Record<string, number[]> = { "p:10": [50, 51], "p:30": [60], "n:7": [50, 51] };
  /** 도시 → 2차맵(도시 1 = 2차맵 1001, 도시 2 = 1002). 유닛이 선 2차맵(없으면 2차맵 사이를 가는 중) — 처음에는 모두 도시 1 */
  const where = new Map<number, number | undefined>(
    [50, 51, 60, 70, 80, 90, 91].map((id) => [id, options.away?.includes(id) ? 1002 : 1001]),
  );
  const sends: { userId: string; unitId: number; mapKey: number }[] = [];
  /** NPC 파견(no-teleport-b): 보낸 NPC 유닛 → 목적 2차맵(닿을 때까지 어느 2차맵에도 없다) */
  const npcSends = new Map<number, number>();
  const port: CoupPort = {
    ready: () => true,
    nation: (rowId) => nations.get(rowId),
    capitalOf: () => 1,
    cityGuards: (_nation, city) => (city === 1 ? [70] : []),
    houseUnits: (_nation, key) => houseUnits[key] ?? [],
    cityPlace: (cityId) => ({ mapKey: 1000 + cityId, x: 10, y: 10 }),
    unitMapOf: (unitId) => where.get(unitId),
    userTroops: (userId) =>
      (userId === "u-rebel" ? [80] : userId === "u-gov" ? [90, 91] : []).map((id) => ({
        id,
        type: "human" as const,
      })),
    sendTroop: async (userId, unitId, place) => {
      sends.push({ userId, unitId, mapKey: place.mapKey });
      // 보내면 2차맵 사이를 간다(닿을 때까지 어느 2차맵에도 없다)
      where.set(unitId, undefined);
      return 5000;
    },
    sendNpcTroop: async (unitId, place) => {
      npcSends.set(unitId, place.mapKey);
      where.set(unitId, undefined);
      return 7000;
    },
    npcTroopEta: (unitId, mapKey) =>
      npcSends.get(unitId) === mapKey && where.get(unitId) !== mapKey ? 7000 : undefined,
    npcHousesOf: () => [],
    citySatisfaction: () => undefined,
    powerOf: (ids) => ids.length,
    coupBattle: (_nation, rebels, loyal) => {
      battles.push({ rebels, loyal });
      return true;
    },
    async cityIndependence(nation, cityId, _nowMs, coup) {
      splits.push([cityId, coup]);
      if (options.split === false) return undefined;
      nations.set(20, { ...nation, rowId: 20, ownerId: 200, playerHouse: false, cities: [cityId] });
      nations.set(nation.rowId, { ...nation, cities: nation.cities.filter((id) => id !== cityId) });
      return 20;
    },
    setRegime: (nation, regime) => void regimes.push([nation.rowId, regime]),
    confiscateToHouse: () => 1000n,
    dropSatisfaction: () => {},
    nationUnits: () => [],
    applyRuling: () => {},
    payCoupCost: () => 0n,
    addRenown: () => {},
  };
  let clock = 1000;
  const service = createCoupService({
    port,
    store: {
      saveState: async (state) => void states.push(state),
      states: async () => new Map(),
    },
    leader: { houseHomes: async () => new Map() },
    coups: {
      insertCoup: async (input) => {
        const row: CoupRow = {
          ...input,
          id: coups.length + 1,
          status: "gathering",
          result: null,
          decidedAtMs: null,
        };
        coups.push(row);
        return row;
      },
      coup: async (id) => coups.find((row) => row.id === id),
      gathering: async () => coups.filter((row) => row.status === "gathering"),
      lastCoupOf: async () => undefined,
      join: async (row) => {
        const at = sides.findIndex((side) => side.coupId === row.coupId && side.joinerKey === row.joinerKey);
        if (at >= 0) sides[at] = row;
        else sides.push(row);
      },
      sides: async (coupId) => sides.filter((row) => row.coupId === coupId),
      finishCoup: async (id, status, result) => {
        const at = coups.findIndex((row) => row.id === id);
        const row = coups[at];
        if (row) coups[at] = { ...row, status, result };
      },
      saveShareHouse: async (row) => void shareHouses.push(row),
    },
    tools: {
      ruling: async () => ({ key: options.ruling ?? ("p:10" satisfies HouseKey), leaderUser: "u-lead" }),
    },
    rules: () => ({ ...TEST_GOVERNANCE_RULES, coupEnabled: true, coupGatherMs: 100, coupProtectMs: 0 }),
    now: () => clock,
    standing: async (userId) =>
      userId === "u-rebel"
        ? {
            nation: nations.get(10) ?? PLAYER_NATION,
            state: undefined,
            ruling: { key: "p:10", leaderUser: "u-lead" },
            electorate: { voters: [], total: 0n },
            leader: false,
            ownHouse: "p:30",
            power: 0n,
          }
        : undefined,
    audit: async () => {},
  });
  const resolve = async () => {
    clock += 1000;
    await service.tick(new Map([[10, nations.get(10) ?? PLAYER_NATION]]), new Map(), clock);
  };
  /** 참가 받는 동안의 틱(NPC 참가·NPC 파견) */
  const gatherTick = async () => {
    clock += 10;
    await service.tick(new Map([[10, nations.get(10) ?? PLAYER_NATION]]), new Map(), clock);
  };
  return {
    service,
    coups,
    states,
    regimes,
    splits,
    battles,
    nations,
    shareHouses,
    resolve,
    where,
    sends,
    npcSends,
    gatherTick,
  };
}

describe("쿠데타(gov-fix-2 — 2542·2545·2549)", () => {
  it("플레이어 가문 나라의 수도(시작 도시)에서 이기면 그 도시만 새 독재 나라로, 정부군 참가자 병력은 어디에 있든 든다", async () => {
    const f = fake();
    // 2545: 플레이어 가문 나라에서도 일으킨다(그 나라의 다른 플레이어 가문 장)
    expect(await f.service.launch("u-rebel", 1)).toEqual({ ok: true, agendaId: 1, action: "coup_started" });
    // 2549: 다른 곳에 있는 내 유닛도 정부군으로 보낸다(이미 도시 1에 있으면 보내지 않는다)
    expect(await f.service.join("u-gov", 1, "government", [90, 91])).toMatchObject({ ok: true });
    expect(f.sends).toEqual([]);
    await f.resolve();
    // 혁명군 = 쿠데타 가문 60 + 일으킨 사람 80, 정부군 = 지배 가문(= 나라 소유 주체) 50·51 + 도시 1 경비대 70 + 보낸 90·91
    expect(f.battles).toEqual([{ rebels: [60, 80], loyal: [50, 51, 70, 90, 91] }]);
    // 2542: 수도(시작 도시)도 그 도시만(coup = true), 옛 나라는 남고 체제·지배 가문 그대로
    expect(f.splits).toEqual([[1, true]]);
    expect(f.nations.get(10)?.cities).toEqual([2]);
    expect(f.regimes).toEqual([[20, "dictatorship"]]);
    expect(f.states).toEqual([
      {
        nationId: 20,
        rulingHouseKey: "p:30",
        electedAtMs: 2000,
        termEndsAtMs: null,
        shareVotesSuspended: false,
        vacantSinceMs: null,
        npcHeadUnit: null,
      },
    ]);
    expect(f.coups[0]).toMatchObject({ status: "won", result: { city: 1, newNationId: 20, seized: "1000" } });
  });

  it("떼어 내지 못하면 이겨도 옛 나라 전체를 차지하지 않는다(아무것도 바뀌지 않음)", async () => {
    const f = fake({ split: false });
    await f.service.launch("u-rebel", 1);
    await f.resolve();
    expect(f.states).toEqual([]);
    expect(f.regimes).toEqual([]);
    expect(f.shareHouses).toEqual([]);
    expect(f.coups[0]).toMatchObject({
      status: "won",
      result: { city: 1, newNationId: null, reason: "no_split" },
    });
  });
});

describe("쿠데타 병력 파견(no-teleport — D-591)", () => {
  it("보낸 병력은 쿠데타 도시 2차맵에 닿아야 싸우고, 늦거나 다른 곳에 있는 유닛(NPC·경비대·지배 가문 포함)은 빠진다", async () => {
    // 지배 가문 유닛 51·일으킨 사람 80·정부군 참가자 90·91은 도시 2(2차맵 1002)에 있다
    const f = fake({ away: [51, 80, 90, 91] });
    expect(await f.service.launch("u-rebel", 1)).toMatchObject({ ok: true });
    // 일으킨 사람은 처음에 그 도시에 있는 내 유닛만(80은 다른 곳 — 보내지 않는다)
    expect(f.sends).toEqual([]);
    // 고르지 않고 편을 들면 그 도시에 있는 내 유닛만(없음 — 보내지 않는다)
    expect(await f.service.join("u-gov", 1, "government")).toMatchObject({ ok: true });
    expect(f.sends).toEqual([]);
    // 고르면 실제로 보낸다(이동 서비스)
    expect(await f.service.join("u-gov", 1, "government", [90, 91, 999])).toMatchObject({ ok: true });
    expect(f.sends).toEqual([
      { userId: "u-gov", unitId: 90, mapKey: 1001 },
      { userId: "u-gov", unitId: 91, mapKey: 1001 },
    ]);
    // 일으킨 사람도 혁명군 참가로 더 보낸다
    expect(await f.service.join("u-rebel", 1, "rebel", [80])).toMatchObject({ ok: true });
    // 90·80은 전투 전에 닿았고 91은 아직 가는 중
    f.where.set(90, 1001);
    f.where.set(80, 1001);
    await f.resolve();
    // 혁명군 = 쿠데타 가문 60 + 닿은 80, 정부군 = 지배 가문 50(51은 다른 도시) + 경비대 70 + 닿은 90
    expect(f.battles).toEqual([{ rebels: [60, 80], loyal: [50, 70, 90] }]);
  });
});

describe("쿠데타 NPC 병력 파견(no-teleport-b — D-591·질문 2651 나)", () => {
  it("NPC 지배 가문의 다른 도시 가문원을 참가 받는 동안 쿠데타 도시로 보내고(한 번만), 닿은 유닛만 싸운다", async () => {
    // 지배 가문 n:7 = 50(도시 1)·51(도시 2)
    const f = fake({ away: [51], ruling: "n:7" });
    expect(await f.service.launch("u-rebel", 1)).toMatchObject({ ok: true });
    await f.gatherTick();
    // 도시 1에 있는 50은 그대로, 51만 보낸다
    expect([...f.npcSends]).toEqual([[51, 1001]]);
    // 가는 중이면 다시 보내지 않는다
    f.npcSends.clear();
    f.npcSends.set(51, 1001);
    await f.gatherTick();
    expect([...f.npcSends]).toEqual([[51, 1001]]);
    // 닿기 전에 전투면 빠진다(닿은 뒤에는 든다 — 다음 시험 줄)
    await f.resolve();
    expect(f.battles).toEqual([{ rebels: [60, 80], loyal: [50, 70] }]);
  });

  it("전투 전에 닿은 NPC 가문원은 정부군으로 싸운다", async () => {
    const f = fake({ away: [51], ruling: "n:7" });
    await f.service.launch("u-rebel", 1);
    await f.gatherTick();
    f.where.set(51, 1001);
    await f.resolve();
    expect(f.battles).toEqual([{ rebels: [60, 80], loyal: [50, 51, 70] }]);
  });
});
