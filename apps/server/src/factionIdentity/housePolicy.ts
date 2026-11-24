// 가문 금고 기부·가문세율·도시 짓기 정책 명령(WebSocket house_donate·house_tax·house_build_policy → house_member_result, 프로토콜 54) —
// 기획 D-574(사용자 답 2026-11-16) 2150 나·2124 나, 기획 대조 2222 확정. docs/adr/2026-11-11-faction-identity.md "바뀜 (house-8, D-574)".
// - 기부(2150): 가문원(가문장 포함)이 자기 지갑의 돈(소속 국가 화폐, world/money.ts)을 가문 금고(houseVault.ts)로 넣는다. 지갑은 지금까지 정산한 뒤 본다(모자라면
//   insufficient_funds). 원장 거래 house_donate 하나. 바뀜(gov-fix-4 — D-591 2532 (1) 나): 넣은 양을 그 가문원 기여도(house_members.contribution)에 더한다
//   (계승 서열이 직위 다음에 본다).
// - 꺼내기(2222 → 사용자 D-576 "가문장이 개인 지갑으로"): 가문장만, 금고 잔고까지(넘으면 insufficient_funds). 원장 거래 house_vault_take. 넣기·꺼내기
//   모두 원장에 남고 가문원 모두에게 장부로 보인다(houseView.ts vaultLog). 해산 때 남은 금고 돈은 가문장 지갑으로(vaultToLeader — 기획 해석,
//   원장 거래 house_vault_dissolve).
// - 가문세율(2150): 가문장만 정한다(0~설정 칸 house_tax_max_pm ‰, 넘으면 tax_too_high). 표 house_policies, 떼기는 houseTax.ts.
// - 도시 짓기 정책(2124): 그 도시를 가진 가문의 가문장만(도시 이동 정책과 같은 사람 — houseEntryPolicy.ts ruledBy). city_policies.house_build
//   (null = 설정 칸 house_city_build_default). 판정은 facilities/landRule.ts.
// - 감사 기록: faction.house_donate·faction.house_tax·faction.house_build_policy.
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { moneyOf } from "../world/money.ts";
import type { HouseMovePersistence } from "./houseEntry.ts";
import { canSetCityJoinPolicy } from "./houseCityJoin.ts";
import { cityHome } from "./houseHome.ts";
import { ruledBy } from "./houseEntryPolicy.ts";
import { houseTaxerOf } from "./houseTax.ts";
import { vaultAccount, vaultBalance } from "./houseVault.ts";
import { type HouseMemberResult, type HouseTxPool, inTransaction, membershipOf } from "./members.ts";
import type { HouseRules } from "./rules.ts";

export interface HousePolicyService {
  /** 가문원이 지갑에서 가문 금고로 기부한다 */
  donate(userId: string, amount: bigint): Promise<HouseMemberResult>;
  /** 가문장이 금고에서 자기 지갑으로 꺼낸다(D-576) */
  take(userId: string, amount: bigint): Promise<HouseMemberResult>;
  /** 해산한 가문의 남은 금고 돈을 (옛) 가문장 지갑으로(D-576 — 기획 해석). 옮긴 양(세계 전이면 0 — 금고에 남는다) */
  vaultToLeader(userId: string, houseId: number): Promise<bigint>;
  /** 가문장이 가문세율(‰)을 정한다 */
  setTax(userId: string, ratePm: number): Promise<HouseMemberResult>;
  /** 도시를 가진 가문의 가문장이 같은 나라 다른 가문의 짓기를 정한다(null = 기본값) */
  setBuild(userId: string, cityId: number, allow: boolean | null): Promise<HouseMemberResult>;
  /** 시민이 아닌 외부인(적대 세력 제외)의 도시 건설 허용 정책 정하기(도시 주인 또는 국가 지도자 — ADR 2026-11-25) */
  setForeignBuild(userId: string, cityId: number, allow: boolean | null): Promise<HouseMemberResult>;
}

const fail = (code: Extract<HouseMemberResult, { ok: false }>["code"]): HouseMemberResult => ({
  ok: false,
  code,
});

