// 막아 낸 정원사 도시 웨이브의 보상(서버) — 기획 D-499(종류·양은 개발자·운영 페이지에서 관리), D-500(보호 레이드는 보상 없음),
// docs/adr/2026-11-01-gardener-r5b.md "바뀜 (2026-11-07, 정원사 2)".
// 양은 @terra/sim waveReward(설정 칸 d499_reward_*), 무엇을 주는지는 팩 데이터다(아이템 편집기에서 고친다):
// - 유전자 조각: gene.drops에 "wave"가 있는 켜진 아이템(@terra/sim waveGeneDrops) — 조각마다 reward.genes개.
// - 크리쳐 재료: 중분류 creature_material의 켜진 아이템 — 재료마다 reward.materials개(지금 팩에는 없다 → 주지 않는다).
// 받는 쪽 = 그 도시 주인 세력의 소유 주체 장부 계정(쌓이는 물자, 시스템 발행 계정에서 나온다 — 유전자 사망 조각과 같은 길).
// 명성(renown)은 정원사 상태(npc_society.gardener)에 세력마다 쌓는다. 장비·포획은 그 층이 생기면 더한다(확인 대기).
import type { ItemEntry } from "@terra/content";
import { type WaveReward, waveGeneDrops } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import { geneItemsOf, issueGoods } from "../fusion/genes.ts";

/** 웨이브 보상 크리쳐 재료의 중분류(팩 item_subcategories ID) */
export const WAVE_MATERIAL_SUBCATEGORY = "creature_material";

export interface WaveRewardItems {
  readonly genes: readonly string[];
  readonly materials: readonly string[];
}

/** 팩 아이템 → 웨이브 보상 아이템(아이템 ID 차례) */
export function waveRewardItemsOf(items: readonly ItemEntry[]): WaveRewardItems {
  return {
    genes: waveGeneDrops(geneItemsOf(items)),
    materials: items
      .filter((item) => item.enabled && item.subcategory?.id === WAVE_MATERIAL_SUBCATEGORY)
      .map((item) => item.id)
      .toSorted(),
  };
}

export interface GrantedItem {
  readonly item: string;
  readonly quantity: number;
}

/** 보상 아이템을 그 소유 주체 장부에 낸다(한 아이템 = 한 거래). 준 것 목록(아이템 ID 차례) */
export function grantWaveReward(
  ledger: Ledger,
  ownerId: number,
  reward: WaveReward,
  items: WaveRewardItems,
  atMs: number,
): GrantedItem[] {
  const granted: GrantedItem[] = [];
  const give = (item: string, quantity: number): void => {
    if (quantity <= 0) return;
    issueGoods(ledger, ownerId, item, BigInt(quantity), atMs, "wave_reward");
    granted.push({ item, quantity });
  };
  for (const item of items.genes) give(item, reward.genes);
  for (const item of items.materials) give(item, reward.materials);
  return granted.toSorted((a, b) => (a.item < b.item ? -1 : a.item > b.item ? 1 : 0));
}

/** gardener_waves.reward(jsonb 글자): 양과 준 아이템 */
export function rewardRecordOf(reward: WaveReward, granted: readonly GrantedItem[]): string {
  return JSON.stringify({
    renown: reward.renown,
    genes: reward.genes,
    materials: reward.materials,
    items: granted.map((entry) => [entry.item, entry.quantity]),
  });
}
