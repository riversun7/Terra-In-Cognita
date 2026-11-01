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
  base: "physical",
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

/** 무기 사양의 공격력 칸 말고 나머지 */
const WEAPON_BODY = {
  hitPm: 900,
  hitAppropriate: 50,
  critPm: 100,
  critAppropriate: 100,
  intervalMs: 1000,
  speedAppropriate: 100,
  range: 1,
  arc: false,
  staminaCost: 10,
  mpCost: 0,
};
const PHYSICAL = { attack: 20, attackAppropriate: 40 };
const ELEMENTAL = { attack: 30, attackAppropriate: 50 };
const weaponIssues = (weapon: Record<string, unknown>) =>
  issuesOf({
    "items.json": { entries: [item({ slot: "weapon", stats: [], weapon: { ...WEAPON_BODY, ...weapon } })] },
  });
const unitKind = (extra: Record<string, unknown>) => ({
  id: "human",
  name,
  slots: ["weapon"],
  skillSlots: { base: 3, perRebirth: 1, max: 10 },
  naturalWeapon: { ...WEAPON_BODY, physical: { attack: 5, attackAppropriate: 20 } },
  naturalElementalWeapon: { ...WEAPON_BODY, elemental: { attack: 5, attackAppropriate: 20 } },
  enabled: true,
  ...extra,
});
const kindIssues = (extra: Record<string, unknown>) =>
  issuesOf({ "unit_kinds.json": { entries: [unitKind(extra)] } });

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

  it("스킬 기반(D-463)은 물리·속성 둘 중 하나이고, 피해를 주는 스킬은 피해 종류와 기반이 같다", () => {
    const strike = { ...skill("guard"), trigger: "active", target: "enemy", range: 1 };
    const ok = issuesOf({
      "effects.json": { entries: [effect({})] },
      "skills.json": { entries: [{ ...strike, damage: "elemental", base: "elemental" }] },
      "items.json": { entries: [item({ slot: "body", stats: [], skills: ["iron_skin"] })] },
    });
    expect(ok.filter((issue) => issue.level === "error" && issue.file === "skills.json")).toEqual([]);
    const mixed = issuesOf({
      "effects.json": { entries: [effect({})] },
      "skills.json": { entries: [{ ...strike, damage: "physical", base: "elemental" }] },
    });
    expect(mixed.some((issue) => issue.file === "skills.json" && issue.path === "base")).toBe(true);
    const missing = issuesOf({
      "effects.json": { entries: [effect({})] },
      "skills.json": { entries: [{ ...strike, base: undefined }] },
    });
    expect(missing.some((issue) => issue.file === "skills.json" && issue.path === "base")).toBe(true);
  });

  it("무기 공격력 칸(D-465): 물리·속성 하나 또는 둘. 하나도 없으면 실패", () => {
    expect(weaponIssues({ physical: PHYSICAL })).toEqual([]);
    expect(weaponIssues({ elemental: ELEMENTAL })).toEqual([]);
    expect(weaponIssues({ physical: PHYSICAL, elemental: ELEMENTAL, basic: "elemental" })).toEqual([]);
    const none = weaponIssues({});
    expect(none.map((issue) => [issue.stage, issue.path])).toEqual([["schema", "equip.weapon"]]);
    // 옛 모양(kind·attack)은 받지 않는다
    expect(weaponIssues({ kind: "physical", attack: 20, attackAppropriate: 40 }).length).toBeGreaterThan(0);
  });

  it("두 칸 무기는 기본 공격 칸(basic)을 꼭 적고, basic은 무기에 있는 칸만 가리킨다(질문 235 가)", () => {
    const missing = weaponIssues({ physical: PHYSICAL, elemental: ELEMENTAL });
    expect(missing.map((issue) => issue.path)).toEqual(["equip.weapon.basic"]);
    const absent = weaponIssues({ physical: PHYSICAL, basic: "elemental" });
    expect(absent.map((issue) => issue.path)).toEqual(["equip.weapon.basic"]);
    expect(weaponIssues({ elemental: ELEMENTAL, basic: "elemental" })).toEqual([]);
  });

  it("유닛 종류: 타고난 무기(맨손)는 물리 칸이 꼭 있고, 맨손 속성 자료는 속성 칸만 있다(D-436·D-463·D-465)", () => {
    expect(kindIssues({})).toEqual([]);
    const claws = { ...WEAPON_BODY, physical: PHYSICAL, elemental: ELEMENTAL, basic: "physical" };
    expect(kindIssues({ naturalWeapon: claws })).toEqual([]);
    expect(kindIssues({ naturalWeapon: { ...WEAPON_BODY, elemental: ELEMENTAL } }).length).toBeGreaterThan(0);
    const both = { ...WEAPON_BODY, physical: PHYSICAL, elemental: ELEMENTAL };
    expect(kindIssues({ naturalElementalWeapon: both }).length).toBeGreaterThan(0);
    expect(
      kindIssues({ naturalElementalWeapon: { ...WEAPON_BODY, physical: PHYSICAL } }).length,
    ).toBeGreaterThan(0);
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
