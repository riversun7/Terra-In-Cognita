// 월드 → NPC 사회 런타임의 폐허 2 고리(npc/ruinsRuntime.ts NpcRuinsInput) — docs/adr/2026-11-07-ruins-restoration.md "바뀜 (기획 답 480~489,
// 472, 535)". world.ts가 런타임을 켤 때 한 줄로 넘긴다.
// - 정부 건물 상태·도시 행정 건물 레벨 = 폐허 서비스(건물 시설 줄), 수호신 = 신전 서비스(부를 때마다 읽는다 — 서비스가 늦게 생겨도 된다).
// - 유저 나라(535): 소유 주체가 유저면 그 사이보그의 나라(세력 행 → 그 세력의 소유 주체). 세력 주체는 없음(NPC 물건은 소각).
// - 그때 띄우기(npc-claim-3): 서버 NPC 알박기가 빈 2차맵을 띄운다(월드 저장 묶음 spawn — 부를 때마다 읽는다).
import type { CyborgService } from "../cyborg/service.ts";
import type { ClaimSpawner } from "../npc/npcClaims.ts";
import type { NpcRuinsInput } from "../npc/ruinsRuntime.ts";
import type { TempleService } from "../temple/service.ts";
import type { OwnerRow } from "../world/persist/load.ts";
import type { RuinService } from "./service.ts";

/** 월드 저장 묶음 가운데 이 고리가 읽는 것(WorldPersistence와 같은 모양) */
export interface RuinsInputSource {
  readonly ruins: RuinService;
  /** 그때 띄우기(서버 NPC 알박기가 빈 2차맵을 띄운다 — npc/npcClaims.ts). 없으면 띄운 2차맵만 */
  readonly spawn?: ClaimSpawner | undefined;
  readonly cyborgs: CyborgService;
  readonly fusion: { readonly temple: TempleService };
}

export function npcRuinsInputOf(
  source: () => RuinsInputSource | undefined,
  owners: ReadonlyMap<number, OwnerRow>,
  now: () => number,
): NpcRuinsInput {
  /** 세력 행 ID → 그 세력의 소유 주체 ID */
  const ownerOfFactionRow = (rowId: number): number | undefined => {
    for (const owner of owners.values()) if (owner.factionId === rowId) return owner.id;
    return undefined;
  };
  return {
    government: (buildingId) => source()?.ruins.governmentStatus(buildingId) ?? { state: "down", level: 0 },
    governmentLevels: () => source()?.ruins.governmentLevels() ?? new Map(),
    foundClaims: (nowMs) => source()?.ruins.foundClaims(nowMs) ?? 0,
    spawner: () => source()?.spawn,
    hasGuardians: (cityId) => source()?.fusion.temple.hasFightingGuardian(cityId, now()) ?? false,
    nationOf(ownerId) {
      const owner = owners.get(ownerId);
      if (!owner || owner.factionId !== null) return undefined;
      const record = owner.userId ? source()?.cyborgs.record(owner.userId) : undefined;
      return record && record.factionId !== null ? ownerOfFactionRow(record.factionId) : undefined;
    },
  };
}
