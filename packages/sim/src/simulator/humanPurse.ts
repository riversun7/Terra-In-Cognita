// NPC 휴먼 지갑·임금·생활비 — 기획 D-569 1782("임금 = 휴먼·사이보그 유닛·NPC 휴먼은 유닛 지갑")·D-097("경제활동시 화폐는 휴먼의 사유재산",
// 부양 = 소유자가 필수 요소를 제공하거나 화폐로 지급)·D-555 1507("유닛은 사유재산이 있어 당연히 자기가 내고")·1509("NPC만으로도 그대로 똑같이"),
// 질문 2236(빈틈 → 줄기 npc-wage), docs/adr/2026-10-31-economy-core.md "바뀜 (npc-wage)".
// - 지갑 = 서버 유닛 지갑과 같은 계정 꼴: (유닛 주인, 화폐, @terra/shared/businessBooks unitPurseLocation(유닛 ID)). 주인이 바뀌면 지갑도 새 주인 밑으로
//   옮긴다(movePurses·도시 주인 바뀜 — 자산은 그대로, 옛 화폐면 옛 화폐로 남는다). 죽으면 상속(society/population.ts inheritPurse).
// - 일꾼: 도시 경제 시설의 일꾼 수를 그 도시 휴먼에게 나눈다 — 서버 npc/humanPlaces.ts와 같은 차례(경비대가 아닌 휴먼의 유닛 ID 차례, 시설 ID 차례로
//   앞에서부터 일꾼 수만큼). 경비대는 일꾼으로 두지 않는다.
// - 하루 끝(중앙은행 전), 도시마다 휴먼 차례로(경비대 아닌 휴먼 유닛 ID 차례 → 경비대):
//   ① 임금(일꾼만): 하루 임금 = 기준 임금(플레이어 직무 배치와 같은 식 — 새 유닛 평균 효율 × N27 단가 × 조정 1000‰, labor/rules.ts) ×
//      그날 포만감 효율 배율(N33 — 그날 받은 생필품 경계 몫 = 포만감, 효율점수와 같은 규칙 D-431·48 §7.2: 굶은 일꾼은 효율 0이라 임금도 0) ×
//      business_npc_wage_pm ÷ 1000을 시설 금고(서버 고리, 없으면 도시 주인 국고) → 지갑. 낼 곳이 모자라면 그 일꾼은 받지 못한다(국고가 꾸어 주지 않는다).
//   ② 생필품 값: 그날 먹은 생필품 값(그 도시 시세)을 지갑 → 도시 주인 국고(나라 창고 물건을 산다). 다음 숙박비 몫(서버 고리)은 지갑에 남긴다.
//      지갑이 모자란 몫은 주인이 현물로 부양한 것으로 센다(D-097 부양 — 굶기지 않는다, 질문 2292).
//   숙박비는 서버가 하루 끝 뒤에 지갑에서 낸다(npc/npcWages.ts). 시뮬은 숙소가 없어 숙박비 0.
// - 생필품 받는 차례(onUpkeep 경계마다 앞에서부터 받은 수만큼) = 위 휴먼 차례. 그래서 일꾼이 먼저 먹는다.
// - 생필품 값: 그 도시 그 물건 거래소의 마지막 체결가(묶음 값 — 도시 주인 화폐일 때만), 없으면 팩 시작 시세. 수량 × 값 ÷ 묶음 크기(내림).
// - business_npc_wage_mode 0이면 아무것도 하지 않는다(옛 판 — NPC 일꾼 임금 없음).
// 정수·BigInt만 쓴다.
import { unitPurseLocation } from "@terra/shared/businessBooks";
import type { LedgerBook, LedgerEntry } from "../ledger/ledgerBook.ts";
import type { SocietyCoefficients } from "../society/coefficients.ts";
import { wage as laborWage } from "../society/labor.ts";
import type { EcoFacility, Economy } from "./economy.ts";
import { HOMELESS, type SimUnit, type SimWorld } from "./world.ts";

