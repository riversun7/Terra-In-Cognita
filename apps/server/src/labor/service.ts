// 노동 계약 서비스(서버) — docs/adr/2026-11-03-labor-contracts.md, 기획 D-479·49 N48
// 판정(지급·일시 중지·자동 해고·유예·보증금)은 @terra/sim economy/laborContract.ts 한 벌이다. 여기는 소유·존재 확인, 저장, 화면 자료.
// - 정산: 소유 주체 정산(world/settlement.ts)이 이 서비스의 outputsFor를 부른다 → 그 주체가 유닛 소유 주체인 계약을 같은 시각까지
//   정산하고(임금·임대료 거래), 유닛마다 산출 구간을 돌려준다(임금형 = 고용주 몫, 일시 중지 = 산출 없음, 임대형 = 임차인 몫).
//   그래서 계약 정산과 직무 산출이 같은 동기 처리 = 같은 커밋에 들어간다.
// - 명령: 바꾸기 전에 일하는 쪽 주체를 지금까지 정산한다(상호작용 전 정산). 돈이 움직이면 커밋을 기다린 뒤 답한다(U2).
// - 유닛·시설이 사라지거나 유닛 주인이 바뀌면 마지막 정산 시각에 끝낸다(남은 보증금은 돌려준다).
// - [임시] 화폐 = 서버 시험 화폐(s3_test_credit), 산출 = 시험 광석. 임금을 받는 곳 = 유닛 소유 주체 지갑(서버에 휴먼 지갑이 아직 없다).
//   임금 = 효율점수 × 기준 단가(N27) × 고용주 조정(N28) — 유닛 스탯이 아직 없어 효율점수는 새 유닛 평균 1차 스탯 하나다.
import type { LaborResultCode } from "@terra/protocol";
import type {
  LaborContractView,
  LaborOverviewResponse,
  LaborBuildingView,
  LaborUnitView,
} from "@terra/shared/labor";
import {
  type LaborContract,
  type LaborRules,
  type OutputSegment,
  type SocietyCoefficients,
  checkLaborEscrow,
  defaultGatherStat,
  depositCyclesLeft,
  laborAccounts,
  laborWarning,
  openLabor,
  requiredDeposit,
  setLeaseRent,
  settleLabor,
  terminateLabor,
  topUpLabor,
  wage,
  wagePerCycle,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { ASSET_CREDIT, ASSET_ORE, type Settlement } from "../world/settlement.ts";
import { KEEP_ENDED_MS, type LoadedLabor, type RentRow, contractRow, rentRow } from "./store.ts";

const HOUR_MS = 3_600_000;

export type LaborCommandResult = { ok: true; contractId?: number } | { ok: false; code: LaborResultCode };

export interface LaborCreateInput {
  readonly kind: "wage" | "lease";
  readonly buildingId: number;
  readonly unitId: number;
  readonly adjustPm?: number | undefined;
  readonly termHours?: number | undefined;
}

export interface LaborService {
  /** 소유 주체 정산의 고리: 그 주체가 유닛 소유 주체인 계약을 toMs까지 정산하고, 유닛 ID → 산출 구간. 없으면 undefined */
  outputsFor(ownerId: number, fromMs: number, toMs: number): ReadonlyMap<number, OutputSegment[]> | undefined;
  create(userId: string, input: LaborCreateInput): Promise<LaborCommandResult>;
  terminate(userId: string, contractId: number): Promise<LaborCommandResult>;
  topUp(userId: string, contractId: number, amount: bigint): Promise<LaborCommandResult>;
  setRent(userId: string, buildingId: number, rent: bigint): Promise<LaborCommandResult>;
  overview(userId: string): LaborOverviewResponse;
  /** 메모리 불변 조건(I14: 에스크로 = 보증금) */
  check(): string[];
  readonly contracts: ReadonlyMap<number, LaborContract>;
}

/** 세력·사회 계수표에서 계약이 쓰는 값: N48 규칙과 임금 식(N27·N28) */
interface WageRules {
  readonly labor: LaborRules;
  readonly efficiency: number;
  readonly rateMilli: number;
  readonly adjustMinPm: number;
  readonly adjustMaxPm: number;
  readonly society: SocietyCoefficients;
}

function wageRulesOf(c: SocietyCoefficients): WageRules {
  return {
    labor: c.labor,
    // [임시] 기준 유닛 효율점수 = 새 유닛 평균 1차 스탯 하나(직무 가중치 합 1000‰이면 그대로, N9 초기 합 ÷ 6)
    efficiency: defaultGatherStat(c.cyborg.initialSum),
    rateMilli: c.wageRateMilli,
    adjustMinPm: c.employerAdjustMinPm,
    adjustMaxPm: c.employerAdjustMaxPm,
    society: c,
  };
}

function isOpen(c: LaborContract): boolean {
  return c.state === "active" || c.state === "paused";
}

const fail = (code: LaborResultCode): LaborCommandResult => ({ ok: false, code });

export function createLaborService(options: {
  loaded: LoadedLabor;
  maps: ReadonlyMap<number, SecondMap>;
  settlement: Settlement;
  ledger: Ledger;
  writer: WorldWriter;
  /** 세력·사회 계수표(설정 칸 실효 값, 부를 때마다 읽는다) */
  rules: () => SocietyCoefficients;
  now: () => number;
  ready: () => boolean;
}): LaborService {
  const { maps, settlement, ledger, writer, now } = options;
  const contracts = new Map<number, LaborContract>(options.loaded.contracts.map((c) => [c.id, c]));
  const rents = new Map<number, RentRow>(options.loaded.rents.map((r) => [r.buildingId, r]));
  let lastId = options.loaded.maxId;
  const accounts = laborAccounts(ledger);
  const save = (c: LaborContract): void => writer.upsert("laborContracts", contractRow(c));

  /** 유닛 주인(없으면 undefined) */
  const unitOwnerOf = (unitId: number): number | undefined => {
    for (const map of maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return info.ownerId;
    }
    return undefined;
  };
  /** 건물 주인(없는 건물이면 undefined, 주인 없음이면 null) */
  const buildingOwnerOf = (buildingId: number): number | null | undefined => {
    for (const map of maps.values()) {
      const owner = map.buildingOwner(buildingId);
      if (owner !== undefined) return owner;
    }
    return undefined;
  };
  const openContractOf = (unitId: number): LaborContract | undefined => {
    for (const c of contracts.values()) if (c.unitId === unitId && isOpen(c)) return c;
    return undefined;
  };
  const stockOf = (ownerId: number) => (): number => ledger.ownerAccount(ownerId, ASSET_ORE);

  /** 사라짐·주인 바뀜이면 마지막 정산 시각에 끝낸다. 끝냈으면 true */
  const endIfGone = (c: LaborContract): boolean => {
    const rules = wageRulesOf(options.rules()).labor;
    const unitOwner = unitOwnerOf(c.unitId);
    const buildingOwner = buildingOwnerOf(c.buildingId);
    const reason =
      unitOwner === undefined || unitOwner !== c.workerOwnerId
        ? "unit_gone"
        : buildingOwner === undefined || buildingOwner !== c.ownerId
          ? "building_gone"
          : null;
    if (reason === null) return false;
    terminateLabor(c, c.settledAtMs, reason, ledger, accounts, rules);
    save(c);
    return true;
  };

  const outputsFor = (
    ownerId: number,
    fromMs: number,
    toMs: number,
  ): ReadonlyMap<number, OutputSegment[]> | undefined => {
    const mine = [...contracts.values()]
      .filter((c) => c.workerOwnerId === ownerId && c.state !== "ended")
      .toSorted((a, b) => a.id - b.id);
    if (mine.length === 0) return undefined;
    const society = options.rules();
    const rules = wageRulesOf(society).labor;
    const productionOn = society.switches.productionEnabled !== 0;
    const out = new Map<number, OutputSegment[]>();
    for (const c of mine) {
      if (c.state !== "grace" && endIfGone(c)) continue;
      const start = c.settledAtMs;
      const segments = settleLabor(c, toMs, ledger, accounts, rules);
      save(c);
      if (c.state === "grace" || c.state === "ended") {
        if (!segments.some((segment) => segment.mode !== "free")) continue;
      }
      const list: OutputSegment[] = [];
      // 계약이 정산한 앞(주체 정산 구간이 더 이르면)은 계약 없는 몫
      if (start > fromMs) list.push({ untilMs: start, stock: productionOn ? stockOf(ownerId) : null });
      for (const segment of segments) {
        list.push({
          untilMs: segment.untilMs,
          stock:
            !productionOn || segment.mode === "idle"
              ? null
              : segment.mode === "work" && c.kind === "wage"
                ? stockOf(c.ownerId)
                : stockOf(ownerId),
        });
      }
      out.set(c.unitId, list);
    }
    return out.size > 0 ? out : undefined;
  };

  /** 명령을 받을 수 있나(세계 준비) + 사용자의 소유 주체 */
  const ownerFor = (userId: string, at: number): number | undefined =>
    options.ready() ? settlement.ownerOfUser(userId, at).id : undefined;

  const done = async (result: LaborCommandResult): Promise<LaborCommandResult> => {
    // 돈·소유가 바뀌는 명령은 커밋 뒤에 답한다(S3 U2)
    await writer.durable();
    return result;
  };

  return {
    outputsFor,
    contracts,
    async create(userId, input) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const buildingOwner = buildingOwnerOf(input.buildingId);
      if (buildingOwner === undefined) return fail("unknown_building");
      const unitOwner = unitOwnerOf(input.unitId);
      if (unitOwner === undefined) return fail("unknown_unit");
      if (unitOwner !== me) return fail("forbidden");
      if (openContractOf(input.unitId)) return fail("unit_busy");
      const rules = wageRulesOf(options.rules());
      let ownerId: number;
      let rate: bigint;
      if (input.kind === "wage") {
        if (buildingOwner !== me) return fail("forbidden");
        const adjust = input.adjustPm ?? 1000;
        if (adjust < rules.adjustMinPm || adjust > rules.adjustMaxPm) return fail("invalid_terms");
        const daily = BigInt(wage(rules.efficiency, rules.rateMilli, adjust, rules.society));
        rate = wagePerCycle(daily, rules.labor);
        ownerId = me;
      } else {
        if (buildingOwner === null) return fail("not_for_lease");
        if (buildingOwner === me) return fail("invalid_terms");
        const posted = rents.get(input.buildingId);
        if (!posted || posted.rentPerHour <= 0n || posted.ownerId !== buildingOwner)
          return fail("not_for_lease");
        rate = posted.rentPerHour;
        ownerId = buildingOwner;
      }
      // 일하는 쪽(유닛 소유 주체 = 나)을 지금까지 정산한 뒤 맺는다: 계약 구간이 주체 정산 시각에서 시작한다
      settlement.settleOwner(me, at);
      const result = openLabor(
        {
          id: lastId + 1,
          kind: input.kind,
          ownerId,
          workerOwnerId: me,
          unitId: input.unitId,
          buildingId: input.buildingId,
          asset: ASSET_CREDIT,
          rate,
          atMs: at,
          endsAtMs: input.termHours === undefined ? null : at + input.termHours * HOUR_MS,
        },
        ledger,
        accounts,
        rules.labor,
      );
      if (!result.ok) return fail(result.code);
      lastId += 1;
      contracts.set(result.contract.id, result.contract);
      save(result.contract);
      return done({ ok: true, contractId: result.contract.id });
    },
    async terminate(userId, contractId) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const c = contracts.get(contractId);
      if (!c) return fail("unknown_contract");
      if (me !== c.ownerId && me !== c.workerOwnerId) return fail("forbidden");
      settlement.settleOwner(c.workerOwnerId, at);
      const rules = wageRulesOf(options.rules()).labor;
      if (!terminateLabor(c, at, me === c.ownerId ? "owner" : "worker", ledger, accounts, rules))
        return fail("not_open");
      save(c);
      return done({ ok: true });
    },
    async topUp(userId, contractId, amount) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const c = contracts.get(contractId);
      if (!c) return fail("unknown_contract");
      if (me !== c.ownerId) return fail("forbidden");
      if (c.kind !== "wage") return fail("invalid_terms");
      settlement.settleOwner(c.workerOwnerId, at);
      const result = topUpLabor(c, amount, at, ledger, accounts, wageRulesOf(options.rules()).labor);
      if (!result.ok) return fail(result.code);
      save(c);
      return done({ ok: true });
    },
    async setRent(userId, buildingId, rent) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const buildingOwner = buildingOwnerOf(buildingId);
      if (buildingOwner === undefined) return fail("unknown_building");
      if (buildingOwner !== me) return fail("forbidden");
      // 그 시설의 열린 임대 계약: 임차인을 지금까지 정산한 뒤(지난 시간은 옛 값) 다음 시간부터 새 값
      if (rent > 0n) {
        for (const c of [...contracts.values()].toSorted((a, b) => a.id - b.id)) {
          if (c.kind !== "lease" || c.buildingId !== buildingId || !isOpen(c)) continue;
          settlement.settleOwner(c.workerOwnerId, at);
          if (setLeaseRent(c, rent)) save(c);
        }
      }
      const row: RentRow = {
        buildingId,
        ownerId: me,
        asset: ASSET_CREDIT,
        rentPerHour: rent,
        updatedAtMs: at,
      };
      rents.set(buildingId, row);
      writer.upsert("laborRents", rentRow(row));
      return done({ ok: true });
    },
    overview(userId) {
      const at = now();
      const rules = wageRulesOf(options.rules());
      const me = settlement.findOwnerOfUser(userId);
      const view = (c: LaborContract): LaborContractView => ({
        id: c.id,
        kind: c.kind,
        role: c.ownerId === c.workerOwnerId ? "both" : c.ownerId === me ? "owner" : "worker",
        unitId: c.unitId,
        buildingId: c.buildingId,
        rate: String(c.rate),
        deposit: String(c.deposit),
        cyclesLeft: Number(depositCyclesLeft(c)),
        warning: laborWarning(c, rules.labor),
        state: c.state,
        startedAt: c.startedAtMs,
        endsAt: c.endsAtMs,
        nextDueAt: isOpen(c) ? c.nextDueMs : null,
        graceUntil: c.graceUntilMs,
        endedAt: c.endedAtMs,
        endReason: c.endReason,
        paidTotal: String(c.paidTotal),
        settledAt: c.settledAtMs,
      });
      const list =
        me === undefined
          ? []
          : [...contracts.values()]
              .filter(
                (c) =>
                  (c.ownerId === me || c.workerOwnerId === me) &&
                  (c.state !== "ended" || (c.endedAtMs ?? 0) > at - KEEP_ENDED_MS),
              )
              .toSorted((a, b) => Number(!isOpen(a)) - Number(!isOpen(b)) || b.id - a.id)
              .map(view);
      const buildings: LaborBuildingView[] = [];
      const units: LaborUnitView[] = [];
      for (const map of maps.values()) {
        map.forEachBuilding((building) => {
          const rent = rents.get(building.id);
          const posted =
            rent && rent.rentPerHour > 0n && rent.ownerId === building.ownerId
              ? String(rent.rentPerHour)
              : null;
          const own = me !== undefined && building.ownerId === me;
          if (own || (posted !== null && building.ownerId !== null))
            buildings.push({ id: building.id, own, rent: posted });
        });
        if (me !== undefined)
          map.forEachUnit((unit) => {
            if (unit.ownerId === me)
              units.push({ id: unit.id, kind: unit.kind, busy: openContractOf(unit.id) !== undefined });
          });
      }
      return {
        status: options.ready() ? "ready" : "not_ready",
        generatedAt: at,
        currency: ASSET_CREDIT,
        balance: String(me === undefined ? 0n : ledger.balanceOf(me, ASSET_CREDIT)),
        rules: {
          wageCycleMs: rules.labor.wageCycleMs,
          depositDays: rules.labor.depositDays,
          warnDays: rules.labor.warnDays,
          rentCycleMs: rules.labor.rentCycleMs,
          graceMs: rules.labor.graceMs,
          adjustMinPm: rules.adjustMinPm,
          adjustMaxPm: rules.adjustMaxPm,
          efficiency: rules.efficiency,
          rateMilli: rules.rateMilli,
          depositCycles: Number(requiredDeposit(1n, rules.labor)),
        },
        contracts: list,
        buildings: buildings.toSorted((a, b) => Number(b.own) - Number(a.own) || a.id - b.id),
        units: units.toSorted((a, b) => a.id - b.id),
      };
    },
    check: () => checkLaborEscrow(contracts.values(), ledger),
  };
}
