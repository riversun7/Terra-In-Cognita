// 개발자 도구 DB 표(전투 실험실 프리셋·계산식 덮어쓰기·전투 보고서 기록) — schema.ts가 다시 내보낸다(drizzle-kit은 schema.ts 하나를 읽는다).
// schema.ts가 1,000줄 상한에 닿아 나눴다.
// 바꾼 뒤 `pnpm --filter @terra/server db:generate`로 마이그레이션을 만든다(schema.ts와 같은 규칙).
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./schema.ts";

/**
 * 전투 실험실 프리셋 — 개발자 밸런스·전투 실험실(/dev/balance, docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)"
 * 3절). 팀이 함께 쓰는 유닛·파티 프리셋. 값(data)은 @terra/shared LabUnit·LabParty 모양이고 읽을 때마다 같은 스키마로 다시 검사한다
 * (맞지 않는 줄은 목록에서 빼고 센다). 줄 판(version)을 조건으로 바꿔 두 사람이 같은 줄을 고치면 늦은 쪽이 충돌.
 * 샘플은 코드(battleLab/samples.ts)라 이 표에 없다. 바꾸기·감사 기록(battle_lab_preset.*)은 한 트랜잭션
 */
export const battleLabPresets = pgTable(
  "battle_lab_presets",
  {
    /** `lab_` + 16진 12자 */
    id: text("id").primaryKey(),
    kind: text("kind").$type<"unit" | "party">().notNull(),
    nameKo: text("name_ko").notNull(),
    nameEn: text("name_en").notNull(),
    data: jsonb("data").notNull(),
    version: integer("version").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("battle_lab_presets_id_format", sql`${table.id} ~ '^lab_[0-9a-f]{12}$'`),
    check("battle_lab_presets_kind", sql`${table.kind} in ('unit', 'party')`),
    check(
      "battle_lab_presets_name_length",
      sql`char_length(${table.nameKo}) between 1 and 40 and char_length(${table.nameEn}) between 1 and 40`,
    ),
    check("battle_lab_presets_version_positive", sql`${table.version} >= 1`),
  ],
);

/** 계산식 덮어쓰기(ADR 2026-11-01-formula-editor): 설정 칸과 같은 판·감사 기록, 글 값. id = 전투 식 ID 또는 `<행 ID>.formula` */
export const formulaOverrides = pgTable(
  "formula_overrides",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    packSource: text("pack_source").notNull(),
    contentVersion: text("content_version").notNull(),
    note: text("note"),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("formula_overrides_id_format", sql`${table.id} ~ '^[a-z][a-z0-9_]{1,47}(\\.formula)?$'`),
    check("formula_overrides_source_length", sql`char_length(${table.source}) between 1 and 2000`),
    check("formula_overrides_pack_source_length", sql`char_length(${table.packSource}) <= 4000`),
    check("formula_overrides_note_length", sql`${table.note} is null or char_length(${table.note}) <= 200`),
  ],
);

/**
 * 전투 보고서 기록 — 밸런스 화면 [전투 보고서]·[보고서 기록](docs/adr/2026-11-14-battle-report.md). 한 번 돌린 보고서의 설정 전부(input: @terra/shared
 * ReportStartInput — 파티·공성·A/B·판 수·시드)와 결과(report: BattleReportBody), 돌린 때의 팩 판·해시·SIM_VERSION·세계 설정 판.
 * 추가만 하고 고치지 않는다(같은 설정을 다시 돌리면 새 줄). 목록에 쓰는 칸(이름·종류·점수)은 따로 둔다. 세계 새로 시작에도 남긴다
 * (cli/resetWorld.ts WORLD_RESET_KEEP). 줄 수 상한(battleReport/store.ts REPORT_STORED_MAX)을 넘으면 오래된 줄부터 지운다
 */
export const battleReports = pgTable(
  "battle_reports",
  {
    /** `rep_` + 16진 12자 */
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    note: text("note").notNull().default(""),
    mode: text("mode").$type<"arena" | "siege" | "wave">().notNull(),
    runs: integer("runs").notNull(),
    seed: integer("seed").notNull(),
    variant: boolean("variant").notNull(),
    scorePm: integer("score_pm").notNull(),
    scoreBPm: integer("score_b_pm"),
    contentVersion: text("content_version").notNull(),
    contentHash: text("content_hash").notNull(),
    simVersion: integer("sim_version").notNull(),
    tuningRevision: integer("tuning_revision").notNull(),
    durationMs: integer("duration_ms").notNull(),
    input: jsonb("input").notNull(),
    report: jsonb("report").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("battle_reports_id_format", sql`${table.id} ~ '^rep_[0-9a-f]{12}$'`),
    check("battle_reports_mode", sql`${table.mode} in ('arena', 'siege', 'wave')`),
    check("battle_reports_name_length", sql`char_length(${table.name}) between 1 and 60`),
    check("battle_reports_note_length", sql`char_length(${table.note}) <= 400`),
    check("battle_reports_runs_positive", sql`${table.runs} >= 1`),
    index("battle_reports_created_idx").on(table.createdAt),
  ],
);

/** 세계 설정 칸 덮어쓰기(docs/adr/2026-11-01-dev-settings-panel.md) */
export const tuningOverrides = pgTable(
  "tuning_overrides",
  {
    /** 칸 ID(팩 tuning 항목 ID) 또는 가중치 표 칸 키 `<stat_rows 행 ID>.<칸>`(밸런스 화면, docs/adr/2026-11-01-balance-screen.md 1절) */
    id: text("id").primaryKey(),
    value: bigint("value", { mode: "number" }).notNull(),
    /** 저장할 때의 팩 값·팩 판(core@N). 지금 팩 값과 다르면 화면이 "팩 값이 바뀜"을 보인다 */
    packValue: bigint("pack_value", { mode: "number" }).notNull(),
    /** 저장할 때의 단위(@terra/shared TUNING_UNITS, 모르면 null). 새 팩에서 단위가 바뀌면 켤 때 지운다 */
    unit: text("unit"),
    contentVersion: text("content_version").notNull(),
    /** 메모(0~200 코드 포인트, @terra/shared TUNING_NOTE_MAX) */
    note: text("note"),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "tuning_overrides_id_format",
      sql`${table.id} ~ '^[a-z][a-z0-9_]{1,47}(\\.(str|dex|agi|vit|int|wis|base|cap|half))?$'`,
    ),
    check("tuning_overrides_note_length", sql`${table.note} is null or char_length(${table.note}) <= 200`),
  ],
);

/**
 * 세계 설정 판 — 줄 하나(id = 1). 덮어쓰기를 바꾸는 트랜잭션마다 revision = revision + 1 where revision = 기대 판(두 관리자가 동시에
 * 바꾸면 늦은 쪽이 충돌, docs/adr/2026-11-01-dev-settings-panel.md 4·8절). 줄은 서버가 켤 때 없으면 만든다
 */
export const tuningRevision = pgTable(
  "tuning_revision",
  {
    id: smallint("id").primaryKey(),
    revision: bigint("revision", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("tuning_revision_single", sql`${table.id} = 1`),
    check("tuning_revision_nonnegative", sql`${table.revision} >= 0`),
  ],
);
