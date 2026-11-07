// 유닛 생명 수치 저장 모양(표 unit_vitals) — 기획 D-512, docs/adr/2026-10-31-combat-core.md "바뀜 (D-512 …)".
// 메모리 표가 원본의 캐시다: 부팅 때 한 번 읽고(쓰기 대기열이 돌기 전), 바뀜은 쓰기 대기열로만 쓴다.
import type { VitalPools, VitalsSnapshot } from "@terra/shared/vitals";
import type { QueryPool } from "../world/persist/load.ts";
import type { Row } from "../world/persist/tables.ts";

/** 유닛 몸 자료(최대·분당 회복). 회복의 HP·아머 칸은 규칙이 아직 없어 0이다(질문 343·344) */
export interface VitalsBody {
  readonly max: VitalPools;
  readonly regen: VitalPools;
}

/** 저장한 줄 하나 */
export interface VitalsRecord {
  readonly unitId: number;
  readonly snapshot: VitalsSnapshot;
}

/** 쓰기 대기열 한 줄(unit_vitals) */
export function vitalsRow(unitId: number, snapshot: VitalsSnapshot): Row {
  return {
    unit_id: unitId,
    hp: snapshot.values.hp,
    armor: snapshot.values.armor,
    shield: snapshot.values.shield,
    max_hp: snapshot.max.hp,
    max_armor: snapshot.max.armor,
    max_shield: snapshot.max.shield,
    regen_hp: snapshot.regen.hp,
    regen_armor: snapshot.regen.armor,
    regen_shield: snapshot.regen.shield,
    updated_at_ms: snapshot.at,
  };
}

const num = (value: unknown): number => Number(value);

/** 부팅 때 한 번(쓰기 대기열이 돌기 전). int8은 pg가 문자열로 주므로 숫자로 바꾼다 */
export async function loadVitals(pool: QueryPool): Promise<VitalsRecord[]> {
  const found = await pool.query(
    `select unit_id, hp, armor, shield, max_hp, max_armor, max_shield, regen_hp, regen_armor, regen_shield,
            updated_at_ms from unit_vitals order by unit_id`,
  );
  return found.rows.map(
    (row): VitalsRecord => ({
      unitId: num(row.unit_id),
      snapshot: {
        values: { hp: num(row.hp), armor: num(row.armor), shield: num(row.shield) },
        max: { hp: num(row.max_hp), armor: num(row.max_armor), shield: num(row.max_shield) },
        regen: { hp: num(row.regen_hp), armor: num(row.regen_armor), shield: num(row.regen_shield) },
        at: num(row.updated_at_ms),
      },
    }),
  );
}
