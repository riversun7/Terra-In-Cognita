// 전투 보고서(/dev/balance [전투 보고서]·[보고서 기록]) 공용 자료 모양 — docs/adr/2026-11-14-battle-report.md
// 서버(tRPC battleReport.*, apps/server/src/battleReport/)와 화면(apps/game/src/editor/balance/report/)이 같이 쓴다. 판정·집계는 서버만 한다
// (기기는 판정 코드를 받지 않는다). 수치 칸의 범위는 실험 도구의 입력 범위(넘침·NAS 부담 방지)이지 게임 규칙이 아니다.
// 집계 값은 모두 판 전체의 합(정수)이다. 판마다 평균·비율은 화면이 runs로 나눠 보인다(reportRate·perRun).
import type { LabParty } from "./battleLab.ts";
import type { ReportCityInfo } from "./battleReportCity.ts";

/** 설정 종류: 파티 대 파티(전투장), 파티 공성(팀 A가 팀 B가 지키는 도시를 친다), 정원사 웨이브 공성(서버 웨이브와 같은 함수) */
export const REPORT_MODES = ["arena", "siege", "wave"] as const;
export type ReportMode = (typeof REPORT_MODES)[number];

/** 입력 범위(서버 검사·화면 같이) */
export const REPORT_LIMITS = {
  runsMin: 2,
  /** 파티 대 파티 판 수 상한 */
  runsMax: 2000,
  /** 공성(파티·웨이브) 판 수 상한 — 공성 한 판은 유닛이 많고 길다 */
  siegeRunsMax: 200,
  /** 판 수 × 제한 시간(초) 상한(A/B면 두 배로 센다). 파티 대 파티 */
  battleSecondsMax: 240_000,
  /** 같은 상한, 공성 */
  siegeBattleSecondsMax: 120_000,
  /** 한 판 제한 시간(초): 파티 대 파티 */
  limitSecMin: 30,
  limitSecMax: 600,
  /** 공성 제한 시간 상한(초, 49 C2 공성 30분) */
  siegeLimitSecMax: 1800,
  /** 웨이브 크리쳐 수·수비 휴먼 수 상한(한 판 유닛 수 상한) */
  waveStrengthMax: 48,
  waveDefendersMax: 32,
  techMin: 1,
  techMax: 10,
  /** 군단(팀) 하나의 파티 수 상한([임시], 기획 D-179·D-545 — 파티 6명이 기본 단위, 파티를 묶어 군단) */
  legionPartiesMax: 4,
  /** 도시 배치: 주거 인원·행정 레벨 */
  housingMax: 200,
  adminLevelMax: 5,
  /** 넥서스 내구도(열린 맵이거나 배치에 행정 건물이 없을 때) */
  nexusMax: 1_000_000,
  /** A/B 설정 칸 바꿈 수 */
  variantChangesMax: 16,
  nameMax: 60,
  noteMax: 400,
  labelMax: 60,
  /** 기록 목록 한 번에 받는 수 */
  listMax: 50,
  /** 전투 시간 막대 칸 수 */
  histogramBins: 12,
} as const;

/**
 * 공성 전투맵: 시뮬 도시 평지 배치 + 성벽(서버 웨이브·시뮬레이터와 같은 함수), 옛 열린 맵(가운데 넥서스), 또는 실제 세계 도시(기획 D-543
 * 1383 나 — 그 도시 2차맵의 지금 건물 배치·성벽·넥서스를 읽기만 한다, battleReportCity.ts)
 */
export interface ReportCity {
  readonly layout: "city" | "open" | "world";
  /** 주거 인원(숙소 수가 정해진다). 실제 도시면 보지 않는다 */
  readonly housing: number;
  /** 행정 건물 레벨(넥서스 내구도 = 행정 건물 내구도 × 레벨). 실제 도시면 보지 않는다 */
  readonly adminLevel: number;
  /** 실제 세계 도시 ID(layout = world일 때만) */
  readonly cityId?: number | undefined;
}

/** 파티 공성 수비: 팀 B 파티(기본) 또는 실제 도시의 세계 수비(휴먼·수호신, layout = world일 때만) */
export type ReportSiegeDefense = "party" | "world";
/** 웨이브 수비: 시뮬 휴먼 N명(기본), 팀 B 파티(기획 D-543 1384 나), 실제 도시의 세계 수비(layout = world일 때만) */
export type ReportWaveDefense = "sim" | "party" | "world";

