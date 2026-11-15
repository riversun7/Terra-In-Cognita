// 플레이어 일꾼(직무 배치·노동 계약)의 숙소 회복 — 질문 1088 가(기획 정리 D-534 "추천대로": NPC 일꾼과 같은 숙소 규칙, D-013),
// docs/adr/2026-11-11-city-building-layout.md "바뀜 (2026-11-12 2차)".
// - 쉼터: 일터 건물이 선 도시의 숙소 가운데 NPC 도시 경제 계획이 쓰고 남은 침대(npc/cityRest.ts planPlayerRest — 유닛 ID 차례, 일터에서 가까운 곳).
//   침대가 없으면 집(설정 칸 lodging_home_recovery_pm). 도시 밖 일터·숙소 회복 끔(lodging_recovery_mode 0)이면 예전 규칙(정산 시험 규칙 = 숙소 Lv1 속도).
// - 회복: 쉼터 회복 배율(@terra/sim restRecoveryPm)을 정산 규칙에 얹는다(rulesWithRecovery — 피로 1점 푸는 시간 = 기본 ÷ 배율). 숙소 Lv1이면 예전과 같고,
//   집이면 느리다(3분에 1점), 숙소 Lv3이면 빠르다.
// - 요금(D-555 1508·1514, docs/adr/2026-11-15-business-ledger.md): 숙소에서 쉬면 일·쉼 한 바퀴(restPeriodMs)마다 하룻밤 요금(설정 칸
//   lodging_fee_per_night)을 그 유닛의 사유재산(유닛 지갑 = @terra/shared/businessBooks unitPurseLocation, D-097)에서 그 숙소 금고로 낸다(제 주인 숙소여도
//   — 유닛 돈과 주인 돈은 다르다). 지갑이 모자라면 남은 만큼만 내고, 그동안 회복이 떨어진다(노숙 회복 [임시]). 주인은 유닛에게 돈을 줄 수 있다
//   (선물 unit_gift). 화폐 = 서버 시험 화폐 [임시]. 바퀴 나머지 ms·못 낸 표시는 메모리(다시 켜면 0부터) [임시].
// - 도시 계획은 짧게(PLAN_TTL_MS) 들고 쓴다 — 정산마다 도시 숙소를 다시 훑지 않게. 정수만 쓴다.
import {
  type JobRules,
  type SocietyCoefficients,
  TEST_JOB_RULES,
  restPeriodMs,
  restRecoveryPm,
  rulesWithRecovery,
} from "@terra/sim";
import { unitPurseLocation } from "@terra/shared/businessBooks";
import type { BusinessCore } from "../business/core.ts";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldFacilities } from "../facilities/world.ts";
import { type CityRestPlaces, cityRestPlacesOf } from "../market/worldInput.ts";
import { type PlayerRest, type PlayerWorker, planPlayerRest } from "../npc/cityRest.ts";
import type { NpcRuntime } from "../npc/runtime.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { ASSET_CREDIT, type Settlement } from "../world/settlement.ts";
import type { LaborService } from "./service.ts";

/** 도시 계획을 다시 셈하기까지(ms) */
const PLAN_TTL_MS = 30_000;

export interface WorkerRestDeps {
  readonly rules: () => SocietyCoefficients;
  readonly now: () => number;
  /** 유닛이 일하는 시설(없으면 undefined) */
  workplaceOf(unitId: number): number | undefined;
  /** 시설 건물이 선 도시(없으면 null·undefined) */
  cityOf(buildingId: number): number | null | undefined;
  /** 그 도시에 선 시설에서 일하는 플레이어 일꾼(유닛 ID 차례 아니어도 된다) */
  workersIn(cityId: number): readonly PlayerWorker[];
  /** 그 도시 쉼터 자리(없으면 undefined) */
  places(cityId: number): CityRestPlaces | undefined;
  /** NPC 도시 경제 계획이 쓰는 침대(숙소 건물 ID → 수, 없으면 undefined) */
  npcTaken(cityId: number): ReadonlyMap<number, number> | undefined;
  /** 일꾼 유닛의 걷기 빠르기(단위/초, D-540 실효 AGI — 2차맵 유닛 speed). 없으면 기본 걷기 */
  speedOf?: ((unitId: number) => number | undefined) | undefined;
  /** 요금(없으면 요금 없음): 원장·화폐 */
  readonly ledger?: Ledger | undefined;
  readonly feeAsset?: string | undefined;
  /** 사업장 장부(숙소 금고로 받기·소득세). 없으면 숙소 주인 지갑(옛 길, 시험) */
  readonly business?: Pick<BusinessCore, "receive"> | undefined;
}

