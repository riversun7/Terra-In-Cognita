// 신용 점수 표의 쓰기 대기열 정의(world/persist/tables.ts가 펼쳐 넣는다 — 그 파일 줄 수 때문에 따로 둔다). 열 이름은 src/db/creditSchema.ts와 같다.
import type { TableSpec } from "../world/persist/tables.ts";

export const CREDIT_TABLES = {
  /** 신용 점수 깎은 몫(갚지 않은 빚마다 한 줄 — docs/adr/2026-11-21-credit.md). 빚 계정이 0이 되면 지운다 */
  creditMarks: {
    name: "credit_marks",
    columns: [
      "cause",
      "kind",
      "owner_id",
      "unit_id",
      "city_id",
      "nation_id",
      "city_points",
      "nation_points",
      "count",
      "since_ms",
      "updated_at_ms",
    ],
    key: ["cause"],
  },
  /**
   * 신용 소속(주인마다 지금 속한 나라 한 줄 — 줄기 governance-5, D-584): 소속 시작(소속 기간 오름)·쌓인 오른 몫(사업장 운영·쿠데타 보상)·마지막으로 사업장 몫을 더한 날.
   * 나라를 옮기면 새 줄로 바꾼다(처음부터 센다 [임시 — 질문 2494])
   */
  creditStandings: {
    name: "credit_standings",
    columns: ["owner_id", "nation_id", "since_ms", "rise", "rose_day", "updated_at_ms"],
    key: ["owner_id"],
  },
} as const satisfies Record<string, TableSpec>;
