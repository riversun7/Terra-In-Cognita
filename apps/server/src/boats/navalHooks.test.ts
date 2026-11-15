// 해상 전투 고리 시험(navalHooks.ts — D-559 1532·1536·1537·1534)
import { HULL_FULL } from "@terra/shared/harbor";
import { START_BOATS } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { boatBody, hullAfterBattle, shellHit } from "./navalHooks.ts";

const CARGO = {
  speedPm: 750,
  naval: {
    shipClass: "cargo",
    hullPoints: 800,
    armor: 5,
    modulePoints: 4,
    guns: [
      { caliber: "light", shells: ["ap", "he"] },
      { caliber: "medium", shells: ["he"] },
    ],
    crew: { captain: 1, gunner: 2, engine: 1, deck: 2 },
    hangar: 0,
  },
} as const;

describe("해상 전투 고리", () => {
  it("배 몸: HP = 함선 HP × 내구도 몫, 화포수가 붙은 함포만, 표류", () => {
    const body = boatBody(
      CARGO,
      { hullPpm: HULL_FULL / 2, fuelEmpty: false, overheat: false },
      { gunner: 1 },
      START_BOATS,
    );
    expect(body).toMatchObject({ hp: 400, maxHp: 800, armor: 5, speedPm: 750, drifting: false });
    expect(body.guns).toEqual([{ caliber: "light", shells: ["ap", "he"] }]);
    const wreck = boatBody(CARGO, { hullPpm: 0, fuelEmpty: false, overheat: false }, {}, START_BOATS);
    expect(wreck).toMatchObject({ hp: 0, drifting: true, guns: [] });
    // 함선 칸이 없는 배 종류는 작은 배 몸
    expect(
      boatBody(undefined, { hullPpm: HULL_FULL, fuelEmpty: true, overheat: false }, {}, START_BOATS),
    ).toMatchObject({
      hp: 300,
      drifting: true,
    });
  });

  it("포탄(1536): AP는 선체만, HE는 선체 + 갑판, 장갑은 선체 피해에서 뺀다", () => {
    expect(shellHit("light", "ap", 5, START_BOATS)).toEqual({ hull: 35, deck: 0 });
    expect(shellHit("light", "he", 5, START_BOATS)).toEqual({ hull: 19, deck: 16 });
    expect(shellHit("heavy", "ap", 1000, START_BOATS)).toEqual({ hull: 0, deck: 0 });
  });

  it("전투 뒤 남은 HP → 내구도(0이면 표류)", () => {
    expect(hullAfterBattle(400, 800)).toBe(HULL_FULL / 2);
    expect(hullAfterBattle(0, 800)).toBe(0);
    expect(hullAfterBattle(900, 800)).toBe(HULL_FULL);
  });
});
