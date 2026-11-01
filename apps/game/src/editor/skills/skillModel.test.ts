import type { SkillEditorSkill } from "@terra/shared/skillEditor";
import { describe, expect, it } from "vitest";
import {
  cleanSkill,
  filterSkills,
  freeSkillId,
  newSkillTemplate,
  parseInt32,
  sameSkill,
  skillErrorOf,
  withShape,
} from "./skillModel.ts";

const view = (id: string, extra: Partial<SkillEditorSkill> = {}): SkillEditorSkill => ({
  entry: { ...newSkillTemplate(id), name: { ko: `한 ${id}`, en: `En ${id}` } },
  origin: "pack",
  pack: null,
  override: null,
  grantedBy: [],
  ...extra,
});

describe("스킬 편집기 모델", () => {
  it("찾기는 ID·이름 ko/en, 거르기는 고침·새로 만듦·꺼짐", () => {
    const skills = [
      view("slash"),
      view("kick", { origin: "created" }),
      view("bash", { origin: "edited", entry: { ...newSkillTemplate("bash"), enabled: false } }),
    ];
    expect(filterSkills(skills, { text: "EN SL", filter: "all" }).map((s) => s.entry.id)).toEqual(["slash"]);
    expect(filterSkills(skills, { text: "", filter: "created" }).map((s) => s.entry.id)).toEqual(["kick"]);
    expect(filterSkills(skills, { text: "", filter: "edited" }).map((s) => s.entry.id)).toEqual(["bash"]);
    expect(filterSkills(skills, { text: "", filter: "disabled" }).map((s) => s.entry.id)).toEqual(["bash"]);
  });

  it("복제 ID는 있는 ID·지운 ID를 피한다", () => {
    expect(freeSkillId("slash", new Set(["slash"]))).toBe("slash_copy");
    expect(freeSkillId("slash", new Set(["slash", "slash_copy"]))).toBe("slash_copy2");
    expect(freeSkillId("a".repeat(48), new Set()).length).toBeLessThanOrEqual(48);
  });

  it("모양을 바꾸면 대상·피해·반지름·연쇄·회복 부품을 그 모양에 맞춘다", () => {
    const base = newSkillTemplate("x");
    const area = withShape(base, "area");
    expect([area.radius, area.target, area.damage]).toEqual([1, "enemy", "physical"]);
    const chain = withShape(area, "chain");
    expect([chain.radius, chain.chain?.targets]).toEqual([0, 3]);
    const heal = withShape(chain, "heal");
    expect([heal.target, heal.damage, heal.chain]).toEqual(["self", "none", undefined]);
    expect(heal.formula.some((part) => part.part === "heal")).toBe(true);
    const buff = withShape({ ...heal, trigger: "passive" }, "buff");
    expect([buff.trigger, buff.formula.some((part) => part.part === "heal")]).toEqual(["passive", false]);
    expect(withShape({ ...buff, trigger: "passive" }, "debuff").trigger).toBe("active");
    expect(withShape(base, "projectile").range).toBe(2);
  });

  it("보낼 항목은 빈 설명·거짓 맨손 칸을 빼고, 맨손 스킬이면 필요한 무기 칸을 뺀다", () => {
    const draft = {
      ...newSkillTemplate("x"),
      description: { ko: " ", en: "" },
      bareHand: false,
      weaponField: "physical" as const,
    };
    const clean = cleanSkill(draft);
    expect("description" in clean || "bareHand" in clean).toBe(false);
    expect(clean.weaponField).toBe("physical");
    const bare = cleanSkill({ ...draft, bareHand: true });
    expect([bare.bareHand, "weaponField" in bare]).toEqual([true, false]);
    expect(sameSkill(newSkillTemplate("x"), { ...newSkillTemplate("x"), bareHand: false })).toBe(true);
    expect(sameSkill(newSkillTemplate("x"), { ...newSkillTemplate("x"), cost: 11 })).toBe(false);
  });

  it("오류 코드: 서버 까닭·판 충돌·권한·연결", () => {
    expect(
      skillErrorOf({ data: { code: "BAD_REQUEST", reason: "invalid_entry", details: ["✗ a"] } }),
    ).toEqual({
      key: "invalid_entry",
      details: ["✗ a"],
      sessionEnded: false,
    });
    expect(skillErrorOf({ data: { code: "CONFLICT", reason: "revision_conflict" } }).key).toBe(
      "revision_conflict",
    );
    expect(skillErrorOf({ data: { code: "UNAUTHORIZED" } }).sessionEnded).toBe(true);
    expect(skillErrorOf(new Error("x")).key).toBe("network");
  });

  it("정수 입력은 범위 안 정수만 받는다", () => {
    expect(parseInt32("12", 0, 100)).toBe(12);
    expect(parseInt32("-3", -5, 5)).toBe(-3);
    expect([parseInt32("1.5", 0, 9), parseInt32("", 0, 9), parseInt32("10", 0, 9)]).toEqual([
      null,
      null,
      null,
    ]);
  });
});
