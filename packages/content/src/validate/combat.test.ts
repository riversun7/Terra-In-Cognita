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
  shape: "buff",
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
  critPm: 100,
  intervalMs: 1000,
  range: 1,
  arc: false,
  staminaCost: 10,
  mpCost: 0,
};
const PHYSICAL = { attack: 20 };
const ELEMENTAL = { attack: 30 };
const weaponIssues = (weapon: Record<string, unknown>) =>
  issuesOf({
    "items.json": { entries: [item({ slot: "weapon", stats: [], weapon: { ...WEAPON_BODY, ...weapon } })] },
  });
const unitKind = (extra: Record<string, unknown>) => ({
  id: "human",
  name,
  slots: ["weapon"],
  skillSlots: { base: 3, perRebirth: 1, max: 10 },
  naturalWeapon: { ...WEAPON_BODY, physical: { attack: 0 }, unarmed: true },
  naturalElementalWeapon: { ...WEAPON_BODY, elemental: { attack: 0 }, unarmed: true },
  enabled: true,
  ...extra,
});
const kindIssues = (extra: Record<string, unknown>) =>
  issuesOf({ "unit_kinds.json": { entries: [unitKind(extra)] } });

const skillIssuePaths = (entry: Record<string, unknown>) =>
  issuesOf({ "effects.json": { entries: [effect({})] }, "skills.json": { entries: [entry] } })
    .filter((issue) => issue.file === "skills.json")
    .map((issue) => issue.path);

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
    const strike = { ...skill("guard"), shape: "single", trigger: "active", target: "enemy", range: 1 };
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

  it("필요한 무기 칸·맨손 스킬(D-490): 피해 스킬은 기반과 같은 칸만, 맨손 스킬은 칸을 적지 않는다", () => {
    const strike = { ...skill("guard"), shape: "single", trigger: "active", target: "enemy", range: 1 };
    const physical = { ...strike, damage: "physical", base: "physical" };
    expect(skillIssuePaths({ ...physical, weaponField: "physical" })).toEqual([]);
    expect(skillIssuePaths({ ...physical, weaponField: "any" })).toEqual(["weaponField"]);
    expect(skillIssuePaths({ ...physical, weaponField: "elemental" })).toEqual(["weaponField"]);
    expect(skillIssuePaths({ ...physical, bareHand: true })).toEqual([]);
    expect(skillIssuePaths({ ...physical, bareHand: true, weaponField: "physical" })).toEqual([
      "weaponField",
    ]);
    // 피해 없는 스킬은 아무 칸(any)이나 다른 칸도 된다
    expect(skillIssuePaths({ ...skill("guard"), weaponField: "any" })).toEqual([]);
    expect(skillIssuePaths({ ...skill("guard"), weaponField: "elemental" })).toEqual([]);
  });

  it("움직임 부품·곡선(docs/adr/2026-11-15-combat-moves.md 6절): 모양·대상과 맞아야 한다", () => {
    const strike = {
      ...skill("guard"),
      shape: "single",
      trigger: "active",
      target: "enemy",
      range: 6,
      damage: "physical",
      base: "physical",
    };
    expect(skillIssuePaths({ ...strike, move: { kind: "dash", cells: 5 } })).toEqual([]);
    expect(skillIssuePaths({ ...strike, move: { kind: "dash", cells: 5, hitRange: 2 } })).toEqual([]);
    expect(skillIssuePaths({ ...strike, displace: { kind: "knockback", cells: 2 } })).toEqual([]);
    expect(skillIssuePaths({ ...strike, curves: ["magic_distance", "close_shot"], shots: 3 })).toEqual([]);
    // 모양 move: 피해 없이 자기 이동 부품 필수
    const move = { ...strike, shape: "move", damage: "none" };
    expect(skillIssuePaths({ ...move, move: { kind: "blink", cells: 4, dir: "away" } })).toEqual([]);
    expect(skillIssuePaths(move)).toEqual(["move"]);
    expect(skillIssuePaths({ ...move, damage: "physical", move: { kind: "backstep", cells: 2 } })).toEqual([
      "damage",
    ]);
    // 은신·감지는 자기 buff, 돌진은 적 대상
    const self = { ...skill("guard"), trigger: "active" };
    expect(skillIssuePaths({ ...self, move: { kind: "stealth", durationMs: 5000 } })).toEqual([]);
    expect(skillIssuePaths({ ...self, move: { kind: "dash", cells: 3 } })).toEqual(["move"]);
    expect(skillIssuePaths({ ...strike, move: { kind: "stealth", durationMs: 5000 } })).toEqual(["move"]);
    // 연사는 대상 하나 모양만, 곡선은 겹치지 않게, 칸 범위
    expect(skillIssuePaths({ ...strike, shape: "area", radius: 2, shots: 3 })).toEqual(["shots"]);
    expect(skillIssuePaths({ ...strike, curves: ["dot_total", "dot_total"] })).toEqual(["curves"]);
    expect(skillIssuePaths({ ...strike, move: { kind: "dash", cells: 99 } })).toEqual(["move.cells"]);
    expect(skillIssuePaths({ ...self, displace: { kind: "pull", cells: 2 } })).toEqual(["displace"]);
  });

  it("쉴드 재생 효과(D-490): 버프·디버프의 stat에 shield_regen을 쓴다", () => {
    const curse = effect({ id: "shield_curse", kind: "debuff", stat: "shield_regen", valueMode: "permille" });
    expect(issuesOf({ "effects.json": { entries: [curse] } })).toEqual([]);
  });

  it("마법 스킬 모양: 연쇄·범위·아군 하나 회복·쉴드 회복·느리게·대상 체력 조건이 통과한다", () => {
    const magic = {
      ...skill("chill"),
      trigger: "active",
      resource: "mp",
      cost: 10,
      damage: "elemental",
      base: "elemental",
      effects: [],
    };
    const issues = issuesOf({
      "effects.json": {
        entries: [effect({ id: "chill", kind: "debuff", stat: "move_speed", valueMode: "permille" })],
      },
      "skills.json": {
        entries: [
          {
            ...magic,
            id: "bolt",
            shape: "projectile",
            target: "enemy",
            range: 6,
            effects: [{ effect: "chill", value: 300, chancePm: 1000 }],
          },
          {
            ...magic,
            id: "zap",
            shape: "chain",
            target: "enemy",
            range: 6,
            chain: { targets: 3, jump: 3, falloffPm: 750 },
          },
          { ...magic, id: "blast", shape: "area", target: "enemy", range: 5, radius: 2 },
          { ...magic, id: "spike", shape: "single", target: "enemy", range: 4 },
          {
            ...magic,
            id: "mend",
            shape: "heal",
            target: "ally",
            range: 5,
            damage: "none",
            formula: [{ part: "heal", pm: 250 }],
            conditions: [{ part: "target_hp_below", pct: 70 }],
          },
          {
            ...magic,
            id: "ward",
            shape: "buff",
            target: "ally",
            range: 5,
            damage: "none",
            formula: [{ part: "shield", pm: 500 }],
          },
          {
            ...magic,
            id: "curse",
            shape: "debuff",
            target: "enemy",
            range: 5,
            damage: "none",
            effects: [{ effect: "chill", value: 1, chancePm: 1000 }],
          },
        ],
      },
    });
    expect(issues).toEqual([]);
  });

  it("모양이 판정 칸과 맞지 않으면 실패한다", () => {
    const magic = {
      ...skill("guard"),
      trigger: "active",
      resource: "mp",
      damage: "elemental",
      base: "elemental",
      effects: [],
    };
    const pathsOf = (entry: Record<string, unknown>) =>
      issuesOf({ "skills.json": { entries: [{ ...magic, ...entry }] } }).map((issue) => issue.path);
    expect(pathsOf({ shape: "chain", target: "enemy", range: 6 })).toEqual(["chain"]);
    expect(
      pathsOf({
        shape: "projectile",
        target: "enemy",
        range: 6,
        chain: { targets: 3, jump: 2, falloffPm: 500 },
      }),
    ).toEqual(["chain"]);
    expect(pathsOf({ shape: "area", target: "enemy", range: 5, radius: 0 })).toEqual(["radius"]);
    expect(pathsOf({ shape: "projectile", target: "enemy", range: 1 })).toEqual(["range"]);
    expect(pathsOf({ shape: "single", target: "ally", range: 1 })).toEqual(["target"]);
    expect(pathsOf({ shape: "debuff", target: "enemy", range: 5 })).toEqual(["damage"]);
    expect(pathsOf({ shape: "heal", target: "ally", range: 5, damage: "none" })).toEqual(["formula"]);
    expect(pathsOf({ shape: "buff", target: "ally", range: 0, radius: 0, damage: "none" })).toEqual([
      "range",
    ]);
    expect(pathsOf({ shape: "single", target: "enemy", range: 1, trigger: "passive" })).toEqual(["shape"]);
    expect(pathsOf({ shape: "spell", target: "enemy", range: 1 })).toEqual(["shape"]);
  });

  it("무기 공격력 칸(D-465): 물리·속성 하나 또는 둘. 하나도 없으면 실패", () => {
    expect(weaponIssues({ physical: PHYSICAL })).toEqual([]);
    expect(weaponIssues({ elemental: ELEMENTAL })).toEqual([]);
    expect(weaponIssues({ physical: PHYSICAL, elemental: ELEMENTAL, basic: "elemental" })).toEqual([]);
    const none = weaponIssues({});
    expect(none.map((issue) => [issue.stage, issue.path])).toEqual([["schema", "equip.weapon"]]);
    // 옛 모양(kind·attack)은 받지 않는다
    expect(weaponIssues({ kind: "physical", attack: 20 }).length).toBeGreaterThan(0);
    // D-502 전의 2차 적정치 칸(attackAppropriate·hitAppropriate 등)도 받지 않는다(DB 옛 줄은 서버가 켤 때 고쳐 읽는다)
    expect(weaponIssues({ physical: { attack: 20, attackAppropriate: 40 } }).length).toBeGreaterThan(0);
    expect(weaponIssues({ physical: PHYSICAL, hitAppropriate: 50 }).length).toBeGreaterThan(0);
  });

  it("무기 1차 적정 스탯(D-502): str·int·dex·agi만, 1 이상, 적어도 하나", () => {
    expect(weaponIssues({ physical: PHYSICAL, appropriate: { str: 25, dex: 12, agi: 12 } })).toEqual([]);
    expect(weaponIssues({ elemental: ELEMENTAL, appropriate: { int: 25 } })).toEqual([]);
    expect(weaponIssues({ physical: PHYSICAL, appropriate: { vit: 10 } }).length).toBeGreaterThan(0);
    expect(weaponIssues({ physical: PHYSICAL, appropriate: { str: 0 } }).length).toBeGreaterThan(0);
    expect(weaponIssues({ physical: PHYSICAL, appropriate: {} }).map((issue) => issue.path)).toEqual([
      "equip.weapon.appropriate",
    ]);
  });

  it("두 칸 무기는 기본 공격 칸(basic)을 꼭 적고, basic은 무기에 있는 칸만 가리킨다(질문 235 가)", () => {
    const missing = weaponIssues({ physical: PHYSICAL, elemental: ELEMENTAL });
    expect(missing.map((issue) => issue.path)).toEqual(["equip.weapon.basic"]);
    const absent = weaponIssues({ physical: PHYSICAL, basic: "elemental" });
    expect(absent.map((issue) => issue.path)).toEqual(["equip.weapon.basic"]);
    expect(weaponIssues({ elemental: ELEMENTAL, basic: "elemental" })).toEqual([]);
  });

  it("맨손(unarmed)은 무기 몫이 없고(attack 0) 적정을 적지 않는다(D-502, 적정 DEX·AGI는 레벨 식)", () => {
    const bare = { ...WEAPON_BODY, physical: { attack: 5 }, unarmed: true };
    expect(kindIssues({ naturalWeapon: bare }).map((issue) => issue.path)).toEqual([
      "naturalWeapon.physical.attack",
    ]);
    const withAppropriate = {
      ...WEAPON_BODY,
      physical: { attack: 0 },
      unarmed: true,
      appropriate: { dex: 5 },
    };
    expect(kindIssues({ naturalWeapon: withAppropriate }).map((issue) => issue.path)).toEqual([
      "naturalWeapon.appropriate",
    ]);
    const elementalBare = { ...WEAPON_BODY, elemental: { attack: 3 }, unarmed: true };
    expect(kindIssues({ naturalElementalWeapon: elementalBare }).map((issue) => issue.path)).toEqual([
      "naturalElementalWeapon.elemental.attack",
    ]);
    // 크리쳐 발톱(맨손 아님)은 무기 공격력·1차 적정 스탯을 가진다
    const claws = { ...WEAPON_BODY, physical: { attack: 12 }, appropriate: { str: 15, dex: 12, agi: 12 } };
    expect(kindIssues({ naturalWeapon: claws })).toEqual([]);
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

  it("유닛 종류: 타고난 무기를 스킬용 무기로 치는지(naturalWeaponIsWeapon, D-490)는 참·거짓 선택 칸", () => {
    expect(kindIssues({ naturalWeaponIsWeapon: true })).toEqual([]);
    expect(kindIssues({ naturalWeaponIsWeapon: false })).toEqual([]);
    expect(kindIssues({ naturalWeaponIsWeapon: "yes" }).length).toBeGreaterThan(0);
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