/** 임금·생활비 규칙(사업장 계수표의 business_npc_wage_* 칸 + 기준 임금) */
export interface NpcLivingRules {
  /** 1 = 켬, 0 = 끔(옛 판) */
  readonly wageMode: number;
  /** 하루 임금 = 기준 임금 × 이 값 ÷ 1000(내림) */
  readonly wagePm: number;
  /** 기준 하루 임금(최소 단위 — npcBaseDailyWage) */
  readonly baseDailyWage: bigint;
  /** 포만감 효율 배율 구간(N33 — 세력·사회 계수표 foodEfficiency). 그날 굶은 일꾼은 효율이 떨어져 임금도 준다(D-431 임금 = 효율 × 단가) */
  readonly foodEfficiency: readonly { readonly atMost: number; readonly pm: number }[];
}

/** 서버가 붙이는 고리(시뮬은 없다) */
export interface NpcLivingHooks {
  /**
   * 그 시설 임금을 낼 계정(서버: 건물 시설이면 그 사업장 금고 — 모자라면 NPC 주인이 운영 자금을 넣는다). need = 그 시설 일꾼 임금 합.
   * undefined면 도시 주인 국고
   */
  wageSource?(input: {
    readonly facilityId: number;
    readonly cityId: number;
    readonly owner: number;
    readonly currency: string;
    readonly need: bigint;
    readonly atMs: number;
  }): number | undefined;
  /** 그 도시 일꾼마다 다음 숙박비(지갑에 남길 몫 — 열쇠 "시설ID:차례", cityWorkerUnits와 같은 차례). 없으면 0 */
  lodgingDue?(cityId: number): ReadonlyMap<string, bigint> | undefined;
}

/** 하루 끝 셈(하루 줄 living 칸) */
export interface LivingDay {
  /** 받은 일꾼 수·낼 곳이 모자라 받지 못한 일꾼 수·굶어 효율 0이라 임금이 0인 일꾼 수 */
  paidWorkers: number;
  unpaidWorkers: number;
  hungryWorkers: number;
  /** 화폐 → 낸 임금 합 */
  readonly wages: Map<string, bigint>;
  /** 화폐 → 지갑에서 낸 생필품 값 합 */
  readonly living: Map<string, bigint>;
  /** 화폐 → 지갑이 모자라 주인이 현물로 부양한 생필품 값 합(D-097) */
  readonly subsidy: Map<string, bigint>;
}

export const emptyLivingDay = (): LivingDay => ({
  paidWorkers: 0,
  unpaidWorkers: 0,
  hungryWorkers: 0,
  wages: new Map(),
  living: new Map(),
  subsidy: new Map(),
});

/** 휴먼 지갑 계정(유닛 주인, 화폐, 유닛 지갑 위치) */
export function humanPurseAccount(book: LedgerBook, owner: number, asset: string, unitId: number): number {
  return book.ownerAccount(owner, asset, unitPurseLocation(unitId));
}

/** 경제의 화폐 자산(지갑에 들 수 있는 것 — 화폐 차례) */
export function moneyAssets(economy: Economy): string[] {
  const set = new Set<string>([economy.base, ...economy.issuer.keys(), ...economy.currencyOf.values()]);
  set.delete("");
  return [...set].toSorted();
}

/**
 * 유닛들의 지갑을 새 주인 밑으로 옮긴다(자산은 그대로). 한 거래. 옮긴 계정 수. 주인이 같으면 0
 */
export function movePurses(
  book: LedgerBook,
  unitIds: readonly number[],
  from: number,
  to: number,
  assets: readonly string[],
  atMs: number,
): number {
  if (from === to) return 0;
  const entries: LedgerEntry[] = [];
  for (const unitId of unitIds) {
    for (const asset of assets) {
      const amount = book.balanceOf(from, asset, unitPurseLocation(unitId));
      if (amount <= 0n) continue;
      entries.push({ account: humanPurseAccount(book, from, asset, unitId), amount: -amount });
      entries.push({ account: humanPurseAccount(book, to, asset, unitId), amount });
    }
  }
  if (entries.length > 0) book.post({ kind: "purse_move", atMs, entries });
  return entries.length / 2;
}