/** 일꾼 하나의 쉼터와 회복(화면·정산) */
export interface WorkerRestView extends PlayerRest {
  readonly cityId: number;
  /** 쉼터 회복 배율(‰, 숙소 없는 집 = lodging_home_recovery_pm) */
  readonly recoveryPm: number;
  /** 숙소 주인(집이면 null) */
  readonly lodgingOwner: number | null;
  /** 지난 숙박비를 다 내지 못해 회복이 떨어졌나(D-555 1508) */
  readonly unpaid: boolean;
}

export interface WorkerRest {
  /** 유닛의 지금 쉼터(일꾼이 아니거나 도시 밖·숙소 회복 끔이면 undefined) */
  restOf(unitId: number): WorkerRestView | undefined;
  /**
   * 소유 주체 정산이 부른다(settlement.restRules): 유닛마다 직무 규칙(없는 칸 = 기본). 일꾼이 하나도 없으면 undefined. 남의 숙소 요금도 이 구간
   * (fromMs, toMs] 몫을 낸다
   */
  rulesFor(
    ownerId: number,
    units: readonly { readonly id: number }[],
    fromMs: number,
    toMs: number,
  ): (JobRules | undefined)[] | undefined;
}

export function createWorkerRest(deps: WorkerRestDeps): WorkerRest {
  const plans = new Map<
    number,
    { atMs: number; rests: Map<number, PlayerRest>; owners: Map<number, number | null> }
  >();
  /** 유닛 → 요금 바퀴 나머지 ms */
  const carry = new Map<number, number>();
  /** 지난 숙박비를 다 내지 못한 유닛 */
  const unpaid = new Set<number>();

  const planOf = (cityId: number, nowMs: number) => {
    const cached = plans.get(cityId);
    if (cached && nowMs - cached.atMs < PLAN_TTL_MS && nowMs >= cached.atMs) return cached;
    const places = deps.places(cityId);
    if (!places) {
      plans.delete(cityId);
      return undefined;
    }
    const rests = planPlayerRest({
      workers: deps.workersIn(cityId),
      areas: places.areas,
      lodgings: places.lodgings,
      taken: deps.npcTaken(cityId),
      home: places.home,
      rules: deps.rules(),
    });
    const plan = { atMs: nowMs, rests, owners: new Map(places.lodgings.map((l) => [l.id, l.ownerId])) };
    plans.set(cityId, plan);
    return plan;
  };

  const restOf = (unitId: number): WorkerRestView | undefined => {
    const c = deps.rules();
    if (Math.trunc(c.logistics.lodgingMode) !== 1) return undefined;
    const buildingId = deps.workplaceOf(unitId);
    const cityId = buildingId === undefined ? undefined : deps.cityOf(buildingId);
    if (cityId === undefined || cityId === null) return undefined;
    const plan = planOf(cityId, deps.now());
    const rest = plan?.rests.get(unitId);
    if (!plan || !rest) return undefined;
    return {
      ...rest,
      cityId,
      recoveryPm: restRecoveryPm(rest.place, c),
      lodgingOwner: rest.lodgingId === null ? null : (plan.owners.get(rest.lodgingId) ?? null),
      unpaid: unpaid.has(unitId),
    };
  };

  /** 숙박비를 낸다. 다 냈거나 낼 것이 없으면 true */
  const chargeFee = (
    ownerId: number,
    unitId: number,
    rest: WorkerRestView,
    spanMs: number,
    atMs: number,
  ): boolean => {
    const c = deps.rules();
    const fee = BigInt(Math.max(0, Math.trunc(c.logistics.lodgingFeePerNight)));
    const ledger = deps.ledger;
    const asset = deps.feeAsset;
    if (!ledger || !asset || fee <= 0n || rest.lodgingOwner === null || rest.lodgingId === null) {
      carry.delete(unitId);
      unpaid.delete(unitId);
      return true;
    }
    const speed = deps.speedOf?.(unitId);
    const period = Math.max(1, restPeriodMs(rest.place, rest.commuteCells, c, TEST_JOB_RULES.cycleMs, speed));
    const total = (carry.get(unitId) ?? 0) + Math.max(0, spanMs);
    const nights = Math.floor(total / period);
    carry.set(unitId, total % period);
    if (nights <= 0) return !unpaid.has(unitId);
    // 유닛 사유재산(D-097)에서 낸다
    const from = ledger.ownerAccount(ownerId, asset, unitPurseLocation(unitId));
    const due = BigInt(nights) * fee;
    const have = ledger.balance(from);
    const pay = have < due ? have : due;
    if (pay < due) unpaid.add(unitId);
    else unpaid.delete(unitId);
    if (pay <= 0n) return false;
    const vaulted = deps.business?.receive({
      from,
      buildingId: rest.lodgingId,
      asset,
      amount: pay,
      kind: "lodging_fee",
      atMs,
    });
    if (!vaulted)
      ledger.post({
        kind: "lodging_fee",
        atMs,
        entries: [
          { account: from, amount: -pay },
          { account: ledger.ownerAccount(rest.lodgingOwner, asset), amount: pay },
        ],
      });
    return pay >= due;
  };

  return {
    restOf,
    rulesFor(ownerId, units, fromMs, toMs) {
      const c = deps.rules();
      let any = false;
      const out = units.map((unit) => {
        const rest = restOf(unit.id);
        if (!rest) return undefined;
        any = true;
        const paid = chargeFee(ownerId, unit.id, rest, toMs - fromMs, toMs);
        // 숙박비를 다 못 내면 회복이 떨어진다(D-555 1508, 노숙 회복 [임시])
        const recovery = paid ? rest.recoveryPm : restRecoveryPm({ kind: "homeless" }, c);
        return rulesWithRecovery(TEST_JOB_RULES, recovery, c);
      });
      return any ? out : undefined;
    },
  };
}

