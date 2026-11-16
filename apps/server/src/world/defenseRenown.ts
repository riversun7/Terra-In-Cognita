// 방어 명성(서버) — 기획 D-326("명성은 납품·방어·의뢰로 그 나라에서 쌓는다. 나라마다 따로다"), D-571(답 1961 "D-326 작위 6단계" — 지휘관
// 정원이 작위를 읽는다). 세계 전투가 끝나 결과를 적용할 때(battleApply.ts onApplied — 결과 기록과 같은 커밋) 수비 편이 이겼으면, 그 편에서
// 끝까지 싸운(퇴각하지 않은) 유닛의 주인 사용자마다 한 번, 지킨 편 세력의 나라 명성을 설정 칸 d326_renown_defense만큼 더한다.
// - 지킨 나라 = 수비 편 faction 칸(소유 주체 ID, battleResults.ts 머리 주석)의 세력. 세력이 없는 주체(유저 개인 땅)면 주지 않는다.
// - 사용자 = 유닛 주인 소유 주체의 user_id(사이보그 본체·유저 휴먼 모두). 사이보그가 없는 사용자는 건너뛴다.
// - 납품·의뢰는 그 기능이 생기면 같은 addRenown으로 더한다(질문 2102). 정원사 웨이브 수비 승리도 세계 전투라 같은 길이다.
import type { BattleInit, RenownCoefficients } from "@terra/sim";
import type { CyborgService } from "../cyborg/service.ts";
import type { BattleOutcome } from "./battles.ts";
import type { OwnerRow } from "./persist/load.ts";

/** 2차맵에서 유닛 주인만 읽는다(SecondMap이 맞는다) */
export interface UnitOwnerMap {
  unitInfo(unitId: number): { readonly ownerId: number } | undefined;
}

export interface DefenseRenownParts {
  readonly maps: ReadonlyMap<number, UnitOwnerMap>;
  readonly owners: ReadonlyMap<number, Pick<OwnerRow, "userId" | "factionId">>;
  readonly cyborgs: Pick<CyborgService, "addRenown">;
  readonly rules: () => { readonly renown: Pick<RenownCoefficients, "defenseRenown"> };
}

/** 유닛 주인 소유 주체(띄운 2차맵 어딘가) */
function ownerOfUnit(maps: ReadonlyMap<number, UnitOwnerMap>, unitId: number): number | undefined {
  for (const map of maps.values()) {
    const info = map.unitInfo(unitId);
    if (info) return info.ownerId;
  }
  return undefined;
}

/** 결과 적용 때 부를 함수: 명성을 받은 사용자 수 */
export function defenseRenown(
  parts: DefenseRenownParts,
): (init: BattleInit, outcome: BattleOutcome, atMs: number) => number {
  return (init, outcome, atMs) => {
    const side = init.sides.find((entry) => entry.id === outcome.result.winner);
    if (!side?.defender) return 0;
    const nation = parts.owners.get(side.faction)?.factionId;
    const amount = Math.trunc(parts.rules().renown.defenseRenown);
    if (nation === null || nation === undefined || amount <= 0) return 0;
    const users = new Set<string>();
    for (const unit of outcome.units) {
      if (unit.side !== side.id || unit.outcome === "retreated") continue;
      const owner = ownerOfUnit(parts.maps, unit.unit);
      const userId = owner === undefined ? null : parts.owners.get(owner)?.userId;
      if (userId) users.add(userId);
    }
    let granted = 0;
    for (const userId of [...users].toSorted())
      if (parts.cyborgs.addRenown(userId, nation, amount, atMs) !== undefined) granted += 1;
    return granted;
  };
}
