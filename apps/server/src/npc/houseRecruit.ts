// 가문 도시 구인 — 질문 1041 다(기획 D-533 "자동 구인": 처음에는 자동으로 마을이 차고, 가문장이 직접 고르고 싶으면 자동을 끄고 산다),
// D-469(인구는 행정 건물 구인 카드로만), D-212(유저와 NPC가 같은 규칙), docs/adr/2026-11-11-house-village.md "바뀜 (2026-11-12)".
// - 자동(기본 켬, factions.recruit_auto): 거울 세계 가문 세력도 NPC처럼 판단 사건을 받지만, 판단(행동·세율)은 돌리지 않고 구인 규칙식
//   (@terra/sim recruitPolicy — NPC와 같은 함수: 주거 목표까지·국고에서 값 소각·배후지 성장 멈춤)만 돌린다. 판단 차례(aiStep)는 NPC처럼 센다.
// - 끔: 판단 사건은 그대로 돌고(다시 켜면 바로 이어진다) 구인만 건너뛴다. 가문장은 카드를 손으로 산다(hire).
// - 손으로 사기: 가문 국고(나라 화폐)가 모자라면 가문장 지갑(기준 통화, 같은 값)으로 낸다 [임시] — 부르는 쪽(factionIdentity/houseRecruit.ts)이
//   지갑 값을 낸 뒤 prepaid로 부른다(질문 1097). 산 휴먼은 가문 도시 주민(가문 소유 주체)이다.
import {
  type NpcContext,
  type RecruitView,
  type SimFaction,
  type SimUnit,
  recruitPolicy,
  scheduleDecide,
} from "@terra/sim";

export interface HouseRecruit {
  /** 가문 세력의 판단 사건(runtime.ts가 player 세력이면 여기로 넘긴다): 자동이면 구인 규칙식, 다음 판단 예약 */
  decide(faction: SimFaction, nowMs: number): void;
  /** 그 가문(소유 주체)이 자동 구인 중인가 */
  auto(ownerId: number): boolean;
  /** 자동 구인 켬·끔(저장은 부르는 쪽이 쓰기 대기열에 넣는다) */
  setAuto(ownerId: number, on: boolean): void;
  /** 새로 들인 가문의 판단 사건을 건다(이미 걸려 있으면 그대로) */
  schedule(faction: SimFaction, nowMs: number): void;
  /** 가문이 그 도시에서 지금 보는 카드(가문 도시가 아니면 undefined) */
  view(ownerId: number, cityId: number, nowMs: number): RecruitView | undefined;
  /** 카드 한 장을 산다(prepaid면 값을 이미 냈다). 산 휴먼, 못 사면 undefined */
  hire(ownerId: number, cityId: number, slot: number, nowMs: number, prepaid: boolean): SimUnit | undefined;
}

export function createHouseRecruit(o: {
  /** NPC 판단 맥락(사회 규칙이 붙은 뒤에 있다) */
  readonly ctx: () => NpcContext | undefined;
  /** 켤 때 읽은 자동 구인을 끈 가문(소유 주체) */
  readonly off: Iterable<number>;
}): HouseRecruit {
  const off = new Set(o.off);
  const houseOf = (ownerId: number): SimFaction | undefined => {
    const faction = o.ctx()?.world.factions.get(ownerId);
    return faction?.player && faction.alive ? faction : undefined;
  };
  return {
    decide(faction, nowMs) {
      const ctx = o.ctx();
      if (!ctx || !faction.alive) return;
      faction.eventId = undefined;
      if (!off.has(faction.id)) recruitPolicy(ctx, faction, nowMs);
      // 판단 차례는 NPC처럼 센다(다음 시각 난수가 겹치지 않게)
      faction.aiStep += 1;
      scheduleDecide(ctx, faction, nowMs);
    },
    auto: (ownerId) => !off.has(ownerId),
    setAuto(ownerId, on) {
      if (on) off.delete(ownerId);
      else off.add(ownerId);
    },
    schedule(faction, nowMs) {
      const ctx = o.ctx();
      if (!ctx || !faction.alive || faction.eventId !== undefined) return;
      scheduleDecide(ctx, faction, nowMs);
    },
    view(ownerId, cityId, nowMs) {
      const faction = houseOf(ownerId);
      return faction ? o.ctx()?.society?.recruitView(faction, cityId, nowMs) : undefined;
    },
    hire(ownerId, cityId, slot, nowMs, prepaid) {
      const faction = houseOf(ownerId);
      return faction ? o.ctx()?.society?.recruit(faction, cityId, slot, nowMs, false, prepaid) : undefined;
    },
  };
}