/** 세계 부품으로 일꾼 쉼터를 만들고 소유 주체 정산에 잇는다(world.ts가 부른다 — 1,000줄 상한 때문에 여기 둔다) */
export function attachWorkerRest(parts: {
  readonly settlement: Settlement;
  readonly labor: LaborService;
  readonly facilities: WorldFacilities;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly ledger: Ledger;
  readonly rules: () => SocietyCoefficients;
  readonly now: () => number;
  readonly npc: () => NpcRuntime | undefined;
}): WorkerRest {
  const { labor, facilities } = parts;
  const places = cityRestPlacesOf(facilities, parts.maps);
  const rest = createWorkerRest({
    rules: parts.rules,
    now: parts.now,
    workplaceOf: (unitId) => labor.workplaceOf(unitId),
    cityOf: (buildingId) => facilities.service.facilities.get(buildingId)?.cityId,
    workersIn: (cityId) =>
      [...facilities.service.facilities.values()]
        .filter((record) => record.cityId === cityId)
        .flatMap((record) =>
          labor
            .workersAt(record.buildingId)
            .map((entry) => ({ unitId: entry.unitId, buildingId: record.buildingId })),
        ),
    places: (cityId) => places(cityId, null),
    npcTaken: (cityId) => parts.npc()?.economy?.restPlan(cityId)?.occupancy,
    // 오감(일터 ↔ 쉼터) 시간은 그 일꾼의 걷기 빠르기로(D-540)
    speedOf: (unitId) => {
      for (const map of parts.maps.values()) {
        const info = map.unitInfo(unitId);
        if (info) return info.speed;
      }
      return undefined;
    },
    ledger: parts.ledger,
    feeAsset: ASSET_CREDIT,
    business: facilities.business,
  });
  parts.settlement.restRules((ownerId, units, fromMs, toMs) => rest.rulesFor(ownerId, units, fromMs, toMs));
  return rest;
}
