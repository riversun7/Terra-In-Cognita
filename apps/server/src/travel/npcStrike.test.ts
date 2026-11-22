// 같은 나라 유닛을 일부러 치는 NPC 후보·확률 시험(줄기 fixes-d592 — 사용자 결정 D-592 2581 (1))
import { describe, expect, it } from "vitest";
import { type NpcStrikeUnit, npcStrikeCandidates, npcStrikeChancePpm } from "./npcStrike.ts";

const unit = (
  unitId: number,
  ownerId: number,
  nation: number,
  x: number,
  npc: boolean,
  decider = !npc,
): NpcStrikeUnit => ({ unitId, ownerId, nation, x, y: 10, decider, npc });

describe("같은 나라 NPC 치기 후보", () => {
  it("확률 = 설정 칸 × 공격 성향 ÷ 1000(백만분율, 범위로 자름)", () => {
    expect(npcStrikeChancePpm(2000, 1000)).toBe(2000);
    expect(npcStrikeChancePpm(2000, 500)).toBe(1000);
    expect(npcStrikeChancePpm(2000, 0)).toBe(0);
    expect(npcStrikeChancePpm(0, 1000)).toBe(0);
    expect(npcStrikeChancePpm(-5, 700)).toBe(0);
    expect(npcStrikeChancePpm(3_000_000, 2000)).toBe(1_000_000);
  });

  it("NPC 유닛과 같은 나라 다른 주인 유닛이 거리 안이면 후보 — 다른 나라·거리 밖·NPC끼리·플레이어끼리는 아니다", () => {
    const units = [
      unit(1, 100, 7, 10, true),
      unit(2, 100, 7, 12, true),
      // 같은 나라 플레이어(일 중이라 판단 유닛이 아니어도 대상이 된다)
      unit(10, 200, 7, 14, false, false),
      // 다른 나라 플레이어(조우 몫 — 여기서는 아니다)
      unit(11, 300, 8, 11, false),
      // 같은 나라 플레이어지만 멀다
      unit(12, 201, 7, 90, false),
      // 다른 NPC 주인(같은 나라) — NPC끼리는 아니다
      unit(13, 101, 7, 6, true),
    ];
    const found = npcStrikeCandidates(units, 5);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ nation: 7, npcOwner: 100, targetOwner: 200 });
    expect(found[0]?.target.unitId).toBe(10);
    expect(found[0]?.attackers.map((row) => row.unitId)).toEqual([1, 2]);
  });

  it("NPC 유닛이 없거나 나라에 NPC뿐이면 후보가 없다", () => {
    expect(npcStrikeCandidates([unit(1, 200, 7, 10, false), unit(2, 201, 7, 11, false)], 5)).toEqual([]);
    expect(npcStrikeCandidates([unit(1, 100, 7, 10, true), unit(2, 101, 7, 11, true)], 5)).toEqual([]);
    expect(npcStrikeCandidates([], 5)).toEqual([]);
  });
});
