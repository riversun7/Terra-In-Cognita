// 정원사의 세력 층(세력 오염·관계도·명성) — docs/adr/2026-11-01-gardener-r5b.md "바뀜 (2026-11-07, 정원사 2)"
// gardenerRun.ts(시뮬·서버 공용 접착)가 하루 끝에 부른다. 기획 D-509(세력 오염 = 목표 순위·세기), D-510·49 N52(관계도), D-499(명성).
// - 세력 오염: 그 세력 도시들의 영향권 칸(겹치면 한 번) 오염 합. 노숙만 남은 떠도는 세력은 0.
// - 관계도: 세력마다 하나(없으면 시작값). 하루 끝에 세력 오염·평화로 바뀐다(gardener/relations.ts). 사라진 세력은 지운다.
import type { GardenerCoefficients } from "../gardener/coefficients.ts";
import { type PollutionGrid, type PollutionLayer, unionInfluenceSum } from "../gardener/pollution.ts";
import { type RelationStage, clampRelation, nextRelation, relationStage } from "../gardener/relations.ts";
import type { SimFaction, SimWorld } from "./world.ts";

/** 살아 있는 세력마다 세력 오염(세력 ID 차례) */
export function factionPollutionOf(
  world: SimWorld,
  layer: PollutionLayer,
  grid: PollutionGrid,
  cellOf: (cityId: number) => number | undefined,
  radius: number,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const faction of [...world.factions.values()].toSorted((a, b) => a.id - b.id)) {
    if (!faction.alive) continue;
    const cells: number[] = [];
    for (const cityId of [...faction.cities].toSorted((a, b) => a - b)) {
      const cell = cellOf(cityId);
      if (cell !== undefined) cells.push(cell);
    }
    out.set(faction.id, unionInfluenceSum(layer, cells, grid, radius));
  }
  return out;
}

/** 그 세력의 지금 관계도(기록이 없으면 시작값, 범위·상한 안) */
export function relationOf(
  relations: ReadonlyMap<number, number>,
  faction: SimFaction,
  c: GardenerCoefficients,
): number {
  return clampRelation(relations.get(faction.id) ?? c.relationStart, faction.fixed, c);
}

/** 하루 끝 관계도 바뀜(세력 ID 차례). 사라진 세력의 기록은 지운다 */
export function updateRelations(
  world: SimWorld,
  relations: Map<number, number>,
  pollution: ReadonlyMap<number, number>,
  c: GardenerCoefficients,
): void {
  for (const id of [...relations.keys()]) if (world.factions.get(id)?.alive !== true) relations.delete(id);
  for (const faction of [...world.factions.values()].toSorted((a, b) => a.id - b.id)) {
    if (!faction.alive) continue;
    relations.set(
      faction.id,
      nextRelation(
        relationOf(relations, faction, c),
        pollution.get(faction.id) ?? 0,
        faction.wars.size === 0,
        faction.fixed,
        c,
      ),
    );
  }
}

/** 살아 있는 세력의 관계도 단계별 수와 최저·최고(요약·하루 줄) */
export function relationCounts(
  world: SimWorld,
  relations: ReadonlyMap<number, number>,
  c: GardenerCoefficients,
): Record<RelationStage, number> & { min: number; max: number } {
  const counts: Record<RelationStage, number> = { allied: 0, friendly: 0, neutral: 0, wary: 0, hostile: 0 };
  let min = 0;
  let max = 0;
  let first = true;
  for (const faction of world.factions.values()) {
    if (!faction.alive) continue;
    const value = relationOf(relations, faction, c);
    counts[relationStage(value, c)] += 1;
    min = first ? value : Math.min(min, value);
    max = first ? value : Math.max(max, value);
    first = false;
  }
  return { ...counts, min, max };
}

/** 그 세력의 가장 오래된(가장 작은 ID) 도시 가운데 칸이 있는 것. 없으면 undefined */
export function oldestCityOf(
  faction: SimFaction,
  cellOf: (cityId: number) => number | undefined,
): number | undefined {
  return [...faction.cities].toSorted((a, b) => a - b).find((cityId) => cellOf(cityId) !== undefined);
}
