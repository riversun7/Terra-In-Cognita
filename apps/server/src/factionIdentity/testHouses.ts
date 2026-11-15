// 시험 도우미: 사용자에게 가문을 준다(기획 D-565 — 유닛을 고용하려면 가문이 있어야 한다). 고용을 하는 DB 시험이 쓴다. 세력 행(kind = player)과
// 가문장 줄만 넣고(정체성·소속 도시 없음), 세계 저장 층의 가문 표(world/houseTies.ts)를 다시 읽는다. 시험 파일만 가져온다.
import { houseTiesOf } from "../world/houseTies.ts";

interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** userId를 새 가문의 가문장으로 둔다. persistence가 있으면 가문 표를 다시 읽는다. 가문 세력 행 ID */
export async function giveTestHouse(pool: Queryable, userId: string, persistence?: object): Promise<number> {
  const { rows } = await pool.query("insert into factions (kind) values ('player') returning id");
  const factionId = Number(rows[0]?.id);
  await pool.query(
    "insert into house_members (user_id, faction_id, role, joined_at_ms) values ($1, $2, 'leader', 0)",
    [userId, factionId],
  );
  await houseTiesOf(persistence)?.reload();
  return factionId;
}
