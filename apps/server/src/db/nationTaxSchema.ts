// 나라 세금 표(줄기 tax-2 — 기획 D-128 "세율은 정부가 정한다"·D-579 주민세 주기·세율은 나라가 정함, 질문 2322 나·2373 가) — schema.ts가 다시 내보낸다
// (그 파일 줄 수 때문에 따로 둔다). 세계 표라 시험 세계 새로 시작(reset-world)에서 지운다(남길 표 목록에 넣지 않는다).
// docs/adr/2026-11-15-business-ledger.md "바뀜 (tax-2 …)".
import { sql } from "drizzle-orm";
import { bigint, check, integer, pgTable, uuid } from "drizzle-orm/pg-core";
import { factions } from "./schema.ts";

/**
 * 나라(세력 행)마다 한 줄 — 그 나라 지도자가 정한 세금(apps/server/src/government/nationTax.ts). 칸마다 null = 정하지 않음: 소득세는 그 나라 거래세율, 주민세
 * 칸은 NPC 나라면 성향 규칙식(D-323), 아니면 설정 칸(nation_resident_tax_*)을 따른다. 줄이 없으면 모두 정하지 않음.
 * - income_tax_bp: 소득세(만분율) — 사업장 수입 소득세와 임금 원천징수(D-578)가 같은 율로 쓴다
 * - resident_tax_pm·resident_every_days·resident_nation_pm: 주민세(재산 ‰, 주기 날, 국세 몫 ‰ — D-579)
 */
export const nationTaxes = pgTable(
  "nation_taxes",
  {
    factionId: bigint("faction_id", { mode: "number" })
      .primaryKey()
      .references(() => factions.id, { onDelete: "cascade" }),
    incomeTaxBp: integer("income_tax_bp"),
    residentTaxPm: integer("resident_tax_pm"),
    residentEveryDays: integer("resident_every_days"),
    residentNationPm: integer("resident_nation_pm"),
    /** 거래세(만분율 — 줄기 governance-5, 질문 2460: 지도자가 정함 D-128). null = 정하지 않음(NPC 나라는 거래세 규칙식, 지도자 나라는 지금 값 그대로) */
    tradeTaxBp: integer("trade_tax_bp"),
    /** 마지막으로 정한 시각·사람(감사 기록과 같은 값) */
    setAtMs: bigint("set_at_ms", { mode: "number" }).notNull(),
    setBy: uuid("set_by"),
  },
  (table) => [
    check("nation_taxes_income_tax_bp", sql`${table.incomeTaxBp} between 0 and 10000`),
    check("nation_taxes_resident_tax_pm", sql`${table.residentTaxPm} between 0 and 1000`),
    check("nation_taxes_resident_every_days", sql`${table.residentEveryDays} between 1 and 365`),
    check("nation_taxes_resident_nation_pm", sql`${table.residentNationPm} between 0 and 1000`),
    check("nation_taxes_trade_tax_bp", sql`${table.tradeTaxBp} between 0 and 10000`),
  ],
);
