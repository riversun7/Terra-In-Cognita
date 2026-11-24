// 가문 도시세 분리(ADR 2026-11-25-house-city-tax.md):
// - 기존 가문 내부 회비(house_policies.tax_pm: 가문원 수입 → 가문 금고)와 별개로, 가문이 소속 도시에 내는 일정액 세금(가문 금고 → 소속 도시 국고).
// - 세율 결정 권한자: 시장(도시 주인 가문장)이 기본, 정책으로 국가 원수로 변경 가능.
// - 납부 주기: 매일·3일·1주·2주(1·3·7·14일, 기본 7일).
// - 미납 처리: 가문 금고에서 부족한 금액을 복식 원장 빚 계정(debt:house_city_tax:... / claim:house_city_tax:...)과 house_city_tax_state에 남기고,
//   신용 장부(creditBookOf(ledger).houseTaxArrears)로 가문장 신용 점수를 하락시킨다. 전액 납부 시 CreditBook.observe가 자동 복구한다.
import type { HouseCityTaxSetter, HouseMemberResultCode } from "@terra/protocol";
import {
  type GovernmentHouseCityTax,
  type HouseCityTaxSetterKind,
  isHouseCityTaxPeriod,
} from "@terra/shared/government";
import type { HouseCityTaxView } from "@terra/shared/house";
import { writeAudit } from "../auth/store.ts";
import { creditBookOf } from "../credit/book.ts";
import type { Database } from "../db/client.ts";
import { moneyOf } from "../world/money.ts";
import type { HouseMovePersistence } from "./houseEntry.ts";
import { electedNationOf, ruledBy } from "./houseEntryPolicy.ts";
import { canSetCityJoinPolicy } from "./houseCityJoin.ts";
import { cityHome } from "./houseHome.ts";
import { vaultAccount, vaultTake } from "./houseVault.ts";
import {
  type HouseMemberResult,
  type HouseTxPool,
  inTransaction,
  lockHouse,
  membershipOf,
  notify,
} from "./members.ts";
import type { IdentityQueryable } from "./store.ts";

const DAY_MS = 86_400_000;

/** 기본 가문 도시세 납부 주기(일) */
export const HOUSE_CITY_TAX_DEFAULT_PERIOD_DAYS = 7;

/** 가문 도시세 미납 빚 시스템 계정 코드(음수 잔고 = 갚을 돈, CreditBook.observe가 자동 감시) */
export const houseCityTaxDebtCode = (houseId: number, cityId: number, asset: string): string =>
  `debt:house_city_tax:${houseId}:${cityId}:${asset}`;

/** 가문 도시세 빚의 짝(도시가 받을 돈 — 복식 원장 균형 유지, 새 화폐를 만들지 않는다) */
export const houseCityTaxClaimCode = (cityId: number, asset: string): string =>
  `claim:house_city_tax:${cityId}:${asset}`;

/** 정책 값 → 실효 세율 결정 권한자(기본 mayor) */
export function effectiveHouseTaxSetter(raw: string | null): HouseCityTaxSetterKind {
  return raw === "leader" ? "leader" : "mayor";
}

/** 정책 값 → 실효 납부 주기(일: 1·3·7·14, 기본 7) */
export function effectiveHouseTaxPeriodDays(raw: number | null): number {
  return raw !== null && isHouseCityTaxPeriod(raw) ? raw : HOUSE_CITY_TAX_DEFAULT_PERIOD_DAYS;
}

/** 가문이 그 도시의 가문 도시세 세율·주기를 바꿀 수 있나 */
export async function canSetHouseCityTax(
  q: IdentityQueryable,
  houseId: number,
  cityId: number,
  nationId: number,
  setter: HouseCityTaxSetterKind,
): Promise<boolean> {
  const ruled = await ruledBy(q, houseId);
  const isCityRuler = ruled.cities.has(cityId);
  const isNationRuler =
    (ruled.nation && houseId === nationId) || (await electedNationOf(q, houseId)) === nationId;
  if (setter === "leader") return isNationRuler;
  return isCityRuler || isNationRuler;
}

