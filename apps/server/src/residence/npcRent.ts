// NPC 휴먼이 남의 집에 세 들기 — 기획 검토 2674(D-555 1509 "똑같이 한다니까 … NPC만으로도 그대로 똑같이 시스템이 돌아간다", D-588 4 임대료 선납, D-591 2
// 남의 주거 건물 세 들기). docs/adr/2026-11-15-business-ledger.md "바뀜 (npc-rent)". 옛 [임시] "NPC는 사는 곳을 고르지 않는다"(질문 2674 가)를 바꾼다.
// - 같은 길: 플레이어 유닛과 같은 사는 곳 장부(book.ts — 표 unit_residences, 정원 = 층 × 설정 칸, 고른 차례)에 적고, 같은 미리 내기(rent.ts chargeResidence —
//   한 기간 집세를 먼저 낸다)·같은 다음 기간 걷기(1분 훑기 renewResidenceRents)·못 내면 쉼(빚 없음, 질문 2676 가)·주민세 집 몫(residentProperty.ts
//   withChosenResidences)이 그대로 돈다. NPC 휴먼은 세를 놓은 남의 집(주인이 정한 집세 — residence_rents)만 고른다(내 세력 집은 고르지 않는다 [임시]).
// - 내는 쪽: 그 휴먼 지갑(사유재산 — D-097·D-555 1507, NPC 숙박비 npc/npcWages.ts와 같은 지갑·화폐: 그 도시 주인 나라 화폐). 집세는 기준 통화(서버 시험 화폐 —
//   질문 2673)로 정해져 있어 지난 환전 체결가로 그 나라 화폐 양으로 바꾼다(올림 — 주인이 손해 보지 않게, 체결가가 없으면 같은 값 [임시] 질문 2731). 받는 곳 =
//   그 건물 사업장 금고(BusinessCore.receive — 들어올 때 소득세, 거래 종류 residence_rent). 사업장 장부가 없으면(시험) 건물 주인 지갑.
// - 고르기(NPC 판단 — D-323 성향 규칙식, [임시] 기술 기본값·설정 칸 npc_rent_*): 그 휴먼이 사는 도시에서 세를 놓은 집 가운데 정원이 남고, 지갑이 집세 ×
//   npc_rent_reserve_pm ÷ 1000 이상인 것만 본다. 그 가운데
//   ① 일꾼이 쉼터를 못 받았으면(노숙 — "숙소가 다 찼다") 가장 싼 집, ② 숙소에서 쉬는 일꾼이면 집세 ≤ 지금 숙박비(한 기간) × 의향 ÷ 1000인 가장 싼 집.
//   의향 = npc_rent_factor_pm + (500 − 이윤 성향 greed) × npc_rent_temper_pm ÷ 500(이윤·시장 성향일수록 값에 까다롭다). 같은 값이면 레벨 높은 집, 그다음 건물 ID.
//   지금 쉬는 숙소 건물은 고르지 않는다(배정받은 숙소는 플레이어도 숙박비 길이 먼저다 — 질문 2675 가). 집에서 쉬는 일꾼·일꾼이 아닌 휴먼은 지금 숙박비가 0이라
//   집세 0인 집만 고른다. 세 든 뒤 쉼터(침대)·밤 숙박비는 그대로다(플레이어도 사는 곳과 쉼터가 따로다 — 질문 2732).
// - 그만두기: 세 든 휴먼이 죽거나 다른 도시로 옮기거나 경비대가 되면(그 집 도시에 살지 않으면) 고른 것을 지운다. 못 내 쉬는 것은 지우지 않는다(돈이 생기면 이어 산다).
//   집세가 올라도 낼 수 있는 동안은 산다(다시 고르지 않는다 [임시] 질문 2733).
// - 성능: 수천 휴먼 — 1분 훑기마다 세를 놓은 집이 있는 도시의 휴먼만, 유닛 ID 차례로 이어 가며 npc_rent_sweep_cap명까지 본다(한 바퀴에 모두 보지 않는다).
// - 시뮬: 시뮬에는 플레이어 건물·집세가 없다 → 판정은 서버만, SIM_VERSION 그대로(설정 칸 이름만 시뮬 계수표에 있다).
// 정수·BigInt만 쓴다.
import { unitPurseLocation } from "@terra/shared/businessBooks";
import type { UnitTraits } from "@terra/shared/unitTraits";
import type { BusinessCore } from "../business/core.ts";
import type { Ledger } from "../economy/ledger.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { ResidenceBook, ResidenceWorld } from "./book.ts";
import { RENT_TX_KIND, type RentPayer, type RentTable, chargeResidence } from "./rent.ts";
import { deleteResidence, saveResidence } from "./store.ts";

