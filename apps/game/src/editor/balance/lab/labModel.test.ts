import { newLabUnit } from "@terra/shared/battleLab";
import { describe, expect, it } from "vitest";
import {
  addSkill,
  addUnit,
  applyFormationPreset,
  clampSelection,
  clockText,
  copyName,
  initialTeams,
  labErrorOf,
  looksLikeTeams,
  moveSkill,
  moveUnit,
  moveUnitFormationPos,
  parseIntIn,
  partyFormationPositions,
  removeUnit,
  setPartyLevel,
  shiftPartyLevel,
  updateUnit,
  weaponChoice,
  weaponOfChoice,
  withEquip,
  withGearRow,
} from "./labModel.ts";

describe("전투 실험실 팀 고치기", () => {
  it("정원 6을 넘지 않고, 파티에 하나는 남기고, 차례를 옮긴다", () => {
    let teams = initialTeams();
    for (let i = 0; i < 8; i++) teams = addUnit(teams, "a", { ...newLabUnit("human"), level: i + 2 });
    expect(teams.a.units).toHaveLength(6);
    teams = moveUnit(teams, { team: "a", index: 1 }, -1);
    expect(teams.a.units[0]?.level).toBe(2);
    let single = initialTeams();
    single = removeUnit(single, { team: "b", index: 0 });
    expect(single.b.units).toHaveLength(1);
    expect(clampSelection(teams, { team: "b", index: 4 })).toEqual({ team: "b", index: 0 });
    const updated = updateUnit(teams, { team: "a", index: 2 }, (unit) => ({ ...unit, level: 77 }));
    expect(updated.a.units[2]?.level).toBe(77);
    expect(updated.b).toBe(teams.b);
  });

  it("장비 칸·직접 값 행·스킬", () => {
    let unit = withEquip(newLabUnit("human"), 3, "test_vest", 700);
    unit = withEquip(unit, 2, "test_helmet");
    expect(unit.equipment.map((entry) => entry.slot)).toEqual([2, 3]);
    unit = withEquip(unit, 3, null);
    expect(unit.equipment).toHaveLength(1);
    unit = withGearRow(unit, "shield_hp", 30);
    unit = withGearRow(unit, "shield_hp", 0);
    expect(unit.gear.rows).toEqual([]);
    unit = addSkill(addSkill(addSkill(unit, "a_skill"), "b_skill"), "a_skill");
    expect(unit.skills.map((skill) => skill.id)).toEqual(["a_skill", "b_skill"]);
    expect(moveSkill(unit, "b_skill", -1).skills[0]?.id).toBe("b_skill");
  });

  it("무기 고르기: 직접 값으로 바꾸면 타고난 무기가 출발값", () => {
    const natural = {
      physical: { attack: 0 },
      elemental: null,
      basic: "physical" as const,
      appropriate: { str: 0, int: 0, dex: 0, agi: 0 },
      hitPm: 850,
      critPm: 50,
      intervalMs: 1000,
      range: 1,
      arc: false,
      staminaCost: 10,
      mpCost: 0,
      elementsPm: Array.from({ length: 12 }, () => 0),
    };
    expect(weaponChoice({ kind: "item", id: "test_sword", pm: 1 })).toBe("item:test_sword");
    expect(weaponOfChoice("custom", { kind: "natural" }, natural)).toEqual({ kind: "custom", spec: natural });
    expect(weaponOfChoice("item:test_staff", { kind: "natural" }, natural)).toEqual({
      kind: "item",
      id: "test_staff",
      pm: 500,
    });
  });

  it("9×6 자유 배치 구역과 기본 진형 프리셋(2열·3열·V자·역V·방진·산개) 적용·자리 바꾸기", () => {
    let teams = initialTeams();
    for (let i = 1; i < 6; i++) teams = addUnit(teams, "a", newLabUnit("cyborg"));
    teams = applyFormationPreset(teams, "a", "v_wing");
    expect(partyFormationPositions(teams.a)).toEqual([
      { x: -4, y: 0 },
      { x: 4, y: 0 },
      { x: -2, y: 2 },
      { x: 2, y: 2 },
      { x: -1, y: 4 },
      { x: 1, y: 4 },
    ]);
    expect(teams.a.units.map((u) => u.row)).toEqual(["front", "front", "front", "front", "back", "back"]);

    // A1((-4, 0))을 빈 칸((0, 5))으로 옮기면 후열로 바뀌고, 이미 A2가 있는 ((4, 0))으로 옮기면 자리를 맞바꾼다
    teams = moveUnitFormationPos(teams, { team: "a", index: 0 }, { x: 0, y: 5 });
    expect(teams.a.units[0]?.pos).toEqual({ x: 0, y: 5 });
    expect(teams.a.units[0]?.row).toBe("back");
    teams = moveUnitFormationPos(teams, { team: "a", index: 0 }, { x: 4, y: 0 });
    expect(teams.a.units[0]?.pos).toEqual({ x: 4, y: 0 });
    expect(teams.a.units[1]?.pos).toEqual({ x: 0, y: 5 });
  });

  it("파티 일괄 레벨 지정과 증감(범위 고정)", () => {
    const party = {
      units: [
        { ...newLabUnit("cyborg"), level: 10 },
        { ...newLabUnit("human"), level: 998 },
      ],
      retreatHpPct: 0,
    };
    const fixed = setPartyLevel(party, 35);
    expect(fixed.units.map((u) => u.level)).toEqual([35, 35]);
    const shiftedUp = shiftPartyLevel(party, 5);
    expect(shiftedUp.units.map((u) => u.level)).toEqual([15, 999]);
    const shiftedDown = shiftPartyLevel(party, -20);
    expect(shiftedDown.units.map((u) => u.level)).toEqual([1, 978]);
  });
});

describe("입력·글·오류", () => {
  it("정수 입력 글", () => {
    expect(parseIntIn(" 1,200 ", 0, 5000)).toBe(1200);
    expect(parseIntIn("1.5", 0, 10)).toBeNull();
    expect(parseIntIn("11", 0, 10)).toBeNull();
    expect(parseIntIn("-3", -5, 5)).toBe(-3);
  });

  it("복제 이름은 40자 안", () => {
    expect(copyName({ ko: "전사", en: "Warrior" })).toEqual({ ko: "전사 복사", en: "Warrior copy" });
    const long = copyName({ ko: "가".repeat(40), en: "a".repeat(40) });
    expect(long.ko).toHaveLength(40);
    expect(long.en.endsWith(" copy")).toBe(true);
  });

  it("서버 오류 → 문구 키", () => {
    expect(labErrorOf({ data: { code: "BAD_REQUEST", reason: "invalid_unit" } }).key).toBe("invalid_unit");
    expect(labErrorOf({ data: { code: "TOO_MANY_REQUESTS", reason: "busy" } }).key).toBe("busy");
    expect(labErrorOf({ data: { code: "UNAUTHORIZED" } })).toEqual({
      key: "unauthorized",
      sessionEnded: true,
    });
    expect(labErrorOf({ data: { code: "BAD_REQUEST" } }).key).toBe("invalid_input");
    expect(labErrorOf(new Error("x")).key).toBe("network");
  });

  it("시계 글·기기 저장 모양", () => {
    expect(clockText(65_400)).toBe("1:05");
    expect(looksLikeTeams(initialTeams())).toBe(true);
    expect(looksLikeTeams({ a: { units: [] }, b: {} })).toBe(false);
  });
});