/** 소유 주체 목록에서 세력 행의 국고 주체 ID 찾기 */
function treasuryOwnerOf(
  owners: ReadonlyMap<number, { readonly id: number; readonly factionId: number | null }>,
  factionId: number,
): number | undefined {
  for (const owner of owners.values()) if (owner.factionId === factionId) return owner.id;
  return undefined;
}

/** 원장 시스템 계정의 현재 음수 빚 크기(양수 반환, 빚이 없으면 0n) */
function ledgerDebtOf(
  ledger: Pick<HouseMovePersistence["ledger"], "accounts" | "balance">,
  code: string,
): bigint {
  for (const acc of ledger.accounts()) {
    if (acc.systemCode === code) {
      const bal = ledger.balance(acc.id);
      return bal < 0n ? -bal : 0n;
    }
  }
  return 0n;
}

export interface HouseCityTaxPolicyInput {
  readonly cityId: number;
  readonly amount: string | null;
  readonly periodDays: number | null;
  readonly setter: HouseCityTaxSetter | null;
}

export interface HouseCityTaxSweepReport {
  readonly billed: number;
  readonly paid: bigint;
  readonly arrears: bigint;
}

export interface HouseCityTaxService {
  setPolicy(actorId: string, input: HouseCityTaxPolicyInput): Promise<HouseMemberResult>;
  payDebt(leaderId: string): Promise<HouseMemberResult>;
  collectDue(): Promise<HouseCityTaxSweepReport>;
}

const fail = (code: HouseMemberResultCode): HouseMemberResult => ({ ok: false, code });

