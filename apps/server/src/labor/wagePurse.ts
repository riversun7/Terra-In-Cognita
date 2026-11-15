// 임금을 받는 곳(기획 D-097 "경제활동시 화폐는 휴먼의 사유재산"·D-127 "재산은 휴먼만", D-564 1631 — 기존 결정으로 답함).
// 임금형 계약의 임금(labor_wage)은 일한 휴먼의 유닛 지갑(@terra/shared/businessBooks unitPurseLocation — 숙박비를 내는 그 지갑, D-555 1508)으로
// 간다. 크리쳐·안드로이드 등 재산이 없는 유닛의 노동 보상은 소유자가 받는다(D-127) → 유닛 소유 주체 지갑(예전 길).
// - 재산을 갖는 유닛 종류: 휴먼(4), 사이보그 유닛(5 — 바탕 휴먼의 유닛 ID를 그대로 쓰는 융합 휴먼, Assumed 휴먼으로 침 — 질문 1782),
//   NPC 휴먼 봇(0 — D-097 해석 "NPC 세력의 휴먼도 같은 규칙"). 사이보그 본체(3)는 플레이어 자신이라 플레이어 지갑이다.
// - 유닛을 찾지 못하면(사라진 유닛의 마지막 정산) 소유 주체 지갑으로 간다(돈이 사라지지 않는다).
// - 유닛 지갑 돈은 유닛 것이다: 숙박비 등 유닛이 쓰는 돈은 여기서 나간다. 주인이 꺼내 쓰는 길은 두지 않는다(D-097).
import type { LaborContract } from "@terra/sim";
import { unitPurseLocation } from "@terra/shared/businessBooks";
import type { Ledger } from "../economy/ledger.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { UNIT_KIND_BOT, UNIT_KIND_CYBORG_UNIT, UNIT_KIND_HUMAN } from "../world/unitKinds.ts";

/** 사유재산(유닛 지갑)을 갖는 유닛 종류(D-097·D-127) */
export const PROPERTY_UNIT_KINDS: ReadonlySet<number> = new Set([
  UNIT_KIND_HUMAN,
  UNIT_KIND_CYBORG_UNIT,
  UNIT_KIND_BOT,
]);

/** 그 유닛의 종류(없으면 undefined) */
function unitKindOf(maps: ReadonlyMap<number, SecondMap>, unitId: number): number | undefined {
  for (const map of maps.values()) {
    const info = map.unitInfo(unitId);
    if (info) return info.kind;
  }
  return undefined;
}

/**
 * 임금형 계약의 임금 받는 계정(laborAccounts workerWallet): 재산을 갖는 유닛이면 그 유닛 지갑, 아니면 유닛 소유 주체 지갑.
 */
export function wageWalletOf(
  ledger: Pick<Ledger, "ownerAccount">,
  maps: ReadonlyMap<number, SecondMap>,
): (contract: LaborContract) => number {
  return (c) => {
    const kind = unitKindOf(maps, c.unitId);
    return kind !== undefined && PROPERTY_UNIT_KINDS.has(kind)
      ? ledger.ownerAccount(c.workerOwnerId, c.asset, unitPurseLocation(c.unitId))
      : ledger.ownerAccount(c.workerOwnerId, c.asset);
  };
}
