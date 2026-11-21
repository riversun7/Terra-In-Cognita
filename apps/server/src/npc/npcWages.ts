// NPC 휴먼 일꾼 임금·숙박비 — 질문 2236(기획 D-569 1782 "임금 = NPC 휴먼은 유닛 지갑"·D-097 "경제활동시 화폐는 휴먼의 사유재산"·D-555 1507
// "유닛은 사유재산이 있어 당연히 자기가 내고"·1509 "NPC만으로도 그대로 똑같이"), docs/adr/2026-11-15-business-ledger.md "바뀜 (npc-wage)".
// 임금·생필품 값은 시뮬과 같은 셈(@terra/sim livingDay — 도시 경제 하루 끝, 중앙은행 전)이고, 서버는 여기서 두 고리를 붙인다:
// - 임금 낼 곳(wageSource): 건물 시설이면 그 사업장 금고(NPC 사업장 장부 business_npc_books 1일 때). 금고가 그 시설 일꾼 임금 합보다 모자라면 NPC 주인이
//   모자란 만큼 국고에서 운영 자금을 넣는다(business invest — 재료비와 같은 길, 적자가 있으면 넣은 돈이 먼저 갚는다). 그래도 모자라면 그 일꾼은 받지 못한다.
//   도시 직무(건물 없음)·장부 없음이면 국고.
// - 숙박비(lodgingDue·chargeLodgingFees): 하루 끝 뒤(afterDay) 일꾼마다 하룻밤 요금 × 하루 쉬는 번 수를 그 휴먼 지갑(유닛 주인, 화폐, unitPurseLocation)에서
//   그 숙소 사업장 금고로 낸다(숙소마다 거래 하나 + 소득세). 지갑이 모자라면 있는 만큼만(국고가 대신 내지 않는다 — 다 못 낸 일꾼 수를 기록, 질문 2293).
//   생필품 값을 낼 때 이 몫은 지갑에 남긴다(lodgingDue). 도시 주인 세력의 숙소도 낸다(사업장 장부가 있을 때, D-555 1509 — 금고 돈은 자동 정산으로 국고에).
//   바뀜 (빈틈 2293 — 기획 대조 D-555 1508·1509): 다 못 낸 일꾼은 다음 숙박비를 낼 때까지 회복이 노숙으로 떨어진다 — 플레이어 일꾼(labor/workerRest.ts)과
//   같다. 쉼터 계획의 그 시설 생산 속도 배율을 다시 센다(restPlan → cityRest.ts withUnpaidRest). 못 낸 일꾼 표는 메모리(다시 켜면 비어 시작) [임시].
//   임금을 받으면 숙박비 몫을 먼저 남기므로 임금을 못 받은 일꾼(금고·국고가 빈 나라)만 걸린다. 끈 판(국고가 냄)은 옛 판 그대로 불이익 없음.
// - business_npc_wage_mode 0이면 옛 판: 임금 없음, 숙박비는 도시 주인 국고가 낸다(숙소마다 합).
// 일꾼 ↔ 휴먼 = @terra/sim cityWorkerUnits(npc/humanPlaces.ts와 같은 나눔), 쉼터 = 그 시설 안 차례의 쉼터 계획(cityRest.ts plan.workers).
// 정수·BigInt만 쓴다.
import {
  type CityWorker,
  type EcoFacility,
  type LedgerBook,
  type LedgerEntry,
  type LivingOptions,
  type SimCity,
  type SimUnit,
  type SocietyCoefficients,
  cityWorkerUnits,
  humanPurseAccount,
  npcBaseDailyWage,
  restsPerDay,
} from "@terra/sim";
import type { BusinessCore } from "../business/core.ts";
import { type CityRestPlan, type WorkerRest, withUnpaidRest } from "./cityRest.ts";