/** NPC 세 들기 규칙(설정 칸 — @terra/sim BusinessCoefficients의 같은 이름 칸) */
export interface NpcRentRules {
  readonly npcRentMode?: number | undefined;
  readonly npcRentSweepCap?: number | undefined;
  readonly npcRentFactorPm?: number | undefined;
  readonly npcRentTemperPm?: number | undefined;
  readonly npcRentReservePm?: number | undefined;
}

/** 설정 칸이 없을 때(옛 팩) 값 — [임시] 기술 기본값 */
export const NPC_RENT_DEFAULTS = {
  mode: 1,
  sweepCap: 200,
  factorPm: 1000,
  temperPm: 200,
  reservePm: 2000,
} as const;

interface ResolvedRules {
  readonly mode: number;
  readonly sweepCap: number;
  readonly factorPm: number;
  readonly temperPm: number;
  readonly reservePm: number;
}

const int = (value: number | undefined, fallback: number, min: number): number =>
  value === undefined || !Number.isFinite(value) ? fallback : Math.max(min, Math.trunc(value));

export function resolveNpcRentRules(rules: NpcRentRules): ResolvedRules {
  return {
    mode: int(rules.npcRentMode, NPC_RENT_DEFAULTS.mode, 0),
    sweepCap: int(rules.npcRentSweepCap, NPC_RENT_DEFAULTS.sweepCap, 0),
    factorPm: int(rules.npcRentFactorPm, NPC_RENT_DEFAULTS.factorPm, 0),
    temperPm: int(rules.npcRentTemperPm, NPC_RENT_DEFAULTS.temperPm, 0),
    reservePm: int(rules.npcRentReservePm, NPC_RENT_DEFAULTS.reservePm, 0),
  };
}

/** NPC 휴먼 하나(거울 세계 SimUnit의 일부) */
export interface NpcTenantUnit {
  readonly id: number;
  readonly owner: number;
  readonly city: number;
  readonly guard?: boolean | undefined;
}

/** NPC 일꾼 하나의 지금 쉼터(도시 경제 쉼터 계획 — npc/cityRest.ts) */
export interface NpcRest {
  /** 쉬는 숙소 건물(집·노숙이면 null) */
  readonly lodgingId: number | null;
  /** 침대도 집 자리도 못 받았다(숙소가 다 찼다) */
  readonly homeless: boolean;
  /** 한 기간 숙박비(그 도시 나라 화폐 — 숙소가 아니면 0) */
  readonly cost: bigint;
}

/** NPC 세계 몫(npcRentWorld.ts가 NPC 런타임으로 만든다) */
export interface NpcRentWorld {
  readonly units: ReadonlyMap<number, NpcTenantUnit>;
  /** NPC 세력인가(플레이어 가문 세력이면 false — 가문 휴먼의 사는 곳은 주인이 고른다) */
  isNpcOwner(owner: number): boolean;
  /** 그 도시 휴먼이 쓰는 화폐(도시 주인 나라 화폐 — NPC 숙박비와 같다). 모르면 undefined */
  currencyOf(cityId: number): string | undefined;
  /** 집세 화폐(주인이 정한 값 — 서버 시험 화폐) 양 → 그 화폐 양(올림) */
  toLocal(amount: bigint, currency: string): bigint;
  /** 유닛 성향(D-323 — 없으면 중립) */
  traits(unitId: number): UnitTraits | undefined;
  /** 그 도시 일꾼 휴먼의 쉼터(유닛 ID → 쉼터, 일꾼이 아니면 없음) */
  restsIn(cityId: number, periodMs: number): ReadonlyMap<number, NpcRest>;
  /** NPC 집주인(npcLandlord.ts — fixes-1117j 2735): 세력의 상업 성향. 없으면 NPC 집주인을 돌리지 않는다 */
  readonly commerceOf?: ((owner: number) => number | undefined) | undefined;
  /** NPC 집주인: 그 레벨 숙소의 한 기간 숙박비(집세 화폐). 없으면 NPC 집주인을 돌리지 않는다 */
  readonly lodgingPeriodFee?: ((level: number, periodMs: number) => bigint | undefined) | undefined;
}

