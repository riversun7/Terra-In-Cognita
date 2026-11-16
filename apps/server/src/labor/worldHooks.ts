// 노동 계약 서비스의 월드 고리 묶음(world/world.ts 1,000줄 상한 — 한 줄로 넘긴다): 신전(비활성·생산 버프)과 NPC 세력 성향(D-573 2045 NPC 소유자 판단).
import type { Traits } from "@terra/sim";

/** 고리가 읽는 월드 몫(부를 때마다 읽는다 — 신전·NPC 런타임은 세계가 준비된 뒤에 생긴다) */
export interface LaborWorldParts {
  readonly temple?:
    | { isAway(unitId: number): boolean; buildingProductionPm(buildingId: number): number }
    | undefined;
  readonly npc?:
    | {
        readonly world: {
          readonly factions: ReadonlyMap<
            number,
            { readonly traits: Traits; readonly player?: true | undefined }
          >;
        };
      }
    | undefined;
}

export function laborWorldHooks(parts: () => LaborWorldParts): {
  unitAway: (unitId: number) => boolean;
  outputBonusPm: (buildingId: number) => number;
  npcTraits: (ownerId: number) => Traits | undefined;
} {
  return {
    unitAway: (unitId) => parts().temple?.isAway(unitId) ?? false,
    outputBonusPm: (buildingId) => parts().temple?.buildingProductionPm(buildingId) ?? 0,
    // NPC 세력(가문 아닌 NPC 주체)만 성향이 있다 — 플레이어 가문(player)은 처리할 일로 손으로 정한다
    npcTraits: (ownerId) => {
      const faction = parts().npc?.world.factions.get(ownerId);
      return faction && faction.player !== true ? faction.traits : undefined;
    },
  };
}
