// 시뮬레이터 세계(메모리) — docs/adr/2026-10-31-rules-simulator.md "세계 차리기"
// 세력·도시·유닛과 원장 장부를 들고, 정산은 서버와 같은 공용 함수(settle/owner.ts)로 한다(D-013).
// R1은 고리를 보여 줄 만큼만 있다: 진짜 세력·도시·인구·기술 규칙은 R4, 경제는 R2가 이 모양을 넓힌다.
// 소유 주체 = 세력(시뮬에는 유저가 없다). NPC는 늘 접속 중이다(서버 settlement.ts와 같다).
import { createRng, type Rng } from "@terra/shared";
import { createLedgerAudit, type LedgerAudit } from "../ledger/audit.ts";
import { type LedgerBook, createLedgerBook } from "../ledger/ledgerBook.ts";
import { mix32 } from "../math/hash.ts";
import { type Point } from "../units.ts";
import {
  TEST_ASSET_CREDIT,
  TEST_ASSET_ORE,
  TEST_SYSTEM_ISSUE_CREDIT,
  settleOwnerPeriod,
  testSettleAccounts,
} from "../settle/owner.ts";
import { JOB_GATHER, PHASE_WORK, TEST_JOB_RULES, type JobState } from "../settle/settle.ts";
import {
  type InjuryCoefficients,
  type InjuryState,
  NO_INJURY,
  START_INJURY_COEFFICIENTS,
  settleWorkInjury,
} from "../society/injury.ts";
import { type NpcCoefficients, TEST_NPC_COEFFICIENTS } from "../npc/coefficients.ts";
import { type Traits, rollTraits } from "../npc/traits.ts";
import type { RecruitDraw, RecruitProfile } from "../society/recruitment.ts";
import type { Regime } from "../society/shares.ts";
import type { WarState } from "../society/wars.ts";
import type { Scenario } from "./scenario.ts";

export interface SimFaction extends WarState {
  readonly id: number;
  readonly code: string;
  readonly fixed: boolean;
  tech: number;
  alive: boolean;
  /** 정권 체제(D-217) */
  regime: Regime;
  /** 상위 세력(봉신 관계 D-216). 없으면 null */
  overlord: number | null;
  /** 전쟁 중인 세력(반란 세력은 원래 세력과 전쟁으로 시작, D-256)·마지막 교전·불가침(society/wars.ts) */
  readonly wars: Set<number>;
  readonly lastFight: Map<number, number>;
  readonly truces: Map<number, number>;
  /** NPC 성향(D-327, npc/traits.ts) */
  traits: Traits;
  /** 지난 판단 때 국고(세율 규칙식 D-323). 처음엔 null */
  taxBefore: bigint | null;
  /** 굶어 멈춘 날이 이어진 수(D-220, 기술 정의 npc.stallDays) */
  stalledDays: number;
  /** 반란으로 생긴 세력이면 원래 세력(정부가 소탕한다, 46 §2.4). 아니면 null */
  rebelOf: number | null;
  /**
   * 태어날 때 부모 세력(반란·새 마을, 기획 답 620 나 — 서버는 세력 행 born_of에 저장). 처음부터 있던 세력은 null. 독립을 고른 새 가문처럼 반란
   * 부모·종주가 없어도 화폐·나라 성격·도시 이름이 부모 나라를 따른다(601 나)
   */
  bornOf: number | null;
  /**
   * 내가 약탈한 도시 → 다시 치지 않는 끝 시각(D-520, 확인 대기 685 — 한 세력이 한 도시를 거듭 털지 않게). 하루 끝에 지난 것을 지운다.
   * 서버는 저장하지 않고 켤 때 war_outcomes 약탈 줄에서 다시 만든다
   */
  readonly raided: Map<number, number>;
  /** 연구 작업 진행·설계도(가장 높았던 단계, D-396) */
  research: { progress: number; blueprint: number };
  /** 도시 ID(넣은 차례) */
  readonly cities: Set<number>;
  /** 유닛 ID(넣은 차례) */
  readonly units: Set<number>;
  settledAtMs: number;
  upkeepArrears: number;
  /** 판단 횟수(판단 난수의 차례) */
  aiStep: number;
  /** 다음 판단 예약 번호 */
  eventId: number | undefined;
}

