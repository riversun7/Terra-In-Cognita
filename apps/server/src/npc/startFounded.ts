// 고정 NPC 국가가 행성마다 세운 시작 도시 수(표 nation_start_cities) — 질문 2612 답(기획 D-585 8·2572 나 "쿠데타로 떨어져 나간 도시는 시작 도시가
// 아니다"), docs/adr/2026-11-21-governance.md "바뀜 (fixes-1117e)".
// 세계 씨앗(nations.ts ensureTestNations)과 등급 반영 미리 보기(world/tierPlan.ts)가 "모자란 시작 도시"를 지금 시작 도시 수가 아니라 이 수로 센다.
// - 세운 수 = max(적어 둔 수, 지금 그 국가 것인 시작 도시 수). 줄이 없으면(이 표 전의 세계) 지금 시작 도시 수다.
// - 쿠데타로 떨어져 나간 도시는 시작 도시 표시를 잃고 새 나라 것이 되어 지금 수에서 빠지지만 세운 수는 그대로라 다시 켜도 채우지 않는다.
// - 다른 길로는 고정 국가가 시작 도시를 잃지 않는다(D-341 — 공성 점령·반란·독립 투표·웨이브 폐허가 시작 도시를 건너뛴다, 시뮬 society.ts).
//   그래서 이 수는 "처음 세울 때 자리가 없어 못 세운 도시"만 다음에 다시 채우게 한다(세운 수는 실제로 넣은 도시만 늘어난다).
import type { QueryPool } from "../world/persist/load.ts";

/** 행성 하나에서 세력 행 ID → 적어 둔 세운 시작 도시 수 */
export async function loadStartFounded(pool: QueryPool, planetId: string): Promise<Map<number, number>> {
  const found = await pool.query(`select faction_id, founded from nation_start_cities where planet_id = $1`, [
    planetId,
  ]);
  return new Map(found.rows.map((row) => [Number(row.faction_id), Number(row.founded)]));
}

/** 세운 수 = max(적어 둔 수, 지금 시작 도시 수) */
export function startFoundedOf(
  recorded: ReadonlyMap<number, number>,
  factionId: number,
  have: number,
): number {
  return Math.max(recorded.get(factionId) ?? 0, have);
}

/** 세운 수를 적는다(줄마다 더 큰 값만 남긴다 — 줄지 않는다) */
export async function saveStartFounded(
  pool: QueryPool,
  planetId: string,
  counts: readonly { readonly factionId: number; readonly founded: number }[],
): Promise<void> {
  for (const { factionId, founded } of counts)
    await pool.query(
      `insert into nation_start_cities (faction_id, planet_id, founded) values ($1, $2, $3)
       on conflict (faction_id, planet_id) do update set founded = greatest(nation_start_cities.founded, excluded.founded)`,
      [factionId, planetId, Math.max(0, Math.trunc(founded))],
    );
}