export interface NpcWagesDeps {
  readonly book: LedgerBook;
  /** 거울 세계(도시 주인·휴먼) */
  readonly world: {
    readonly cities: ReadonlyMap<number, Pick<SimCity, "owner">>;
    readonly units: ReadonlyMap<number, Pick<SimUnit, "id" | "city" | "guard" | "owner">>;
  };
  /** 도시 경제(시설 일꾼 수) */
  readonly economy: {
    readonly facilities: ReadonlyMap<number, Pick<EcoFacility, "id" | "city" | "workers">>;
  };
  /** 사업장 장부(없으면 시험 — 숙박비는 숙소 주인 지갑, 임금은 국고) */
  readonly business?: Pick<BusinessCore, "vault" | "vaultBalance" | "invest" | "taxIncome"> | undefined;
  readonly restPlans: ReadonlyMap<number, CityRestPlan>;
  /** 세력 화폐 */
  currencyOf(owner: number): string;
  /** 도시 경제 시설의 건물 ID(도시 직무면 null) */
  buildingOf(facilityId: number): number | null;
  readonly rules: () => SocietyCoefficients;
}

/** 하루 숙박비 셈 */
export interface LodgingFees {
  readonly paid: bigint;
  readonly lodgings: number;
  /** 지갑이 모자라 다 내지 못한 일꾼 수 */
  readonly short: number;
}

/** 그 도시 일꾼마다 쉼터(시설 안 차례로 맞춘다 — "시설ID:차례") */
function restsByWorker(plan: CityRestPlan): Map<string, WorkerRest> {
  const out = new Map<string, WorkerRest>();
  const next = new Map<number, number>();
  for (const rest of plan.workers) {
    const index = next.get(rest.facilityId) ?? 0;
    next.set(rest.facilityId, index + 1);
    out.set(`${rest.facilityId}:${index}`, rest);
  }
  return out;
}

const workerKey = (worker: CityWorker): string => `${worker.facilityId}:${worker.index}`;

