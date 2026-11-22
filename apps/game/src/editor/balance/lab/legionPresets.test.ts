import { newLabUnit } from "@terra/shared/battleLab";
import { beforeEach, describe, expect, it } from "vitest";
import { initialTeams } from "./labModel.ts";
import {
  deleteLegionPreset,
  isDuelMatchup,
  legionUnitCount,
  loadSavedLegions,
  saveLegionPreset,
  swapTeams,
  toDuelParty,
} from "./legionPresets.ts";

describe("군단 프리셋과 1:1 도우미", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
  });

  it("군단을 저장·덮어쓰기·불러오기·지우기한다", () => {
    const p1 = { units: [newLabUnit("cyborg"), newLabUnit("human")], retreatHpPct: 10 };
    const p2 = { units: [newLabUnit("creature")], retreatHpPct: 0 };
    const first = saveLegionPreset([], "공격 군단", [p1, p2], 1000);
    expect(first).not.toBeNull();
    expect(first?.saved.parties).toHaveLength(2);
    expect(loadSavedLegions()).toHaveLength(1);

    // 같은 이름으로 저장하면 덮어쓴다
    const updated = saveLegionPreset(first?.list ?? [], "공격 군단", [p1], 2000);
    expect(updated?.list).toHaveLength(1);
    expect(updated?.saved.id).toBe(first?.saved.id);
    expect(updated?.saved.parties).toHaveLength(1);

    const afterDelete = deleteLegionPreset(updated?.list ?? [], updated?.saved.id ?? "");
    expect(afterDelete).toEqual([]);
    expect(loadSavedLegions()).toEqual([]);
  });

  it("빈 이름이나 빈 파티는 저장하지 않는다", () => {
    const p1 = { units: [newLabUnit("cyborg")], retreatHpPct: 0 };
    expect(saveLegionPreset([], "   ", [p1])).toBeNull();
    expect(saveLegionPreset([], "이름", [])).toBeNull();
  });

  it("1:1 정리·팀 바꾸기·군단 유닛 수 합계", () => {
    const a1 = { ...newLabUnit("cyborg"), level: 10 };
    const a2 = { ...newLabUnit("human"), level: 25 };
    const b1 = { ...newLabUnit("creature"), level: 30 };
    const teams = {
      a: { units: [a1, a2], retreatHpPct: 15 },
      b: { units: [b1], retreatHpPct: 0 },
    };
    expect(isDuelMatchup(teams, 0, 0)).toBe(false);
    const duelTeams = { a: toDuelParty(teams.a, 1), b: toDuelParty(teams.b, 0) };
    expect(duelTeams.a.units).toEqual([a2]);
    expect(isDuelMatchup(duelTeams, 0, 0)).toBe(true);
    expect(isDuelMatchup(duelTeams, 1, 0)).toBe(false);

    const swapped = swapTeams(duelTeams);
    expect(swapped.a.units[0]?.level).toBe(30);
    expect(swapped.b.units[0]?.level).toBe(25);
    expect(legionUnitCount(teams.a, [teams.b])).toBe(3);
    expect(isDuelMatchup(initialTeams(), 0, 0)).toBe(true);
  });
});
