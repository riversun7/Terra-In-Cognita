// 밸런스 프리셋(balance_presets) 분류 시험 — 이름(ko·en), 1차 범위, 무기 참조, 대결 상한(짝수 판 수·판 수 × 제한), dev_ 앞머리
import { describe, expect, it } from "vitest";
import { BASE_ITEMS, fixture, named } from "../testFixtures.ts";
import { validatePack } from "./pack.ts";

const preset = (extra: Record<string, unknown> = {}) => ({
  ...named("lv30_combat"),
  primaries: { str: 54, vit: 54, int: 31, wis: 31, dex: 31, agi: 31 },
  weapon: "iron_ore",
  count: 1,
  runs: 10,
  limitSec: 120,
  ...extra,
});

const problems = (entries: unknown[]) =>
  validatePack(
    fixture({ "items.json": { entries: BASE_ITEMS }, "balance_presets.json": { entries } }),
  ).issues.map((issue) => [issue.stage, issue.id, issue.path, issue.message]);

describe("balance_presets 분류", () => {
  it("올바른 프리셋이 통과한다(무기 없음 = 맨손)", () => {
    expect(problems([preset(), preset({ ...named("new_cyborg"), weapon: undefined })])).toEqual([]);
  });

  it("무기는 아이템 참조다(없는 ID는 2단계에서 실패)", () => {
    const issues = problems([preset({ weapon: "no_such_sword" })]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.[0]).toBe("references");
  });

  it("1차는 0~10,000 정수, 6칸 모두", () => {
    expect(
      problems([preset({ primaries: { str: -1, vit: 1, int: 1, wis: 1, dex: 1, agi: 1 } })]),
    ).toHaveLength(1);
    expect(problems([preset({ primaries: { str: 1, vit: 1, int: 1, wis: 1, dex: 1 } })])).toHaveLength(1);
    expect(
      problems([preset({ primaries: { str: 10_001, vit: 1, int: 1, wis: 1, dex: 1, agi: 1 } })]),
    ).toHaveLength(1);
  });

  it("판 수는 짝수, 판 수 × 제한 시간 ≤ 2,400초, 인원 1~3", () => {
    expect(problems([preset({ runs: 9 })])[0]?.[3]).toContain("짝수");
    expect(problems([preset({ runs: 40, limitSec: 120 })])[0]?.[3]).toContain("2400");
    expect(problems([preset({ count: 4 })])).toHaveLength(1);
  });

  it("ID는 dev_로 시작하지 않는다(화면에서 만든 프리셋 앞머리)", () => {
    expect(problems([preset({ ...named("dev_mine") })])[0]?.[3]).toContain("dev_");
  });
});
