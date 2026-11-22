// 같은 나라 유닛을 일부러 치는 NPC(순수) — 사용자 결정 D-592(2026-11-22, 질문 2581 (1) 원문 "성향에 따라 쿠데타에는 적극 참여하나 같은국가 유닛공격은 드뭄
// 도시외부에서"), docs/adr/2026-11-15-unloaded-second-maps.md "바뀜 (fixes-d592, D-592)".
// - 조우(clash.ts)는 그대로 다른 나라끼리만 저절로 만난다. 이 모듈은 그 밖의 드문 길 하나: 띄운 2차맵에서 NPC 유닛(플레이어가 아닌 소유 주체 — NPC 나라 봇)이 같은 나라
//   다른 주인의 유닛과 조우 거리(encounter_radius_cells) 안이면 후보다. 부르는 쪽(encounterWorld.ts)이 조우 찾기마다 후보 하나에 한 번 굴리고(확률 = 설정 칸
//   encounter_npc_same_nation_ppm × 공격 성향 ÷ 1000, 백만분율 [임시]), 맞으면 도시(시가지) 밖일 때만 일부러 치기(strike)와 같은 길로 친다.
// - 같은 입력이면 같은 답(나라 ID 차례, 그 안은 clash.ts 짝 차례).
import { type ClashUnit, findClashes } from "./clash.ts";

/** 후보를 찾는 유닛 하나(ClashUnit + NPC 소유 주체인가) */
export interface NpcStrikeUnit extends ClashUnit {
  /** 플레이어가 아닌 소유 주체(NPC 나라)의 유닛 */
  readonly npc: boolean;
}

/** 같은 나라 NPC → 다른 주인 유닛 후보 하나 */
export interface NpcStrikeCandidate {
  readonly nation: number;
  readonly npcOwner: number;
  readonly targetOwner: number;
  /** 대상 주인 유닛과 만난 NPC 유닛(유닛 ID 차례) */
  readonly attackers: readonly ClashUnit[];
  /** 대상 유닛(만난 대상 주인 유닛 가운데 유닛 ID가 가장 작은 것) */
  readonly target: ClashUnit;
}

/** 굴림 하나의 확률(백만분율): 설정 칸 × 공격 성향(0~1000) ÷ 1000 */
export function npcStrikeChancePpm(ppm: number, aggression: number): number {
  const base = Math.max(0, Math.min(1_000_000, Math.trunc(ppm)));
  const temper = Math.max(0, Math.min(1000, Math.trunc(aggression)));
  return Math.trunc((base * temper) / 1000);
}

/** 한 2차맵 유닛에서 후보를 찾는다(나라마다 NPC 유닛과 다른 주인 유닛이 모두 있을 때만 격자를 만든다) */
export function npcStrikeCandidates(units: readonly NpcStrikeUnit[], radius: number): NpcStrikeCandidate[] {
  const byNation = new Map<number, NpcStrikeUnit[]>();
  for (const unit of units) {
    const list = byNation.get(unit.nation);
    if (list) list.push(unit);
    else byNation.set(unit.nation, [unit]);
  }
  const out: NpcStrikeCandidate[] = [];
  for (const nation of [...byNation.keys()].toSorted((a, b) => a - b)) {
    const list = byNation.get(nation) ?? [];
    const npcOwners = new Set(list.filter((unit) => unit.npc).map((unit) => unit.ownerId));
    if (npcOwners.size === 0 || list.every((unit) => unit.npc)) continue;
    // 주인을 "나라" 칸에 넣어 같은 나라 안 다른 주인끼리의 만남을 찾는다. 먼저 보는 쪽(decider) = NPC 유닛(그쪽이 치는 편)
    const contacts = findClashes(
      list.map((unit) => ({ ...unit, nation: unit.ownerId, decider: unit.npc })),
      radius,
    );
    for (const contact of contacts) {
      const [low, high] = contact.nations;
      const lowNpc = npcOwners.has(low);
      if (lowNpc === npcOwners.has(high)) continue;
      const attackers = lowNpc ? contact.sides[0] : contact.sides[1];
      const targets = lowNpc ? contact.sides[1] : contact.sides[0];
      const target = targets[0];
      if (!target || attackers.length === 0) continue;
      out.push({
        nation,
        npcOwner: lowNpc ? low : high,
        targetOwner: lowNpc ? high : low,
        attackers: attackers.map((unit) => ({ ...unit, nation })),
        target: { ...target, nation },
      });
    }
  }
  return out;
}