export function createHousePolicy(o: {
  readonly pool: HouseTxPool;
  readonly db?: Database | undefined;
  readonly rules: () => HouseRules;
  readonly now: () => number;
  /** 세계 저장 층(원장 — 기부). 세계가 준비되기 전이면 undefined(기부는 busy) */
  readonly persistence: () => HouseMovePersistence | undefined;
}): HousePolicyService {
  const audit = async (userId: string, action: string, after: Record<string, unknown>): Promise<void> => {
    if (!o.db) return;
    await writeAudit(o.db, {
      actor: { kind: "user", id: userId, ip: null },
      action,
      targetId: userId,
      before: null,
      after,
    });
  };
  return {
    async donate(userId, amount) {
      if (amount <= 0n) return fail("internal_error");
      const mine = await membershipOf(o.pool, userId);
      if (!mine) return fail("not_in_house");
      const p = o.persistence();
      if (!p) return fail("busy");
      const owner = p.settlement.findOwnerOfUser(userId);
      if (owner === undefined) return fail("no_cyborg");
      const nowMs = o.now();
      p.settlement.settleOwner(owner, nowMs);
      // 넣는 사람의 돈(소속 국가 화폐)으로 넣는다 — 금고는 화폐마다 따로 쌓인다
      const asset = moneyOf(p.ledger, owner);
      if (p.ledger.balanceOf(owner, asset) < amount) return fail("insufficient_funds");
      p.ledger.post({
        kind: "house_donate",
        atMs: nowMs,
        key: `house_donate:${mine.factionId}:${owner}:${nowMs}`,
        entries: [
          { account: p.ledger.ownerAccount(owner, asset), amount: -amount },
          { account: vaultAccount(p.ledger, mine.factionId, asset), amount },
        ],
      });
      await p.writer.durable();
      // 기여도(계승 서열 — governance/succession.ts rankMembers, D-591 2532 (1) 나): 그 가문에 넣은 기부 합
      await o.pool.query(
        "update house_members set contribution = contribution + $3 where user_id = $1 and faction_id = $2",
        [userId, mine.factionId, amount.toString()],
      );
      await audit(userId, "faction.house_donate", { factionId: mine.factionId, amount: amount.toString() });
      return { ok: true, action: "donated", factionId: mine.factionId };
    },
    async take(userId, amount) {
      if (amount <= 0n) return fail("internal_error");
      const mine = await membershipOf(o.pool, userId);
      if (!mine) return fail("not_in_house");
      if (mine.role !== "leader") return fail("not_leader");
      const p = o.persistence();
      if (!p) return fail("busy");
      const owner = p.settlement.findOwnerOfUser(userId);
      if (owner === undefined) return fail("no_cyborg");
      // 받는 사람(가문장)의 돈으로 된 금고에서 꺼낸다
      const asset = moneyOf(p.ledger, owner);
      if (vaultBalance(p.ledger, mine.factionId, asset) < amount) return fail("insufficient_funds");
      const nowMs = o.now();
      p.ledger.post({
        kind: "house_vault_take",
        atMs: nowMs,
        key: `house_vault_take:${mine.factionId}:${owner}:${nowMs}`,
        entries: [
          { account: vaultAccount(p.ledger, mine.factionId, asset), amount: -amount },
          { account: p.ledger.ownerAccount(owner, asset), amount },
        ],
      });
      await p.writer.durable();
      await audit(userId, "faction.house_vault_take", {
        factionId: mine.factionId,
        amount: amount.toString(),
      });
      return { ok: true, action: "vault_taken", factionId: mine.factionId };
    },
    async vaultToLeader(userId, houseId) {
      const p = o.persistence();
      const owner = p?.settlement.findOwnerOfUser(userId);
      if (!p || owner === undefined) return 0n;
      // 해산 돌려주기 = 가문장의 돈으로 된 금고 잔고 [임시](다른 화폐로 쌓인 금고 몫은 남는다)
      const asset = moneyOf(p.ledger, owner);
      const amount = vaultBalance(p.ledger, houseId, asset);
      if (amount <= 0n) return 0n;
      const nowMs = o.now();
      p.ledger.post({
        kind: "house_vault_dissolve",
        atMs: nowMs,
        key: `house_vault_dissolve:${houseId}:${nowMs}`,
        entries: [
          { account: vaultAccount(p.ledger, houseId, asset), amount: -amount },
          { account: p.ledger.ownerAccount(owner, asset), amount },
        ],
      });
      await p.writer.durable();
      await audit(userId, "faction.house_vault_dissolve", { factionId: houseId, amount: amount.toString() });
      return amount;
    },
    async setTax(userId, ratePm) {
      const rate = Math.trunc(ratePm);
      if (!Number.isSafeInteger(rate) || rate < 0) return fail("internal_error");
      const result = await inTransaction(o.pool, async (q): Promise<HouseMemberResult> => {
        const mine = await membershipOf(q, userId);
        if (!mine) return fail("not_in_house");
        if (mine.role !== "leader") return fail("not_leader");
        if (rate > o.rules().taxMaxPm) return fail("tax_too_high");
        await q.query(
          `insert into house_policies (faction_id, tax_pm, set_at_ms, set_by) values ($1, $2, $3, $4)
           on conflict (faction_id) do update set tax_pm = excluded.tax_pm, set_at_ms = excluded.set_at_ms,
             set_by = excluded.set_by`,
          [mine.factionId, rate, o.now(), userId],
        );
        return { ok: true, action: "tax_set", factionId: mine.factionId };
      });
      if (result.ok) {
        const ledger = o.persistence()?.ledger;
        if (ledger) houseTaxerOf(ledger)?.setRate(result.factionId, rate);
        await audit(userId, "faction.house_tax", { factionId: result.factionId, ratePm: rate });
      }
      return result;
    },
    async setBuild(userId, cityId, allow) {
      const result = await inTransaction(o.pool, async (q): Promise<HouseMemberResult> => {
        const mine = await membershipOf(q, userId);
        if (!mine) return fail("not_in_house");
        if (mine.role !== "leader") return fail("not_leader");
        // 가문 행을 잠근다(도시 얻기·해산과 겹치지 않게 — 이동 정책과 같다)
        const locked = await q.query("select id from factions where id = $1 for update", [mine.factionId]);
        if (locked.rows.length === 0) return fail("not_found");
        const exists = await q.query("select 1 from world_cities where id = $1", [cityId]);
        if (exists.rows.length === 0) return fail("unknown_city");
        if (!(await ruledBy(q, mine.factionId)).cities.has(cityId)) return fail("not_ruler");
        await q.query(
          `insert into city_policies (city_id, house_build, set_at_ms, set_by) values ($1, $2, $3, $4)
           on conflict (city_id) do update set house_build = excluded.house_build, set_at_ms = excluded.set_at_ms,
             set_by = excluded.set_by`,
          [cityId, allow, o.now(), userId],
        );
        return { ok: true, action: "build_policy_set", factionId: mine.factionId };
      });
      if (result.ok)
        await audit(userId, "faction.house_build_policy", { factionId: result.factionId, cityId, allow });
      return result;
    },
    async setForeignBuild(userId, cityId, allow) {
      const result = await inTransaction(o.pool, async (q): Promise<HouseMemberResult> => {
        const mine = await membershipOf(q, userId);
        if (!mine) return fail("not_in_house");
        if (mine.role !== "leader") return fail("not_leader");
        const city = await cityHome(q, cityId);
        if (!city) return fail("unknown_city");
        if (!(await canSetCityJoinPolicy(q, mine.factionId, city.id, city.nationId)))
          return fail("not_ruler");
        await q.query(
          `insert into city_policies (city_id, foreign_build, set_at_ms, set_by) values ($1, $2, $3, $4)
           on conflict (city_id) do update set foreign_build = excluded.foreign_build, set_at_ms = excluded.set_at_ms,
             set_by = excluded.set_by`,
          [cityId, allow, o.now(), userId],
        );
        return { ok: true, action: "foreign_build_policy_set", factionId: mine.factionId };
      });
      if (result.ok)
        await audit(userId, "faction.house_foreign_build_policy", {
          factionId: result.factionId,
          cityId,
          allow,
        });
      return result;
    },
  };
}