/**
 * [임시] 지배 가문 금고 주체 = 세력 국고 주체. 가문 층이 아직 없다(ADR faction-society-core "바뀜 (2026-11-01)" 1·
 * "바뀜 (2026-11-01, D-444)"). 가문이 들어오면 이 함수만 바꾼다(배당 ③·상장폐지 재발행·독재 과반 검사가 이 값을 쓴다)
 */
export function rulingFamilyOf(faction: SimFaction): number {
  return faction.id;
}

export interface SimCity {
  readonly id: number;
  owner: number;
  /** 기본 NPC 국가의 시작 도시(D-341: 주인이 바뀌지 않는다) */
  readonly start: boolean;
  /** 휴먼 주거 수(구인 목표, 넘으면 노숙) */
  housing: number;
  /** 행정 건물(정부기관) 레벨(1~5, D-469). 구인 카드 수·토탈 스탯 범위를 정한다(49 N45) */
  adminLevel: number;
  /** 도시 주인(고용 주체)이 지금 창에 산 구인 카드 칸. 주인이 바뀌었거나 창이 지났으면 새 묶음이다 */
  recruitDraw: (RecruitDraw & { readonly hirer: number }) | null;
  /** 연구 시설 레벨(0~5, 질문 121) */
  researchLevel: number;
  /** 발전도(0~100, [임시] 인구·만족도로 계산) */
  development: number;
  /** 다음 반란 판정을 할 수 있는 시각(반란 뒤 쉬는 시간) */
  nextRebellionMs: number;
}

/**
 * 폐허(웨이브에 무너진 도시, D-105·D-464 217·D-510, docs/adr/2026-11-07-ruins-restoration.md). ID = 무너진 도시 ID(복원하면 같은 ID로
 * 돌아온다 — 도시 지분 share_<ID>·자리·칸 오염 칸이 이어진다). 도시처럼 세계에 있지 않다(영토·주인·휴먼 없음)
 */
export interface SimRuin {
  readonly id: number;
  /** 무너지기 전 주인 세력 */
  readonly formerOwner: number;
  readonly ruinedAtMs: number;
  /** 무너지기 전 주거 수(복원하면 그대로 — 휴먼은 구인 카드로 다시 든다) */
  readonly housing: number;
  /** 정부(행정 건물)를 먼저 지은 주체(소유 주체 ID — 시뮬은 세력, 서버는 유저 주체도). null = 주인 없음 */
  claimant: number | null;
  /**
   * 복원하면 도시가 드는 세력(NPC 주인은 그 세력, 유저 주인은 그 유저의 나라 — 기획 답 481: 유저 세력 층이 생기면 봉신·독립 고르기, 그
   * 전엔 유저 나라)
   */
  joinFaction: number | null;
  claimedAtMs: number;
  /**
   * 정부 건물 ID(유저가 2차맵에 지었을 때, 서버만). 없으면 null(NPC는 시설 칸 없이 값을 내고 바로 다 지은 것으로 친다). 건물이 다 지어지고
   * 서 있어야 복원 사업을 연다(480 다), 0%·사라지면 다시 지은 쪽이 주인(487 다) — 상태는 서버가 고리로 알려 준다(attachGovernment)
   */
  building: number | null;
  /** 복원 목표·화폐(주인이 될 때 정함, 0n·"" = 주인 없음) */
  goal: bigint;
  currency: string;
  /** 주인이 모금을 열었나(열면 누구나 넣는다, D-343) */
  open: boolean;
  /**
   * 모금 기한(ms, 기획 답 485 다: 처음 주인이 된 때 + 기한 날 수, 다시 지은 주인도 그대로 잇는다). 0 = 정하지 않음(주인 없음, 또는 기한 칸이
   * 생기기 전에 주인이 된 줄 — 그때는 주인이 된 때 + 기한 날 수로 본다)
   */
  deadlineMs: number;
  /** 낸 값(소유 주체 → 최소 단위). 값은 에스크로 계정에 있다(restoreEscrow) */
  readonly contributions: Map<number, bigint>;
}