/** 그 도시 사는 휴먼의 지갑 위치들(도시 주인이 바뀔 때 창고와 함께 넘긴다) */
export function pursePlacesOf(world: SimWorld, cityId: number): Set<number> {
  const out = new Set<number>();
  for (const unit of world.units.values()) if (unit.city === cityId) out.add(unitPurseLocation(unit.id));
  return out;
}

/** 일꾼 한 명(시설·그 시설 안 차례) */
export interface CityWorker {
  readonly unitId: number;
  readonly facilityId: number;
  /** 그 시설 안 차례(0부터) */
  readonly index: number;
}

/** 일꾼 나누기가 보는 휴먼 칸 */
type WorkerUnit = Pick<SimUnit, "id" | "city" | "guard">;

/** 그 도시 휴먼 차례: 경비대가 아닌 휴먼(유닛 ID 차례) 다음 경비대(유닛 ID 차례) */
export function cityUnitOrder<U extends WorkerUnit>(
  world: { readonly units: ReadonlyMap<number, U> },
  cityId: number,
): U[] {
  const units: U[] = [];
  if (cityId === HOMELESS) return units;
  for (const unit of world.units.values()) if (unit.city === cityId) units.push(unit);
  return units.toSorted((a, b) => Number(a.guard === true) - Number(b.guard === true) || a.id - b.id);
}

/**
 * 그 도시 일꾼(서버 npc/humanPlaces.ts와 같은 나눔): 경비대가 아닌 휴먼을 유닛 ID 차례로, 시설 ID 차례로 앞에서부터 그 시설 일꾼 수만큼.
 * units = cityUnitOrder 결과(없으면 새로 센다)
 */
export function cityWorkerUnits(
  world: { readonly units: ReadonlyMap<number, WorkerUnit> },
  economy: { readonly facilities: ReadonlyMap<number, Pick<EcoFacility, "id" | "city" | "workers">> },
  cityId: number,
  units: readonly WorkerUnit[] = cityUnitOrder(world, cityId),
): CityWorker[] {
  const humans = units.filter((unit) => unit.guard !== true);
  const facilities = [...economy.facilities.values()]
    .filter((facility) => facility.city === cityId)
    .toSorted((a, b) => a.id - b.id);
  const out: CityWorker[] = [];
  let next = 0;
  for (const facility of facilities) {
    for (let index = 0; index < facility.workers && next < humans.length; index++) {
      const unit = humans[next];
      next += 1;
      if (unit) out.push({ unitId: unit.id, facilityId: facility.id, index });
    }
  }
  return out;
}

/** 생필품 qty(기본 단위)의 값: 그 도시 거래소 마지막 체결가(그 화폐일 때만), 없으면 팩 시작 시세 × qty ÷ 묶음 크기(내림) */
export function necessityCost(
  economy: Pick<Economy, "markets" | "catalog">,
  cityId: number,
  asset: string,
  currency: string,
  qty: bigint,
): bigint {
  if (qty <= 0n) return 0n;
  // 읽기만 한다 — 서버 도시 표는 get이 거래소를 만든다(economy.ts peekMarket과 같은 has 먼저 보기, 값 import 고리를 피해 여기서 본다)
  const perItem = economy.markets.get(cityId);
  const market = perItem?.has(asset) === true ? perItem.get(asset) : undefined;
  const last = market && market.config.currency === currency ? market.lastPrice : undefined;
  const price = last ?? economy.catalog.startPrice.get(asset) ?? 0n;
  const lot = economy.catalog.lotSize.get(asset) ?? 1n;
  return (qty * price) / (lot > 0n ? lot : 1n);
}

