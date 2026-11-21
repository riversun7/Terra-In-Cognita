// NPC 자율행동 런타임 브리지(aiBridge.ts) — docs/adr/2026-11-20-npc-autonomous-ai.md 3단계
// runtime.ts(1,000줄 상한)를 부풀리지 않고 개별 유닛 7축 성향 레지스트리 · 2차맵 8상태 FSM 연결 ·
// NPC 가문 자율 AI · 지배 가문 7축 금고 환류를 한곳에서 묶는다.
import { type TraitRole, type UnitTraits, upgradeLegacyTraits } from "@terra/shared/unitTraits";
import type { SimCity, SimFaction, SimUnit, SocietyCoefficients } from "@terra/sim";
import type { SecondMap } from "../world/secondMap.ts";
import { restCycleOf } from "./cityRest.ts";
import type { ServerEconomy } from "./economy.ts";
import { type HumanPlacesInput, createHumanPlaces } from "./humanPlaces.ts";
import { type NpcHouseAiService, createNpcHouseAi } from "./npcHouseAi.ts";
import type { CityPlace } from "./persist.ts";
import { type UnitTraitStore, createUnitTraitRegistry } from "./unitTraitRegistry.ts";

export interface NpcAiBridge {
  readonly traits: UnitTraitStore;
  readonly houseAi: NpcHouseAiService;
  /** humanPlaces.sync에 덧붙이는 8상태 FSM · 경비대 순찰 반경 옵션 */
  humanPlacesOptions(): Pick<HumanPlacesInput, "traitsOf" | "atWarOf" | "ai">;
  /** 특정 세력(소유 주체 ID)의 7축 바탕 성향 */
  factionBaseTraits(ownerId: number): UnitTraits | undefined;
  /** 사망·제거된 유닛의 성향 캐시를 정리한다 */
  pruneDeadUnits(): void;
  /** 2차맵 휴먼 자리 + 8상태 FSM 동기화(runtime.ts에서 분리) */
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
  readonly cities: ReadonlyMap<number, Pick<SimCity, "id" | "owner">>;
  readonly units: ReadonlyMap<
    number,
    Pick<SimUnit, "id" | "owner" | "city"> & { readonly guard?: boolean | undefined }
  >;
  readonly maps: ReadonlyMap<
    number,
    Pick<SecondMap, "forEachBuilding" | "unitInfo" | "setHome" | "setTraits" | "stream">
  >;
  readonly mapKeyOfCity: (cityId: number) => number | undefined;
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

  const atWarOf = (cityId: number): boolean => {
    const city = o.cities.get(cityId);
    if (!city) return false;
    const faction = o.factions.get(city.owner);
    return faction !== undefined && faction.wars.size > 0;
  };

  return {
    traits,
    houseAi,

    humanPlacesOptions() {
      return {
        traitsOf,
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