/**
 * 공성 결과의 남은 상태(D-520, docs/adr/2026-11-07-war-outcomes.md) — 도시 ID마다 하나. occupied = 점령 상태(소유는 owner 그대로, occupier가
 * nextTaxMs마다 세금, untilMs에 끝남), annexed = 점령·귀속 불이익(그 도시 휴먼 만족도 회복이 untilMs까지 느림). 끝나면 지운다
 */
export interface SimOccupation {
  readonly city: number;
  readonly kind: "occupied" | "annexed";
  /** 점령자(점령 상태) · 새 주인(점령·귀속) */
  readonly occupier: number;
  /** 시작할 때 도시 주인(점령 상태 = 소유 그대로인 주인, 점령·귀속 = 옛 주인) */
  readonly owner: number;
  readonly sinceMs: number;
  readonly untilMs: number;
  /** 다음 세금 시각(점령 상태). 점령·귀속은 untilMs */
  nextTaxMs: number;
  /** 지금까지 거둔 세금(그때 주인 국고 화폐 최소 단위 합 — 화면·기록용) */
  taken: bigint;
}

/** 복원 사업 에스크로 시스템 계정 코드(폐허·화폐마다 하나) */
export const restoreEscrow = (ruinId: number, asset: string): string => `escrow:restore:${ruinId}:${asset}`;

/** 노숙(갈 도시가 없는 휴먼, D-296)의 도시 칸 값. 도시 ID는 1부터다 */
export const HOMELESS = 0;

export interface SimUnit {
  readonly id: number;
  /** 사는 도시(노숙이면 HOMELESS — 떠도는 세력의 휴먼, D-294·D-464 217) */
  city: number;
  owner: number;
  job: JobState;
  pos: Point;
  /** 이동 판단 횟수 */
  tripStep: number;
  eventId: number | undefined;
  /** 휴먼 만족도(밀리점 0~100 × 1000, D-219·D-433) */
  satisfactionMilli: number;
  /** 태어난 시각·수명(D-021·T4). 환생하면 다시 센다 */
  bornAtMs: number;
  lifespanMs: number;
  /** 구인 카드로 온 휴먼의 레벨·스탯·속성(D-469). 처음부터 있던 휴먼은 null. 유닛에게는 부모·자녀가 없다(D-469) */
  readonly recruit: RecruitProfile | null;
  /** 그 유닛의 환생 횟수(D-438 4) */
  rebirths: number;
  /** 부상(D-521: 작업 중·전투 뒤 확률, 단계별 자연 치유). 없으면 초록 */
  injury?: InjuryState | undefined;
}

export interface SimWorld {
  readonly seed: number;
  readonly factions: Map<number, SimFaction>;
  readonly cities: Map<number, SimCity>;
  readonly units: Map<number, SimUnit>;
  /** 폐허(도시 ID → 폐허, docs/adr/2026-11-07-ruins-restoration.md) */
  readonly ruins: Map<number, SimRuin>;
  /** 공성 결과의 남은 상태(도시 ID → 점령 상태·점령·귀속 불이익, D-520) */
  readonly occupations: Map<number, SimOccupation>;
  readonly book: LedgerBook;
  readonly audit: LedgerAudit;
  /** 시험 직무 정산(S3 settle)을 돌리나. 경제를 돌리는 시나리오는 끈다(일꾼은 시설에서 일한다) */
  readonly testJobs: boolean;
  /** 부상 설정 칸(D-521, 49 N55 — 시나리오 설정 칸을 얹은 값, run.ts가 넣는다). 없으면 출발값 */
  injury?: InjuryCoefficients | undefined;
  nextFactionId(): number;
  nextCityId(): number;
  nextUnitId(): number;
}