export function createNpcWages(deps: NpcWagesDeps): {
  /** runEconomy에 넘길 임금·생활비 선택(규칙은 부를 때마다 읽는다) */
  readonly living: LivingOptions;
  /** 하루 끝 뒤 숙박비(afterDay) */
  chargeLodgingFees(nowMs: number): LodgingFees;
  /** 새 쉼터 계획에 숙박비를 다 못 낸 일꾼의 회복 불이익을 얹는다(빈틈 2293 — 없으면 plan 그대로) */
  restPlan(cityId: number, plan: CityRestPlan): CityRestPlan;
} {
  const { book, world, economy } = deps;
  const wagesOn = (): boolean => Math.trunc(deps.rules().business.npcWageMode) === 1;
  const fee = (): bigint => BigInt(Math.max(0, Math.trunc(deps.rules().logistics.lodgingFeePerNight)));
  /** 도시 → 지난 숙박비를 다 못 낸 일꾼 휴먼(유닛 ID). 숙박비를 걷을 때마다 새로 센다 */
  const unpaid = new Map<number, Set<number>>();

  /** 그 도시 일꾼마다 낼 숙박비(남의 숙소 — 장부가 있으면 도시 주인 숙소도) */
  const dueOf = (
    cityId: number,
  ): { worker: CityWorker; lodgingId: number; owner: number; amount: bigint }[] => {
    const plan = deps.restPlans.get(cityId);
    const city = world.cities.get(cityId);
    const perNight = fee();
    if (!plan || !city || perNight <= 0n) return [];
    const rests = restsByWorker(plan);
    const c = deps.rules();
    const out = [];
    for (const worker of cityWorkerUnits(world, economy, cityId)) {
      const rest = rests.get(workerKey(worker));
      if (!rest || rest.lodgingId === null) continue;
      const owner = plan.owners.get(rest.lodgingId) ?? null;
      // 도시 주인 세력의 숙소도 요금을 낸다(사업장 장부가 있을 때 — D-555 1509·1514). 장부가 없으면 같은 주머니라 건너뛴다
      if (owner === null || (owner === city.owner && !deps.business)) continue;
      const nights = BigInt(restsPerDay(rest.place, rest.commuteCells, c));
      if (nights > 0n) out.push({ worker, lodgingId: rest.lodgingId, owner, amount: nights * perNight });
    }
    return out;
  };

  const living: LivingOptions = {
    rules: () => {
      const c = deps.rules();
      return {
        wageMode: c.business.npcWageMode,
        wagePm: c.business.npcWagePm,
        baseDailyWage: npcBaseDailyWage(c),
        foodEfficiency: c.foodEfficiency,
      };
    },
    wageSource: ({ facilityId, owner, currency, need, atMs }) => {
      const business = deps.business;
      const buildingId = deps.buildingOf(facilityId);
      if (!business || buildingId === null || deps.rules().business.npcBooks !== 1) return undefined;
      const have = business.vaultBalance(buildingId, owner, currency);
      // 금고가 모자라면 NPC 주인이 국고에서 운영 자금을 넣는다(국고도 모자라면 넣지 않는다 — 있는 만큼만 받는다)
      if (have < need) business.invest(buildingId, owner, currency, need - have, atMs);
      return business.vault(owner, currency, buildingId);
    },
    lodgingDue: (cityId) => {
      if (!wagesOn()) return undefined;
      const out = new Map<string, bigint>();
      for (const due of dueOf(cityId)) out.set(workerKey(due.worker), due.amount);
      return out;
    },
  };

  const chargeLodgingFees = (nowMs: number): LodgingFees => {
    let paid = 0n;
    let lodgings = 0;
    let short = 0;
    const purses = wagesOn();
    unpaid.clear();
    for (const cityId of [...deps.restPlans.keys()].toSorted((a, b) => a - b)) {
      const city = world.cities.get(cityId);
      if (!city) continue;
      const currency = deps.currencyOf(city.owner);
      const treasury = book.ownerAccount(city.owner, currency);
      // 숙소마다: 낸 사람(지갑 — 옛 판은 국고 하나)과 양
      const byLodging = new Map<number, { owner: number; entries: LedgerEntry[]; total: bigint }>();
      let treasuryLeft = book.balance(treasury);
      for (const due of dueOf(cityId)) {
        let from = treasury;
        let have = treasuryLeft;
        if (purses) {
          from = humanPurseAccount(
            book,
            world.units.get(due.worker.unitId)?.owner ?? city.owner,
            currency,
            due.worker.unitId,
          );
          have = book.balance(from);
        }
        const pay = have < due.amount ? have : due.amount;
        if (pay < due.amount) {
          short += 1;
          // 휴먼 지갑이 모자라면 회복이 떨어진다(빈틈 2293). 끈 판(국고가 냄)은 옛 판 — 불이익 없음
          if (purses) {
            const set = unpaid.get(cityId) ?? new Set<number>();
            set.add(due.worker.unitId);
            unpaid.set(cityId, set);
          }
        }
        if (pay <= 0n) continue;
        if (!purses) treasuryLeft -= pay;
        const entry = byLodging.get(due.lodgingId) ?? { owner: due.owner, entries: [], total: 0n };
        entry.entries.push({ account: from, amount: -pay });
        entry.total += pay;
        byLodging.set(due.lodgingId, entry);
      }
      for (const [lodgingId, entry] of [...byLodging].toSorted((a, b) => a[0] - b[0])) {
        // 사업장 금고로(D-548, 소득세는 금고에서) — 장부가 없으면 숙소 주인 지갑(옛 길)
        const to = deps.business
          ? deps.business.vault(entry.owner, currency, lodgingId)
          : book.ownerAccount(entry.owner, currency);
        book.post({
          kind: "lodging_fee",
          atMs: nowMs,
          key: `lodging_fee:${cityId}:${lodgingId}:${nowMs}`,
          entries: [...entry.entries, { account: to, amount: entry.total }],
        });
        deps.business?.taxIncome(lodgingId, entry.owner, currency, entry.total, nowMs);
        paid += entry.total;
        lodgings += 1;
      }
    }
    return { paid, lodgings, short };
  };

  const restPlan = (cityId: number, plan: CityRestPlan): CityRestPlan => {
    const units = unpaid.get(cityId);
    if (!units || units.size === 0) return plan;
    // 새 계획의 일꾼 자리(시설 ID 차례 × 일꾼 수)에 앉는 휴먼 = cityWorkerUnits(같은 나눔) — 못 낸 휴먼이 앉은 자리만 고른다
    const facilities = new Map<number, { id: number; city: number; workers: number }>();
    for (const rest of plan.workers) {
      const found = facilities.get(rest.facilityId) ?? { id: rest.facilityId, city: cityId, workers: 0 };
      found.workers += 1;
      facilities.set(rest.facilityId, found);
    }
    const slots = new Set<string>();
    for (const worker of cityWorkerUnits(world, { facilities }, cityId))
      if (units.has(worker.unitId)) slots.add(workerKey(worker));
    return withUnpaidRest(plan, slots, deps.rules());
  };

  return { living, chargeLodgingFees, restPlan };
}
