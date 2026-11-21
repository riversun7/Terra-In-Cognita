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
} as const satisfies Record<string, TableSpec>;
