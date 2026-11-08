// NPC 도시의 시장·처음 인구 — 기획 답 744 나(NPC 도시는 그 도시 휴먼 가운데 하나를 시장으로 자동 지정, 직위 규칙이 생기면 유저 — 다)·
// 749 다(도시 처음 인구 = 세계 규칙: 주거 × 비율, 봇 수와 무관하게 세계 씨앗이 세운다), docs/adr/2026-11-07-play-flow.md "WP-NPC2".
// - 시장 [임시 규칙]: 그 도시 휴먼 가운데 INT + WIS가 가장 큰 휴먼(구인 카드 스탯, 처음부터 있던 휴먼은 기본값 모두 10 — 화면 기본 스탯과
//   같다) → 스탯 합 → 작은 유닛 ID. 한 번 고르면 그 휴먼이 죽거나 다른 도시·노숙으로 떠날 때만 다시 고른다(더 나은 휴먼이 와도 그대로).
//   world_cities.mayor_unit_id에 저장한다(다시 켜도 같은 시장).
// - 처음 인구: 시작 도시(start)마다 한 번, 그 도시 휴먼이 floor(주거 × npc_seed_population_pm ÷ 1000)보다 적으면 모자란 만큼 휴먼을 세운다
//   (런타임 runtime.ts — 구인과 같은 길로 도시 둘레에 선다). 채운 시각을 world_cities.population_seeded_at_ms에 적어 다시 채우지 않는다
//   (D-469 출생 없음 — 그 뒤 인구는 구인 카드로만). 옛 세계(이미 휴먼이 있는 도시)는 모자란 것만 더하고 지우지 않는다.
import type { SimCity, SimUnit } from "@terra/sim";
import type { WorldWriter } from "../world/persist/writer.ts";

/** [임시] 저장된 스탯이 없는 휴먼의 1차 스탯(화면 기본값과 같다, roster/body.ts BASELINE_PRIMARY) */
export const BASELINE_HUMAN_STAT = 10;
/** 구인 카드 스탯 차례(STR·DEX·AGI·VIT·INT·WIS)에서 INT·WIS 자리 */
const INT_INDEX = 4;
const WIS_INDEX = 5;

/** 시장 후보(거울 세계 휴먼 몫) */
export type MayorCandidate = Pick<SimUnit, "id" | "recruit">;

/** 휴먼 하나의 시장 점수: [INT + WIS, 스탯 합] */
function mayorScore(unit: MayorCandidate): [number, number] {
  const stats = unit.recruit?.stats;
  if (!stats || stats.length < 6) return [BASELINE_HUMAN_STAT * 2, BASELINE_HUMAN_STAT * 6];
  const total = stats.reduce((sum, value) => sum + value, 0);
  return [(stats[INT_INDEX] ?? 0) + (stats[WIS_INDEX] ?? 0), total];
}

/** 시장 고르기(순수 함수): INT + WIS → 스탯 합 → 작은 유닛 ID. 휴먼이 없으면 undefined */
export function pickMayor(humans: Iterable<MayorCandidate>): number | undefined {
  let best: { id: number; score: [number, number] } | undefined;
  for (const unit of humans) {
    const score = mayorScore(unit);
    if (
      !best ||
      score[0] > best.score[0] ||
      (score[0] === best.score[0] &&
        (score[1] > best.score[1] || (score[1] === best.score[1] && unit.id < best.id)))
    )
      best = { id: unit.id, score };
  }
  return best?.id;
}

/** 처음 인구 목표: floor(주거 × 비율 ÷ 1000), 0 이상 정수 */
export function seedPopulationOf(housing: number, populationPm: number): number {
  return Math.max(0, Math.floor((Math.max(0, housing) * Math.max(0, populationPm)) / 1000));
}

/** 켤 때 읽은 도시 줄의 두 칸 */
export interface CityPeopleRow {
  readonly id: number;
  readonly mayorUnitId: number | null;
  readonly populationSeededAtMs: number | null;
}

export interface CityPeople {
  /** 시작 도시이고 처음 인구를 아직 채우지 않았나 */
  needsSeed(cityId: number): boolean;
  /** 처음 인구를 채웠다(다음 저장에 시각을 쓴다) */
  markSeeded(cityId: number, atMs: number): void;
  /** 그 도시 시장 유닛(없으면 undefined) */
  mayorOf(cityId: number): number | undefined;
  /** 시장이 없거나 떠난 도시만 다시 고른다. 바뀐 도시 수 */
  sync(): number;
  /** 바뀐 도시 줄 칸만 쓰기 대기열에 넣는다(도시 줄 다음 차례, 쓰기 표 cityPeople). 쓴 줄 수 */
  flush(): number;
}

export function createCityPeople(o: {
  readonly world: {
    readonly cities: ReadonlyMap<number, Pick<SimCity, "start">>;
    readonly units: ReadonlyMap<number, Pick<SimUnit, "id" | "city" | "recruit">>;
  };
  readonly writer: Pick<WorldWriter, "upsert">;
  readonly rows: readonly CityPeopleRow[];
}): CityPeople {
  const mayors = new Map<number, number>();
  const seededAt = new Map<number, number>();
  const saved = new Map<number, string>();
  const sigOf = (cityId: number): string =>
    JSON.stringify([mayors.get(cityId) ?? null, seededAt.get(cityId) ?? null]);
  for (const row of o.rows) {
    if (row.mayorUnitId !== null) mayors.set(row.id, row.mayorUnitId);
    if (row.populationSeededAtMs !== null) seededAt.set(row.id, row.populationSeededAtMs);
    saved.set(row.id, sigOf(row.id));
  }
  const livesIn = (unitId: number | undefined, cityId: number): boolean =>
    unitId !== undefined && o.world.units.get(unitId)?.city === cityId;

  return {
    needsSeed: (cityId) => o.world.cities.get(cityId)?.start === true && !seededAt.has(cityId),
    markSeeded(cityId, atMs) {
      seededAt.set(cityId, atMs);
    },
    mayorOf: (cityId) => (livesIn(mayors.get(cityId), cityId) ? mayors.get(cityId) : undefined),
    sync() {
      const byCity = new Map<number, MayorCandidate[]>();
      for (const unit of o.world.units.values()) {
        const list = byCity.get(unit.city);
        if (list) list.push(unit);
        else byCity.set(unit.city, [unit]);
      }
      let changed = 0;
      for (const cityId of o.world.cities.keys()) {
        if (livesIn(mayors.get(cityId), cityId)) continue;
        const pick = pickMayor(byCity.get(cityId) ?? []);
        if (pick === mayors.get(cityId)) continue;
        if (pick === undefined) mayors.delete(cityId);
        else mayors.set(cityId, pick);
        changed += 1;
      }
      // 사라진 도시(폐허)는 잊는다 — 도시 줄은 NPC 저장이 지운다
      for (const cityId of [...mayors.keys(), ...seededAt.keys()])
        if (!o.world.cities.has(cityId)) {
          mayors.delete(cityId);
          seededAt.delete(cityId);
          saved.delete(cityId);
        }
      return changed;
    },
    flush() {
      let rows = 0;
      for (const cityId of [...o.world.cities.keys()].toSorted((a, b) => a - b)) {
        const sig = sigOf(cityId);
        if (saved.get(cityId) === sig) continue;
        o.writer.upsert("cityPeople", {
          id: cityId,
          mayor_unit_id: mayors.get(cityId) ?? null,
          population_seeded_at_ms: seededAt.get(cityId) ?? null,
        });
        saved.set(cityId, sig);
        rows += 1;
      }
      return rows;
    },
  };
}
