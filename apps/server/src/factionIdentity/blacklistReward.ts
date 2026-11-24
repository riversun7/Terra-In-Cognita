// 블랙리스트 사냥 보상(ADR 2026-11-25-house-city-approval-and-blacklist.md):
// - 세계 전투 결과 적용(battleApply.onApplied — 결과 기록과 같은 커밋, 동기) 안에서 승자가 블랙리스트에 오른 유저의 유닛을
//   격파(귀환·포로)했을 때 보상을 지급한다.
// - 현상금: 해당 나라 국고에 있는 만큼(새 화폐를 만들지 않는다) 승자 지갑으로 이체(ledger.post kind = "blacklist_bounty").
// - 기여도: 승자의 해당 나라 명성(cyborgs.addRenown)을 더하고, 승자가 가문에 속해 있으면 가문 기여도(house_members.contribution)를 비동기 DB 갱신.
import type { BattleInit } from "@terra/sim";
import type { CyborgService } from "../cyborg/service.ts";
import type { Ledger } from "../economy/ledger.ts";
import type { BattleOutcome } from "../world/battles.ts";
import type { UnitOwnerMap } from "../world/defenseRenown.ts";
import { moneyOf } from "../world/money.ts";
import type { OwnerRow, QueryPool } from "../world/persist/load.ts";
import { blacklistTableOf } from "./blacklist.ts";

export interface BlacklistRewardParts {
  readonly maps: ReadonlyMap<number, UnitOwnerMap>;
  readonly owners: ReadonlyMap<number, Pick<OwnerRow, "id" | "userId" | "factionId">>;
  readonly cyborgs: Pick<CyborgService, "addRenown">;
  readonly ledger: Pick<Ledger, "balanceOf" | "ownerAccount" | "post">;
  readonly pool?: QueryPool | undefined;
  readonly log?: { error(obj: object, message: string): void } | undefined;
}

/** 유닛 주인 소유 주체(띄운 2차맵 어딘가) */
function ownerOfUnit(maps: ReadonlyMap<number, UnitOwnerMap>, unitId: number): number | undefined {
  for (const map of maps.values()) {
    const info = map.unitInfo(unitId);
    if (info) return info.ownerId;
  }
  return undefined;
}

/** 세력 행 ID → 국고 소유 주체 ID */
function treasuryOwnerOf(
  owners: ReadonlyMap<number, Pick<OwnerRow, "id" | "factionId">>,
  nationId: number,
): number | undefined {
  for (const owner of owners.values()) if (owner.factionId === nationId) return owner.id;
  return undefined;
}

/** 결과 적용 때 부를 함수: 보상을 지급한 블랙리스트 항목 수 */
export function blacklistReward(parts: BlacklistRewardParts): (
  init: Pick<BattleInit, "seed">,
  outcome: {
    readonly result: Pick<BattleOutcome["result"], "winner">;
    readonly units: readonly Pick<BattleOutcome["units"][number], "unit" | "side" | "outcome">[];
  },
  atMs: number,
) => number {
  return (init, outcome, atMs) => {
    const table = blacklistTableOf(parts.ledger);
    if (!table) return 0;
    const winnerSide = outcome.result.winner;
    if (winnerSide === null || winnerSide === undefined) return 0;

    // 격파된 패자 측 플레이어 사용자(귀환·포로)와 끝까지 싸운 승자 측 플레이어 사용자(userId → ownerId)
    const defeatedUsers = new Set<string>();
    const winnerOwners = new Map<string, number>();
    for (const unit of outcome.units) {
      const ownerId = ownerOfUnit(parts.maps, unit.unit);
      const userId = ownerId === undefined ? null : (parts.owners.get(ownerId)?.userId ?? null);
      if (!userId || ownerId === undefined) continue;
      if (unit.side === winnerSide) {
        if (unit.outcome !== "retreated") winnerOwners.set(userId, ownerId);
      } else if (unit.outcome === "returned" || unit.outcome === "prisoner") {
        defeatedUsers.add(userId);
      }
    }
    if (defeatedUsers.size === 0 || winnerOwners.size === 0) return 0;

    let rewarded = 0;
    for (const defeatedUserId of [...defeatedUsers].toSorted()) {
      const entries = table.entriesForUser(defeatedUserId);
      if (entries.length === 0) continue;
      // 자기 자신 사냥 제외
      const winners = [...winnerOwners.entries()]
        .filter(([userId]) => userId !== defeatedUserId)
        .toSorted(([a], [b]) => a.localeCompare(b));
      if (winners.length === 0) continue;

      for (const entry of entries) {
        let paidAny = false;
        // 1) 현상금 지급: 그 나라 국고에 있는 만큼 승자들에게 균등 분배
        if (entry.bounty > 0n) {
          const treasury = treasuryOwnerOf(parts.owners, entry.nationId);
          if (treasury !== undefined) {
            const asset = moneyOf(parts.ledger, treasury);
            const available = parts.ledger.balanceOf(treasury, asset);
            const totalPay = entry.bounty < available ? entry.bounty : available;
            if (totalPay > 0n) {
              const count = BigInt(winners.length);
              const share = totalPay / count;
              const rem = totalPay % count;
              const txEntries: { account: number; amount: bigint }[] = [
                { account: parts.ledger.ownerAccount(treasury, asset), amount: -totalPay },
              ];
              for (let i = 0; i < winners.length; i++) {
                const winner = winners[i];
                if (!winner) continue;
                const amount = share + (i === 0 ? rem : 0n);
                if (amount > 0n) {
                  txEntries.push({ account: parts.ledger.ownerAccount(winner[1], asset), amount });
                }
              }
              if (txEntries.length > 1) {
                parts.ledger.post({
                  kind: "blacklist_bounty",
                  atMs,
                  key: `blacklist_bounty:${entry.nationId}:${defeatedUserId}:${atMs}:${init.seed}`,
                  entries: txEntries,
                });
                paidAny = true;
              }
            }
          }
        }
        // 2) 국가 명성 및 가문 기여도 지급
        if (entry.renownReward > 0) {
          const winnerIds: string[] = [];
          for (const [winnerUserId] of winners) {
            if (
              parts.cyborgs.addRenown(winnerUserId, entry.nationId, entry.renownReward, atMs) !== undefined
            ) {
              winnerIds.push(winnerUserId);
              paidAny = true;
            }
          }
          if (winnerIds.length > 0 && parts.pool) {
            void parts.pool
              .query(
                "update house_members set contribution = contribution + $1::bigint where user_id = any($2::uuid[])",
                [String(entry.renownReward), winnerIds],
              )
              .catch((error: unknown) =>
                parts.log?.error({ err: error }, "blacklist house contribution update failed"),
              );
          }
        }
        if (paidAny) rewarded += 1;
      }
    }
    return rewarded;
  };
}