export function createHouseCityTaxService(o: {
  readonly pool: HouseTxPool;
  readonly db?: Database | undefined;
  readonly now: () => number;
  readonly persistence?: (() => HouseMovePersistence | undefined) | undefined;
  /** 도시 화폐(없으면 도시 국고 주체의 나라 화폐) */
  readonly cityMoneyOf?: ((cityId: number) => string | undefined) | undefined;
}): HouseCityTaxService {
  return {
    async setPolicy(actorId, input) {
      if (input.periodDays !== null && !isHouseCityTaxPeriod(input.periodDays)) return fail("invalid_period");
      const amount = input.amount === null ? null : BigInt(input.amount);
      let audit = null as Record<string, unknown> | null;
      const result = await inTransaction(o.pool, async (q): Promise<HouseMemberResult> => {
        const mine = await membershipOf(q, actorId);
        if (!mine) return fail("not_in_house");
        if (mine.role !== "leader") return fail("not_leader");
        const city = await cityHome(q, input.cityId);
        if (!city) return fail("unknown_city");
        const prev = await q.query<{ house_city_tax_setter: string | null }>(
          "select house_city_tax_setter from city_policies where city_id = $1",
          [city.id],
        );
        const prevSetterRaw = prev.rows[0]?.house_city_tax_setter ?? null;
        const currentSetter = effectiveHouseTaxSetter(prevSetterRaw);
        const allowed = await canSetHouseCityTax(q, mine.factionId, city.id, city.nationId, currentSetter);
        if (!allowed) return fail("not_ruler");
        // 권한자(setter) 자체를 바꾸는 것은 도시 주인 또는 국가 지도자만
        if (input.setter !== prevSetterRaw) {
          const canAuth = await canSetCityJoinPolicy(q, mine.factionId, city.id, city.nationId);
          if (!canAuth) return fail("not_ruler");
        }
        const now = o.now();
        await q.query(
          `insert into city_policies
             (city_id, house_city_tax_amount, house_city_tax_period_days, house_city_tax_setter, set_at_ms, set_by)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (city_id) do update
             set house_city_tax_amount = excluded.house_city_tax_amount,
                 house_city_tax_period_days = excluded.house_city_tax_period_days,
                 house_city_tax_setter = excluded.house_city_tax_setter,
                 set_at_ms = excluded.set_at_ms,
                 set_by = excluded.set_by`,
          [city.id, amount === null ? null : amount.toString(), input.periodDays, input.setter, now, actorId],
        );
        audit = {
          factionId: mine.factionId,
          cityId: city.id,
          amount: input.amount,
          periodDays: input.periodDays,
          setter: input.setter,
        };
        return { ok: true, action: "city_tax_policy_set", factionId: mine.factionId };
      });
      if (audit && o.db) {
        await writeAudit(o.db, {
          actor: { kind: "user", id: actorId, ip: null },
          action: "faction.house_city_tax_policy",
          targetId: actorId,
          before: null,
          after: audit,
        });
      }
      return result;
    },

    async collectDue() {
      const p = o.persistence?.();
      if (!p) return { billed: 0, paid: 0n, arrears: 0n };
      const now = o.now();
      const { rows } = await o.pool.query<{
        house_id: string;
        house_name: string;
        city_id: string;
        city_owner_faction: string;
        home_set_at_ms: string;
        tax_amount: string;
        period_days: number | null;
        policy_set_at_ms: string;
        leader_id: string | null;
        last_billed_at_ms: string | null;
        state_city_id: string | null;
        state_debt: string | null;
        missed_cycles: number | null;
      }>(
        `select h.faction_id as house_id, fp.name as house_name, h.city_id,
                c.faction_id as city_owner_faction, h.set_at_ms as home_set_at_ms,
                p.house_city_tax_amount::text as tax_amount,
                p.house_city_tax_period_days as period_days,
                p.set_at_ms as policy_set_at_ms,
                (select m.user_id from house_members m where m.faction_id = h.faction_id and m.role = 'leader' limit 1) as leader_id,
                s.last_billed_at_ms, s.city_id as state_city_id, s.debt::text as state_debt, s.missed_cycles
           from house_homes h
           join factions f on f.id = h.faction_id and f.kind = 'player' and f.dissolved_at_ms is null
           join faction_profiles fp on fp.faction_id = h.faction_id
           join world_cities c on c.id = h.city_id
           join city_policies p on p.city_id = h.city_id and p.house_city_tax_amount > 0
           left join house_city_tax_state s on s.faction_id = h.faction_id
          where h.city_id is not null and c.faction_id <> h.faction_id`,
      );

      let billed = 0;
      let totalPaid = 0n;
      let totalArrears = 0n;

      for (const row of rows) {
        const houseId = Number(row.house_id);
        const cityId = Number(row.city_id);
        const periodDays = effectiveHouseTaxPeriodDays(row.period_days);
        const periodMs = periodDays * DAY_MS;
        const sameCityState = row.state_city_id !== null && Number(row.state_city_id) === cityId;
        const baseMs =
          sameCityState && row.last_billed_at_ms !== null
            ? Number(row.last_billed_at_ms)
            : Math.max(Number(row.home_set_at_ms), Number(row.policy_set_at_ms));
        if (baseMs + periodMs > now) continue;

        const city = await cityHome(o.pool, cityId);
        if (!city) continue;
        const cityOwnerFaction = Number(row.city_owner_faction);
        const treasury =
          treasuryOwnerOf(p.owners, cityOwnerFaction) ?? treasuryOwnerOf(p.owners, city.nationId);
        if (treasury === undefined) continue;
        const nationOwner = treasuryOwnerOf(p.owners, city.nationId) ?? treasury;

        const asset = o.cityMoneyOf?.(cityId) ?? moneyOf(p.ledger, treasury);
        const taxAmount = BigInt(row.tax_amount);
        const debtCode = houseCityTaxDebtCode(houseId, cityId, asset);
        const claimCode = houseCityTaxClaimCode(cityId, asset);
        const existingDebt = ledgerDebtOf(p.ledger, debtCode);
        const totalDue = existingDebt + taxAmount;
        const paidFromVault = vaultTake(p.ledger, houseId, asset, totalDue);
        const paidOld = paidFromVault < existingDebt ? paidFromVault : existingDebt;
        const paidNew = paidFromVault - paidOld;
        const addedDebt = taxAmount - paidNew;

        const entries: { account: number; amount: bigint }[] = [];
        if (paidFromVault > 0n) {
          entries.push(
            { account: vaultAccount(p.ledger, houseId, asset), amount: -paidFromVault },
            { account: p.ledger.ownerAccount(treasury, asset), amount: paidFromVault },
          );
        }
        const debtDelta = paidOld - addedDebt;
        if (debtDelta !== 0n) {
          entries.push(
            { account: p.ledger.systemAccount(debtCode, asset), amount: debtDelta },
            { account: p.ledger.systemAccount(claimCode, asset), amount: -debtDelta },
          );
        }
        if (entries.length > 0) {
          p.ledger.post({
            kind: "house_city_tax",
            atMs: now,
            key: `house_city_tax:${cityId}:${houseId}:${now}`,
            entries,
          });
        }

        const newDebt = existingDebt - paidOld + addedDebt;
        const prevMissed = sameCityState ? (row.missed_cycles ?? 0) : 0;
        const missedCycles = addedDebt > 0n ? prevMissed + 1 : newDebt === 0n ? 0 : prevMissed;

        if (addedDebt > 0n && row.leader_id) {
          const leaderOwner = p.settlement.findOwnerOfUser(row.leader_id);
          if (leaderOwner !== undefined) {
            creditBookOf(p.ledger)?.houseTaxArrears(
              { cause: debtCode, ownerId: leaderOwner, cityId, nationId: nationOwner },
              now,
            );
          }
          await notify(o.pool, {
            userId: row.leader_id,
            factionId: houseId,
            kind: "city_tax_arrears",
            houseName: row.house_name,
            other: city.name,
            reason: newDebt.toString(),
            nowMs: now,
          });
        }

        await o.pool.query(
          `insert into house_city_tax_state
             (faction_id, city_id, last_billed_at_ms, debt, debt_asset, missed_cycles, updated_at_ms)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (faction_id) do update
             set city_id = excluded.city_id,
                 last_billed_at_ms = excluded.last_billed_at_ms,
                 debt = excluded.debt,
                 debt_asset = excluded.debt_asset,
                 missed_cycles = excluded.missed_cycles,
                 updated_at_ms = excluded.updated_at_ms`,
          [houseId, cityId, now, newDebt.toString(), newDebt > 0n ? asset : null, missedCycles, now],
        );

        billed += 1;
        totalPaid += paidFromVault;
        totalArrears += addedDebt;
      }

      if (billed > 0) await p.writer.durable();
      return { billed, paid: totalPaid, arrears: totalArrears };
    },

    async payDebt(leaderId) {
      const p = o.persistence?.();
      if (!p) return fail("busy");
      const now = o.now();
      let audit = null as Record<string, unknown> | null;
      let paidLedger = false;

      const result = await inTransaction(o.pool, async (q): Promise<HouseMemberResult> => {
        const mine = await membershipOf(q, leaderId);
        if (!mine) return fail("not_in_house");
        if (mine.role !== "leader") return fail("not_leader");
        const house = await lockHouse(q, mine.factionId);
        if (!house) return fail("not_found");

        const st = await q.query<{
          city_id: string;
          debt: string;
          debt_asset: string | null;
          missed_cycles: number;
        }>(
          "select city_id, debt::text as debt, debt_asset, missed_cycles from house_city_tax_state where faction_id = $1 for update",
          [house.id],
        );
        const state = st.rows[0];
        if (!state || BigInt(state.debt) <= 0n) return fail("no_debt");

        const cityId = Number(state.city_id);
        const city = await cityHome(q, cityId);
        const cityOwnerRow = await q.query<{ faction_id: string }>(
          "select faction_id from world_cities where id = $1",
          [cityId],
        );
        const cityOwnerFaction =
          cityOwnerRow.rows[0]?.faction_id === undefined ? null : Number(cityOwnerRow.rows[0].faction_id);
        const treasury =
          (cityOwnerFaction === null ? undefined : treasuryOwnerOf(p.owners, cityOwnerFaction)) ??
          (city ? treasuryOwnerOf(p.owners, city.nationId) : undefined);
        if (treasury === undefined) return fail("unknown_city");

        const asset = state.debt_asset ?? o.cityMoneyOf?.(cityId) ?? moneyOf(p.ledger, treasury);
        const debtCode = houseCityTaxDebtCode(house.id, cityId, asset);
        const claimCode = houseCityTaxClaimCode(cityId, asset);
        const ledgerDebt = ledgerDebtOf(p.ledger, debtCode);
        const owed = ledgerDebt > 0n ? ledgerDebt : BigInt(state.debt);
        if (owed <= 0n) return fail("no_debt");

        // 가문 금고 우선 → 부족하면 가문장 지갑에서 납부
        const fromVault = vaultTake(p.ledger, house.id, asset, owed);
        const needMore = owed - fromVault;
        const leaderOwner = p.settlement.findOwnerOfUser(leaderId);
        let fromLeader = 0n;
        if (needMore > 0n && leaderOwner !== undefined) {
          p.settlement.settleOwner(leaderOwner, now);
          const avail = p.ledger.balanceOf(leaderOwner, asset);
          fromLeader = needMore < avail ? needMore : avail;
        }
        const paid = fromVault + fromLeader;
        if (paid <= 0n) return fail("insufficient_funds");

        const entries: { account: number; amount: bigint }[] = [];
        if (fromVault > 0n) {
          entries.push({ account: vaultAccount(p.ledger, house.id, asset), amount: -fromVault });
        }
        if (fromLeader > 0n && leaderOwner !== undefined) {
          entries.push({ account: p.ledger.ownerAccount(leaderOwner, asset), amount: -fromLeader });
        }
        entries.push({ account: p.ledger.ownerAccount(treasury, asset), amount: paid });
        if (ledgerDebt > 0n) {
          const clear = paid < ledgerDebt ? paid : ledgerDebt;
          entries.push(
            { account: p.ledger.systemAccount(debtCode, asset), amount: clear },
            { account: p.ledger.systemAccount(claimCode, asset), amount: -clear },
          );
        }
        p.ledger.post({
          kind: "house_city_tax_pay",
          atMs: now,
          key: `house_city_tax_pay:${house.id}:${now}`,
          entries,
        });
        paidLedger = true;

        const remaining = owed - paid;
        await q.query(
          `update house_city_tax_state
              set debt = $2,
                  debt_asset = $3,
                  missed_cycles = $4,
                  updated_at_ms = $5
            where faction_id = $1`,
          [
            house.id,
            remaining.toString(),
            remaining > 0n ? asset : null,
            remaining === 0n ? 0 : state.missed_cycles,
            now,
          ],
        );
        audit = {
          factionId: house.id,
          cityId,
          paid: paid.toString(),
          fromVault: fromVault.toString(),
          fromLeader: fromLeader.toString(),
          remaining: remaining.toString(),
        };
        return { ok: true, action: "city_tax_paid", factionId: house.id };
      });

      if (paidLedger) await p.writer.durable();
      if (audit && o.db) {
        await writeAudit(o.db, {
          actor: { kind: "user", id: leaderId, ip: null },
          action: "faction.house_city_tax_pay",
          targetId: leaderId,
          before: null,
          after: audit,
        });
      }
      return result;
    },
  };
}

