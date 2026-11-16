// 봉신 가문 독립 선언(WebSocket house_independence, 프로토콜 53) — 기획 D-575 "소속된 국가로 귀속을 하여도, 그 도시의 지분은 최초설립자가
// 가지며 독립을 선언할수도 있음"과 보충(사용자 답 "가"): 알박기로 세운 도시는 독재 나라에 귀속해도 최초 설립자가 지분을 갖고 독립을 선언할 수
// 있다(D-302 "독재 = 반란으로만"의 예외 — D-302는 그 나라가 원래 가진 도시와 알박기가 아닌 길로 얻은 도시에만). D-216 봉신 독립 선언 = 위
// 세력과의 관계를 끊는 사건(@terra/sim society.breakVassal).
// - 누가: 봉신 가문(거울 세계에 든 가문, 위 세력 있음)의 가문장. 체제를 함께 고른다(D-340 "독립 도시국가로 세우면 체제도 그때 정한다").
// - 언제 열리나(independenceOpen): 바뀜(기획 D-577 — 질문 2244 답 "독립은 가문 단위. 가문 자체가 독립하고, 독립한 가문 세력이 가문이 가진 도시를
//   모두 데리고 그대로 국가가 된다"): 가문 도시 가운데 알박기로 선 도시(표 claim_cities)가 하나라도 있으면 열린다. 위 나라의 체제와 상관없다(독재도 —
//   D-575 예외를 가문 전체로). 알박기 도시가 하나도 없는 가문은 막는다(independence_blocked — D-302 독재는 반란으로만, 다른 체제는 46 §3.2 독립
//   규칙 몫이고 플레이어 길은 아직 없다). 예전(질문 2244 기술 기본값): 가문 도시가 모두 알박기 도시일 때만.
// - 선언하면 가문 전체(모든 가문 도시 — 알박기가 아닌 도시도)가 위 세력에서 떨어져 독립 나라 + 고른 체제가 된다(D-577). 지분은 그대로(설립자 =
//   가문이 이미 갖고 있다, D-575). 공물은 위 세력이 없어지므로 멈춘다(시뮬 societyPayouts).
import type { QueryPool } from "../world/persist/load.ts";

/** 가문 도시 가운데 알박기로 선 도시 ID */
export async function claimCityIds(pool: QueryPool, cityIds: readonly number[]): Promise<Set<number>> {
  if (cityIds.length === 0) return new Set();
  const { rows } = await pool.query("select city_id from claim_cities where city_id = any($1::bigint[])", [
    [...cityIds],
  ]);
  return new Set(rows.map((row) => Number(row.city_id)));
}

/**
 * 독립 선언이 열리나(D-575·보충 "가", D-577 가문 단위): 가문 도시 가운데 알박기로 선 도시가 하나라도 있다. 바꾸려면 이 함수만 — 세력 화면 줄
 * (houseCity view)과 명령(house_independence)이 같이 쓴다
 */
export function independenceOpen(cityIds: readonly number[], claimed: ReadonlySet<number>): boolean {
  return cityIds.some((id) => claimed.has(id));
}