/**
 * 기준 하루 임금 = 플레이어 직무 배치 기준 임금과 같은 식(서버 labor/rules.ts wageRulesOf): 효율 = 새 유닛 평균 1차 스탯 하나(⌊N9 초기 합 ÷ 6⌋),
 * 단가 = N27 기준 단가, 고용주 조정 1000‰
 */
export function npcBaseDailyWage(c: SocietyCoefficients): bigint {
  const efficiency = Math.floor(Math.max(0, c.cyborg.initialSum) / 6);
  return BigInt(Math.max(0, laborWage(efficiency, c.wageRateMilli, 1000, c)));
}

/** 하루 임금 = 기준 임금 × ‰ ÷ 1000(내림, 0 아래 없음) */
export function npcDailyWage(rules: NpcLivingRules): bigint {
  const pm = BigInt(Math.max(0, Math.trunc(rules.wagePm)));
  const base = rules.baseDailyWage > 0n ? rules.baseDailyWage : 0n;
  return (base * pm) / 1000n;
}

/** 오늘 생필품 경계마다 받은 사람 수를 적는다(economy.ts onUpkeep이 부른다 — 받는 차례 = cityUnitOrder) */
export function noteServed(economy: Economy, cityId: number, asset: string, served: number): void {
  const today = economy.today;
  if (!today.served) today.served = new Map();
  let perAsset = today.served.get(cityId);
  if (!perAsset) {
    perAsset = new Map();
    today.served.set(cityId, perAsset);
  }
  const list = perAsset.get(asset) ?? [];
  list.push(served);
  perAsset.set(asset, list);
}

/** 포만감 효율 배율(N33, society/labor.ts foodEfficiencyPm과 같은 셈): 포만감이 구간 이하이면 그 ‰ */
function foodPmOf(food: number, bands: NpcLivingRules["foodEfficiency"]): number {
  for (const band of bands) if (food <= band.atMost) return band.pm;
  return 1000;
}

const bump = (map: Map<string, bigint>, key: string, amount: bigint): void => {
  if (amount > 0n) map.set(key, (map.get(key) ?? 0n) + amount);
};

/**
 * 하루 끝 임금·생활비(위 머리 주석). 도시마다 거래 하나. 오늘 받은 사람 수 기록(today.served)을 비운다. 끈 판이면 기록만 비운다
 */
