// NPC 수도 고르기·옮기기 — 기획 D-528(사용자 원문 "수도는 발전도가 높은곳이나 적정한 곳을 npc가 설정하고 상황에 따라 바꿀 수있음"),
// docs/adr/2026-11-07-world-layout.md "바뀜 (D-528)".
// - 수도 = 그 세력 도시 가운데 발전도가 가장 높은 도시. 같으면 시작 도시(D-341 — 주인이 바뀌지 않는 도시) 먼저, 그다음 작은 ID [임시, 질문 863].
// - 하루 끝(NPC 사회 런타임 endOfDay)에 다시 보고, 다른 도시가 지금 수도보다 발전도 설정 칸(npc_capital_switch_dev) 이상 높으면 옮긴다
//   (작은 차이로 매일 오가지 않게 — 문턱). 수도가 주인을 잃었거나(점령·폐허) 띄운 2차맵에 없으면 문턱 없이 바로 다시 고른다.
// - 저장: 세력 행 capital_city_id(쓰기 대기열 factionCapital). 읽는 곳: 지도자 자리(leaders.ts — 수도 행정 건물 곁), 정부 판의 "수도"(government/reads.ts).
// - "시작"(D-341 시작 도시 보호)은 이 수도와 다른 개념이다: 시작 도시 표시(world_cities.start)는 그대로 둔다(D-528 "시작 = 시작 세력" 해석은 질문 864).
import type { SimCity, SimFaction } from "@terra/sim";
import type { WorldWriter } from "../world/persist/writer.ts";

/** 수도 후보 도시 하나 */
export interface CapitalCandidate {
  readonly id: number;
  readonly development: number;
  readonly start: boolean;
}

/** 발전도 높은 → 시작 도시 → 작은 ID 차례로 앞선 것 */
function better(a: CapitalCandidate, b: CapitalCandidate): boolean {
  if (a.development !== b.development) return a.development > b.development;
  if (a.start !== b.start) return a.start;
  return a.id < b.id;
}

/**
 * 수도 고르기(순수 함수): 도시가 없으면 undefined. 지금 수도가 없거나 후보에 없으면 가장 앞선 도시. 있으면 가장 앞선 도시의 발전도가
 * 지금 수도보다 switchDev 이상(그리고 0보다 많이) 높을 때만 그 도시, 아니면 지금 수도 그대로
 */
export function pickCapital(
  cities: readonly CapitalCandidate[],
  current: number | null | undefined,
  switchDev: number,
): number | undefined {
  let best: CapitalCandidate | undefined;
  for (const city of cities) if (!best || better(city, best)) best = city;
  if (!best) return undefined;
  const now =
    current === null || current === undefined ? undefined : cities.find((city) => city.id === current);
  if (!now) return best.id;
  const lead = best.development - now.development;
  return best.id !== now.id && lead > 0 && lead >= Math.max(0, switchDev) ? best.id : now.id;
}

/** 수도가 바뀐 것 하나(지도자 옮기기·기록) */
export interface CapitalChange {
  /** 세력 ID(= 소유 주체 ID) */
  readonly owner: number;
  readonly from: number | undefined;
  readonly to: number;
}

export interface NpcCapitals {
  /** 그 세력(소유 주체 ID)의 지금 수도. 저장된 수도가 그 세력 도시가 아니면 문턱 없이 다시 고른 값(저장은 하루 끝에) */
  capitalOf(owner: number): number | undefined;
  /** 하루 끝: 살아 있는 세력마다 다시 고르고 바뀐 것을 저장한다. 바뀐 목록을 돌려준다 */
  review(switchDev: number): CapitalChange[];
}

/** 거울 세계에서 읽는 몫(세력·도시) */
export interface CapitalWorld {
  readonly cities: ReadonlyMap<number, Pick<SimCity, "id" | "owner" | "development" | "start">>;
  readonly factions: ReadonlyMap<number, Pick<SimFaction, "id" | "alive">>;
}

export interface NpcCapitalsOptions {
  readonly world: CapitalWorld;
  /** 세력 ID(소유 주체) → 저장된 수도(세력 행 capital_city_id) */
  readonly stored: ReadonlyMap<number, number | null>;
  /** 세력 ID → 세력 행 ID(없으면 저장하지 않는다) */
  readonly rowOf: (owner: number) => number | undefined;
  readonly writer: Pick<WorldWriter, "upsert">;
}

export function createNpcCapitals(o: NpcCapitalsOptions): NpcCapitals {
  const chosen = new Map<number, number | null>(o.stored);
  const candidates = (owner: number): CapitalCandidate[] => {
    const out: CapitalCandidate[] = [];
    for (const city of o.world.cities.values())
      if (city.owner === owner) out.push({ id: city.id, development: city.development, start: city.start });
    return out;
  };
  return {
    capitalOf(owner) {
      const list = candidates(owner);
      const stored = chosen.get(owner);
      if (stored !== null && stored !== undefined && list.some((city) => city.id === stored)) return stored;
      return pickCapital(list, undefined, 0);
    },
    review(switchDev) {
      const changes: CapitalChange[] = [];
      for (const faction of [...o.world.factions.values()].toSorted((a, b) => a.id - b.id)) {
        if (!faction.alive) continue;
        const before = chosen.get(faction.id) ?? undefined;
        const next = pickCapital(candidates(faction.id), before, switchDev);
        if (next === undefined || next === before) continue;
        chosen.set(faction.id, next);
        const row = o.rowOf(faction.id);
        if (row !== undefined) o.writer.upsert("factionCapital", { id: row, capital_city_id: next });
        changes.push({ owner: faction.id, from: before, to: next });
      }
      return changes;
    },
  };
}
