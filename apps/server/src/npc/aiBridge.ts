// NPC 자율행동 런타임 브리지(aiBridge.ts) — docs/adr/2026-11-20-npc-autonomous-ai.md 3단계
// runtime.ts(1,000줄 상한)를 부풀리지 않고 개별 유닛 7축 성향 레지스트리 · 2차맵 5상태 FSM 연결 ·
// NPC 가문 자율 AI · 지배 가문 7축 금고 환류를 한곳에서 묶는다.
import { type TraitRole, type UnitTraits, upgradeLegacyTraits } from "@terra/shared/unitTraits";
import {
  type SimCity,
  type SimFaction,
  type SimUnit,
  type SocietyCoefficients,
  npcBaseDailyWage,
  npcDailyWage,
} from "@terra/sim";
import { houseStatusOf } from "@terra/sim/npcAi";
import type { Ledger } from "../economy/ledger.ts";
import type { NpcCityHouses } from "./cityHouses.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { restCycleOf } from "./cityRest.ts";
import type { ServerEconomy } from "./economy.ts";
import { type HumanPlacesInput, createHumanPlaces } from "./humanPlaces.ts";
import { type AiMonitorView, buildAiMonitor } from "./aiMonitor.ts";
import { type HouseCareDay, createHouseCare } from "./houseCare.ts";
import { HOUSE_VAULT_PREFIX } from "../factionIdentity/houseVault.ts";
import { npcHouseVaultCode } from "./rulingVault.ts";
import { type LaborOrders, createLaborOrders } from "./laborOrders.ts";
import { type NpcHouseAiService, createNpcHouseAi } from "./npcHouseAi.ts";
import type { CityPlace } from "./persist.ts";
import { type UnitTraitStore, createUnitTraitRegistry } from "./unitTraitRegistry.ts";

export interface NpcAiBridge {
  readonly traits: UnitTraitStore;
  readonly houseAi: NpcHouseAiService;
  /** 가문 일 지시(일꾼 차례·지시 불복, laborOrders.ts) */
  readonly labor: LaborOrders;
  /** 하루 끝 가문세·돌봄 배당(임금·생활비 다음, 만족도 앞 — houseCare.ts) */
  houseDay(nowMs: number): HouseCareDay;
  /** AI 작동 모니터(/dev/npc-ai 탭, aiMonitor.ts — 읽기만). cityId를 주면 그 도시 가문 표를 붙인다 */
  monitor(nowMs: number, cityId?: number): AiMonitorView;
  /** 가문 일 지시 점검: 바뀐 도시의 일꾼 수를 도시 경제에 다시 세게 하고 바뀐 도시 수를 돌려준다 */
  laborTick(nowMs: number, econ?: Pick<ServerEconomy, "refreshCity">): number;
  /** humanPlaces.sync에 덧붙이는 5상태 FSM · 경비대 순찰 반경 옵션 */
  humanPlacesOptions(): Pick<HumanPlacesInput, "traitsOf" | "needsOf" | "atWarOf" | "ai">;
  /** 특정 세력(소유 주체 ID)의 7축 바탕 성향 */
  factionBaseTraits(ownerId: number): UnitTraits | undefined;
  /** 사망·제거된 유닛의 성향 캐시를 정리한다 */
  pruneDeadUnits(): void;
  /** 2차맵 휴먼 자리 + 5상태 FSM 동기화(runtime.ts에서 분리) */
  syncHumanPlaces(input: {
    readonly places: ReadonlyMap<number, CityPlace>;
    readonly econ?: ServerEconomy | undefined;
    readonly lodgingsOf?: ((cityId: number) => readonly number[]) | undefined;
    readonly nowMs: number;
  }): number;
}

