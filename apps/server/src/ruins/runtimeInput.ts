// 월드 → NPC 사회 런타임의 폐허 2 고리(npc/ruinsRuntime.ts NpcRuinsInput) — docs/adr/2026-11-07-ruins-restoration.md "바뀜 (기획 답 480~489,
// 472, 535)". world.ts가 런타임을 켤 때 한 줄로 넘긴다.
// - 정부 건물 상태·도시 행정 건물 레벨 = 폐허 서비스(건물 시설 줄), 수호신 = 신전 서비스(부를 때마다 읽는다 — 서비스가 늦게 생겨도 된다).
// - 유저 나라(535): 소유 주체가 유저면 그 사이보그의 나라(세력 행 → 그 세력의 소유 주체), 세력 주체면 그 자신.
import type { CyborgService } from "../cyborg/service.ts";
import type { NpcRuinsInput } from "../npc/ruinsRuntime.ts";
import type { TempleService } from "../temple/service.ts";
import type { OwnerRow } from "../world/persist/load.ts";
import type { RuinService } from "./service.ts";

export function npcRuinsInputOf(o: {
  readonly ruins: () => RuinService | undefined;
  readonly temple: () => TempleService | undefined;
  readonly cyborgs: CyborgService;
  readonly owners: ReadonlyMap<number, OwnerRow>;
  readonly now: () => number;
}): NpcRuinsInput {
  /** 세력 행 ID → 그 세력의 소유 주체 ID */
  const ownerOfFactionRow = (rowId: number): number | undefined => {
    for (const owner of o.owners.values()) if (owner.factionId === rowId) return owner.id;
    return undefined;
  };
  return {
    government: (buildingId) => o.ruins()?.governmentStatus(buildingId) ?? { state: "down", level: 0 },
    governmentLevels: () => o.ruins()?.governmentLevels() ?? new Map(),
    hasGuardians: (cityId) => o.temple()?.hasFightingGuardian(cityId, o.now()) ?? false,
    nationOf(ownerId) {
      const owner = o.owners.get(ownerId);
      if (!owner) return undefined;
      if (owner.factionId !== null) return ownerId;
      const record = owner.userId ? o.cyborgs.record(owner.userId) : undefined;
      return record ? ownerOfFactionRow(record.factionId) : undefined;
    },
  };
}
