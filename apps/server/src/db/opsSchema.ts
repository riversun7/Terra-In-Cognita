// 운영 권한 체크박스 표(docs/adr/2026-11-08-operator-console.md) — schema.ts가 다시 내보낸다(그 파일 줄 수 때문에 따로 둔다).
// 계정마다 역할 기본(@terra/shared OPS_ROLE_DEFAULTS) 위에 더 준 운영 권한. 빼기는 없다(역할 기본은 늘 가진다).
// 세계 밖 표(계정 설정)라 시험 세계 새로 시작(reset-world)에서 남긴다(src/cli/resetWorld.ts 남길 표 목록).
import { sql } from "drizzle-orm";
import { bigint, boolean, check, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./schema.ts";

export const opsGrants = pgTable(
  "ops_grants",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 운영 권한 ID 목록(@terra/shared OPS_PERMISSIONS). 모르는 ID는 읽을 때 버린다(더 새 판이 쓴 값) */
    permissions: text("permissions").array().notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
    /** 마지막으로 바꾼 운영자(감사 기록에도 남는다). 계정이 지워져도 남게 외래 키를 두지 않는다 */
    updatedBy: uuid("updated_by"),
  },
  (table) => [check("ops_grants_size", sql`cardinality(${table.permissions}) <= 64`)],
);

/**
 * 운영 스위치(docs/adr/2026-11-08-operator-roles-log-switch.md): 줄이 없으면 꺼짐. id = @terra/shared OPS_SWITCHES(모르는 ID는 서버가 무시한다).
 * 세계 밖 표라 시험 세계 새로 시작에서 남긴다
 */
export const opsSwitches = pgTable(
  "ops_switches",
  {
    id: text("id").primaryKey(),
    enabled: boolean("enabled").notNull(),
    updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
    updatedBy: uuid("updated_by"),
  },
  (table) => [check("ops_switches_id_format", sql`${table.id} ~ '^[a-z][a-z0-9_]{1,47}$'`)],
);
