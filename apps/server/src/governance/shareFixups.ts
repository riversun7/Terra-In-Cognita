// 지배 가문 반영·도시 지분 정리(의결 틱마다, 멱등) — 줄기 governance-2. docs/adr/2026-11-21-governance.md "바뀜 (governance-2)".
// 1. 지배 가문 반영(질문 2406 — 기획 대조): 의결이 정한 지배 가문(선출 기록·빈자리)을 NPC 런타임(npc/cityHouses.ts setRuling)에 알린다 → 지배 가문 금고(D-338)·
//    정부 판 지도자·지도 한눈 정보·랭킹 지도자 자산이 따른다. 플레이어 가문 나라는 그 가문 자신이라 알리지 않는다.
// 2. 독재 나라(D-338 "독재 나라 도시의 주식 1000주 = 지배 가문 계정 소유", "국고" 대안 기각): 국고가 가진 도시 지분을 지배 가문 계정으로 옮긴다(틱마다 — 새 도시
//    발행·점령 재발행이 국고에 넣은 몫도 옮긴다). NAS 옛 세계는 배포 뒤 첫 틱에 모든 독재 나라 도시의 국고 지분이 옮겨진다. 감사 기록 governance.shares_to_house.
// 3. 자본주의 NPC 나라 처음 지분(기획 D-582 — D-575 세운 가문 원칙을 넓힘): 도시 지분은 그 도시를 처음 세운 NPC 가문(그 도시에서 먼저 세운 가문), 수도는 지배 가문.
//    도시마다 한 번만 옮긴다(governance_share_fixups) — 그 뒤 국고에 생긴 지분(점령 몰수 D-298·재발행 D-444)은 국고 몫이라 그대로 둔다. 가문이 아직 없는 도시는
//    가문이 생긴 뒤 틱에 옮긴다. NAS 옛 세계는 배포 뒤 첫 틱에 국고가 가진 지분을 모두 옮긴다(처음 지분과 몰수 지분을 가를 기록이 없다 — 질문 2435).
// 민주주의 나라·플레이어 가문 나라의 자본주의 지분은 그대로다.
// 바뀜(governance-3 — 질문 2432 나 답, 2432 (다) 답 D-583): 독재 나라는 지배 쪽 지분을 가진 가문을 기록한다(governance_share_houses). 지배 가문이 바뀌면(수도
// 이전으로 처음 규칙 가문이 바뀜 — D-574 10 "새 수도의 첫 가문", 쿠데타는 coup.ts가 바로 적는다) 옛 지배 가문 계정의 그 나라 도시 지분을 새 지배 가문으로 옮긴다
// (D-580 6·D-582·D-344 "과반수이상을 유지", 감사 기록 governance.shares_follow_ruler) [임시: 옛 가문의 다른 몫(자본주의 때 세운 가문 몫)과 가르지 않고 모두 옮긴다].
// 지분 과반을 사서 독재가 된 나라(treasury_kept — 체제 전환 집행이 적는다)는 국고 지분을 국고에 남긴다(배당은 받고 의결권은 없다 — D-583). 독재가 아닌
// 나라의 기록은 지운다(다음에 독재가 되면 그때 지배 가문부터 센다). 선출(민주주의·자본주의)로 지배 가문이 바뀔 때는 지배 쪽 지분이 따로 없어 옮기지 않는다.
import type { HouseKey } from "@terra/shared/governance";
import type { CoupStore, ShareHouseRow } from "./coupStore.ts";
import type { ElectorateTools } from "./electorate.ts";
import type { GovernanceNation, GovernancePort } from "./port.ts";
import type { GovernanceStore, StateRow } from "./store.ts";

export interface ShareFixupDeps {
  readonly port: Pick<
    GovernancePort,
    "applyRuling" | "moveTreasuryShares" | "founderOf" | "capitalOf" | "moveHouseShares"
  >;
  readonly store: Pick<GovernanceStore, "fixedCities" | "markFixed">;
  readonly coups: Pick<CoupStore, "shareHouses" | "saveShareHouse">;
  readonly tools: Pick<ElectorateTools, "ruling">;
  readonly audit: (action: string, after: Record<string, unknown>) => Promise<void>;
}

const sharesRow = (rows: readonly { readonly cityId: number; readonly amount: bigint }[]) =>
  rows.map((row) => ({ cityId: row.cityId, shares: row.amount.toString() }));

