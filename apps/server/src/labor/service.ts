// 노동 계약 서비스(서버) — docs/adr/2026-11-03-labor-contracts.md, 기획 D-479·49 N48
// 판정(지급·일시 중지·자동 해고·유예·보증금)은 @terra/sim economy/laborContract.ts 한 벌이다. 여기는 소유·존재 확인, 저장, 화면 자료.
// - 정산: 소유 주체 정산(world/settlement.ts)이 이 서비스의 outputsFor를 부른다 → 그 주체가 유닛 소유 주체인 계약을 같은 시각까지
//   정산하고(임금·임대료 거래), 유닛마다 산출 구간을 돌려준다(임금형 = 고용주 몫, 일시 중지 = 산출 없음, 임대형 = 임차인 몫).
//   그래서 계약 정산과 직무 산출이 같은 동기 처리 = 같은 커밋에 들어간다.
// - 명령: 바꾸기 전에 일하는 쪽 주체를 지금까지 정산한다(상호작용 전 정산). 돈이 움직이면 커밋을 기다린 뒤 답한다(U2).
// - 유닛·시설이 사라지거나 유닛 주인이 바뀌면 마지막 정산 시각에 끝낸다(남은 보증금은 돌려준다). 임대형은 유닛이 사라져도 유예에
//   들고(임차인 물건, D-161 해석), 시설이 사라지면 유예 없이(유예 중이면 유예만) 끝낸다.
// - 구인 게시판(jobBoard.ts): 시설 주인이 일자리를 내고 남의 유닛 주인이 받으면 임금형 계약(고용주 ≠ 유닛 주인)이 된다.
// - [임시] 화폐 = 서버 시험 화폐(s3_test_credit), 산출 = 시험 광석. 임금을 받는 곳 = 휴먼의 유닛 지갑(사유재산, D-097·D-127·D-564 1631 —
//   wagePurse.ts. 재산이 없는 유닛은 소유 주체 지갑). 임금 = 효율점수 × 단가 × 고용주 조정(N28) — 유닛 스탯이 아직 없어 효율점수는 새 유닛 평균 1차 스탯 하나,
//   단가는 도시 노동 시장이 아직 없어 N27 기준 단가 그대로다(rules.ts).
// - 시설 창고(docs/adr/2026-11-07-buildings-runtime.md "바뀜 (창고·직무)", D-516 382): 임대형 임차인 몫 산출은 그 건물 창고(원장 위치 = 그
//   건물, @terra/shared/goodsPlaces buildingLocation)에 쌓인다. 유예 동안 임차인이 꺼내 가고(storage_move out), 유예가 끝나면 남은 것이
//   시설 주인 것이 된다(옛 StorageUtils expireGraceStorage — 같은 건물 창고에서 주인만 바뀐다). 옮기기는 산출 거래를 넣은 뒤(정산 뒤 고리)
//   한다. 임금형 몫은 예전처럼 고용주 기본 창고다(시설에 일꾼 물건이 남지 않는다).
// - 건물 작업(짓기·수리 등)에 묶인 유닛은 계약을 맺지 못한다(unit_busy, D-516 364 — 작업 동안 직무 산출이 없다).
// - 비활성(수명이 다한 휴먼, D-517)은 일하지 않는다: 계약을 맺지 못하고 열린 계약은 "유닛 사라짐"으로 끝난다(docs/adr/2026-11-07-temple-religion.md).
// - 플레이어 생산(docs/adr/2026-11-07-play-flow.md "WP3 플레이어 생산"): 채집 시설(팩 gather)에서 일한 구간은 시험 광석 대신 진짜 물건을 낸다
//   (workBook.ts goodsFor — 임금형·직무 배치 = 그 건물 창고(사업장 몫, D-569 1784), 임대형 = 그 건물 창고(임차인 몫)). 계약 밖 구간(앞·끝 뒤)은 산출이 없다
//   (그 구간에 시험 광석을 내던 개발 시험 일꾼은 없앴다 — 사용자 지적 2026-11-09 "시험일꾼 다 없애라고"). 계약을 맺으면 유닛 직무를
//   채집으로 켜고, 일이 끝나면 정산 뒤 고리가 끈다.
//   직무 배치(assign·unassign, 프로토콜 14)는 내 유닛을 내 채집 시설에 돈 없이 둔다(질문 521, 자리 = 레벨 × 레벨당 자리).
//   거래 직무(D-571 1944, ADR exchange-buildings "바뀜 (D-571)"): 남의 거래소에도 주인마다 exchange_trade_slots, 산출 없이 주문 한도를 늘린다.
// - 직무 위치·임대 상한(docs/adr/2026-11-07-play-flow.md "WP8", 기획 정리 D-518 522 ①·523 ②): 직무 배치·계약 맺기·구인 받기는 유닛이 그
//   시설과 같은 2차맵에 있어야 한다(wrong_map). 정산 때 유닛이 그 2차맵을 떠났으면 배치는 풀고 계약은 "유닛 사라짐"으로 끝낸다. 임대형
//   임차인 몫(그 건물 창고)은 그 건물 창고 상한(팩 시설 storageKg × 레벨, N50)까지만 쌓인다(workBook.ts leaseRooms).
import type { LaborResultCode } from "@terra/protocol";
import type {
  LaborBuildingContractView,
  LaborBuildingResponse,
  LaborContractView,
  LaborOverviewResponse,
  LaborBuildingView,
  LaborJobsResponse,
  LaborRulesView,
  LaborUnitView,
} from "@terra/shared/labor";
import {
  type LaborContract,
  type LaborEndReason,
  type LaborRules,
  type OutputSegment,
  type SocietyCoefficients,
  checkLaborEscrow,
  depositCyclesLeft,
  fundLaborDeposit,
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
import { buildingLocation } from "@terra/shared/goodsPlaces";
import type { WageNeed } from "../business/reserve.ts";
import type { Ledger } from "../economy/ledger.ts";
import {
  type ProductionSource,
  type StationHook,
  buildingReceiver,
  businessReceiver,
  createWorkBook,
} from "./workBook.ts";
import type { CityRow } from "../world/cities.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { ASSET_CREDIT, ASSET_ORE, type Settlement } from "../world/settlement.ts";
import { type JobBoardFilter, type LaborPostInput, createJobBoard } from "./jobBoard.ts";
import { wageRulesOf } from "./rules.ts";
import { npcQuits } from "./npcWait.ts";
import { fundDueWages } from "./wageFunding.ts";
import { wageWalletOf } from "./wagePurse.ts";
import { KEEP_ENDED_MS, type LoadedLabor, type RentRow, contractRow, rentRow } from "./store.ts";

const HOUR_MS = 3_600_000;

export type LaborCommandResult =
  | { ok: true; contractId?: number; jobId?: number }
  | { ok: false; code: LaborResultCode };

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
  /**
   * 관리 명령(해지·채우기·임대료·구인 내기·거두기)의 operator = 운영자 모드 연결(기획 D-560, 사용자 요청 2026-11-15 "주인의 건물관리 기능(운영자도
   * 조작가능)"): 주인·대주주가 아니어도 그 건물 주인 대신 한다. 대주주(사업장 지분 — business/shares.ts)도 주인 대신 한다(D-555 1502)
   */
  terminate(userId: string, contractId: number, operator?: boolean): Promise<LaborCommandResult>;
  topUp(userId: string, contractId: number, amount: bigint, operator?: boolean): Promise<LaborCommandResult>;
  setRent(userId: string, buildingId: number, rent: bigint, operator?: boolean): Promise<LaborCommandResult>;
  /** 구인 내기(내 시설, 시설마다 열린 게시 하나 — 다시 내면 바꾼다) */
  postJob(userId: string, input: LaborPostInput, operator?: boolean): Promise<LaborCommandResult>;
  /** 구인 거두기(낸 사람·관리하는 사람, 맺은 계약은 그대로) */
  withdrawJob(userId: string, jobId: number, operator?: boolean): Promise<LaborCommandResult>;
  /** 건물 하나의 노동 판(누구나 — 건물 판 [일꾼·계약] 칸) */
  building(userId: string, buildingId: number): LaborBuildingResponse;
  /** 구인 받기(남의 시설 일자리를 내 유닛으로 → 임금형 계약) */
  acceptJob(userId: string, jobId: number, unitId: number): Promise<LaborCommandResult>;
  overview(userId: string): LaborOverviewResponse;
  /** 구인 게시판(남이 낸 열린 일자리, 도시·시설로 거름) */
  jobs(userId: string, filter: JobBoardFilter): LaborJobsResponse;
  /** 메모리 불변 조건(I14: 에스크로 = 보증금) */
  check(): string[];
  /** 그 시설의 열린 임금형 계약 필요액(지급준비금, D-564 1623 — business/reserve.ts) */
  wageNeeds(buildingId: number, periodMs: number): WageNeed[];
  /** 그 계약 보증금을 사업장 금고에서 더 묶는다(정산의 지급준비금 자동 채우기, D-564 1624). 묶은 양 */
  fundDeposit(contractId: number, amount: bigint, atMs: number): bigint;
  readonly contracts: ReadonlyMap<number, LaborContract>;
  /** 유닛에 열린 계약(일함·일시 중지)이 있거나 비활성(D-517)·수호신(기획 답 456 가)인가 — 건물 작업 일꾼·공격 유닛 확인 */
  unitBusy(unitId: number): boolean;
  /** 일하지 않는 유닛인가(비활성·수호신, unitAway 고리) — 건물 공격 수비 고르기가 뺀다(수호신은 도시 방어가 따로 넣는다) */
  unitAway(unitId: number): boolean;
  /** 건물에 지금 일하는 계약(active)이 있나 — 건물 사용 닳음(D-509) */
  buildingInUse(buildingId: number): boolean;
  /** 유닛이 일하는 건물(직무 배치, 없으면 열린 노동 계약). 없으면 undefined — 유닛 화면 컨디션(D-534)의 도시 */
  assignedTo(unitId: number): number | undefined;
  /**
   * 정산 뒤 고리(소유 주체 정산이 산출 거래를 넣은 뒤 부른다): 그 주체의 유예가 끝난 임대형 계약의 남은 물건을 시설 주인에게, 일이 끝난
   * 플레이어 유닛의 직무 끄기
   */
  afterSettle(ownerId: number, toMs: number): void;
  /** 직무 배치(프로토콜 14): 내 유닛을 내 채집 시설에 돈 없이 둔다(질문 521) */
  assign(userId: string, buildingId: number, unitId: number): Promise<LaborCommandResult>;
  /** 직무 배치 풀기(배치한 사람만) */
  unassign(userId: string, unitId: number): Promise<LaborCommandResult>;
  /** 그 시설에서 일하는 유닛(직무 배치 + 열린 노동 계약, 유닛 ID 차례) — 건물 화면 */
  workersAt(buildingId: number): readonly LaborWorkerEntry[];
  /**
   * 그 시설의 시간당 인건비(적정가 — 기획 D-570 1822): 열린 임금형 계약 임금 + 직무 배치 유닛은 기준 임금(조정 1000‰)으로 친다. 임대형(임차인
   * 몫)은 뺀다. 화폐 최소 단위, 올림
   */
  hourlyLabor(buildingId: number): bigint;
  /** 유닛이 일하는 시설(열린 노동 계약 또는 직무 배치, 없으면 undefined) — 일꾼 쉼터(질문 1088 가)·채집소 운반꾼(1090 가) */
  workplaceOf(unitId: number): number | undefined;
  /** 채집 산출 자료를 잇는다(건물 서비스 — facilities/world.ts attachLabor) */
  attachProduction(source: ProductionSource | undefined): void;
  /** 채집소 고리를 잇는다(gather/station.ts — 반경 안 오브젝트·채집소 창고·레벨 버프, 사용자 지적 2026-11-08) */
  attachStation(hook: StationHook | undefined): void;
  /** 사업장 장부를 잇는다(건물 세계 — 보증금 적자·임대료 소득세, D-555 1503·1504) */
  attachBusiness(hook: LaborBusinessHook | undefined): void;
}