/** 새 세력(기본 칸). 부르는 쪽이 factions에 넣는다 */
export function newFaction(
  id: number,
  code: string,
  fields: {
    fixed: boolean;
    tech: number;
    regime: Regime;
    settledAtMs: number;
    overlord?: number | null;
    traits: Traits;
  },
): SimFaction {
  return {
    id,
    code,
    fixed: fields.fixed,
    tech: fields.tech,
    alive: true,
    regime: fields.regime,
    overlord: fields.overlord ?? null,
    wars: new Set(),
    lastFight: new Map(),
    truces: new Map(),
    traits: fields.traits,
    taxBefore: null,
    stalledDays: 0,
    rebelOf: null,
    bornOf: null,
    raided: new Map(),
    research: { progress: 0, blueprint: fields.tech },
    cities: new Set(),
    units: new Set(),
    settledAtMs: fields.settledAtMs,
    upkeepArrears: 0,
    aiStep: 0,
    eventId: undefined,
  };
}

const REGIMES: readonly Regime[] = ["dictatorship", "democracy", "capitalism"];

/** 난수 흐름(세계 시드 하나에서 갈라 쓴다, 기술 순서 ADR 4절 "결정성") */
export const STREAM_SETUP = 1;
export const STREAM_DECIDE = 2;
export const STREAM_TRIP = 3;
/** 흐름 4는 세력·사회(society.ts STREAM_SOCIETY), 5는 NPC 성향 */
export const STREAM_TRAITS = 5;

/** (세계 시드, 흐름, 대상, 차례)로 정해지는 난수 — 다른 흐름·대상의 판단 수와 상관없이 같은 값 */
export function streamRng(seed: number, stream: number, subject: number, step: number): Rng {
  return createRng(
    mix32(
      seed ^
        Math.imul(stream, 0x27d4_eb2f) ^
        Math.imul(subject, 0x9e37_79b1) ^
        Math.imul(step + 1, 0x85eb_ca6b),
    ),
  );
}

function counter(): () => number {
  let last = 0;
  return () => {
    last += 1;
    return last;
  };
}

const FRESH_JOB: JobState = { job: JOB_GATHER, phase: PHASE_WORK, progressMs: 0, fatigue: 0 };