/**
 * 군단 = 파티(유닛 6 기본) 여럿과 군단 명령(기획 D-179·D-545 "파티가 모여 군단 단위로 명령"). 파티 명령 = 파티 퇴각 기준선(⑦, 파티의
 * retreatHpPct), 군단 명령 = 정한 시각에 군단의 모든 파티에 퇴각 명령(판정의 파티 퇴각, D-205·D-6025). 그 밖의 파티·군단 명령(전진·자리
 * 지키기·목표)은 판정에 아직 없다(질문 1461)
 */
export interface ReportLegion {
  readonly parties: readonly LabParty[];
  /** 군단 퇴각 명령 시각(초, 0 = 없음) */
  readonly retreatAtSec: number;
}

/** 팀: 군단, 또는 옛 기록의 파티 하나(= 파티 하나뿐인 군단) */
export type ReportTeam = LabParty | ReportLegion;

export const isReportLegion = (team: ReportTeam): team is ReportLegion => "parties" in team;

/** 팀 → 군단(옛 기록의 파티 하나는 명령 없는 한 파티 군단) */
export function legionOf(team: ReportTeam): ReportLegion {
  return isReportLegion(team) ? team : { parties: [team], retreatAtSec: 0 };
}

/** 군단의 유닛 수 */
export const legionUnits = (team: ReportTeam): number =>
  legionOf(team).parties.reduce((sum, party) => sum + party.units.length, 0);

export interface ReportArenaSetup {
  readonly mode: "arena";
  readonly a: ReportTeam;
  readonly b: ReportTeam;
  /** 전투 실험실 지형 ID(battleLab.catalog terrains) */
  readonly terrain: string;
  readonly limitSec: number;
}

export interface ReportSiegeSetup {
  readonly mode: "siege";
  /** 공격 편 */
  readonly a: ReportTeam;
  /** 수비 편(넥서스 앞) */
  readonly b: ReportTeam;
  readonly city: ReportCity;
  readonly nexusDurability: number;
  readonly limitSec: number;
  /** 수비(없으면 party — 옛 기록) */
  readonly defense?: ReportSiegeDefense | undefined;
}

export interface ReportWaveSetup {
  readonly mode: "wave";
  /** 정원사 크리쳐 수와 그 가운데 물리형(공성 크리쳐) 수 */
  readonly strength: number;
  readonly physical: number;
  readonly creatureTech: number;
  /** 수비 휴먼 수와 기술 단계([임시] 시뮬 휴먼 사양) */
  readonly defenders: number;
  readonly defenderTech: number;
  readonly city: ReportCity;
  readonly nexusDurability: number;
  readonly limitSec: number;
  /** 수비(없으면 sim — 옛 기록). sim이면 defenders·defenderTech를 쓴다 */
  readonly defense?: ReportWaveDefense | undefined;
  /** 수비 군단(defense = party일 때 — 실험실 팀 B) */
  readonly b?: ReportTeam | undefined;
}

export type ReportSetup = ReportArenaSetup | ReportSiegeSetup | ReportWaveSetup;

/** 설정의 수비 종류(없으면 옛 기록 기본값). 파티 대 파티는 늘 party */
export function reportDefense(setup: ReportSetup): ReportWaveDefense {
  if (setup.mode === "arena") return "party";
  if (setup.mode === "siege") return setup.defense ?? "party";
  return setup.defense ?? "sim";
}

/** 설정이 쓰는 실제 세계 도시 ID(없으면 null) */
export function reportCityId(setup: ReportSetup): number | null {
  if (setup.mode === "arena" || setup.city.layout !== "world") return null;
  return setup.city.cityId ?? null;
}

/** A/B의 설정 칸 바꿈 하나(설정 칸 ID 또는 가중치 칸 키 `<행>.<칸>`). 세계 값은 바꾸지 않는다(이 보고서 안에서만) */
export interface ReportTuningChange {
  readonly id: string;
  readonly value: number;
}

/** B 설정: A와 같은 설정에서 바꾼 것. setup이 null이면 A 설정 그대로(설정 칸만 바꿈) */
export interface ReportVariant {
  readonly label: string;
  readonly setup: ReportSetup | null;
  readonly tuning: readonly ReportTuningChange[];
}

export interface ReportStartInput {
  readonly name: string;
  readonly note: string;
  readonly setup: ReportSetup;
  readonly variant: ReportVariant | null;
  readonly runs: number;
  readonly seed: number;
}