/** 세를 놓은 집 하나(그 휴먼 화폐로 바꾼 값) */
export interface NpcRentOffer {
  readonly buildingId: number;
  readonly price: bigint;
  readonly level: number;
}

/** 이윤 성향(greed)에 따른 의향(‰) — 머리 주석 */
export function npcRentWillingPm(greed: number, rules: Pick<ResolvedRules, "factorPm" | "temperPm">): number {
  const g = Math.min(1000, Math.max(0, Math.trunc(greed)));
  return Math.max(0, rules.factorPm + Math.trunc(((500 - g) * rules.temperPm) / 500));
}

/**
 * 고를 집(머리 주석의 규칙식). 고르지 않으면 null. offers는 정원이 남은 집만 준다
 */
export function pickNpcRent(input: {
  readonly offers: readonly NpcRentOffer[];
  readonly rest: NpcRest | undefined;
  readonly purse: bigint;
  readonly greed: number;
  readonly rules: Pick<ResolvedRules, "factorPm" | "temperPm" | "reservePm">;
}): number | null {
  const reserve = BigInt(input.rules.reservePm);
  const willing = BigInt(npcRentWillingPm(input.greed, input.rules));
  const cost = input.rest?.cost ?? 0n;
  const homeless = input.rest?.homeless === true;
  const fits = input.offers.filter(
    (offer) =>
      offer.price >= 0n &&
      offer.buildingId !== input.rest?.lodgingId &&
      offer.price * reserve <= input.purse * 1000n &&
      (homeless || offer.price * 1000n <= cost * willing),
  );
  const best = fits.toSorted(
    (a, b) =>
      (a.price < b.price ? -1 : a.price > b.price ? 1 : 0) ||
      b.level - a.level ||
      a.buildingId - b.buildingId,
  )[0];
  return best?.buildingId ?? null;
}

/** 그 유닛이 NPC 세력의 휴먼이면 그 유닛(가문 휴먼·플레이어 유닛이면 undefined) */
function npcTenant(npc: NpcRentWorld | undefined, unitId: number): NpcTenantUnit | undefined {
  const unit = npc?.units.get(unitId);
  return unit && npc?.isNpcOwner(unit.owner) ? unit : undefined;
}

/**
 * NPC 휴먼이면 그 도시 나라 화폐로 값을 셈하고 그 휴먼 지갑에서 걷는 RentPayer(플레이어 유닛은 base 그대로). NPC는 세 든 집(rent)만 — 숙소 미리 내기(lodging)는
 * NPC 숙박비 하루 끝 길이라 셀 수 없다(undefined)
 */
