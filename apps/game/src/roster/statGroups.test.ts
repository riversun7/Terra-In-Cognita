// 2차 스탯 묶음 시험 — 기획 48 §3.2·§3.3 표, 모르는 행은 "기타", 빈 묶음은 뺀다, 묶음 안 차례는 받은 차례
import { describe, expect, it } from "vitest";
import { STAT_GROUPS, groupStats, statGroupLabel, statGroupOf } from "./statGroups.ts";

const row = (id: string) => ({ id });

describe("2차 스탯 묶음", () => {
  it("팩 행 14개를 48 §3.2·§3.3 묶음으로 나눈다", () => {
    const ids = [
      "hp",
      "armor_hp",
      "shield_hp",
      "defense_rate",
      "physical_attack",
      "elemental_attack",
      "hit",
      "evade",
      "crit_chance",
      "crit_multiplier",
      "action_speed",
      "stamina",
      "mp",
      "sight",
    ];
    const groups = groupStats(ids.map(row));
    expect(groups.map((entry) => entry.group)).toEqual([
      "survival",
      "offense",
      "accuracy",
      "speed",
      "resource",
      "activity",
    ]);
    expect(groups[0]?.rows.map((entry) => entry.id)).toEqual(["hp", "armor_hp", "shield_hp", "defense_rate"]);
    expect(groups.flatMap((entry) => entry.rows).length).toBe(ids.length);
  });

  it("표에 없는 행은 기타로, 묶음 안 차례는 받은 차례 그대로", () => {
    expect(statGroupOf("new_row")).toBe("other");
    const groups = groupStats([row("mp"), row("zzz"), row("stamina")]);
    expect(groups).toEqual([
      { group: "resource", rows: [row("mp"), row("stamina")] },
      { group: "other", rows: [row("zzz")] },
    ]);
  });

  it("묶음 이름은 두 언어로 있다", () => {
    for (const group of STAT_GROUPS) {
      expect(statGroupLabel(group, "ko")).not.toBe("");
      expect(statGroupLabel(group, "en")).not.toBe("");
    }
    expect(statGroupLabel("survival", "ko")).toBe("생존");
  });
});