/** 받지 않은 요청의 까닭(error.data.reason) */
export const REPORT_REASONS = [
  "invalid_settings",
  "budget",
  "variant_mode",
  "invalid_unit",
  "unknown_terrain",
  "unknown_tuning",
  "tuning_out_of_range",
  "unknown_city",
  "unknown_job",
  "unknown_report",
  "busy",
  "rate_limited",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** 유닛·편 하나의 셈(판 전체 합) */
export interface ReportCounters {
  /** 기본 공격 시도·명중·빗나감(명중 굴림 실패)·회피(회피 굴림 성공)·크리 */
  attacks: number;
  hits: number;
  misses: number;
  evades: number;
  crits: number;
  /** 기본 공격 피해(물리 + 속성)와 그 가운데 크리 명중의 피해 */
  attackDamage: number;
  critDamage: number;
  /** 스킬 쓰기·스킬 대상 명중·빗나감·회피 */
  skillCasts: number;
  skillHits: number;
  skillMisses: number;
  skillEvades: number;
  /** 적에게 준 피해: 물리·속성(기본 공격 + 스킬)·지속 */
  physicalDealt: number;
  elementalDealt: number;
  dotDealt: number;
  /** 받은 피해: 물리·속성·지속 */
  physicalTaken: number;
  elementalTaken: number;
  dotTaken: number;
  /** 준 회복·받은 회복 */
  healed: number;
  healReceived: number;
  kills: number;
  deaths: number;
  retreats: number;
  /** 스태미나가 모자라 늦어진 기본 공격 수와 기다린 시간(ms) */
  staminaWaits: number;
  staminaWaitMs: number;
  /** 건물 피해: 성벽·성문, 넥서스, 그 밖의 건물 */
  wallDamage: number;
  nexusDamage: number;
  otherBuildingDamage: number;
  /** 살아 있던 시간(ms, 초당 공격 수의 분모) */
  aliveMs: number;
}

export const REPORT_COUNTER_KEYS = [
  "attacks",
  "hits",
  "misses",
  "evades",
  "crits",
  "attackDamage",
  "critDamage",
  "skillCasts",
  "skillHits",
  "skillMisses",
  "skillEvades",
  "physicalDealt",
  "elementalDealt",
  "dotDealt",
  "physicalTaken",
  "elementalTaken",
  "dotTaken",
  "healed",
  "healReceived",
  "kills",
  "deaths",
  "retreats",
  "staminaWaits",
  "staminaWaitMs",
  "wallDamage",
  "nexusDamage",
  "otherBuildingDamage",
  "aliveMs",
] as const satisfies readonly (keyof ReportCounters)[];

export function emptyCounters(): ReportCounters {
  return {
    attacks: 0,
    hits: 0,
    misses: 0,
    evades: 0,
    crits: 0,
    attackDamage: 0,
    critDamage: 0,
    skillCasts: 0,
    skillHits: 0,
    skillMisses: 0,
    skillEvades: 0,
    physicalDealt: 0,
    elementalDealt: 0,
    dotDealt: 0,
    physicalTaken: 0,
    elementalTaken: 0,
    dotTaken: 0,
    healed: 0,
    healReceived: 0,
    kills: 0,
    deaths: 0,
    retreats: 0,
    staminaWaits: 0,
    staminaWaitMs: 0,
    wallDamage: 0,
    nexusDamage: 0,
    otherBuildingDamage: 0,
    aliveMs: 0,
  };
}

/** into에 from을 더한다 */
export function addCounters(into: ReportCounters, from: ReportCounters): void {
  for (const key of REPORT_COUNTER_KEYS) into[key] += from[key];
}

/** 보고서 유닛 줄: 파티 유닛(키 a0·b2 …) 또는 웨이브 무리(wave_physical·wave_magic·defenders) */
export interface ReportUnitRow {
  readonly key: string;
  readonly team: "a" | "b";
  /** 보이는 이름(파티 유닛 표시 이름 또는 종류 ID, 무리는 빈 글 — 화면이 메시지 키로) */
  readonly label: string;
  /** 무리면 들어간 유닛 수(파티 유닛은 1) */
  readonly members: number;
  readonly counters: ReportCounters;
  /** 쓰러진 판의 쓰러진 시각 합(ms)과 그 판 수(평균 쓰러짐 시각) */
  readonly deathMsSum: number;
}

/** 전투 시간 분포 */
export interface ReportDurations {
  readonly avgMs: number;
  readonly minMs: number;
  readonly p10Ms: number;
  readonly p50Ms: number;
  readonly p90Ms: number;
  readonly maxMs: number;
  /** 막대(같은 너비 칸, fromMs 이상 toMs 미만 — 마지막 칸은 toMs 포함) */
  readonly histogram: readonly { readonly fromMs: number; readonly toMs: number; readonly count: number }[];
}

/** 끝난 까닭 수 */
export interface ReportEnds {
  /** 한 편이 모두 쓰러지거나 물러남 */
  wipe: number;
  /** 넥서스가 무너짐(공성) */
  nexus: number;
  /** 제한 시간 */
  timeout: number;
  /** 웨이브가 공성 크리쳐를 다 잃어 물러남(수비 승) */
  spent: number;
}

/** 승패 */
export interface ReportOutcome {
  readonly runs: number;
  /** 편 A 승(시간 초과 판정승 포함)·편 B 승·비김(시간 초과에 남은 몫이 같음) */
  readonly winsA: number;
  readonly winsB: number;
  readonly draws: number;
  /** 그 가운데 시간 초과로 정해진 승 */
  readonly timeoutWinsA: number;
  readonly timeoutWinsB: number;
  readonly ends: ReportEnds;
  /** 편 A 점수(승 1·비김 ½, ‰)와 95% 신뢰 구간(윌슨, ‰) */
  readonly scorePm: number;
  readonly ciLowPm: number;
  readonly ciHighPm: number;
  readonly durations: ReportDurations;
  /** 쓰러뜨리기까지 걸린 시간: 그 편이 상대를 모두 쓰러뜨려 이긴 판의 전투 시간 */
  readonly timeToKill: {
    readonly a: { readonly runs: number; readonly avgMs: number; readonly p50Ms: number };
    readonly b: { readonly runs: number; readonly avgMs: number; readonly p50Ms: number };
  };
}

/** 공성 결과(공성·웨이브만) */
export interface ReportSiege {
  /** 넥서스 처음 내구도·무너진 판 수·판마다 남은 내구도 몫 합(‰) */
  readonly nexusMax: number;
  readonly nexusDestroyed: number;
  readonly nexusLeftPmSum: number;
  /** 넥서스·성벽(성문 포함)·그 밖의 건물이 받은 피해 합 */
  readonly nexusDamage: number;
  readonly wallDamage: number;
  readonly otherBuildingDamage: number;
  /** 성벽 조각 수(전투맵 안) */
  readonly walls: number;
}

/** 설정 하나(A 또는 B)의 결과 */
export interface ReportResult {
  readonly outcome: ReportOutcome;
  readonly sides: { readonly a: ReportCounters; readonly b: ReportCounters };
  readonly units: readonly ReportUnitRow[];
  readonly siege: ReportSiege | null;
  /** 피해 흐름: 편마다(편 a = A가 친 공격)와 공격자→방어자 짝마다(키 `<공격 줄>><방어 줄>`) */
  readonly flows: {
    readonly a: ReportFlow;
    readonly b: ReportFlow;
    readonly pairs: Readonly<Record<string, ReportFlow>>;
  };
  /** 첫 판의 공격 단계 표본(편마다 앞에서부터, 합 REPORT_SAMPLE_MAX) */
  readonly samples: readonly ReportHitTrace[];
  /** 이 설정의 판정 CPU(ms) */
  readonly cpuMs: number;
  /** 실제 세계 도시를 썼으면 그 스냅숏(없으면 null, 옛 기록은 칸이 없다) */
  readonly city?: ReportCityInfo | null | undefined;
  /** 편마다 군단 모양(시작 때 — 옛 기록은 칸이 없다) */
  readonly legion?: { readonly a: ReportLegionView; readonly b: ReportLegionView } | undefined;
}

/**
 * 편 하나의 군단 모양(시작 때): 파티 수·유닛 수, 지휘 정원(그 편 유닛 가운데 가장 큰 값 — 판정의 지휘관 고르기, D-179·D-331)과 정원 밖
 * "지휘 없음" 파티 수. 지휘 없음은 판정에서 아직 행동을 바꾸지 않는다(질문 1463)
 */
export interface ReportLegionView {
  readonly parties: number;
  readonly units: number;
  readonly commandCap: number;
  readonly uncommanded: number;
}

export interface BattleReportBody {
  readonly a: ReportResult;
  readonly b: ReportResult | null;
}

/** 기록 줄(목록) */
export interface BattleReportMeta {
  readonly id: string;
  readonly name: string;
  readonly mode: ReportMode;
  readonly runs: number;
  readonly seed: number;
  readonly variant: boolean;
  readonly scorePm: number;
  readonly scoreBPm: number | null;
  readonly createdAtMs: number;
  readonly createdBy: string | null;
  readonly contentVersion: string;
  readonly contentHash: string;
  readonly simVersion: number;
  readonly tuningRevision: number;
  readonly durationMs: number;
}

/** 기록 하나(열기) */
export interface BattleReportRecord extends BattleReportMeta {
  readonly note: string;
  readonly input: ReportStartInput;
  readonly report: BattleReportBody;
}

export interface BattleReportListInput {
  /** 이 시각 이후(ms, 포함)·이전(ms, 미포함) */
  readonly fromMs?: number | undefined;
  readonly toMs?: number | undefined;
  /** 이름에 든 글(대소문자 무시) */
  readonly name?: string | undefined;
  readonly mode?: ReportMode | undefined;
  readonly limit?: number | undefined;
  /** 이 기록보다 오래된 것(다음 쪽) */
  readonly before?: string | undefined;
}

export interface BattleReportListResponse {
  readonly reports: readonly BattleReportMeta[];
  /** 다음 쪽이 있으면 마지막 기록 ID */
  readonly next: string | null;
}

/** 돌고 있는 일 */
export interface ReportJobView {
  readonly id: string;
  readonly name: string;
  readonly mode: ReportMode;
  readonly state: "running" | "done" | "failed" | "cancelled";
  /** 끝난 판 수(A/B면 두 설정 합)와 전체 */
  readonly done: number;
  readonly total: number;
  readonly startedAtMs: number;
  readonly elapsedMs: number;
  readonly reason: string | null;
  /** 끝나서 저장된 기록 ID(저장 못 했으면 null, reason = save_failed) */
  readonly reportId: string | null;
}

export interface ReportStatusResponse {
  readonly job: ReportJobView;
  /** 끝났으면 기록(저장 실패여도 결과는 실린다, id = "") */
  readonly report: BattleReportRecord | null;
}

export interface ReportJobsResponse {
  readonly jobs: readonly ReportJobView[];
  readonly busy: boolean;
}

/** 판 수 × 제한 시간(초)(A/B면 두 배) — 상한 검사 */
export function reportBattleSeconds(input: Pick<ReportStartInput, "setup" | "variant" | "runs">): number {
  return input.runs * input.setup.limitSec * (input.variant ? 2 : 1);
}

const isSiegeMode = (mode: ReportMode): boolean => mode !== "arena";
const intIn = (value: number, min: number, max: number): boolean =>
  Number.isInteger(value) && value >= min && value <= max;

/** 범위·예산 문제(서버 검사·화면 같이). 없으면 null. 팩 참조(종류·지형·칸)는 서버가 따로 본다 */
export function reportProblem(
  input: Pick<ReportStartInput, "setup" | "variant" | "runs" | "seed">,
): ReportReason | null {
  const L = REPORT_LIMITS;
  const { setup } = input;
  const siege = isSiegeMode(setup.mode);
  if (!intIn(input.runs, L.runsMin, siege ? L.siegeRunsMax : L.runsMax) || input.runs % 2 !== 0)
    return "invalid_settings";
  if (!intIn(input.seed, 0, 0x7fff_ffff)) return "invalid_settings";
  for (const one of input.variant?.setup ? [setup, input.variant.setup] : [setup]) {
    if (!intIn(one.limitSec, L.limitSecMin, siege ? L.siegeLimitSecMax : L.limitSecMax))
      return "invalid_settings";
    if (one.mode === "wave") {
      if (!intIn(one.strength, 1, L.waveStrengthMax) || !intIn(one.physical, 0, one.strength))
        return "invalid_settings";
      if (!intIn(one.defenders, 1, L.waveDefendersMax)) return "invalid_settings";
      if (!intIn(one.creatureTech, L.techMin, L.techMax) || !intIn(one.defenderTech, L.techMin, L.techMax))
        return "invalid_settings";
    }
    if (one.mode !== "arena") {
      if (!intIn(one.city.housing, 0, L.housingMax) || !intIn(one.city.adminLevel, 1, L.adminLevelMax))
        return "invalid_settings";
      if (!intIn(one.nexusDurability, 1, L.nexusMax)) return "invalid_settings";
      const world = one.city.layout === "world";
      if (world !== (one.city.cityId !== undefined)) return "invalid_settings";
      if (world && !intIn(one.city.cityId ?? 0, 1, 0x7fff_ffff)) return "invalid_settings";
      const defense = reportDefense(one);
      // 세계 수비는 실제 도시에서만, 웨이브 파티 수비는 팀 B가 있어야 한다
      if (defense === "world" && !world) return "invalid_settings";
      if (one.mode === "wave" && defense === "party" && !one.b) return "invalid_settings";
    }
    // 군단: 파티 1~상한, 파티마다 1명 이상, 군단 퇴각 시각은 제한 시간 안
    const teams = one.mode === "wave" ? (one.b ? [one.b] : []) : [one.a, one.b];
    for (const team of teams) {
      const legion = legionOf(team);
      if (!intIn(legion.parties.length, 1, L.legionPartiesMax)) return "invalid_settings";
      if (legion.parties.some((party) => party.units.length === 0)) return "invalid_settings";
      if (!intIn(legion.retreatAtSec, 0, one.limitSec)) return "invalid_settings";
    }
  }
  if (input.variant) {
    if (input.variant.setup && input.variant.setup.mode !== setup.mode) return "variant_mode";
    if (input.variant.tuning.length > L.variantChangesMax) return "invalid_settings";
    if (!input.variant.setup && input.variant.tuning.length === 0) return "invalid_settings";
  }
  const longest = Math.max(setup.limitSec, input.variant?.setup?.limitSec ?? 0);
  const seconds = input.runs * longest * (input.variant ? 2 : 1);
  if (seconds > (siege ? L.siegeBattleSecondsMax : L.battleSecondsMax)) return "budget";
  return null;
}

/** 0~1000‰ 비율(분모 0이면 0) */
export function reportRatePm(part: number, whole: number): number {
  return whole <= 0 ? 0 : Math.round((part * 1000) / whole);
}

/**
 * 윌슨 95% 신뢰 구간(‰). score = 승 + ½ 비김(반 단위라 2배로 받는다: score2 = 2 × 승 + 비김). 정수 입력·Math.sqrt만 쓴다
 * (명세가 결과를 정한다). runs 0이면 0~1000
 */
export function wilsonPm(score2: number, runs: number): { low: number; high: number } {
  if (runs <= 0) return { low: 0, high: 1000 };
  const z = 1.96;
  const p = score2 / (2 * runs);
  const z2 = z * z;
  const denom = 1 + z2 / runs;
  const center = p + z2 / (2 * runs);
  const margin = z * Math.sqrt((p * (1 - p)) / runs + z2 / (4 * runs * runs));
  const low = Math.max(0, (center - margin) / denom);
  const high = Math.min(1, (center + margin) / denom);
  return { low: Math.round(low * 1000), high: Math.round(high * 1000) };
}

// ── 피해 흐름(공격 한 번이 지나는 판정 단계) ─────────────────────────────────────────────
// 판정 코드 차례(packages/sim/src/combat/formula.ts resolveAttack, attackStages.ts): 명중 굴림 → 회피 굴림 → 크리 굴림 → 실제 공격력
// → 물리 비율 방어(방어율 − 관통) → 물리 고정 방어 → 속성 방어 상성 → 속성 방어율 → 속성 저항 → 크리 배율 → 스킬 배율 → 버프
// → 물리 최소 1 → 스킬 고정 피해 → 아머(물리)·쉴드(속성) → HP. 값 단계는 그 단계 뒤 (물리 + 속성) 합이다.

/** 값 단계(차례 = 판정 차례) */
export const FLOW_VALUE_STAGES = [
  "raw",
  "rate",
  "flat",
  "matchup",
  "elementalDefense",
  "resist",
  "crit",
  "skill",
  "buff",
  "floor",
  "final",
  "applied",
] as const;
export type FlowValueStage = (typeof FLOW_VALUE_STAGES)[number];

/** 단계 입력 값 합(확률·배율의 평균을 내는 분자). 분모는 칸마다 다르다(주석) */
export interface FlowSums {
  /** 명중 확률(‰) 합 ÷ attacks */
  hitPm: number;
  /** 회피: 2차 스탯 회피·AGI 상대 보정·최종(‰) 합 ÷ hitPassed */
  evadeBasePm: number;
  evadeRelativePm: number;
  evadePm: number;
  /** 최종 회피가 1%·85%에 걸린 수 */
  evadeAtMin: number;
  evadeAtMax: number;
  /** 크리 확률(‰) 합 ÷ hits, 크리 배율(‰) 합 ÷ crits */
  critPm: number;
  critMulPm: number;
  /** 물리 몫이 있는 명중 수와 그 듣는 방어율·방어율·관통(‰)·고정 방어 합 */
  physicalHits: number;
  ratePm: number;
  defenseRatePm: number;
  penetrationPm: number;
  defenseFlat: number;
  /** 속성 몫이 있는 명중 수와 그 방어 상성·속성 방어율·저항(‰) 합 */
  elementalHits: number;
  matchupPm: number;
  elementalDefensePm: number;
  resistPm: number;
  /** 스킬 배율·버프(‰) 합 ÷ hits */
  skillMulPm: number;
  buffPm: number;
  /** 물리·속성 몫: 처음과 판정 끝 */
  physicalRaw: number;
  elementalRaw: number;
  physicalFinal: number;
  elementalFinal: number;
  /** 스탯 공격력·무기 공격력(적정 비율 전) 합 ÷ hits */
  statAttack: number;
  weaponAttack: number;
  /** 반영: 아머·쉴드·HP·넘침 */
  toArmor: number;
  toShield: number;
  toHp: number;
  overkill: number;
}

export const FLOW_SUM_KEYS = [
  "hitPm",
  "evadeBasePm",
  "evadeRelativePm",
  "evadePm",
  "evadeAtMin",
  "evadeAtMax",
  "critPm",
  "critMulPm",
  "physicalHits",
  "ratePm",
  "defenseRatePm",
  "penetrationPm",
  "defenseFlat",
  "elementalHits",
  "matchupPm",
  "elementalDefensePm",
  "resistPm",
  "skillMulPm",
  "buffPm",
  "physicalRaw",
  "elementalRaw",
  "physicalFinal",
  "elementalFinal",
  "statAttack",
  "weaponAttack",
  "toArmor",
  "toShield",
  "toHp",
  "overkill",
] as const satisfies readonly (keyof FlowSums)[];

/** 흐름 하나(편 또는 공격자→방어자 짝) */
export interface ReportFlow {
  /** 공격 시도(기본 공격 + 스킬 대상)·명중 굴림 통과·회피 굴림 통과(= 명중)·크리·물리 최소 1을 올린 수·스킬 몫 */
  attacks: number;
  hitPassed: number;
  hits: number;
  crits: number;
  floored: number;
  skillAttacks: number;
  /** 단계마다 값 합(명중만) */
  values: Record<FlowValueStage, number>;
  sums: FlowSums;
  /** 단계마다 값 막대(편 흐름만, 짝 흐름은 null): [칸, 수] 차례 목록(flowBin) */
  hist: Record<FlowValueStage, [number, number][]> | null;
}

/** 값 단계마다 하나씩 만든 칸 */
function perStage<T>(make: () => T): Record<FlowValueStage, T> {
  return {
    raw: make(),
    rate: make(),
    flat: make(),
    matchup: make(),
    elementalDefense: make(),
    resist: make(),
    crit: make(),
    skill: make(),
    buff: make(),
    floor: make(),
    final: make(),
    applied: make(),
  };
}

function emptySums(): FlowSums {
  return {
    hitPm: 0,
    evadeBasePm: 0,
    evadeRelativePm: 0,
    evadePm: 0,
    evadeAtMin: 0,
    evadeAtMax: 0,
    critPm: 0,
    critMulPm: 0,
    physicalHits: 0,
    ratePm: 0,
    defenseRatePm: 0,
    penetrationPm: 0,
    defenseFlat: 0,
    elementalHits: 0,
    matchupPm: 0,
    elementalDefensePm: 0,
    resistPm: 0,
    skillMulPm: 0,
    buffPm: 0,
    physicalRaw: 0,
    elementalRaw: 0,
    physicalFinal: 0,
    elementalFinal: 0,
    statAttack: 0,
    weaponAttack: 0,
    toArmor: 0,
    toShield: 0,
    toHp: 0,
    overkill: 0,
  };
}

export function emptyFlow(withHist: boolean): ReportFlow {
  const values = perStage(() => 0);
  const hist = perStage((): [number, number][] => []);
  const sums = emptySums();
  return {
    attacks: 0,
    hitPassed: 0,
    hits: 0,
    crits: 0,
    floored: 0,
    skillAttacks: 0,
    values,
    sums,
    hist: withHist ? hist : null,
  };
}

/** into에 from을 더한다(막대는 칸마다 더함) */
export function addFlow(into: ReportFlow, from: ReportFlow): void {
  into.attacks += from.attacks;
  into.hitPassed += from.hitPassed;
  into.hits += from.hits;
  into.crits += from.crits;
  into.floored += from.floored;
  into.skillAttacks += from.skillAttacks;
  for (const stage of FLOW_VALUE_STAGES) into.values[stage] += from.values[stage];
  for (const key of FLOW_SUM_KEYS) into.sums[key] += from.sums[key];
  if (into.hist && from.hist)
    for (const stage of FLOW_VALUE_STAGES) into.hist[stage] = mergeHist(into.hist[stage], from.hist[stage]);
}

function mergeHist(a: readonly [number, number][], b: readonly [number, number][]): [number, number][] {
  const map = new Map<number, number>(a.map(([bin, n]) => [bin, n]));
  for (const [bin, n] of b) map.set(bin, (map.get(bin) ?? 0) + n);
  return [...map.entries()].toSorted((x, y) => x[0] - y[0]);
}

/** 막대 칸 경계 비(‰): 2^(k/4) — 칸 하나 = 옥타브의 4분의 1 */
const QUARTER_PM = [1000, 1189, 1414, 1682] as const;

/**
 * 값 → 막대 칸(0 = 0 이하, 1 + 4k + q = [2^k × Q_q, 2^k × Q_(q+1))). 정수 비교만 쓴다(같은 값이면 어느 기기든 같은 칸)
 */
export function flowBin(value: number): number {
  if (value <= 0) return 0;
  let k = 0;
  let pow = 1;
  while (pow * 2 <= value) {
    pow *= 2;
    k += 1;
  }
  let q = 0;
  for (let i = 1; i < 4; i++) if (value * 1000 >= pow * (QUARTER_PM[i] ?? 1000)) q = i;
  return 1 + 4 * k + q;
}

/** 칸의 [아래, 위) 경계(0 칸은 [0, 0]) */
export function flowBinRange(bin: number): { low: number; high: number } {
  if (bin <= 0) return { low: 0, high: 0 };
  const k = Math.floor((bin - 1) / 4);
  const q = (bin - 1) % 4;
  const pow = 2 ** k;
  const next = q === 3 ? pow * 2 : (pow * (QUARTER_PM[q + 1] ?? 2000)) / 1000;
  return { low: (pow * (QUARTER_PM[q] ?? 1000)) / 1000, high: next };
}

/** 막대에서 q 분위(0~1) 근사: 그 칸의 가운데(기하 평균). 막대가 비면 0 */
export function flowQuantile(hist: readonly [number, number][], q: number): number {
  const total = hist.reduce((sum, [, n]) => sum + n, 0);
  if (total === 0) return 0;
  const want = Math.max(1, Math.ceil(total * q));
  let seen = 0;
  for (const [bin, n] of hist) {
    seen += n;
    if (seen >= want) {
      const { low, high } = flowBinRange(bin);
      return bin === 0 ? 0 : Math.round(Math.sqrt(low * high));
    }
  }
  return 0;
}

/** 공격 한 번의 단계 값(한 대 풀이·표본). sim AttackStages와 같은 칸 + 누가·언제 */
export interface ReportHitTrace {
  readonly ms: number;
  readonly attacker: string;
  readonly target: string;
  readonly source: "attack" | "skill";
  readonly kind: "physical" | "elemental";
  readonly outcome: "miss" | "evaded" | "hit";
  readonly hitPm: number;
  readonly hitRoll: number;
  readonly evadeBasePm: number;
  readonly evadeRelativePm: number;
  readonly evadePm: number;
  readonly evadeRoll: number;
  readonly critPm: number;
  readonly critRoll: number;
  readonly crit: boolean;
  readonly critMulPm: number;
  readonly statAttack: number;
  readonly weaponAttack: number;
  readonly realAttack: number;
  readonly elementAddPm: number;
  readonly physicalRaw: number;
  readonly elementalRaw: number;
  readonly ratePm: number;
  readonly defenseRatePm: number;
  readonly penetrationPm: number;
  readonly physicalAfterRate: number;
  readonly defenseFlat: number;
  readonly physicalAfterFlat: number;
  readonly matchupPm: number;
  readonly elementalAfterMatchup: number;
  readonly elementalDefensePm: number;
  readonly elementalAfterDefense: number;
  readonly resistPm: number;
  readonly elementalAfterResist: number;
  readonly physicalAfterCrit: number;
  readonly elementalAfterCrit: number;
  readonly skillMulPm: number;
  readonly physicalAfterSkill: number;
  readonly elementalAfterSkill: number;
  readonly buffPm: number;
  readonly physicalAfterBuff: number;
  readonly elementalAfterBuff: number;
  readonly floored: boolean;
  readonly physical: number;
  readonly elemental: number;
  readonly flat: number;
  readonly toArmor: number;
  readonly toShield: number;
  readonly toHp: number;
  readonly overkill: number;
}

/** 한 대 풀이 요청: 저장된 기록(또는 입력)의 설정 A·B 가운데 하나, 판 번호(0부터) */
export interface ReportTraceInput {
  readonly reportId: string;
  readonly which: "a" | "b";
  readonly run: number;
}

export interface ReportTraceResponse {
  /** 그 판의 공격 단계 기록(차례대로, 상한 traceMax) */
  readonly hits: readonly ReportHitTrace[];
  readonly dropped: number;
  /** 다시 돌린 때의 세계 설정 판·팩·SIM(실제 도시면 그 스냅숏)이 저장 때와 같은가(다르면 숫자가 다를 수 있다) */
  readonly same: boolean;
  readonly winner: "a" | "b" | null;
  readonly endMs: number;
}

/** 한 대 풀이 상한(줄)과 보고서에 담는 표본 수 */
export const REPORT_TRACE_MAX = 600;
export const REPORT_SAMPLE_MAX = 8;
