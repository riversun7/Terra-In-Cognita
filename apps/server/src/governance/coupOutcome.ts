// 쿠데타 결과 셈(coup.ts에서 떼었다 — 줄 수): 이긴 쿠데타의 도시 떼기(seize — D-585·D-588, 2542)와 결과·보상(settle — 줄기 no-teleport-a: 보상 = 병력이
// 쿠데타 세계 전투에 실제로 든 참가자만, D-591·2455). 참가 줄의 병력(unitsOf)도 여기 둔다.
import type { CoupDeps } from "./coup.ts";
import type { CoupRow, CoupSideRow } from "./coupStore.ts";
import type { GovernanceNation } from "./port.ts";

export function createCoupOutcome(d: CoupDeps) {
  /** 쿠데타가 차지할 도시 = 싸운 도시(D-588 2492 가 — 시작 도시·수도도, 2542). 옛 나라 도시가 아니거나 모르면 undefined */
  const seizedCityOf = (coup: CoupRow, nation: GovernanceNation): number | undefined => {
    const city = coup.cityId ?? d.port.capitalOf(nation);
    return city !== undefined && nation.cities.includes(city) ? city : undefined;
  };

  /** 이긴 쿠데타: 싸운 도시만 새 독재 나라로(D-585·D-588, 2542 — 옛 나라 전체는 없다). 새 나라 소유 주체 ID(못 떼면 undefined) */
  const seize = async (
    coup: CoupRow,
    nation: GovernanceNation,
    nowMs: number,
    result: Record<string, unknown>,
  ): Promise<number | undefined> => {
    const rules = d.rules();
    const city = seizedCityOf(coup, nation);
    const child = city === undefined ? undefined : await d.port.cityIndependence(nation, city, nowMs, true);
    const target = child === undefined ? undefined : d.port.nation(child);
    result.city = city ?? null;
    result.newNationId = target?.rowId ?? null;
    if (!target) {
      result.seized = "0";
      result.reason = "no_split";
      return undefined;
    }
    await d.store.saveState(
      {
        nationId: target.rowId,
        rulingHouseKey: coup.houseKey,
        electedAtMs: nowMs,
        termEndsAtMs: null,
        shareVotesSuspended: false,
        vacantSinceMs: null,
        npcHeadUnit: null,
      },
      nowMs,
    );
    if (target.regime !== "dictatorship") d.port.setRegime(target, "dictatorship");
    const seized = d.port.confiscateToHouse(target, coup.houseKey, nowMs);
    await d.coups.saveShareHouse(
      { nationId: target.rowId, houseKey: coup.houseKey, treasuryKept: false },
      nowMs,
    );
    d.port.dropSatisfaction(d.port.nationUnits(target), rules.coupSatisfactionDrop);
    if (!target.playerHouse) d.port.applyRuling(target, coup.houseKey);
    result.seized = seized.toString();
    return target.ownerId;
  };

  /** 참가 줄의 병력(보낸 것 — 도착 여부는 here): 플레이어 = 보낸 유닛 가운데 아직 그 사람 것(옛 줄은 그 사람 유닛 모두), NPC 가문 = 가문원 */
  const unitsOf = (nation: GovernanceNation, row: CoupSideRow): readonly number[] => {
    if (row.joinerKey.startsWith("u:")) {
      const owned = d.port.userTroops(row.joinerKey.slice(2)).map((troop) => troop.id);
      if (row.units === null || row.units === undefined) return owned;
      const still = new Set(owned);
      return row.units.filter((id) => still.has(id));
    }
    return row.joinerKey.startsWith("n:")
      ? d.port.houseUnits(nation, `n:${Number(row.joinerKey.slice(2))}`)
      : [];
  };

  /**
   * 쿠데타 결과(D-582·D-585·D-588): 이기면 싸운 도시만 새 독재 나라로, 지면 일으킨 가문 비용·만족도. 이긴 편 플레이어 참가자 보상(공훈 = 나라 명성, 신용 =
   * 새 나라 시작 가산) — 병력 없이 편만 든 사람·병력이 전투에 들지 못한 사람은 받지 않는다(2455, D-591). fought = 전투에 든 유닛
   */
  const settle = async (
    coup: CoupRow,
    nation: GovernanceNation,
    won: boolean,
    fought: ReadonlySet<number>,
    nowMs: number,
    result: Record<string, unknown>,
  ): Promise<void> => {
    const rules = d.rules();
    const sides = await d.coups.sides(coup.id);
    result.rebels = sides.filter((row) => row.side === "rebel").map((row) => row.joinerKey);
    result.government = sides.filter((row) => row.side === "government").map((row) => row.joinerKey);
    let newNationOwner: number | undefined;
    if (won) newNationOwner = await seize(coup, nation, nowMs, result);
    else {
      const paid = d.port.payCoupCost(nation, coup.houseKey, rules.coupFailCost, nowMs);
      d.port.dropSatisfaction(d.port.houseUnits(nation, coup.houseKey), rules.coupFailSatisfactionDrop);
      result.paid = paid.toString();
    }
    const winners = sides.filter(
      (row) =>
        row.side === (won ? "rebel" : "government") &&
        row.userId !== null &&
        unitsOf(nation, row).some((id) => fought.has(id)),
    );
    for (const row of winners) {
      if (row.userId === null) continue;
      d.port.addRenown(row.userId, nation.rowId, rules.coupMeritRenown, nowMs);
      if (rules.coupCreditReward > 0)
        d.credit?.won(row.userId, won ? newNationOwner : undefined, rules.coupCreditReward, nowMs);
    }
    result.rewarded = winners.length;
    await d.coups.finishCoup(coup.id, won ? "won" : "lost", result, nowMs);
    await d.audit(coup.userId, won ? "governance.coup_won" : "governance.coup_lost", {
      nationId: nation.rowId,
      coupId: coup.id,
      house: coup.houseKey,
      ...result,
    });
  };

  return { seize, settle, unitsOf };
}