export function createNpcAiBridge(o: {
  readonly worldSeed: number;
  readonly rules: () => SocietyCoefficients;
  readonly factions: ReadonlyMap<number, Pick<SimFaction, "id" | "traits" | "wars">>;
  readonly cities: ReadonlyMap<number, Pick<SimCity, "id" | "owner" | "housing" | "researchLevel">>;
  readonly units: ReadonlyMap<
    number,
    Pick<SimUnit, "id" | "owner" | "city"> & {
      readonly guard?: boolean | undefined;
      readonly fedPm?: number | undefined;
      satisfactionMilli: number;
      paidToday?: number | undefined;
      laborRank?: number | undefined;
      onStrike?: boolean | undefined;
    }
  >;
  readonly maps: ReadonlyMap<
    number,
    Pick<SecondMap, "forEachBuilding" | "unitInfo" | "setHome" | "setTraits" | "stream">
  >;
  readonly mapKeyOfCity: (cityId: number) => number | undefined;
  /** 도시 이름(모니터 표). 없으면 번호만 보인다 */
  readonly cityNameOf?: ((cityId: number) => string | undefined) | undefined;
  /**
   * 가문 고리(가문 일 지시·가문 금고): NPC 도시 가문 표, 지금 날(불복 굴림은 하루에 한 번), 원장, 세력 화폐(임금 화폐 — 경제가 없으면 undefined).
   * 없으면 모두 가문 없는 휴먼으로 보고 가문 금고는 돌지 않는다
   */
  readonly ties?:
    | {
        readonly cityHouses: Pick<NpcCityHouses, "of" | "housesOfCity" | "membersOf" | "headOf">;
        readonly society: { currentDay(): number };
        readonly ledger: Pick<Ledger, "systemAccount" | "ownerAccount" | "balance" | "post"> &
          Partial<Pick<Ledger, "accounts">>;
        readonly currencyOf: (cityId: number) => string | undefined;
      }
    | undefined;
}): NpcAiBridge {
  const traits = createUnitTraitRegistry(o.worldSeed);
  const houseAi = createNpcHouseAi({ worldSeed: o.worldSeed, rules: o.rules });
  const humanPlaces = createHumanPlaces();

  const factionBaseTraits = (ownerId: number): UnitTraits | undefined => {
    const f = o.factions.get(ownerId);
    return f ? upgradeLegacyTraits(f.traits) : undefined;
  };

  const traitsOf = (unitId: number): UnitTraits | undefined => {
    const u = o.units.get(unitId);
    if (!u) return traits.peek(unitId);
    const role: TraitRole = u.guard === true ? "guard" : "citizen";
    const mapKey = o.mapKeyOfCity(u.city);
    const map = mapKey === undefined ? undefined : o.maps.get(mapKey);
    return traits.getOrCreate({
      unitId,
      role,
      anchor: factionBaseTraits(u.owner),
      ai: o.rules().npcAi,
      persist: map?.setTraits ? (arr) => map.setTraits?.(unitId, arr) : undefined,
    });
  };

  const labor = createLaborOrders({
    worldSeed: o.worldSeed,
    rules: o.rules,
    units: o.units,
    cities: o.cities,
    traitsOf: (unitId) => traitsOf(unitId),
    houseOf: (unitId) => o.ties?.cityHouses.of(unitId)?.id,
    day: () => o.ties?.society.currentDay() ?? 0,
  });
  const ties = o.ties;
  const care = ties
    ? createHouseCare({
        ledger: ties.ledger,
        rules: o.rules,
        units: o.units,
        cities: o.cities,
        currencyOf: ties.currencyOf,
        dailyWage: () => {
          const c = o.rules();
          return npcDailyWage({
            wageMode: c.business.npcWageMode,
            wagePm: c.business.npcWagePm,
            baseDailyWage: npcBaseDailyWage(c),
            foodEfficiency: c.foodEfficiency,
          });
        },
        housesOfCity: (cityId) => ties.cityHouses.housesOfCity(cityId),
        membersOf: (houseId) => ties.cityHouses.membersOf(houseId),
        headOf: (houseId) => ties.cityHouses.headOf(houseId),
        traitsOf: (unitId) => traitsOf(unitId),
        flagsOf: (cityId, houseId) => labor.planOf(cityId)?.houses.get(houseId)?.flags ?? [],
      })
    : undefined;
  const laborOf = (unitId: number) => o.units.get(unitId);
  // 모니터가 보는 마지막 기록(이 서버가 켜진 뒤 — 저장하지 않는다)
  let lastHouseDay: AiMonitorView["lastHouseDay"] = null;
  let lastLaborChange: AiMonitorView["lastLaborChange"] = null;
  let laborChanges = 0;

  // 욕구·만족도(1차 값): 거울 세계 휴먼의 그날 식사 몫·만족도를 그대로 읽는다
  const needsOf = (unitId: number) => {
    const u = o.units.get(unitId);
    return u ? { fedPm: u.fedPm, satisfactionMilli: u.satisfactionMilli } : undefined;
  };

  const atWarOf = (cityId: number): boolean => {
    const city = o.cities.get(cityId);
    if (!city) return false;
    const faction = o.factions.get(city.owner);
    return faction !== undefined && faction.wars.size > 0;
  };

  return {
    traits,
    houseAi,
    labor,
    houseDay(nowMs) {
      // 가문세·돌봄 배당. 가문 연맹은 가문끼리 맺는 조약이라 금고·투자가 없다(D-587 2461·2464 — factionIdentity/houseLeague.ts)
      const day = care?.day(nowMs) ?? { taxed: 0, cared: 0 };
      lastHouseDay = { atMs: nowMs, taxed: day.taxed, cared: day.cared };
      return day;
    },
    laborTick(nowMs, econ) {
      const changed = labor.tick(nowMs);
      for (const cityId of changed) econ?.refreshCity(cityId, nowMs);
      if (changed.length > 0) {
        lastLaborChange = { atMs: nowMs, cities: changed.length };
        laborChanges += changed.length;
      }
      return changed.length;
    },
    monitor(nowMs, cityId) {
      const ai = o.rules().npcAi;
      return buildAiMonitor({
        nowMs,
        day: ties?.society.currentDay() ?? 0,
        switches: {
          npcAi: o.rules().switches.npcAiEnabled,
          unitAi: ai.unitAiEnabled,
          houseAi: ai.houseAiEnabled,
        },
        units: o.units.values(),
        cities: o.cities,
        planOf: (id) => labor.planOf(id),
        cityName: (id) => o.cityNameOf?.(id),
        lastHouseDay,
        lastLaborChange,
        laborChanges,
        unfedBelowPm: ai.houseUnfedBelowPm,
        cityId,
        housesOf: (id, plan) => {
          if (!ties) return [];
          const currency = ties.currencyOf(id);
          // 금고 잔고는 읽기만 한다(계정을 만들지 않게 있는 계정만 훑는다)
          const vaults = new Map<string, bigint>();
          for (const account of ties.ledger.accounts?.() ?? [])
            if (account.systemCode?.startsWith(HOUSE_VAULT_PREFIX))
              vaults.set(account.systemCode, account.balance);
          return ties.cityHouses
            .housesOfCity(id)
            .toSorted((a, b) => a - b)
            .map((houseId) => {
              const head = ties.cityHouses.headOf(houseId);
              const seen = plan?.houses.get(houseId);
              return {
                id: houseId,
                // 가문 이름은 가문원 줄에서 읽는다(지배 가문장 = 국가 지도자 유닛은 가문원 줄이 없다)
                name:
                  [head, ...ties.cityHouses.membersOf(houseId).slice(0, 1)]
                    .flatMap((unitId) => (unitId === undefined ? [] : [ties.cityHouses.of(unitId)?.name]))
                    .find((name) => name !== undefined) ?? null,
                head: head ?? null,
                status: seen?.status ?? houseStatusOf([]),
                flags: seen?.flags ?? [],
                vault: String(currency ? (vaults.get(npcHouseVaultCode(houseId, currency)) ?? 0n) : 0n),
              };
            });
        },
      });
    },

    humanPlacesOptions() {
      return {
        traitsOf,
        needsOf,
        atWarOf,
        ai: o.rules().npcAi,
      };
    },

    factionBaseTraits,

    pruneDeadUnits() {
      if (traits.size <= o.units.size + 64) return;
      for (const unitId of traits.keys()) {
        if (!o.units.has(unitId)) traits.delete(unitId);
      }
    },

    syncHumanPlaces(input) {
      const rules = o.rules();
      const seedRules = rules.worldSeed;
      const econ = input.econ;
      const changed = humanPlaces.sync({
        units: o.units,
        places: input.places,
        maps: o.maps,
        workHours: { startPm: seedRules.workStartPm, endPm: seedRules.workEndPm },
        facilitiesOf: econ ? (cityId) => econ.workFacilities(cityId) : undefined,
        lodgingsOf: input.lodgingsOf,
        restOf: econ ? (cityId) => econ.restPlan(cityId) : undefined,
        restCycle: restCycleOf(rules),
        carry: econ ? { board: econ.carry, nowMs: input.nowMs } : undefined,
        traitsOf,
        needsOf,
        laborOf,
        atWarOf,
        ai: rules.npcAi,
      });
      if (traits.size > o.units.size + 64) {
        for (const unitId of traits.keys()) {
          if (!o.units.has(unitId)) traits.delete(unitId);
        }
      }
      return changed;
    },
  };
}

/** 런타임이 가문 고리를 한 줄로 묶어 넘긴다(runtime.ts 줄 수 상한) */
export function bridgeTies(
  cityHouses: Pick<NpcCityHouses, "of" | "housesOfCity" | "membersOf" | "headOf">,
  society: { currentDay(): number },
  ledger: Pick<Ledger, "systemAccount" | "ownerAccount" | "balance" | "post" | "accounts">,
  econ: { readonly cityMoney: { of(cityId: number): string | undefined } } | undefined,
): NonNullable<Parameters<typeof createNpcAiBridge>[0]["ties"]> {
  return {
    cityHouses,
    society,
    ledger,
    currencyOf: (cityId) => econ?.cityMoney.of(cityId),
  };
}
