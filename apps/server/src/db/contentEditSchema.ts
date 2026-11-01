// 팩 항목 덮어쓰기 표(스킬 편집기·행동별 소모, docs/adr/2026-11-01-skill-editor.md 3절; 아이템 편집기, docs/adr/2026-11-01-item-editor.md
// 4절) — schema.ts가 다시 내보낸다(drizzle-kit 표 정의 진입점은 schema.ts). users는 schema.ts에서 오고, 참조는 함수 안에서만 읽어
// 순환 가져오기가 문제되지 않는다.
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./schema.ts";

/**
 * 팩 항목 덮어쓰기 — 스킬 편집기·행동별 소모 화면(/dev/skills, docs/adr/2026-11-01-skill-editor.md 3절). 실효 항목 = 팩 항목 위에
 * 그 세계의 덮어쓰기(항목 통째). 팩에 없는 ID는 편집기에서 만든 항목이다. 바로 든다(D-461)
 */
export const contentOverrides = pgTable(
  "content_overrides",
  {
    /** 팩 분류(CONTENT_OVERRIDE_CATEGORIES. 지금 코드가 쓰는 것은 @terra/shared CONTENT_EDIT_CATEGORIES, effects는 WP-6) */
    category: text("category").notNull(),
    id: text("id").notNull(),
    /** 항목 JSON(팩 파일 한 줄과 같은 모양, 저장 때 팩 스키마로 검사함) */
    entry: jsonb("entry").$type<Record<string, unknown>>().notNull(),
    /**
     * 저장할 때의 팩 항목 해시(정규 JSON SHA-256). 팩에 없던 항목(편집기에서 만듦)이면 null. 켤 때 지금 팩 항목 해시와 다르면
     * 그 뒤에 배포가 항목을 바꾼 것이라 팩이 이긴다(가장 나중에 바꾼 것이 이긴다, D-461)
     */
    packHash: text("pack_hash"),
    contentVersion: text("content_version").notNull(),
    note: text("note"),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.category, table.id] }),
    // 아이템 편집기 마이그레이션 하나에서 effects·아이템 분류 자료까지 넓혔다(뒤 WP에서 다시 넓히지 않는다). 직전 판 앱은 모르는 분류의
    // 줄을 읽을 때 거른다(잠든 줄 unknown_category)
    check(
      "content_overrides_category",
      sql`${table.category} in ('skills', 'items', 'unit_kinds', 'effects', 'item_subcategories', 'item_tags', 'weapon_types')`,
    ),
    check("content_overrides_id_format", sql`${table.id} ~ '^[a-z][a-z0-9_]{1,47}$'`),
    check("content_overrides_note_length", sql`${table.note} is null or char_length(${table.note}) <= 200`),
  ],
);

/** 팩 항목 덮어쓰기 판 — 줄 하나(id = 1). 바꾸는 트랜잭션마다 조건부로 올린다(두 사람이 같은 판을 보고 보내면 늦은 쪽이 충돌) */
export const contentOverrideRevision = pgTable(
  "content_override_revision",
  {
    id: smallint("id").primaryKey(),
    revision: bigint("revision", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("content_override_revision_single", sql`${table.id} = 1`),
    check("content_override_revision_nonnegative", sql`${table.revision} >= 0`),
  ],
);

/**
 * 은퇴 ID — 그 세계에서 만든 뒤 지운 항목 ID(docs/adr/2026-11-01-item-editor.md 4절, 설계안 2.9). 한 번 쓴 ID는 다시 쓰지 않는다
 * (PROTECTED): 덮어쓰기 줄을 지우면 흔적이 없어 같은 ID를 다른 뜻으로 다시 만들 수 있었다. 덮어쓰기 묶음 트랜잭션 안에서 넣고
 * 지우지 않는다(내보내기 retiredIds로 팩 쪽에 알린다)
 */
export const contentRetiredIds = pgTable(
  "content_retired_ids",
  {
    category: text("category").notNull(),
    id: text("id").notNull(),
    /** 지울 때의 팩 판(core@N) */
    contentVersion: text("content_version").notNull(),
    retiredBy: uuid("retired_by").references(() => users.id, { onDelete: "set null" }),
    retiredAt: timestamp("retired_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.category, table.id] }),
    check(
      "content_retired_ids_category",
      sql`${table.category} in ('skills', 'items', 'unit_kinds', 'effects', 'item_subcategories', 'item_tags', 'weapon_types')`,
    ),
    check("content_retired_ids_id_format", sql`${table.id} ~ '^[a-z][a-z0-9_]{1,47}$'`),
  ],
);