export function livingDay(
  economy: Economy,
  world: SimWorld,
  nowMs: number,
  rules: NpcLivingRules,
  hooks: NpcLivingHooks = {},
): LivingDay {
  const out = emptyLivingDay();
  const served = economy.today.served;
  economy.today.served = undefined;
  if (Math.trunc(rules.wageMode) !== 1) return out;
  const { book } = world;
  for (const city of [...world.cities.values()].toSorted((a, b) => a.id - b.id)) {
    const owner = city.owner;
    const currency = economy.currencyOf.get(owner) ?? economy.base;
    if (!currency) continue;
    const units = cityUnitOrder(world, city.id);
    if (units.length === 0) continue;
    const workers = cityWorkerUnits(world, economy, city.id, units);
    const lodging = hooks.lodgingDue?.(city.id);
    const wage = npcDailyWage(rules);
    // 시설마다 임금 낼 곳(서버 고리 — 금고 채우기가 여기서 일어나므로 잔고는 그 뒤에 읽는다)
    const treasury = book.ownerAccount(owner, currency);
    const sourceOf = new Map<number, number>();
    if (hooks.wageSource) {
      const need = new Map<number, bigint>();
      for (const worker of workers) need.set(worker.facilityId, (need.get(worker.facilityId) ?? 0n) + wage);
      for (const [facilityId, amount] of [...need].toSorted((a, b) => a[0] - b[0])) {
        const source = hooks.wageSource({
          facilityId,
          cityId: city.id,
          owner,
          currency,
          need: amount,
          atMs: nowMs,
        });
        if (source !== undefined) sourceOf.set(facilityId, source);
      }
    }
    // 계정 잔고는 메모리에서 셈하고 끝에 바뀐 양(같은 계정 합)만 거래 하나로 넣는다. 지갑 계정은 바뀐 양이 있을 때만 만든다(임금 = 생필품 값이면
    // 지갑 계정도 거래 항목도 생기지 않는다 — 서버 DB 쓰기를 줄인다)
    const delta = new Map<number, bigint>();
    const balanceOf = (account: number): bigint => book.balance(account) + (delta.get(account) ?? 0n);
    const shift = (account: number, amount: bigint): void => {
      delta.set(account, (delta.get(account) ?? 0n) + amount);
    };
    const purseDelta = new Map<SimUnit, bigint>();
    const byUnit = new Map(workers.map((worker) => [worker.unitId, worker]));
    const cityServed = served?.get(city.id);
    units.forEach((unit, order) => {
      // 지갑 주인 = 유닛 주인(보통 도시 주인과 같다), 화폐 = 도시 주인 화폐(임금·생필품 값을 그 화폐로 주고받는다)
      let purse = book.balanceOf(unit.owner, currency, unitPurseLocation(unit.id));
      // 오늘 먹은 생필품(받는 차례 order가 경계마다 받은 수 안이면 받았다)·값, 포만감(받은 경계 몫, 0~100)
      let eaten = 0n;
      let due = 0;
      let fed = 0;
      for (const spec of economy.catalog.necessities) {
        const list = cityServed?.get(spec.asset) ?? [];
        const times = list.filter((n) => n > order).length;
        due += list.length;
        fed += times;
        if (times > 0)
          eaten += necessityCost(economy, city.id, spec.asset, currency, spec.perUnit * BigInt(times));
      }
      let change = 0n;
      // ① 임금(일꾼만) — 포만감 효율 배율(N33)을 곱한다
      const worker = byUnit.get(unit.id);
      if (worker) {
        const food = due === 0 ? 100 : Math.floor((fed * 100) / due);
        const pay = (wage * BigInt(foodPmOf(food, rules.foodEfficiency))) / 1000n;
        const source = sourceOf.get(worker.facilityId) ?? treasury;
        if (pay > 0n && balanceOf(source) >= pay) {
          shift(source, -pay);
          change += pay;
          purse += pay;
          out.paidWorkers += 1;
          bump(out.wages, currency, pay);
        } else if (pay > 0n) out.unpaidWorkers += 1;
        else if (wage > 0n) out.hungryWorkers += 1;
      }
      if (eaten > 0n) {
        // 다음 숙박비 몫은 남긴다(서버가 하루 끝 뒤에 지갑에서 낸다)
        const keep = worker ? (lodging?.get(`${worker.facilityId}:${worker.index}`) ?? 0n) : 0n;
        const spare = purse - keep;
        const have = spare > 0n ? spare : 0n;
        const spend = have < eaten ? have : eaten;
        if (spend > 0n) {
          shift(treasury, spend);
          change -= spend;
          bump(out.living, currency, spend);
        }
        bump(out.subsidy, currency, eaten - spend);
      }
      if (change !== 0n) purseDelta.set(unit, change);
    });
    const posted: LedgerEntry[] = [];
    for (const [account, amount] of delta) if (amount !== 0n) posted.push({ account, amount });
    for (const [unit, amount] of purseDelta)
      posted.push({ account: humanPurseAccount(book, unit.owner, currency, unit.id), amount });
    if (posted.length > 0) book.post({ kind: "npc_living", atMs: nowMs, entries: posted });
  }
  return out;
}

/** 경제의 휴먼 지갑 잔고 합(화폐 → 합, 하루 줄·요약) */
export function purseTotals(economy: Economy, world: SimWorld): Map<string, bigint> {
  const assets = moneyAssets(economy);
  const out = new Map<string, bigint>();
  for (const unit of world.units.values())
    for (const asset of assets) {
      const amount = world.book.balanceOf(unit.owner, asset, unitPurseLocation(unit.id));
      if (amount > 0n) out.set(asset, (out.get(asset) ?? 0n) + amount);
    }
  return out;
}
