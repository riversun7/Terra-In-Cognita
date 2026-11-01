// 전투 분류(효과 사전·스킬·유닛 종류·아이템 장비 칸) 시험 — 스키마 규칙과 참조
import { describe, expect, it } from "vitest";
import { ITEM_FIELDS, fixture } from "../testFixtures.ts";
import { validatePack } from "./pack.ts";

const name = { ko: "이름", en: "Name" };
const statRows = {
  entries: [{ id: "armor_hp", name, shape: "quantity", base: 0, weights: [0, 0, 0, 0, 0, 0], enabled: true }],
};
const effect = (extra: Record<string, unknown>) => ({
  id: "guard",
  name,
  kind: "buff",
  stat: "defense_rate",
  valueMode: "flat",
  durationMs: 0,
  tickMs: 0,
  stacking: "refresh",
  maxStacks: 1,
  enabled: true,
  ...extra,
});
const skill = (effectId: string) => ({
  id: "iron_skin",
  name,
  trigger: "passive",
  resource: "stamina",
  cost: 0,
  castMs: 0,
  cooldownMs: 0,
  target: "self",
  range: 0,
  radius: 0,
  damage: "none",
  formula: [],
  conditions: [],
  effects: [{ effect: effectId, value: 50, chancePm: 1000 }],
  gradePm: [1000],
  enabled: true,
});
const item = (equip: Record<string, unknown>) => ({
  id: "test_gear",
  name,
  ...ITEM_FIELDS,
  category: "equipment",
  equip,
});
const issuesOf = (files: Record<string, unknown>) =>
  validatePack(fixture({ "stat_rows.json": statRows, ...files })).issues;

describe("전투 분류", () => {
  it("올바른 효과·스킬·장비는 통과한다", () => {
    expect(
      issuesOf({
        "effects.json": { entries: [effect({})] },
        "skills.json": { entries: [skill("guard")] },
        "items.json": {
          entries: [
            item({ slot: "body", stats: [{ stat: "armor_hp", min: 1, max: 2 }], skills: ["iron_skin"] }),
          ],
        },
      }),
    ).toEqual([]);
  });

  it("버프에 바꿀 수치가 없거나, 상태이상이 아닌데 저항이 있으면 실패한다", () => {
    const issues = issuesOf({
      "effects.json": {
        entries: [
          effect({ stat: undefined }),
          {
            ...effect({ id: "burn", kind: "dot", stat: undefined }),
            resist: { cap: 1, halfConstant: 1, weights: [0, 0, 0, 0, 0, 0] },
          },
        ],
      },
    });
    expect(issues.map((issue) => issue.stage)).toEqual(["schema", "schema"]);
  });

  it("칸과 스탯 묶음이 맞지 않으면 실패한다(D-423): 몸 칸에 1차 스탯, 장신구 칸에 2차 수치", () => {
    expect(
      issuesOf({
        "items.json": { entries: [item({ slot: "body", stats: [{ stat: "str", min: 1, max: 2 }] })] },
      }),
    ).toHaveLength(1);
    expect(
      issuesOf({
        "items.json": {
          entries: [item({ slot: "accessory", stats: [{ stat: "armor_hp", min: 1, max: 2 }] })],
        },
      }),
    ).toHaveLength(1);
    expect(
      issuesOf({
        "items.json": { entries: [item({ slot: "accessory", stats: [{ stat: "str", min: 3, max: 1 }] })] },
      }),
    ).toHaveLength(1);
  });

  it("장비·인공장기 스탯 묶음에 속성값 칸(D-450): 코드(D-167)·1~10(D-182), 한 칸 한 줄", () => {
    expect(
      issuesOf({
        "items.json": {
          entries: [
            item({
              slot: "organ",
              stats: [{ stat: "str", min: 1, max: 2 }],
              elements: [
                { element: "frost", value: 3 },
                { element: "fire", value: 10 },
              ],
            }),
          ],
        },
      }),
    ).toEqual([]);
    for (const elements of [
      [{ element: "plasma", value: 3 }],
      [{ element: "fire", value: 11 }],
      [{ element: "fire", value: 0 }],
      [
        { element: "fire", value: 2 },
        { element: "fire", value: 3 },
      ],
    ])
      expect(
        issuesOf({ "items.json": { entries: [item({ slot: "organ", stats: [], elements })] } }),
      ).toHaveLength(1);
  });

  it("스킬이 없는 효과를, 장비가 없는 스탯 행을 가리키면 참조 오류다", () => {
    const issues = issuesOf({
      "effects.json": { entries: [effect({})] },
      "skills.json": { entries: [skill("gaurd")] },
      "items.json": { entries: [item({ slot: "head", stats: [{ stat: "shield_hp", min: 1, max: 2 }] })] },
    });
    expect(issues.map((issue) => [issue.stage, issue.file])).toEqual([
      ["references", "items.json"],
      ["references", "skills.json"],
    ]);
  });
});
