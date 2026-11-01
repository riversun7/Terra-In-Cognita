// 팩의 임시 전투 자료가 시뮬의 TEST_COMBAT_CATALOG와 같은지(둘을 함께 고치게) — 팩 파일을 읽어야 해서 서버 시험에 둔다
import { loadContentPack } from "@terra/content/node";
import {
  TEST_COMBAT_CATALOG,
  TEST_COMBAT_COEFFICIENTS,
  TEST_SOCIETY_COEFFICIENTS,
  combatCoefficientsFrom,
  societyCoefficientsFrom,
} from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { COMBAT_FORMULA_IDS, DEFAULT_COMBAT_FORMULAS } from "@terra/shared/formula";
import { combatCatalogOf, formulaEntriesOf, tuningOf } from "./combatCatalog.ts";

describe("전투 자료: 팩 = TEST_COMBAT_CATALOG", () => {
  it("스탯 표·효과 사전·스킬·장비·유닛 종류가 같다", () => {
    const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
    if (!loaded.source) throw new Error("content pack");
    const catalog = combatCatalogOf(loaded.source);
    expect(catalog.statTable).toEqual(TEST_COMBAT_CATALOG.statTable);
    expect(catalog.effects).toEqual(TEST_COMBAT_CATALOG.effects);
    expect(catalog.skills).toEqual(TEST_COMBAT_CATALOG.skills);
    expect(catalog.equipment).toEqual(TEST_COMBAT_CATALOG.equipment);
    expect(catalog.unitKinds).toEqual(TEST_COMBAT_CATALOG.unitKinds);
  });

  it("설정 칸 값(tuning)으로 만든 계수표가 TEST 계수표와 같다", () => {
    const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
    if (!loaded.source) throw new Error("content pack");
    const tuning = tuningOf(loaded.source);
    expect(tuning.size).toBeGreaterThan(0);
    expect(combatCoefficientsFrom(tuning)).toEqual(TEST_COMBAT_COEFFICIENTS);
    expect(societyCoefficientsFrom(tuning)).toEqual(TEST_SOCIETY_COEFFICIENTS);
  });

  it("전투 계산식(formulas)이 판정 코드의 기본 식과 같다(docs/adr/2026-11-01-formula-editor.md)", () => {
    const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
    if (!loaded.source) throw new Error("content pack");
    const entries = formulaEntriesOf(loaded.source);
    expect(entries.map((entry) => entry.id)).toEqual([...COMBAT_FORMULA_IDS]);
    expect(Object.fromEntries(entries.map((entry) => [entry.id, entry.expression]))).toEqual(
      DEFAULT_COMBAT_FORMULAS,
    );
  });
});
