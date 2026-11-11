// 국가 프리셋 팩 검사 시험(약어·화폐 약어·화폐 코드 겹침, 도시 직무 레시피의 시설, 국가마다 씨앗 값·마크 사양 스키마) —
// docs/adr/2026-11-10-nation-editor.md 1·2·4절. 값은 형식 확인용이다(실제 팩 자료는 apps/server/src/npc/presets.test.ts가 본다).
import { describe, expect, it } from "vitest";
import { ITEM_FIELDS, fixture } from "../testFixtures.ts";
import { validatePack } from "./pack.ts";

const name = { ko: "이름", en: "Name" };
const items = { entries: [{ id: "grain", name, ...ITEM_FIELDS }] };
const facilities = {
  entries: [
    { id: "farm", name, stage: "gather", slotsPerLevel: 10 },
    { id: "mine", name, stage: "gather", slotsPerLevel: 10 },
  ],
};
const recipes = {
  entries: [
    {
      id: "farm_grain",
      name,
      facility: "farm",
      inputs: [],
      outputs: [{ item: "grain", qty: 1 }],
      work: 1000,
      enabled: true,
    },
  ],
};

type Nation = Record<string, unknown>;
const nation = (n: number, extra: Nation = {}): Nation => ({
  id: `nation_${n}`,
  name,
  shortName: `N${n}A`,
  color: "#c0392b",
  currency: { code: `cur_${n}`, name, symbol: "¤", ticker: `AA${String.fromCharCode(64 + n)}` },
  tradeTaxBp: 200,
  enabled: true,
  ...extra,
});

function check(nations: Nation[]) {
  return validatePack(
    fixture({
      "items.json": items,
      "facilities.json": facilities,
      "recipes.json": recipes,
      "nation_presets.json": { entries: nations },
    }),
  ).issues.filter((issue) => issue.level === "error");
}
const codes = (nations: Nation[]) => check(nations).map((issue) => `${issue.id}:${issue.code}`);

describe("checkNations", () => {
  it("겹치지 않으면 통과한다", () => {
    expect(check([nation(1), nation(2)])).toEqual([]);
  });

  it("약어가 겹치면(대소문자 무시) 오류", () => {
    expect(codes([nation(1), nation(2, { shortName: "n1a" })])).toEqual(["nation_2:nation_short_taken"]);
  });

  it("화폐 약어가 겹치면 오류", () => {
    const second = nation(2, { currency: { code: "cur_2", name, ticker: "AAA" } });
    expect(codes([nation(1), second])).toEqual(["nation_2:nation_ticker_taken"]);
  });

  it("화폐 코드가 겹치면 오류", () => {
    const second = nation(2, { currency: { code: "cur_1", name, ticker: "AAB" } });
    expect(codes([nation(1), second])).toEqual(["nation_2:nation_currency_code_taken"]);
  });

  it("국력 등급을 적었는데 등급 표에 그 줄이 없으면 오류, 있으면 통과", () => {
    expect(codes([nation(1, { powerTier: "great_power" })])).toEqual(["nation_1:nation_tier_missing"]);
    const tier = {
      id: "great_power",
      name,
      startCities: 4,
      startHousing: 50,
      startPopulationPm: 750,
      facilities: [{ facility: "farm", count: 2 }],
      guardsPerCity: 4,
      startTech: 3,
      startCreditPm: 2000,
      cityStepCells: 2,
      homeGapPm: 1300,
    };
    const withTiers = (tiers: unknown[]) =>
      validatePack(
        fixture({
          "items.json": items,
          "facilities.json": facilities,
          "recipes.json": recipes,
          "nation_presets.json": { entries: [nation(1, { powerTier: "great_power" })] },
          "nation_tiers.json": { entries: tiers },
        }),
      ).issues.filter((issue) => issue.level === "error");
    expect(withTiers([tier])).toEqual([]);
    // 등급 ID는 정해진 다섯뿐이고, 시설은 팩에 있어야 하고, 한 등급에 같은 시설을 두 번 적지 않는다
    expect(withTiers([{ ...tier, id: "empire" }]).length).toBeGreaterThan(0);
    expect(withTiers([{ ...tier, facilities: [{ facility: "nope", count: 1 }] }]).length).toBeGreaterThan(0);
    expect(
      withTiers([
        {
          ...tier,
          facilities: [
            { facility: "farm", count: 1 },
            { facility: "farm", count: 2 },
          ],
        },
      ]).length,
    ).toBeGreaterThan(0);
  });

  it("꺼진 프리셋은 겹쳐도 보지 않는다", () => {
    expect(codes([nation(1), nation(2, { shortName: "N1A", enabled: false })])).toEqual([]);
  });

  it("도시 직무의 레시피가 다른 시설의 것이면 오류", () => {
    const bad = nation(1, { personality: { cityJobs: [{ facility: "mine", recipe: "farm_grain" }] } });
    expect(codes([bad])).toEqual(["nation_1:nation_job_facility"]);
    const good = nation(1, { personality: { cityJobs: [{ facility: "farm", recipe: "farm_grain" }] } });
    expect(codes([good])).toEqual([]);
  });

  it("국가마다 씨앗 값은 설정 칸 범위 안이어야 한다", () => {
    const fine = nation(1, {
      personality: {
        startHousing: 60,
        startPopulationPm: 500,
        startFarms: 2,
        startLumberCamps: 0,
        startMines: 0,
        startStorehouses: 4,
      },
    });
    expect(check([fine])).toEqual([]);
    expect(check([nation(1, { personality: { startFarms: 5 } })])).not.toEqual([]);
    expect(check([nation(1, { personality: { startHousing: 3 } })])).not.toEqual([]);
    expect(check([nation(1, { personality: { startPopulationPm: 1001 } })])).not.toEqual([]);
  });

  it("마크 사양·이름 말씨는 목록 안의 값만 받는다", () => {
    const emblem = { shape: "shield", division: "chevron", charge: "sword", scheme: 2 };
    expect(check([nation(1, { emblem, nameStyle: "birch" })])).toEqual([]);
    expect(check([nation(1, { emblem: { ...emblem, shape: "flag" } })])).not.toEqual([]);
    expect(check([nation(1, { emblem: { ...emblem, scheme: 3 } })])).not.toEqual([]);
    expect(check([nation(1, { nameStyle: "klingon" })])).not.toEqual([]);
  });
});
