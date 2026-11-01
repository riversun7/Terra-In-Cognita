import { describe, expect, it } from "vitest";
import { TEST_NPC_COEFFICIENTS as c } from "../npc/coefficients.ts";
import {
  type WarState,
  declareWar,
  endWar,
  endedWars,
  inTruce,
  makePeace,
  recordFight,
  warCost,
} from "./wars.ts";

const DAY = 86_400_000;
const empty = (): WarState => ({ wars: new Set(), lastFight: new Map(), truces: new Map() });

describe("전쟁·강화 규칙(D-256·D-290·D-292, 질문 194~196 가)", () => {
  it("무명분 선포 비용 = 국고의 5%(내림)", () => {
    expect(warCost(1_000n, c)).toBe(50n);
    expect(warCost(19n, c)).toBe(0n);
  });

  it("선포하면 둘 다 전쟁이고 교전 시각이 적힌다", () => {
    const a = empty();
    const b = empty();
    declareWar(a, 1, b, 2, 100);
    expect(a.wars.has(2) && b.wars.has(1)).toBe(true);
    expect(a.lastFight.get(2)).toBe(100);
    recordFight(a, 1, b, 2, 500);
    expect(b.lastFight.get(1)).toBe(500);
  });

  it("마지막 교전에서 7일이 지나면 백지 강화(불가침 없음)", () => {
    const a = empty();
    const b = empty();
    declareWar(a, 1, b, 2, 0);
    expect(endedWars(a, 7 * DAY - 1, c)).toEqual([]);
    expect(endedWars(a, 7 * DAY, c)).toEqual([2]);
    endWar(a, 1, b, 2);
    expect(a.wars.size + b.wars.size).toBe(0);
    expect(inTruce(a, 2, 7 * DAY)).toBe(false);
  });

  it("강화 조약은 전쟁을 끝내고 14일 불가침", () => {
    const a = empty();
    const b = empty();
    declareWar(a, 1, b, 2, 0);
    makePeace(a, 1, b, 2, DAY, c);
    expect(a.wars.has(2)).toBe(false);
    expect(inTruce(a, 2, DAY + 14 * DAY - 1)).toBe(true);
    expect(inTruce(b, 1, DAY + 14 * DAY)).toBe(false);
  });
});