/** 시나리오에서 세계를 차린다. 처음 화폐는 발행 계정에서 준다(원장에 남는다) */
export function createWorld(
  scenario: Scenario,
  seed: number,
  startMs: number,
  options: { systemRule?: (code: string, kind: string) => boolean; npc?: NpcCoefficients } = {},
): SimWorld {
  const npc = options.npc ?? TEST_NPC_COEFFICIENTS;
  const audit = createLedgerAudit([], options.systemRule);
  const book = createLedgerBook({ nextAccountId: counter(), nextTxId: counter(), hooks: audit.hooks });
  const nextFactionId = counter();
  const nextCityId = counter();
  const nextUnitId = counter();
  const factions = new Map<number, SimFaction>();
  const cities = new Map<number, SimCity>();
  const units = new Map<number, SimUnit>();
  const setup = streamRng(seed, STREAM_SETUP, 0, 0);
  for (const group of scenario.factions) {
    for (let n = 1; n <= group.count; n++) {
      const id = nextFactionId();
      const code = group.count === 1 ? group.code : `${group.code}_${String(n).padStart(2, "0")}`;
      // [임시] "mixed"면 세력 ID 차례로 세 체제를 돌린다(NPC 성향 D-327 전)
      const regime =
        group.regime === "mixed" ? (REGIMES[(id - 1) % REGIMES.length] ?? "democracy") : group.regime;
      const faction = newFaction(id, code, {
        fixed: group.fixed,
        tech: group.tech,
        regime,
        settledAtMs: startMs,
        // 성향은 (세계 시드, 세력)으로 굴린다(D-327: 행성마다 무작위)
        traits: rollTraits(streamRng(seed, STREAM_TRAITS, id, 0), npc),
      });
      factions.set(id, faction);
      const own: number[] = [];
      for (let c = 0; c < group.cities; c++) {
        const city: SimCity = {
          id: nextCityId(),
          owner: id,
          // 고정 세력의 첫 도시가 시작 도시(D-341, [임시] 수도 하나)
          start: group.fixed && c === 0,
          housing: group.housing,
          // 첫 도시에 처음 기술 단계만큼의 연구 시설, 나머지는 하나 낮게
          researchLevel: Math.max(0, group.researchLevel - (c === 0 ? 0 : 1)),
          adminLevel: group.adminLevel,
          recruitDraw: null,
          development: 0,
          nextRebellionMs: startMs,
        };
        cities.set(city.id, city);
        faction.cities.add(city.id);
        own.push(city.id);
      }
      for (let u = 0; u < group.workers; u++) {
        const unit: SimUnit = {
          id: nextUnitId(),
          city: own[u % own.length] ?? 0,
          owner: id,
          job: FRESH_JOB,
          // 처음 자리는 2차맵 하나 안 아무 곳(합성 이동 부하용)
          pos: { x: setup.nextInt(0x4_0000), y: setup.nextInt(0x4_0000) },
          tripStep: 0,
          eventId: undefined,
          satisfactionMilli: 60_000,
          // 나이·수명은 세력·사회(society.ts)가 차릴 때 흩는다
          bornAtMs: startMs,
          lifespanMs: 0,
          recruit: null,
          rebirths: 0,
        };
        units.set(unit.id, unit);
        faction.units.add(unit.id);
      }
      if (group.credit > 0n)
        book.post({
          kind: "issue",
          atMs: startMs,
          entries: [
            {
              account: book.systemAccount(TEST_SYSTEM_ISSUE_CREDIT, TEST_ASSET_CREDIT),
              amount: -group.credit,
            },
            { account: book.ownerAccount(id, TEST_ASSET_CREDIT), amount: group.credit },
          ],
        });
    }
  }
  return {
    seed,
    factions,
    cities,
    units,
    ruins: new Map(),
    occupations: new Map(),
    book,
    audit,
    testJobs: scenario.economy === undefined,
    nextFactionId,
    nextCityId,
    nextUnitId,
  };
}

/** 세력 하나를 toMs까지 정산한다(공용 정산 함수, 서버 settlement.ts와 같은 판정) */
export function settleFaction(world: SimWorld, faction: SimFaction, toMs: number): void {
  if (!world.testJobs) {
    faction.settledAtMs = Math.max(faction.settledAtMs, toMs);
    return;
  }
  if (toMs <= faction.settledAtMs) return;
  const list = [...faction.units].map((id) => world.units.get(id)).filter((unit) => unit !== undefined);
  // 작업 중 부상(D-521): 정산 전 직무 상태로 구간 안 작업 주기 경계를 굴린다(서버 settlement.ts와 같은 함수)
  const injury = world.injury ?? START_INJURY_COEFFICIENTS;
  for (const unit of list) {
    const next = settleWorkInjury(
      {
        injury: unit.injury ?? NO_INJURY,
        job: unit.job,
        unit: unit.id,
        seed: world.seed,
        fromMs: faction.settledAtMs,
        toMs,
        offlineSinceMs: null,
        rules: TEST_JOB_RULES,
      },
      injury,
    );
    unit.injury = next.stage > 0 ? next : undefined;
  }
  const result = settleOwnerPeriod(
    {
      ownerId: faction.id,
      jobs: list.map((unit) => unit.job),
      fromMs: faction.settledAtMs,
      toMs,
      offlineSinceMs: null,
    },
    world.book,
    testSettleAccounts(world.book, faction.id),
  );
  list.forEach((unit, index) => {
    unit.job = result.jobs[index] ?? unit.job;
  });
  faction.upkeepArrears += result.upkeepUnpaid;
  faction.settledAtMs = toMs;
}

