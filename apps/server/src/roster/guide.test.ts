// 유닛 추천 표(팩) 시험 — 팩 core의 1차 생산 여섯 가지가 사용자 표(2026-11-11, 옛 gather_type_config = 기획 43 §4)와 같고 스탯마다 주 하나·
// 보조 하나인지, 전투 클래스 표가 옛 35종(2스탯 15 + 3스탯 20, 기획 D-529) + 범용인지, 옛 문서·코드 예시가 그대로 나오는지.
// 팩 파일을 읽어야 해서 서버 시험이다(함수 시험은 packages/shared/src/unitGuide.test.ts).
import {
  combatClassEntrySchema,
  facilityEntrySchema,
  itemEntrySchema,
  readCategoryFile,
} from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import { PRIMARY_STATS } from "@terra/shared/roster";
import {
  type GuideStats,
  OLD_COMBAT_CLASS_RULE,
  classKey,
  recommendCombatClass,
  recommendProduction,
  statCoverage,
} from "@terra/shared/unitGuide";
import type { FishTierRanges } from "@terra/shared/fishWater";
import { TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { gatherKindsFromEntries } from "../gather/kinds.ts";
import { fishRangesOfKinds } from "../gather/npcTiers.ts";
import { unitGuideOf } from "./guide.ts";

function packGuide(fishTiers?: FishTierRanges) {
  const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
  if (!loaded.source) throw new Error("content pack");
  return unitGuideOf(
    {
      facilities: readCategoryFile(loaded.source, "facilities").entries.map((raw) =>
        facilityEntrySchema.parse(raw),
      ),
      combatClasses: readCategoryFile(loaded.source, "combat_classes").entries.map((raw) =>
        combatClassEntrySchema.parse(raw),
      ),
      fishTiers,
    },
    0,
  );
}

const stats = (str: number, vit: number, int: number, wis: number, dex: number, agi: number): GuideStats => ({
  str,
  vit,
  int,
  wis,
  dex,
  agi,
});

describe("유닛 추천 표(팩 core)", () => {
  const guide = packGuide();
  const nameOf = (value: GuideStats) =>
    recommendCombatClass(value, guide.classes, guide.classRule).entry?.name.ko;

  it("1차 생산 여섯 가지의 스탯 짝이 사용자 표와 같다: 스탯마다 주 하나·보조 하나", () => {
    expect(
      guide.production.map((type) => [type.facility, type.primary, type.secondary, type.mode, type.group]),
    ).toEqual([
      ["farm", "vit", "int", "select", "building"],
      ["lumber_camp", "dex", "str", "roll", "field"],
      ["mine", "str", "vit", "roll", "field"],
      ["herb_field", "int", "wis", "select", "building"],
      ["ranch", "wis", "agi", "select", "building"],
      ["fishing_spot", "agi", "dex", "roll", "building"],
    ]);
    const coverage = statCoverage(guide.production);
    expect(coverage.balanced).toBe(true);
    expect(coverage.rows.map((row) => [row.stat, row.primaryOf[0], row.secondaryOf[0]])).toEqual([
      ["str", "mine", "lumber_camp"],
      ["vit", "farm", "mine"],
      ["int", "herb_field", "farm"],
      ["wis", "ranch", "herb_field"],
      ["dex", "lumber_camp", "fishing_spot"],
      ["agi", "fishing_spot", "ranch"],
    ]);
  });

  it("전투 클래스 표 = 옛 35종 + 범용: 두 스탯 조합 15·세 스탯 조합 20이 하나도 빠지지 않는다", () => {
    const keys = new Set(guide.classes.map((entry) => classKey(entry.stats)));
    expect(guide.classes).toHaveLength(36);
    expect(keys.size).toBe(36);
    let pairs = 0;
    let triples = 0;
    for (let a = 0; a < 6; a++)
      for (let b = a + 1; b < 6; b++) {
        const pair = [PRIMARY_STATS[a], PRIMARY_STATS[b]].flatMap((stat) => (stat ? [stat] : []));
        expect(keys.has(classKey(pair)), classKey(pair)).toBe(true);
        pairs += 1;
        for (let c = b + 1; c < 6; c++) {
          const triple = [...pair, PRIMARY_STATS[c]].flatMap((stat) => (stat ? [stat] : []));
          expect(keys.has(classKey(triple)), classKey(triple)).toBe(true);
          triples += 1;
        }
      }
    expect([pairs, triples]).toEqual([15, 20]);
    expect(keys.has("")).toBe(true);
    // 2스탯 조합에는 묶음·역할이 있다(옛 §6.2 분류·주요 역할 칸)
    for (const entry of guide.classes.filter((row) => row.stats.length === 2)) {
      expect(entry.group, entry.id).toBeDefined();
      expect(entry.role, entry.id).toBeDefined();
    }
    // 문턱 출발값 = 옛 0.60·0.80, 계수표와 같다
    expect(guide.classRule).toEqual(OLD_COMBAT_CLASS_RULE);
    expect(TEST_SOCIETY_COEFFICIENTS.combatClass).toEqual(OLD_COMBAT_CLASS_RULE);
  });

  it("옛 조합 표(문서 §6.2·옛 코드 class_detector.js)의 이름이 그대로 나온다", () => {
    // 옛 문서 예시 1: STR 40·AGI 35·DEX 15 → 2스탯 STR + AGI = 돌격병
    expect(nameOf(stats(40, 0, 0, 0, 15, 35))).toBe("돌격병");
    // 2스탯 조합(문서 표)
    expect(nameOf(stats(50, 40, 5, 5, 5, 5))).toBe("워리어");
    expect(nameOf(stats(5, 5, 50, 40, 5, 5))).toBe("아크메이지");
    expect(nameOf(stats(5, 5, 5, 5, 50, 40))).toBe("듀얼리스트");
    expect(nameOf(stats(5, 40, 50, 5, 5, 5))).toBe("혈법사");
    // 3스탯 조합(옛 코드 표): STR + DEX + AGI = 검성, WIS + DEX + AGI = 추적자, STR + VIT + WIS = 성전사
    expect(nameOf(stats(30, 0, 0, 0, 25, 28))).toBe("검성");
    expect(nameOf(stats(0, 0, 0, 30, 25, 28))).toBe("추적자");
    expect(nameOf(stats(30, 28, 0, 25, 0, 0))).toBe("성전사");
    // 고르게 높으면 범용, 모두 0이면 없음
    expect(nameOf(stats(20, 20, 19, 18, 17, 16))).toBe("범용");
    expect(nameOf(stats(0, 0, 0, 0, 0, 0))).toBeUndefined();
  });

  it("1차 생산 추천: STR·VIT가 높으면 광산 먼저, AGI·DEX가 높으면 낚시터 먼저", () => {
    expect(
      recommendProduction(stats(40, 30, 5, 5, 10, 5), guide.production).map((p) => p.type.facility),
    ).toEqual(["mine", "lumber_camp"]);
    expect(
      recommendProduction(stats(5, 5, 5, 20, 30, 40), guide.production).map((p) => p.type.facility),
    ).toEqual(["fishing_spot", "ranch"]);
  });

  it("낚시터 줄에만 물 종류마다 티어 범위(D-562 1562 — 팩 오브젝트 물터·어군에서 끌어냄, 없으면 싣지 않는다)", () => {
    const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
    if (!loaded.source) throw new Error("content pack");
    const tiers = new Map(
      readCategoryFile(loaded.source, "items").entries.map((raw) => {
        const item = itemEntrySchema.parse(raw);
        return [item.id, item.tier];
      }),
    );
    const kinds = gatherKindsFromEntries(readCategoryFile(loaded.source, "gather_objects").entries);
    const withTiers = packGuide(fishRangesOfKinds(kinds, (id) => tiers.get(id)));
    const fishing = withTiers.production.find((row) => row.facility === "fishing_spot");
    // 민물 = 민물 물터·호수 어군 T2, 연안 = 바다 물터·연안 어군 T4, 대륙붕 T6·심해 T8(어군), 아래 끝은 막지 않는다(물터가 섞인다)
    expect(fishing?.waterTiers).toEqual([
      { water: "fresh", min: 0, max: 2 },
      { water: "coast", min: 0, max: 4 },
      { water: "shelf", min: 0, max: 6 },
      { water: "deep", min: 0, max: 8 },
    ]);
    expect(withTiers.production.filter((row) => row.waterTiers).map((row) => row.facility)).toEqual([
      "fishing_spot",
    ]);
    expect(guide.production.some((row) => row.waterTiers !== undefined)).toBe(false);
  });

  it("출처가 없으면 빈 표와 옛 문턱", () => {
    expect(unitGuideOf(undefined, 5)).toEqual({
      production: [],
      classes: [],
      classRule: OLD_COMBAT_CLASS_RULE,
      generatedAt: 5,
    });
  });
});