export function npcAwarePayer(
  base: RentPayer,
  o: {
    npc(): NpcRentWorld | undefined;
    readonly ledger: Ledger;
    readonly business?: Pick<BusinessCore, "receive"> | undefined;
    readonly world: Pick<ResidenceWorld, "building">;
  },
): RentPayer {
  const purse = (npc: NpcRentWorld, unit: NpcTenantUnit): { account: number; asset: string } | undefined => {
    const asset = npc.currencyOf(unit.city);
    return asset === undefined
      ? undefined
      : { account: o.ledger.ownerAccount(unit.owner, asset, unitPurseLocation(unit.id)), asset };
  };
  return {
    periodMs: () => base.periodMs(),
    priceOf(unitId, buildingId, kind) {
      const npc = o.npc();
      const unit = npcTenant(npc, unitId);
      if (!npc || !unit) return base.priceOf(unitId, buildingId, kind);
      if (kind === "own") return 0n;
      const rent = kind === "rent" ? o.world.building(buildingId)?.rent : undefined;
      const asset = npc.currencyOf(unit.city);
      return rent === undefined || rent === null || asset === undefined
        ? undefined
        : npc.toLocal(rent, asset);
    },
    purseBalance(ownerId, unitId, buildingId) {
      const npc = o.npc();
      const unit = npcTenant(npc, unitId);
      if (!npc || !unit) return base.purseBalance(ownerId, unitId, buildingId);
      const found = purse(npc, unit);
      return found ? o.ledger.balance(found.account) : 0n;
    },
    pay(input) {
      const npc = o.npc();
      const unit = npcTenant(npc, input.unitId);
      if (!npc || !unit) return base.pay(input);
      if (input.kind === "own" || input.amount <= 0n) return true;
      const found = purse(npc, unit);
      if (!found || input.kind !== "rent") return false;
      const kind = RENT_TX_KIND.rent;
      if (
        o.business?.receive({
          from: found.account,
          buildingId: input.buildingId,
          asset: found.asset,
          amount: input.amount,
          kind,
          atMs: input.atMs,
        })
      )
        return true;
      // 사업장 장부가 없거나(시험) 받지 않으면 건물 주인 지갑으로(플레이어 길과 같다)
      const owner = o.world.building(input.buildingId)?.ownerId ?? null;
      if (owner === null) return false;
      o.ledger.post({
        kind,
        atMs: input.atMs,
        entries: [
          { account: found.account, amount: -input.amount },
          { account: o.ledger.ownerAccount(owner, found.asset), amount: input.amount },
        ],
      });
      return true;
    },
  };
}

/** 훑기 한 번 결과 */
export interface NpcRentSweep {
  /** 고를지 본 휴먼 수 */
  readonly evaluated: number;
  /** 새로 세 든 휴먼 수 */
  readonly rented: number;
  /** 그 도시에 살지 않게 되어 지운 고른 것 수 */
  readonly left: number;
}