/** 도시 하나와 그 유닛을 다른 세력으로 옮긴다. 두 세력은 먼저 지금까지 정산한다(상호작용 전 정산, S3 ADR 4절) */
export function transferCity(world: SimWorld, cityId: number, to: SimFaction, nowMs: number): void {
  const city = world.cities.get(cityId);
  const from = city ? world.factions.get(city.owner) : undefined;
  if (!city || !from || from === to) return;
  settleFaction(world, from, nowMs);
  settleFaction(world, to, nowMs);
  from.cities.delete(cityId);
  to.cities.add(cityId);
  city.owner = to.id;
  // Set을 돌면서 지금 항목을 지워도 된다(남은 항목은 그대로 돈다)
  for (const unitId of from.units) {
    const unit = world.units.get(unitId);
    if (!unit || unit.city !== cityId) continue;
    from.units.delete(unitId);
    to.units.add(unitId);
    unit.owner = to.id;
  }
}

/** 한 세력의 자산 하나를 다른 세력에게 옮긴다(share = 몫의 분모, 1이면 전부). 옮긴 양 */
export function transferAsset(
  world: SimWorld,
  from: SimFaction,
  to: SimFaction,
  asset: string,
  share: bigint,
  atMs: number,
): bigint {
  const amount = world.book.balanceOf(from.id, asset) / share;
  if (amount <= 0n) return 0n;
  world.book.post({
    kind: "transfer",
    atMs,
    entries: [
      { account: world.book.ownerAccount(from.id, asset), amount: -amount },
      { account: world.book.ownerAccount(to.id, asset), amount },
    ],
  });
  return amount;
}

/** 세계 몫의 불변 조건(원장 감사 + 소속·예약). 위반 문장 목록 */
export function checkWorld(world: SimWorld, nowMs: number, tripsOn: boolean): string[] {
  const problems = world.audit.check(world.book.accounts());
  let badCities = 0;
  let badUnits = 0;
  let missingDecide = 0;
  let missingTrip = 0;
  let future = 0;
  const owned = new Set<number>();
  for (const faction of world.factions.values()) {
    if (!faction.alive) {
      if (faction.cities.size > 0 || faction.units.size > 0) badCities += 1;
      continue;
    }
    if (faction.eventId === undefined) missingDecide += 1;
    if (faction.settledAtMs > nowMs) future += 1;
    for (const cityId of faction.cities) if (world.cities.get(cityId)?.owner !== faction.id) badCities += 1;
    for (const unitId of faction.units) {
      const unit = world.units.get(unitId);
      if (
        !unit ||
        unit.owner !== faction.id ||
        owned.has(unitId) ||
        (unit.city !== HOMELESS && world.cities.get(unit.city)?.owner !== faction.id)
      )
        badUnits += 1;
      owned.add(unitId);
    }
  }
  for (const city of world.cities.values()) if (!world.factions.get(city.owner)?.alive) badCities += 1;
  for (const unit of world.units.values()) {
    if (!owned.has(unit.id)) badUnits += 1;
    if (tripsOn && unit.eventId === undefined) missingTrip += 1;
  }
  const add = (label: string, n: number): void => {
    if (n > 0) problems.push(`${label}: ${n}`);
  };
  add("I4 units not in exactly one living faction with their city (or homeless)", badUnits);
  add("I4 cities whose owner does not list them or is not alive", badCities);
  add("I5 living factions without a scheduled decision", missingDecide);
  add("I5 units without a scheduled trip", missingTrip);
  add("I6 factions settled in the future", future);
  return problems;
}

/** 세계의 시험 자원 합(창고 계정만) */
export function totalOwnerAsset(world: SimWorld, asset: string): bigint {
  let sum = 0n;
  for (const account of world.book.accounts())
    if (account.ownerId !== null && account.asset === asset) sum += account.balance;
  return sum;
}

export { TEST_ASSET_CREDIT, TEST_ASSET_ORE };