/** 노동 계약이 쓰는 사업장 장부 고리(business/core.ts의 일부) */
export interface LaborBusinessHook {
  advance(buildingId: number, ownerId: number, asset: string, needed: bigint, atMs: number): bigint;
  taxIncome(buildingId: number, ownerId: number, asset: string, gross: bigint, atMs: number): bigint;
  /** 주인 대신 관리할 수 있나(가장 많은 주주 — D-555 1502). 없으면 주인만 */
  mayManage?(buildingId: number, ownerId: number): boolean;
  /**
   * 새 임금형 계약의 보증금(D-564 1624 "보증금은 있는 만큼만"): 묶을 보증금 = 금고에 있는 만큼(perCycle 이상 full 이하). undefined = 고용을
   * 막는다(D-570 1789 — 금고에 한 주기 임금도 없거나 멈춘 사업장). 고리가 없으면 예전처럼 full 전부를 advance로
   */
  fundDeposit?(
    buildingId: number,
    ownerId: number,
    asset: string,
    perCycle: bigint,
    full: bigint,
    atMs: number,
  ): bigint | undefined;
  /** 멈춘 사업장인가(적자를 한 주기 넘게 못 갚음, D-555 1504) — 멈추면 임금을 더 채우지 않는다 */
  suspended?(buildingId: number): boolean;
  /** 마지막 적자 주기 뒤 멈춤(D-570 1789 — business/core.ts stopAfter). 없으면 멈춤을 정하지 않는다(시험) */
  stopAfter?(buildingId: number, atMs: number): void;
  /** 사업장 금고 잔고(화폐 하나). 없으면 0 */
  vaultBalance?(buildingId: number, ownerId: number, asset: string): bigint;
}