/** 1분 훑기(attach.ts)가 부르는 NPC 세 들기 훑기(머리 주석). 커서(마지막으로 본 유닛 ID)는 메모리 — 다시 켜면 처음부터 */
export function createNpcRentSweeper(o: {
  readonly book: ResidenceBook;
  readonly rents: Pick<RentTable, "all">;
  readonly world: Pick<ResidenceWorld, "building">;
  readonly payer: RentPayer;
  npc(): NpcRentWorld | undefined;
  readonly pool?: QueryPool | undefined;
  rules(): NpcRentRules;
}): { sweep(nowMs: number): Promise<NpcRentSweep> } {
  let cursor = 0;

  /** 세 든 휴먼이 그 집 도시에 살지 않게 되었으면 지운다 */
  const leave = async (npc: NpcRentWorld): Promise<number> => {
    let left = 0;
    for (const choice of o.book.all()) {
      if (!npc.isNpcOwner(choice.ownerId)) continue;
      const unit = npc.units.get(choice.unitId);
      const cityId = o.world.building(choice.buildingId)?.cityId ?? null;
      if (unit && unit.owner === choice.ownerId && unit.guard !== true && unit.city === cityId) continue;
      if (o.pool) await deleteResidence(o.pool, choice.unitId);
      o.book.remove(choice.unitId);
      left += 1;
    }
    return left;
  };

  /** 도시 → 세를 놓은 집(기준 통화 집세) */
  const offersByCity = (): Map<
    number,
    { buildingId: number; rent: bigint; level: number; ownerId: number | null }[]
  > => {
    const out = new Map<
      number,
      { buildingId: number; rent: bigint; level: number; ownerId: number | null }[]
    >();
    for (const row of o.rents.all()) {
      const facts = o.world.building(row.buildingId);
      const rent = facts?.rent ?? null;
      if (!facts || rent === null || facts.level < 1 || !facts.living || facts.cityId === null) continue;
      const list = out.get(facts.cityId) ?? [];
      list.push({ buildingId: row.buildingId, rent, level: facts.level, ownerId: facts.ownerId });
      out.set(facts.cityId, list);
    }
    return out;
  };

  /** 한 휴먼을 그 집에 들인다(서비스 setNow와 같은 차례 — 돈 확인 → 표 → 걷기). 들였으면 true */
  const rentFor = async (unit: NpcTenantUnit, buildingId: number, nowMs: number): Promise<boolean> => {
    const price = o.payer.priceOf(unit.id, buildingId, "rent");
    if (price === undefined || o.payer.purseBalance(unit.owner, unit.id) < price) return false;
    const choice = {
      unitId: unit.id,
      ownerId: unit.owner,
      buildingId,
      chosenAtMs: nowMs,
      paidUntilMs: nowMs + Math.max(1, Math.trunc(o.payer.periodMs())),
    };
    if (o.pool) await saveResidence(o.pool, choice);
    const charged = chargeResidence(o.payer, {
      ownerId: unit.owner,
      unitId: unit.id,
      buildingId,
      kind: "rent",
      atMs: nowMs,
    });
    if (!charged.ok) {
      // 표를 쓴 사이 지갑이 줄었다 — NPC는 고른 것을 남기지 않는다(다음 훑기가 다시 본다)
      if (o.pool) await deleteResidence(o.pool, unit.id);
      return false;
    }
    o.book.put(choice);
    return true;
  };

  return {
    async sweep(nowMs) {
      const npc = o.npc();
      if (!npc) return { evaluated: 0, rented: 0, left: 0 };
      const left = await leave(npc);
      const rules = resolveNpcRentRules(o.rules());
      if (rules.mode !== 1 || rules.sweepCap <= 0) return { evaluated: 0, rented: 0, left };
      const offers = offersByCity();
      if (offers.size === 0) return { evaluated: 0, rented: 0, left };
      // 세를 놓은 집이 있는 도시의, 고른 것이 없는 NPC 휴먼(경비대 빼고) — 유닛 ID 차례로 커서 다음부터 이어 간다
      const ids: number[] = [];
      for (const unit of npc.units.values())
        if (
          offers.has(unit.city) &&
          unit.guard !== true &&
          npc.isNpcOwner(unit.owner) &&
          o.book.choiceOf(unit.id) === undefined
        )
          ids.push(unit.id);
      ids.sort((a, b) => a - b);
      const start = ids.findIndex((id) => id > cursor);
      const order = start <= 0 ? ids : [...ids.slice(start), ...ids.slice(0, start)];
      const periodMs = Math.max(1, Math.trunc(o.payer.periodMs()));
      const rests = new Map<number, ReadonlyMap<number, NpcRest>>();
      let evaluated = 0;
      let rented = 0;
      for (const id of order.slice(0, rules.sweepCap)) {
        const unit = npc.units.get(id);
        if (!unit) continue;
        evaluated += 1;
        cursor = id;
        const asset = npc.currencyOf(unit.city);
        if (asset === undefined) continue;
        const cityRests = rests.get(unit.city) ?? npc.restsIn(unit.city, periodMs);
        rests.set(unit.city, cityRests);
        const choices: NpcRentOffer[] = [];
        for (const offer of offers.get(unit.city) ?? []) {
          if (offer.ownerId === unit.owner) continue;
          if (o.book.blockOf(unit.id, unit.owner, offer.buildingId) !== null) continue;
          choices.push({
            buildingId: offer.buildingId,
            price: npc.toLocal(offer.rent, asset),
            level: offer.level,
          });
        }
        if (choices.length === 0) continue;
        const picked = pickNpcRent({
          offers: choices,
          rest: cityRests.get(unit.id),
          purse: o.payer.purseBalance(unit.owner, unit.id),
          greed: npc.traits(unit.id)?.greed ?? 500,
          rules,
        });
        if (picked !== null && (await rentFor(unit, picked, nowMs))) rented += 1;
      }
      return { evaluated, rented, left };
    },
  };
}
