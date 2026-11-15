// 서버 채집 오브젝트 종류 → NPC 채집 티어 규칙의 입력(기획 D-562 1562 "npc도 스탯티어 따른다" — @terra/shared/npcGatherTiers).
// NPC 도시 경제(시뮬 경제 목록 gatherObjects)와 화면(낚시터 물 종류 범위 — 유닛 추천·사이보그 판·생산 편집기)이 같은 오브젝트에서 끌어낸다.
import {
  type NpcFacilityTiers,
  type NpcObjectSource,
  npcFishRanges,
  npcGatherTiersOf,
} from "@terra/shared/npcGatherTiers";
import type { FishTierRanges } from "@terra/shared/fishWater";
import type { GatherKind } from "./kinds.ts";

/** 오브젝트 종류 → 규칙 입력(팩 차례 그대로) */
export function npcObjectSourcesOf(kinds: readonly GatherKind[]): NpcObjectSource[] {
  return kinds.map((kind) => ({
    source: kind.source,
    facility: kind.facility,
    item: kind.item,
    table: (kind.table?.length ?? 0) > 0,
    ...(kind.tierRange ? { tierRange: kind.tierRange } : {}),
    ...(kind.itemWeights ? { itemWeights: kind.itemWeights } : {}),
    ...(kind.waters ? { waters: kind.waters } : {}),
    ...(kind.source === "school" && kind.biomes
      ? { biomes: [...kind.biomes].map(([biome, amount]) => ({ biome, amount })) }
      : {}),
  }));
}

/** 오브젝트 종류 → 시설마다 NPC 규칙(itemTier = 아이템 티어) */
export function npcTiersOfKinds(
  kinds: readonly GatherKind[],
  itemTier: (item: string) => number | undefined,
): Map<string, NpcFacilityTiers> {
  return npcGatherTiersOf(npcObjectSourcesOf(kinds), itemTier);
}

/** 화면용 낚시터 물 종류마다 범위(아래 0 · 위 = 그 물 오브젝트 묶음 위 끝). 물 오브젝트가 없으면 undefined */
export function fishRangesOfKinds(
  kinds: readonly GatherKind[],
  itemTier: (item: string) => number | undefined,
): FishTierRanges | undefined {
  return npcFishRanges(npcTiersOfKinds(kinds, itemTier));
}