/** 정부 판용 가문 도시세 정책 읽기 */
export async function readGovernmentHouseCityTax(
  q: IdentityQueryable,
  input: {
    readonly cityId: number;
    readonly nationId: number;
    readonly viewerHouseId: number | null;
    readonly viewerIsLeader: boolean;
  },
): Promise<GovernmentHouseCityTax> {
  const { rows } = await q.query<{
    house_city_tax_amount: string | null;
    house_city_tax_period_days: number | null;
    house_city_tax_setter: string | null;
  }>(
    `select house_city_tax_amount::text as house_city_tax_amount,
            house_city_tax_period_days, house_city_tax_setter
       from city_policies where city_id = $1`,
    [input.cityId],
  );
  const row = rows[0];
  const ownAmount = row?.house_city_tax_amount ?? null;
  const ownPeriodDays = row?.house_city_tax_period_days ?? null;
  const rawSetter = row?.house_city_tax_setter ?? null;
  const ownSetter: HouseCityTaxSetterKind | null =
    rawSetter === "mayor" || rawSetter === "leader" ? rawSetter : null;
  const setter = effectiveHouseTaxSetter(ownSetter);
  const periodDays = effectiveHouseTaxPeriodDays(ownPeriodDays);
  const canSet =
    input.viewerIsLeader && input.viewerHouseId !== null
      ? await canSetHouseCityTax(q, input.viewerHouseId, input.cityId, input.nationId, setter)
      : false;
  const canSetAuthority =
    input.viewerIsLeader && input.viewerHouseId !== null
      ? await canSetCityJoinPolicy(q, input.viewerHouseId, input.cityId, input.nationId)
      : false;
  return {
    amount: ownAmount ?? "0",
    ownAmount,
    periodDays,
    ownPeriodDays,
    setter,
    ownSetter,
    canSet,
    canSetAuthority,
  };
}