/** 시설에서 일하는 유닛 하나 */
export interface LaborWorkerEntry {
  readonly unitId: number;
  /** assign = 직무 배치, wage·lease = 노동 계약 */
  readonly via: "assign" | "wage" | "lease";
  /** 유닛 소유 주체 */
  readonly workerOwnerId: number;
}

function isOpen(c: LaborContract): boolean {
  return c.state === "active" || c.state === "paused";
}

const fail = (code: LaborResultCode): LaborCommandResult => ({ ok: false, code });

/** 끝난 계약이 완전히 끝난 시각: 유예를 거쳤으면 유예 끝(물건이 넘어간 시각), 아니면 해지 시각 */
const finishedAt = (c: LaborContract): number => Math.max(c.endedAtMs ?? 0, c.leftoversMovedAtMs ?? 0);

export function createLaborService(options: {
  loaded: LoadedLabor;
  maps: ReadonlyMap<number, SecondMap>;
  /** 도시(부팅 때 읽은 것, 구인 게시판의 가까운 도시) */
  cities?: readonly CityRow[] | undefined;
  settlement: Settlement;
  ledger: Ledger;
  writer: WorldWriter;
  /** 세력·사회 계수표(설정 칸 실효 값, 부를 때마다 읽는다) */
  rules: () => SocietyCoefficients;
  now: () => number;
  ready: () => boolean;
  /**
   * 그 건물(시설)이 지금 일하나(건물 서비스: 짓는 중·30% 미만이면 false, 49 N50). 없으면 늘 true. false면 그 계약의 일한 구간은 산출이
   * 없다(임금·임대료는 계약대로 — 고치는 것은 주인 몫)
   */
  buildingWorks?: ((buildingId: number) => boolean) | undefined;
  /** 그 유닛이 건물 작업에 묶였나(건물 서비스). 묶였으면 계약을 맺지 못한다. 없으면 늘 false */
  unitInJob?: ((unitId: number) => boolean) | undefined;
  /**
   * 그 유닛이 일을 멈췄나(비활성 — 수명이 다한 휴먼, D-517, docs/adr/2026-11-07-temple-religion.md — 또는 수호신, 기획 답 456 가). 멈췄으면
   * 계약을 맺지 못하고, 열린 계약은 다음 정산에서 "유닛 사라짐"으로 끝난다(옛 LifeEngine _processWraith "활성 계약 종료"). 없으면 늘 false
   */
  unitAway?: ((unitId: number) => boolean) | undefined;
  /** 그 건물 산출 더하기 ‰(그 도시 수호신 생산 버프, 기획 답 470 가). 일한 구간에만 든다. 없으면 0 */
  outputBonusPm?: ((buildingId: number) => number) | undefined;
  /** NPC 세력 주체의 성향(일시 중지 계약을 기다릴지 — D-573 2045, npcWait.ts). 플레이어·모르면 undefined(처리할 일로 손으로) */
  npcTraits?: ((ownerId: number) => { readonly commerce: number } | undefined) | undefined;
}): LaborService {
  const { maps, settlement, ledger, writer, now } = options;
  const contracts = new Map<number, LaborContract>(options.loaded.contracts.map((c) => [c.id, c]));
  const rents = new Map<number, RentRow>(options.loaded.rents.map((r) => [r.buildingId, r]));
  let lastId = options.loaded.maxId;
  // 시설 주인 쪽 = 그 시설의 사업장 금고(D-548·D-555 1504): 보증금·채우기를 내고, 돌려받고(옛 계약도 금고로 — 주인이 정산으로 꺼낸다),
  // 임대료를 받는다(소득세는 정산 뒤 taxRent)
  // 임금을 받는 곳 = 휴먼의 유닛 지갑(D-097·D-564 1631, wagePurse.ts)
  const accounts = laborAccounts(ledger, wageWalletOf(ledger, maps), (c) =>
    ledger.ownerAccount(c.ownerId, c.asset, buildingLocation(c.buildingId)),
  );
  let business: LaborBusinessHook | undefined;
  /** 임대료 소득세(D-555 1503): 정산 전후 낸 임대료 차이 */
  const taxRent = (c: LaborContract, paidBefore: bigint, atMs: number): void => {
    if (c.kind !== "lease" || c.paidTotal <= paidBefore) return;
    business?.taxIncome(c.buildingId, c.ownerId, c.asset, c.paidTotal - paidBefore, atMs);
  };
  const save = (c: LaborContract): void => writer.upsert("laborContracts", contractRow(c));
  /**
   * 새 임금형 계약 보증금(D-564 1624): 사업장 고리가 있으면 금고에 있는 만큼(한 주기 임금 이상), null = 고용을 막는다(D-570 1789), 고리가 없으면
   * undefined(= N48 날수 전부, 예전 길)
   */
  const depositFor = (
    buildingId: number,
    ownerId: number,
    asset: string,
    perCycle: bigint,
    atMs: number,
  ): bigint | null | undefined => {
    const full = requiredDeposit(perCycle, wageRulesOf(options.rules()).labor);
    if (business?.fundDeposit)
      return business.fundDeposit(buildingId, ownerId, asset, perCycle, full, atMs) ?? null;
    business?.advance(buildingId, ownerId, asset, full, atMs);
    return undefined;
  };
  const work = createWorkBook({
    loaded: options.loaded.work ?? [],
    maps,
    ledger,
    writer,
    rules: options.rules,
    now,
  });

  /** 유닛 주인(없으면 undefined) */
  const unitOwnerOf = (unitId: number): number | undefined => {
    for (const map of maps.values()) {
      const info = map.unitInfo(unitId);
      if (info) return info.ownerId;
    }
    return undefined;
  };
  /** 유닛이 그 시설과 같은 2차맵에 있나(522 ①, 가장 단순한 위치 조건). 유닛·시설이 없으면 false */
  const onSiteMap = (unitId: number, buildingId: number): boolean => {
    for (const map of maps.values())
      if (map.unitInfo(unitId)) return map.buildingOwner(buildingId) !== undefined;
    return false;
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
  /** 임대형 임차인 몫 = 그 건물 창고(위치 = 건물) */
  const buildingStockOf = (ownerId: number, buildingId: number) => (): number =>
    ledger.ownerAccount(ownerId, ASSET_ORE, buildingLocation(buildingId));
  /** 계약·직무 배치·건물 작업 중인 유닛 */
  const unitBusy = (unitId: number): boolean =>
    openContractOf(unitId) !== undefined ||
    work.assignedTo(unitId) !== undefined ||
    (options.unitInJob?.(unitId) ?? false) ||
    (options.unitAway?.(unitId) ?? false);
  /** 지금 일하는 유닛(열린 계약 또는 직무 배치) — 정산 뒤 직무 끄기가 남긴다 */
  const working = (unitId: number): boolean =>
    openContractOf(unitId) !== undefined || work.assignedTo(unitId) !== undefined;
  /** 그 시설에서 일하는 유닛 */
  const workersAt = (buildingId: number): LaborWorkerEntry[] => {
    const out: LaborWorkerEntry[] = [];
    for (const c of contracts.values())
      if (c.buildingId === buildingId && isOpen(c))
        out.push({ unitId: c.unitId, via: c.kind, workerOwnerId: c.workerOwnerId });
    for (const unitId of work.assignedAt(buildingId)) {
      const owner = unitOwnerOf(unitId);
      if (owner !== undefined) out.push({ unitId, via: "assign", workerOwnerId: owner });
    }
    return out.toSorted((a, b) => a.unitId - b.unitId);
  };
  /** 직무 배치를 받는 일터: 채집 시설 또는 채집이 아닌 일터(병원 의사, D-521 — 산출 없음) */
  const workplaceOf = (buildingId: number): { readonly level: number; readonly slots: number } | undefined =>
    work.source()?.site(buildingId) ?? work.source()?.workplace?.(buildingId);
  /**
   * 직무 배치가 끝날 까닭(유닛 사라짐·주인 바뀜·일 멈춤, 시설 사라짐·주인 바뀜·채집 시설 아님). 그대로면 false. 풀면 그 구간 산출은 없다
   */
  const assignmentGone = (unitId: number, ownerId: number, buildingId: number): boolean => {
    const desk = work.source()?.tradeDesk?.(buildingId);
    return (
      unitOwnerOf(unitId) !== ownerId ||
      (options.unitAway?.(unitId) ?? false) ||
      // 거래 직무는 남의 거래소에 둔다(건물이 남아 있기만 하면 된다)
      (desk ? buildingOwnerOf(buildingId) === undefined : buildingOwnerOf(buildingId) !== ownerId) ||
      (desk === undefined && workplaceOf(buildingId) === undefined) ||
      !onSiteMap(unitId, buildingId)
    );
  };
  /** 이번 정산에서 유예가 끝난 임대형 계약(정산 뒤 고리가 남은 물건을 옮긴다) */
  const leftoverQueue: LaborContract[] = [];

  /** 사라짐·주인 바뀜이면 그 사유(유닛이 먼저). 그대로면 null */
  const goneReason = (c: LaborContract): LaborEndReason | null => {
    const unitOwner = unitOwnerOf(c.unitId);
    // 비활성(일하지 않음)도 유닛이 사라진 것처럼 끝낸다
    if (unitOwner === undefined || unitOwner !== c.workerOwnerId || (options.unitAway?.(c.unitId) ?? false))
      return "unit_gone";
    const buildingOwner = buildingOwnerOf(c.buildingId);
    if (buildingOwner === undefined || buildingOwner !== c.ownerId) return "building_gone";
    // 유닛이 그 시설의 2차맵을 떠났으면 유닛이 사라진 것처럼 끝낸다(522 ①)
    return onSiteMap(c.unitId, c.buildingId) ? null : "unit_gone";
  };
  /**
   * 사라짐·주인 바뀜이면 마지막 정산 시각에 해지한다(임금형 끝·임대형 유예, 시설이 사라지면 유예 없이). 유예 중이면 시설이
   * 사라졌을 때만 유예를 끝낸다(유닛은 유예 동안 계약에 묶이지 않는다). 해지했으면 true
   */
  const endIfGone = (c: LaborContract): boolean => {
    const reason = goneReason(c);
    if (reason === null || (c.state === "grace" && reason !== "building_gone")) return false;
    terminateLabor(c, c.settledAtMs, reason, ledger, accounts, wageRulesOf(options.rules()).labor);
    save(c);
    return true;
  };

  /** NPC 일꾼 소유자의 일시 중지 계약 판단(D-573 2045, npcWait.ts): 기다리는 날이 지나면 해지(worker)하고 다른 곳으로 */
  const npcDecide = (c: LaborContract, toMs: number): void => {
    const traits = c.state === "paused" ? options.npcTraits?.(c.workerOwnerId) : undefined;
    const society = options.rules();
    const range = { traitMin: society.npc.traitMin, traitMax: society.npc.traitMax };
    const waitDays = society.business.npcWaitDays;
    if (
      traits &&
      npcQuits({ commerce: traits.commerce, waitDays, range, pausedSinceMs: c.nextDueMs, nowMs: toMs })
    )
      terminateLabor(c, toMs, "worker", ledger, accounts, wageRulesOf(society).labor);
  };

  /** 정산 구간 임금 채우기(wageFunding.ts — D-573 2042 진행 중인 생산 주기만 마지막 적자) */
  const fundDue = (c: LaborContract, toMs: number, rules: LaborRules): void =>
    fundDueWages({
      contract: c,
      toMs,
      rules,
      business,
      ledger,
      accounts,
      inProgress: (unitId, buildingId) => work.inProgress(unitId, buildingId),
    });

  const outputsFor = (
    ownerId: number,
    fromMs: number,
    toMs: number,
  ): ReadonlyMap<number, OutputSegment[]> | undefined => {
    const mine = [...contracts.values()]
      .filter((c) => c.workerOwnerId === ownerId && c.state !== "ended")
      .toSorted((a, b) => a.id - b.id);
    const assigned = work.assignmentsOf(ownerId);
    if (mine.length === 0 && assigned.length === 0) return undefined;
    const society = options.rules();
    const rules = wageRulesOf(society).labor;
    const productionOn = society.switches.productionEnabled !== 0;
    // 임대형 임차인 몫이 쌓이는 건물 창고의 남은 자리(이번 정산 안에서 함께 줄인다, 523 ②)
    const rooms = work.leaseRooms();
    const out = new Map<number, OutputSegment[]>();
    for (const c of mine) {
      // 사라진 유닛·시설의 산출은 나누지 않는다(유예에 들었으면 다음 정산부터 시각만 흐른다). 플레이어 유닛은 그 구간 산출이 없다
      if (endIfGone(c)) {
        out.set(c.unitId, [{ untilMs: toMs, stock: null }]);
        continue;
      }
      const start = c.settledAtMs;
      const movedBefore = c.leftoversMovedAtMs;
      const paidBefore = c.paidTotal;
      fundDue(c, toMs, rules);
      const segments = settleLabor(c, toMs, ledger, accounts, rules);
      npcDecide(c, toMs);
      taxRent(c, paidBefore, toMs);
      save(c);
      // 이번 정산에서 유예가 끝났으면(한 번에 일함 → 유예 → 끝이어도) 정산 뒤에 남은 물건을 옮긴다
      if (c.kind === "lease" && c.leftoversMovedAtMs !== null && c.leftoversMovedAtMs !== movedBefore)
        leftoverQueue.push(c);
      if (c.state === "grace" || c.state === "ended") {
        if (!segments.some((segment) => segment.mode !== "free")) continue;
      }
      const list: OutputSegment[] = [];
      // 계약이 정산한 앞(주체 정산 구간이 더 이르면)은 계약 없는 몫(산출 없음)
      if (start > fromMs) list.push({ untilMs: start, stock: null });
      // 시설이 일하지 않으면(짓는 중·30% 미만, N50) 계약대로 일한 구간도 산출이 없다. 정산하는 때의 상태로 본다(분 단위 노화)
      const works = options.buildingWorks?.(c.buildingId) ?? true;
      // 그 도시 수호신 생산 버프(470 가): 일한 구간 산출에 ‰ 덤
      const bonusPm = works ? (options.outputBonusPm?.(c.buildingId) ?? 0) : 0;
      // 채집 시설이면 진짜 물건(임금형 = 고용주의 그 건물 창고(사업장 창고, D-569 1784), 임대형 = 임차인의 그 건물 창고). 아니면 예전처럼 시험 광석
      const goods = work.goodsFor(
        c.unitId,
        ownerId,
        c.buildingId,
        c.kind === "wage" ? businessReceiver(c.ownerId) : buildingReceiver(ownerId),
        c.kind === "lease" ? rooms : undefined,
        rooms,
      );
      for (const segment of segments) {
        const producing = productionOn && segment.mode === "work" && works;
        list.push({
          untilMs: segment.untilMs,
          ...(bonusPm > 0 && segment.mode === "work" ? { bonusPm } : {}),
          ...(producing && goods ? { goods } : {}),
          // 일한 구간만 산출(임금형 = 고용주 창고, 임대형 = 임차인의 그 건물 창고). 쉼·계약 밖은 산출 없음
          stock: !producing
            ? null
            : c.kind === "wage"
              ? stockOf(c.ownerId)
              : buildingStockOf(ownerId, c.buildingId),
        });
      }
      out.set(c.unitId, list);
    }
    // 직무 배치(돈 없음, 질문 521): 정산 구간 내내 그 시설에서 일한다(배치·풀기 전에 정산하므로 구간 안에서 바뀌지 않는다)
    for (const record of assigned) {
      const buildingId = record.buildingId;
      if (buildingId === null) continue;
      if (assignmentGone(record.unitId, ownerId, buildingId)) {
        work.unassign(record.unitId, fromMs);
        if (unitOwnerOf(record.unitId) !== undefined)
          out.set(record.unitId, [{ untilMs: toMs, stock: null }]);
        continue;
      }
      const works = productionOn && (options.buildingWorks?.(buildingId) ?? true);
      const bonusPm = works ? (options.outputBonusPm?.(buildingId) ?? 0) : 0;
      const goods = works
        ? work.goodsFor(record.unitId, ownerId, buildingId, businessReceiver(ownerId), undefined, rooms)
        : undefined;
      out.set(record.unitId, [
        goods
          ? { untilMs: toMs, stock: stockOf(ownerId), goods, ...(bonusPm > 0 ? { bonusPm } : {}) }
          : { untilMs: toMs, stock: null },
      ]);
    }
    return out.size > 0 ? out : undefined;
  };

  /** 명령을 받을 수 있나(세계 준비) + 사용자의 소유 주체 */
  const ownerFor = (userId: string, at: number): number | undefined =>
    options.ready() ? settlement.ownerOfUser(userId, at).id : undefined;

  /**
   * 그 건물을 관리하는 사람이면 건물 주인(계약·게시의 고용주 = 주인 — 돈은 그 사업장 금고, D-555): 주인, 가장 많은 주주, 운영자 모드.
   * 없는 건물이면 unknown_building, 주인 없음·관리 못 함이면 forbidden
   */
  const managedOwner = (
    me: number,
    buildingId: number,
    operator: boolean,
  ): { ok: true; ownerId: number } | { ok: false; code: LaborResultCode } => {
    const owner = buildingOwnerOf(buildingId);
    if (owner === undefined) return { ok: false, code: "unknown_building" };
    if (owner === null) return { ok: false, code: "forbidden" };
    if (owner === me || operator || business?.mayManage?.(buildingId, me) === true)
      return { ok: true, ownerId: owner };
    return { ok: false, code: "forbidden" };
  };
  /** 화면 규칙 값 */
  const rulesView = (): LaborRulesView => {
    const rules = wageRulesOf(options.rules());
    return {
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
    };
  };

  const done = async (result: LaborCommandResult): Promise<LaborCommandResult> => {
    // 돈·소유가 바뀌는 명령은 커밋 뒤에 답한다(S3 U2)
    await writer.durable();
    return result;
  };

  const board = createJobBoard({
    loaded: options.loaded,
    maps,
    cities: options.cities ?? [],
    settlement,
    ledger,
    writer,
    accounts,
    rules: () => wageRulesOf(options.rules()),
    unitOwnerOf,
    buildingOwnerOf,
    unitBusy,
    onSiteMap,
    nextContractId: () => lastId + 1,
    addContract: (c) => {
      lastId = Math.max(lastId, c.id);
      contracts.set(c.id, c);
      save(c);
      // 받은 유닛이 일을 시작한다(직무 = 채집)
      work.startJob(c.unitId);
    },
    fundDeposit: (buildingId, ownerId, asset, perCycle, atMs) =>
      depositFor(buildingId, ownerId, asset, perCycle, atMs),
  });
  /** 구인 명령 공통: 세계 준비·내 주체 → 판단 → 바뀌었으면 커밋 뒤 답 */
  const jobCommand = async (
    userId: string,
    run: (me: number, at: number) => LaborCommandResult,
  ): Promise<LaborCommandResult> => {
    const at = now();
    const me = ownerFor(userId, at);
    if (me === undefined) return fail("busy");
    const result = run(me, at);
    return result.ok ? done(result) : result;
  };

  return {
    outputsFor,
    contracts,
    unitBusy: (unitId) => working(unitId) || (options.unitAway?.(unitId) ?? false),
    assignedTo: (unitId) => work.assignedTo(unitId) ?? openContractOf(unitId)?.buildingId,
    unitAway: (unitId) => options.unitAway?.(unitId) ?? false,
    workersAt,
    hourlyLabor(buildingId) {
      const rules = wageRulesOf(options.rules());
      const cycle = BigInt(Math.max(1, rules.labor.wageCycleMs));
      const base = wagePerCycle(
        BigInt(wage(rules.efficiency, rules.rateMilli, 1000, rules.society)),
        rules.labor,
      );
      let perCycle = 0n;
      for (const entry of workersAt(buildingId)) {
        if (entry.via === "lease") continue;
        const c = entry.via === "wage" ? openContractOf(entry.unitId) : undefined;
        perCycle += c ? c.rate : base;
      }
      return (perCycle * BigInt(HOUR_MS) + cycle - 1n) / cycle;
    },
    workplaceOf(unitId) {
      for (const c of contracts.values()) if (c.unitId === unitId && isOpen(c)) return c.buildingId;
      return work.assignedTo(unitId);
    },
    attachProduction: (source) => work.attach(source),
    attachStation: (hook) => work.attachStation(hook),
    attachBusiness(hook) {
      business = hook;
    },
    afterSettle(ownerId) {
      // 채집소 일꾼 피로 덜기(직무 상태를 적은 뒤, 직무를 끄기 전)
      work.station()?.afterSettle(ownerId);
      // 일이 끝난 플레이어 유닛(계약 끝·배치 풀림)의 직무를 끈다(그 구간 산출은 이미 없었다)
      work.stopIdle(ownerId, working);
      for (const c of leftoverQueue.splice(0)) {
        if (c.workerOwnerId !== ownerId) {
          leftoverQueue.push(c);
          continue;
        }
        // 같은 건물에 그 임차인의 다른 임대형 계약이 아직 열려 있거나 유예 중이면 그 물건은 그 계약 몫이라 그대로 둔다
        const shared = [...contracts.values()].some(
          (other) =>
            other.id !== c.id &&
            other.kind === "lease" &&
            other.workerOwnerId === c.workerOwnerId &&
            other.buildingId === c.buildingId &&
            other.state !== "ended",
        );
        if (shared) continue;
        const here = buildingLocation(c.buildingId);
        const entries: { account: number; amount: bigint }[] = [];
        // 먼저 모은다(옮길 계정을 만들며 장부를 도는 동안 계정이 늘지 않게)
        const left = [...ledger.accounts()].filter(
          (account) =>
            account.ownerId === c.workerOwnerId && account.location === here && account.balance > 0n,
        );
        for (const account of left) {
          entries.push({ account: account.id, amount: -account.balance });
          entries.push({
            account: ledger.ownerAccount(c.ownerId, account.asset, here),
            amount: account.balance,
          });
        }
        if (entries.length > 0)
          ledger.post({ kind: "labor_leftovers", atMs: c.leftoversMovedAtMs ?? 0, entries });
      }
    },
    buildingInUse(buildingId) {
      for (const c of contracts.values())
        if (c.buildingId === buildingId && c.state === "active") return true;
      return work.assignedAt(buildingId).length > 0;
    },
    async create(userId, input) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const buildingOwner = buildingOwnerOf(input.buildingId);
      if (buildingOwner === undefined) return fail("unknown_building");
      const unitOwner = unitOwnerOf(input.unitId);
      if (unitOwner === undefined) return fail("unknown_unit");
      if (unitOwner !== me) return fail("forbidden");
      if (!onSiteMap(input.unitId, input.buildingId)) return fail("wrong_map");
      if (unitBusy(input.unitId)) return fail("unit_busy");
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
      // 임금형 보증금은 그 사업장 금고에서(D-555 1504) — 있는 만큼만 묶고(D-564 1624), 한 주기 임금도 없으면 고용을 막는다(D-570 1789)
      const deposit =
        input.kind === "wage" && rate > 0n && (input.termHours === undefined || input.termHours > 0)
          ? depositFor(input.buildingId, ownerId, ASSET_CREDIT, rate, at)
          : undefined;
      if (deposit === null) return fail("insufficient_funds");
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
          deposit,
        },
        ledger,
        accounts,
        rules.labor,
      );
      if (!result.ok) return fail(result.code);
      taxRent(result.contract, 0n, at);
      lastId += 1;
      contracts.set(result.contract.id, result.contract);
      save(result.contract);
      // 계약한 유닛이 일을 시작한다(직무 = 채집). 정산은 위에서 이 시각까지 했다
      work.startJob(input.unitId);
      return done({ ok: true, contractId: result.contract.id });
    },
    async terminate(userId, contractId, operator = false) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const c = contracts.get(contractId);
      if (!c) return fail("unknown_contract");
      // 유닛 주인이 아니면 시설 쪽(주인·대주주·운영자)이 주인 대신 해고한다
      const asOwner =
        me === c.ownerId || (me !== c.workerOwnerId && managedOwner(me, c.buildingId, operator).ok);
      if (!asOwner && me !== c.workerOwnerId) return fail("forbidden");
      settlement.settleOwner(c.workerOwnerId, at);
      const rules = wageRulesOf(options.rules()).labor;
      if (!terminateLabor(c, at, asOwner ? "owner" : "worker", ledger, accounts, rules))
        return fail("not_open");
      save(c);
      // 일이 끝난 유닛의 직무를 끈다(유예 중에도 유닛은 묶이지 않는다)
      work.stopIdle(c.workerOwnerId, working);
      return done({ ok: true });
    },
    async topUp(userId, contractId, amount, operator = false) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const c = contracts.get(contractId);
      if (!c) return fail("unknown_contract");
      if (me !== c.ownerId && !managedOwner(me, c.buildingId, operator).ok) return fail("forbidden");
      if (c.kind !== "wage") return fail("invalid_terms");
      // 보증금이 나가는 고용주(남의 유닛을 고용했으면 일꾼 쪽과 다르다)와 계약을 정산하는 일꾼 쪽을 지금까지
      settlement.settleOwner(c.ownerId, at);
      settlement.settleOwner(c.workerOwnerId, at);
      // 채우기도 사업장 금고에서 — 있는 만큼만(D-564 1624, 모자라면 insufficient_funds. 적자로 미리 넣지 않는다)
      const result = topUpLabor(c, amount, at, ledger, accounts, wageRulesOf(options.rules()).labor);
      if (!result.ok) return fail(result.code);
      save(c);
      return done({ ok: true });
    },
    async setRent(userId, buildingId, rent, operator = false) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const managed = managedOwner(me, buildingId, operator);
      if (!managed.ok) return fail(managed.code);
      const buildingOwner = managed.ownerId;
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
        // 임대료 줄의 주인 = 건물 주인(대주주·운영자가 정해도 받는 금고는 주인 사업장 금고)
        ownerId: buildingOwner,
        asset: ASSET_CREDIT,
        rentPerHour: rent,
        updatedAtMs: at,
      };
      rents.set(buildingId, row);
      writer.upsert("laborRents", rentRow(row));
      return done({ ok: true });
    },
    postJob: (userId, input, operator = false) =>
      jobCommand(userId, (me, at) => {
        const managed = managedOwner(me, input.buildingId, operator);
        return managed.ok ? board.post(managed.ownerId, input, at) : fail(managed.code);
      }),
    withdrawJob: (userId, jobId, operator = false) =>
      jobCommand(userId, (me, at) => {
        const job = board.jobs.get(jobId);
        if (!job) return board.withdraw(me, jobId, at);
        // 낸 사람(그때 주인)이 아니어도 지금 그 건물을 관리하면 거둔다
        if (job.ownerId !== me) {
          const managed = managedOwner(me, job.buildingId, operator);
          if (!managed.ok) return fail(managed.code);
        }
        return board.withdraw(job.ownerId, jobId, at);
      }),
    building(userId, buildingId) {
      const at = now();
      if (!options.ready()) return { status: "not_ready", buildingId };
      const owner = buildingOwnerOf(buildingId);
      if (owner === undefined) return { status: "unknown_building", buildingId };
      const me = settlement.findOwnerOfUser(userId);
      const rules = wageRulesOf(options.rules());
      const rent = rents.get(buildingId);
      const posted =
        owner !== null && rent && rent.rentPerHour > 0n && rent.ownerId === owner
          ? String(rent.rentPerHour)
          : null;
      const manager =
        me !== undefined &&
        owner !== null &&
        (owner === me || business?.mayManage?.(buildingId, me) === true);
      const contractsHere: LaborBuildingContractView[] = [...contracts.values()]
        .filter((c) => c.buildingId === buildingId && (isOpen(c) || c.state === "grace"))
        .toSorted((a, b) => a.id - b.id)
        .map((c) => {
          const worker = me !== undefined && c.workerOwnerId === me;
          const boss = manager || (me !== undefined && c.ownerId === me);
          return {
            id: c.id,
            kind: c.kind,
            unitId: c.unitId,
            state: c.state,
            rate: String(c.rate),
            deposit: String(c.deposit),
            cyclesLeft: Number(depositCyclesLeft(c)),
            warning: laborWarning(c, rules.labor),
            nextDueAt: isOpen(c) ? c.nextDueMs : null,
            graceUntil: c.graceUntilMs,
            endsAt: c.endsAtMs,
            paidTotal: String(c.paidTotal),
            role: worker && boss ? "both" : worker ? "worker" : boss ? "owner" : "none",
          };
        });
      const site = workplaceOf(buildingId);
      const myUnits: LaborUnitView[] = [];
      for (const map of maps.values()) {
        if (map.buildingOwner(buildingId) === undefined) continue;
        if (me !== undefined)
          map.forEachUnit((unit) => {
            if (unit.ownerId === me)
              myUnits.push({ id: unit.id, kind: unit.kind, busy: unitBusy(unit.id), mapKey: map.mapKey });
          });
      }
      return {
        status: "ready",
        buildingId,
        generatedAt: at,
        currency: ASSET_CREDIT,
        rules: rulesView(),
        canManage: manager,
        ownerless: owner === null,
        rent: posted,
        job: board.openAt(buildingId, me),
        slots: site?.slots ?? 0,
        filled: workersAt(buildingId).length,
        baseDailyWage: String(wage(rules.efficiency, rules.rateMilli, 1000, rules.society)),
        contracts: contractsHere,
        myUnits: myUnits.toSorted((a, b) => a.id - b.id),
      };
    },
    acceptJob: (userId, jobId, unitId) => jobCommand(userId, (me, at) => board.accept(me, jobId, unitId, at)),
    jobs(userId, filter) {
      return {
        status: options.ready() ? "ready" : "not_ready",
        generatedAt: now(),
        ...board.board(settlement.findOwnerOfUser(userId), filter),
      };
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
        leftoversMovedAt: c.leftoversMovedAtMs,
      });
      const list =
        me === undefined
          ? []
          : [...contracts.values()]
              .filter(
                (c) =>
                  (c.ownerId === me || c.workerOwnerId === me) &&
                  (c.state !== "ended" || finishedAt(c) > at - KEEP_ENDED_MS),
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
            buildings.push({ id: building.id, own, rent: posted, mapKey: map.mapKey });
        });
        if (me !== undefined)
          map.forEachUnit((unit) => {
            if (unit.ownerId === me)
              units.push({ id: unit.id, kind: unit.kind, busy: unitBusy(unit.id), mapKey: map.mapKey });
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
        jobs: board.mine(me),
      };
    },
    wageNeeds(buildingId, periodMs) {
      const rules = wageRulesOf(options.rules()).labor;
      const cycle = Math.max(1, rules.wageCycleMs);
      const pays = BigInt(Math.max(1, Math.ceil(Math.max(0, periodMs) / cycle)));
      const out: WageNeed[] = [];
      for (const c of [...contracts.values()].toSorted((a, b) => a.id - b.id)) {
        if (c.buildingId !== buildingId || c.kind !== "wage" || !isOpen(c)) continue;
        const short = requiredDeposit(c.rate, rules) - c.deposit;
        out.push({
          contractId: c.id,
          asset: c.asset,
          nextWage: c.rate * pays,
          shortfall: short > 0n ? short : 0n,
        });
      }
      return out;
    },
    fundDeposit(contractId, amount, atMs) {
      const c = contracts.get(contractId);
      if (!c) return 0n;
      const funded = fundLaborDeposit(c, amount, atMs, ledger, accounts);
      if (funded > 0n) save(c);
      return funded;
    },
    check: () => [
      ...checkLaborEscrow(contracts.values(), ledger),
      ...work.check((unitId) => openContractOf(unitId) !== undefined),
    ],
    async assign(userId, buildingId, unitId) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const buildingOwner = buildingOwnerOf(buildingId);
      if (buildingOwner === undefined) return fail("unknown_building");
      const unitOwner = unitOwnerOf(unitId);
      if (unitOwner === undefined) return fail("unknown_unit");
      // 거래 직무(D-571)는 남의 거래소에도 주인마다 자리 수까지, 그 밖은 내 다 지은 채집 시설·병원(레벨 1 이상)만
      const desk = work.source()?.tradeDesk?.(buildingId);
      if (unitOwner !== me || (!desk && buildingOwner !== me)) return fail("forbidden");
      const site = desk ?? workplaceOf(buildingId);
      if (!site || site.level < 1) return fail("not_workplace");
      if (!onSiteMap(unitId, buildingId)) return fail("wrong_map");
      if (unitBusy(unitId)) return fail("unit_busy");
      const taken = desk
        ? work.assignedAt(buildingId).filter((id) => unitOwnerOf(id) === me).length
        : workersAt(buildingId).length;
      if (taken >= site.slots) return fail("facility_full");
      // 바꾸기 전에 지금까지 정산한다(배치 구간이 이 시각에서 시작한다)
      settlement.settleOwner(me, at);
      work.assign(unitId, me, buildingId, at);
      work.startJob(unitId);
      return done({ ok: true });
    },
    async unassign(userId, unitId) {
      const at = now();
      const me = ownerFor(userId, at);
      if (me === undefined) return fail("busy");
      const buildingId = work.assignedTo(unitId);
      if (buildingId === undefined) return fail("not_assigned");
      if (unitOwnerOf(unitId) !== me) return fail("forbidden");
      settlement.settleOwner(me, at);
      // 정산이 사라짐으로 이미 풀었으면 그대로 끝
      work.unassign(unitId, at);
      work.stopIdle(me, working);
      return done({ ok: true });
    },
  };
}
