// 사는 곳 표 읽기·쓰기(표 unit_residences — db/residenceSchema.ts). 부팅 때 gather/world.ts가 한 번 읽는다(attach.ts). 쓰기는 고르는 명령마다 한 줄(서비스).
// 월드 쓰기 대기열을 쓰지 않는다: 유닛·건물 외래 키가 없고 다른 세계 표와 같은 묶음일 까닭이 없다(나라 세금 표와 같은 꼴 — government/nationTaxPolicy.ts).
import type { QueryPool } from "../world/persist/load.ts";
import type { ResidenceChoice } from "./book.ts";

export async function loadResidences(pool: QueryPool): Promise<ResidenceChoice[]> {
  const { rows } = await pool.query(
    "select unit_id, owner_id, building_id, chosen_at_ms from unit_residences order by unit_id",
  );
  return rows.map((row) => ({
    unitId: Number(row.unit_id),
    ownerId: Number(row.owner_id),
    buildingId: Number(row.building_id),
    chosenAtMs: Number(row.chosen_at_ms),
  }));
}

/** 한 유닛의 사는 곳을 적는다(있으면 바꾼다) */
export async function saveResidence(pool: QueryPool, choice: ResidenceChoice): Promise<void> {
  await pool.query(
    `insert into unit_residences (unit_id, owner_id, building_id, chosen_at_ms) values ($1, $2, $3, $4)
     on conflict (unit_id) do update set owner_id = excluded.owner_id, building_id = excluded.building_id,
       chosen_at_ms = excluded.chosen_at_ms`,
    [choice.unitId, choice.ownerId, choice.buildingId, choice.chosenAtMs],
  );
}

/** 한 유닛의 고른 사는 곳을 지운다 */
export async function deleteResidence(pool: QueryPool, unitId: number): Promise<void> {
  await pool.query("delete from unit_residences where unit_id = $1", [unitId]);
}