/** 세력 화면용 내 가문 도시세 현황 읽기 */
export async function readMyHouseCityTax(
  q: IdentityQueryable,
  houseId: number,
): Promise<HouseCityTaxView | null> {
  const { rows } = await q.query<{
    city_id: string | null;
    home_set_at_ms: string;
    tax_amount: string | null;
    period_days: number | null;
    policy_set_at_ms: string | null;
    last_billed_at_ms: string | null;
    state_city_id: string | null;
    debt: string | null;
    missed_cycles: number | null;
  }>(
    `select h.city_id, h.set_at_ms as home_set_at_ms,
            p.house_city_tax_amount::text as tax_amount,
            p.house_city_tax_period_days as period_days,
            p.set_at_ms as policy_set_at_ms,
            s.last_billed_at_ms, s.city_id as state_city_id,
            s.debt::text as debt, s.missed_cycles
       from house_homes h
       left join city_policies p on p.city_id = h.city_id
       left join house_city_tax_state s on s.faction_id = h.faction_id
      where h.faction_id = $1`,
    [houseId],
  );
  const row = rows[0];
  if (!row || row.city_id === null) {
    // 소속 도시가 없더라도 이전 체납 빚이 남아있을 수 있다
    const debtOnly = await q.query<{ city_id: string; debt: string; missed_cycles: number }>(
      "select city_id, debt::text as debt, missed_cycles from house_city_tax_state where faction_id = $1 and debt > 0",
      [houseId],
    );
    const d = debtOnly.rows[0];
    if (!d) return null;
    return {
      cityId: Number(d.city_id),
      amount: "0",
      periodDays: HOUSE_CITY_TAX_DEFAULT_PERIOD_DAYS,
      debt: d.debt,
      missedCycles: d.missed_cycles,
      nextDueAtMs: null,
    };
  }
  const cityId = Number(row.city_id);
  const amount = row.tax_amount ?? "0";
  const periodDays = effectiveHouseTaxPeriodDays(row.period_days);
  const sameCity = row.state_city_id !== null && Number(row.state_city_id) === cityId;
  const baseMs =
    sameCity && row.last_billed_at_ms !== null
      ? Number(row.last_billed_at_ms)
      : Math.max(Number(row.home_set_at_ms), Number(row.policy_set_at_ms ?? "0"));
  const nextDueAtMs = BigInt(amount) > 0n ? baseMs + periodDays * DAY_MS : null;
  return {
    cityId,
    amount,
    periodDays,
    debt: row.debt ?? "0",
    missedCycles: row.missed_cycles ?? 0,
    nextDueAtMs,
  };
}