/** 지배 가문을 NPC 런타임에 알린다(위 1) */
export function applyRulings(
  port: Pick<GovernancePort, "applyRuling">,
  nations: Iterable<GovernanceNation>,
  states: ReadonlyMap<number, StateRow>,
): void {
  for (const nation of nations) {
    if (nation.playerHouse) continue;
    const state = states.get(nation.rowId);
    port.applyRuling(
      nation,
      state && state.vacantSinceMs !== null ? "vacant" : (state?.rulingHouseKey ?? null),
    );
  }
}

/** 독재 나라 한 곳의 국고 지분 → 지배 가문 계정(위 2)·지배 가문이 바뀌면 옛 지배 가문 지분도(바뀜 governance-3). 국고에서 옮긴 주 수 합 */
export async function dictatorshipShares(
  d: ShareFixupDeps,
  nation: GovernanceNation,
  ruling: HouseKey | null,
  nowMs: number,
  record?: ShareHouseRow,
): Promise<bigint> {
  if (ruling === null) return 0n;
  const kept = record?.treasuryKept === true;
  if (record?.houseKey && record.houseKey !== ruling) {
    const followed = d.port.moveHouseShares(nation, record.houseKey, ruling, nowMs);
    if (followed > 0n)
      await d.audit("governance.shares_follow_ruler", {
        nationId: nation.rowId,
        from: record.houseKey,
        to: ruling,
        shares: followed.toString(),
      });
  }
  if (record?.houseKey !== ruling)
    await d.coups.saveShareHouse({ nationId: nation.rowId, houseKey: ruling, treasuryKept: kept }, nowMs);
  // 지분 과반을 사서 독재가 된 나라는 국고 지분을 국고에 남긴다(D-583)
  if (kept) return 0n;
  const moved = d.port.moveTreasuryShares(nation, nation.cities, ruling, nowMs);
  const total = moved.reduce((sum, row) => sum + row.amount, 0n);
  if (total > 0n)
    await d.audit("governance.shares_to_house", {
      nationId: nation.rowId,
      house: ruling,
      reason: "dictatorship",
      cities: sharesRow(moved),
    });
  return total;
}

/** 위 2·3을 모든 나라에 */
export async function runShareFixups(
  d: ShareFixupDeps,
  nations: Iterable<GovernanceNation>,
  states: ReadonlyMap<number, StateRow>,
  nowMs: number,
): Promise<void> {
  let fixed: Set<number> | undefined;
  const records = await d.coups.shareHouses();
  for (const nation of nations) {
    const record = records.get(nation.rowId);
    // 독재가 아니면 지배 쪽 지분 가문 기록을 지운다(위 바뀜 governance-3)
    if (nation.regime !== "dictatorship" && record && (record.houseKey !== null || record.treasuryKept))
      await d.coups.saveShareHouse({ nationId: nation.rowId, houseKey: null, treasuryKept: false }, nowMs);
    if (nation.regime === "democracy") continue;
    const ruling = (await d.tools.ruling(nation, states.get(nation.rowId))).key;
    if (nation.regime === "dictatorship") {
      await dictatorshipShares(d, nation, ruling, nowMs, record);
      continue;
    }
    if (nation.playerHouse) continue;
    fixed ??= await d.store.fixedCities();
    const capital = d.port.capitalOf(nation);
    const moved: { cityId: number; amount: bigint; house: HouseKey }[] = [];
    for (const cityId of nation.cities) {
      if (fixed.has(cityId)) continue;
      const founder = d.port.founderOf(cityId);
      const target: HouseKey | null =
        cityId === capital ? ruling : founder === undefined ? null : `n:${founder}`;
      if (target === null) continue;
      const rows = d.port.moveTreasuryShares(nation, [cityId], target, nowMs);
      const amount = rows.reduce((sum, row) => sum + row.amount, 0n);
      await d.store.markFixed(cityId, target, amount, nowMs);
      fixed.add(cityId);
      if (amount > 0n) moved.push({ cityId, amount, house: target });
    }
    if (moved.length > 0)
      await d.audit("governance.shares_to_house", {
        nationId: nation.rowId,
        reason: "capitalism_founders",
        cities: moved.map((row) => ({ cityId: row.cityId, house: row.house, shares: row.amount.toString() })),
      });
  }
}
