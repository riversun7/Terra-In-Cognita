// 세력 화면 점령 칸의 실제 자료 — 공성 결과 표 war_outcomes(docs/adr/2026-11-07-war-outcomes.md, 기획 D-520)에서 내 세력이 이기거나 당한 결과.
// 읽기만 한다. 서버 NPC 공격은 아직 실시간 공성 없이 결과를 고르고, 편입 제안은 런타임 메모리에만 있어(저장 전) ④는 넘김(skipped)으로 보인다
// [임시]. ⑤ 복원 모금은 전쟁이 폐허를 만들지 않아(486 가) 늘 넘김이다.
import type { FactionKind, OccupationRow, OccupationStep, StepState } from "@terra/shared/faction";
import type { Queryable } from "./source.ts";

/** 한 번에 보이는 결과 수(최근 차례) */
export const OCCUPATION_ROWS_MAX = 20;

const asNumber = (value: unknown): number => (typeof value === "string" ? Number(value) : Number(value ?? 0));
const asNumberOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : asNumber(value);
const asKind = (value: unknown): FactionKind => (value === "player" ? "player" : "npc");

const ONLY_FIRST: Readonly<Record<OccupationStep, StepState>> = {
  loot_or_integrate: "done",
  regime: "skipped",
  shares: "skipped",
  incorporation: "skipped",
  restoration: "skipped",
};
const ANNEXED: Readonly<Record<OccupationStep, StepState>> = {
  loot_or_integrate: "done",
  regime: "done",
  shares: "done",
  incorporation: "skipped",
  restoration: "skipped",
};

/** 내 세력(세력 행 ID)이 이기거나 당한 공성 결과(최근 차례, 최대 OCCUPATION_ROWS_MAX) */
export async function readOccupationRows(db: Queryable, factionId: number): Promise<OccupationRow[]> {
  const result = await db.query(
    `select w.id, w.city_id, w.attacker_faction_id, w.target_faction_id, w.outcome, w.share_choice, w.at_ms, w.until_ms,
            w.ended_at_ms, w.taken::text as taken, w.taken_asset,
            coalesce(c.name, r.name) as city_name, o.id as other_id, o.kind as other_kind, o.code as other_code
       from war_outcomes w
       left join world_cities c on c.id = w.city_id
       left join world_ruins r on r.id = w.city_id
       join factions o on o.id = case when w.attacker_faction_id = $1 then w.target_faction_id else w.attacker_faction_id end
      where w.attacker_faction_id = $1 or w.target_faction_id = $1
      order by w.at_ms desc, w.id desc
      limit $2`,
    [factionId, OCCUPATION_ROWS_MAX],
  );
  return result.rows.flatMap((row): OccupationRow[] => {
    const outcome = row.outcome;
    if (outcome !== "loot" && outcome !== "integrate" && outcome !== "occupy") return [];
    const atMs = asNumber(row.at_ms);
    const otherId = asNumber(row.other_id);
    const shareChoice =
      row.share_choice === "keep" || row.share_choice === "delist" ? row.share_choice : null;
    return [
      {
        id: `war_${asNumber(row.id)}`,
        side: asNumber(row.attacker_faction_id) === factionId ? "as_occupier" : "as_target",
        cityName: typeof row.city_name === "string" ? row.city_name : `#${asNumber(row.city_id)}`,
        other: {
          id: `faction_${otherId}`,
          name: typeof row.other_code === "string" ? row.other_code : `#${otherId}`,
          tag: null,
          kind: asKind(row.other_kind),
        },
        occurredAt: atMs,
        steps: outcome === "integrate" ? ANNEXED : ONLY_FIRST,
        lootChoice: outcome,
        shareChoice: outcome === "integrate" ? shareChoice : null,
        offers: { deadlineAt: atMs, accepted: 0, refused: 0, pending: 0, mine: null, myBuildings: 0 },
        restoration: null,
        outcome: {
          taken: typeof row.taken === "string" ? row.taken : "0",
          currency: typeof row.taken_asset === "string" ? row.taken_asset : null,
          untilAt: asNumberOrNull(row.until_ms),
          endedAt: asNumberOrNull(row.ended_at_ms),
        },
      },
    ];
  });
}
