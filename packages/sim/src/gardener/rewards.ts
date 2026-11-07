// 막아 낸 웨이브 보상 — docs/adr/2026-11-01-gardener-r5b.md "바뀜 (2026-11-07, 정원사 2)", 기획 D-499·D-500
// D-499: 웨이브를 막아 내면 명성·랭킹 점수, 장비, 소재, 유전자, 포획 기회 등을 받는다. 종류와 양은 개발자·운영 페이지에서 관리.
// D-500: 보호 레이드(필수 NPC 세력을 친 세력에게 가는 레이드)는 보상이 전혀 없다(보상을 노린 공격을 막는다).
// 여기서는 양만 정한다(설정 칸 [임시]). 무엇을 주는지(아이템)는 데이터다: 유전자 조각 = 팩 아이템 gene.drops에 "wave"가 있는 것,
// 크리쳐 재료 = 중분류 creature_material의 켜진 아이템. 받는 쪽은 그 도시 주인 세력이다. 장비·포획은 그 층이 생기면 더한다(확인 대기).

/** 웨이브 종류: city = 오염으로 생긴 도시 웨이브, protection = 보호 레이드(D-500) */
export type GardenerWaveKind = "city" | "protection";

export interface WaveReward {
  /** 명성·랭킹 점수(세력마다 쌓인다) */
  readonly renown: number;
  /** 유전자 조각 아이템마다 몇 개 */
  readonly genes: number;
  /** 크리쳐 재료 아이템마다 몇 개 */
  readonly materials: number;
}

export const NO_REWARD: WaveReward = { renown: 0, genes: 0, materials: 0 };

/** 막아 낸 웨이브 하나의 보상 양. 보호 레이드는 없음 */
export function waveReward(
  kind: GardenerWaveKind,
  strength: number,
  c: { readonly rewardRenownPer: number; readonly rewardGenes: number; readonly rewardMaterialsPm: number },
): WaveReward {
  if (kind === "protection") return NO_REWARD;
  const n = Math.max(0, strength);
  return {
    renown: n * Math.max(0, c.rewardRenownPer),
    genes: Math.max(0, c.rewardGenes),
    materials: Math.floor((n * Math.max(0, c.rewardMaterialsPm)) / 1000),
  };
}

/** 보상이 하나도 없나 */
export function isEmptyReward(reward: WaveReward): boolean {
  return reward.renown === 0 && reward.genes === 0 && reward.materials === 0;
}
