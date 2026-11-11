// 채집 칸 검사 시험 — 성공 확률(낚시터, 팩 facilities.gather.catch, docs/adr/2026-11-11-production-six.md): 스키마 범위와 상한 ≥ 기본.
import { describe, expect, it } from "vitest";
import { fixture } from "../testFixtures.ts";
import { validatePack } from "./pack.ts";

const name = { ko: "이름", en: "Name" };
const band = { id: "band_0", from: 0, weightsPm: [1000, 0, 0, 0, 0, 0, 0, 0, 0, 0] };

function check(catchRule: unknown) {
  return validatePack(
    fixture({
      "item_subcategories.json": { entries: [{ id: "fish", name, major: "raw", enabled: true }] },
      "gather_tiers.json": { entries: [band] },
      "facilities.json": {
        entries: [
          {
            id: "fishing_spot",
            name,
            stage: "gather",
            slotsPerLevel: 10,
            gather: {
              primary: "agi",
              secondary: "dex",
              subcategory: "fish",
              ...(catchRule === undefined ? {} : { catch: catchRule }),
            },
          },
        ],
      },
    }),
  ).issues;
}

const schema = (rule: unknown) => check(rule).filter((issue) => issue.stage === "schema").length;

describe("채집 성공 확률 칸(gather.catch)", () => {
  it("옛 낚시 값(300·800·500·200)과 칸이 없는 시설은 통과한다", () => {
    expect(check({ basePm: 300, maxPm: 800, statPm: 500, fullStat: 200 })).toEqual([]);
    expect(check(undefined)).toEqual([]);
  });

  it("상한이 기본보다 작으면 오류(gather_catch_range)", () => {
    const issues = check({ basePm: 600, maxPm: 500, statPm: 500, fullStat: 200 });
    expect(issues.map((issue) => [issue.level, issue.code, issue.path])).toEqual([
      ["error", "gather_catch_range", "gather.catch.maxPm"],
    ]);
  });

  it("‰는 0~1000, 가득 차는 스탯 합은 1 이상(스키마)", () => {
    expect(schema({ basePm: 1001, maxPm: 800, statPm: 500, fullStat: 200 })).toBe(1);
    expect(schema({ basePm: 300, maxPm: 800, statPm: -1, fullStat: 200 })).toBe(1);
    expect(schema({ basePm: 300, maxPm: 800, statPm: 500, fullStat: 0 })).toBe(1);
    expect(schema({ basePm: 300, maxPm: 800, statPm: 500 })).toBe(1);
  });
});
