// 정원사 실행의 모양(gardenerRun.ts가 쓴다) — docs/adr/2026-11-01-gardener-r5b.md 4절·"바뀜 (2026-11-07, 정원사 2)"
// 시뮬레이터(run.ts)와 서버 NPC 런타임(apps/server/src/npc/gardener.ts)이 같은 모양으로 attachGardener를 부른다.
import type { GardenerCoefficients } from "../gardener/coefficients.ts";
import type { NomadParty } from "../gardener/nomads.ts";
import type { PollutionGrid, PollutionLayer } from "../gardener/pollution.ts";
import type { GardenerWaveKind, WaveReward } from "../gardener/rewards.ts";
import type { MetricsRecorder } from "./metrics.ts";
import type { SocietyRun } from "./societyTypes.ts";
import type { SimFaction, SimUnit, SimWorld } from "./world.ts";

export type WaveState = "marching" | "fighting";

export interface GardenerWave {
  readonly id: number;
  /** city = 도시 웨이브, protection = 보호 레이드(D-500, 보상 없음, 실패해도 쉬는 시간 없음) */
  readonly kind: GardenerWaveKind;
  readonly city: number;
  /** 생길 때 그 도시 주인(세기를 정한 세력) */
  readonly faction: number;
  readonly strength: number;
  readonly physical: number;
  readonly createdAtMs: number;
  readonly arriveAtMs: number;
  state: WaveState;
  /** 서버: 전투 서비스의 전투 ID(싸우는 중) */
  battleId: number | null;
  eventId: number | undefined;
}

/** 끝난 웨이브(서버가 결과 줄을 쓴다). outcome = damaged | ruined | repelled | disbanded */
export interface ResolvedWave {
  readonly wave: GardenerWave;
  readonly outcome: "damaged" | "ruined" | "repelled" | "disbanded";
  readonly atMs: number;
  /** 막아 낸 도시 웨이브의 보상(D-499). 나머지는 없음 */
  readonly reward: WaveReward;
}

export interface GardenerSummary {
  readonly pollution: { readonly cells: number; readonly total: number; readonly max: number };
  readonly waves: {
    readonly noticed: number;
    readonly battles: number;
    readonly won: number;
    readonly failed: number;
    readonly undefended: number;
    /** 물리형 0마리라 넥서스를 부술 수 없어 전투 없이 막힌 웨이브(규칙으로 정해진 결과, ADR 4절) */
    readonly noSiege: number;
    readonly disbanded: number;
    readonly budgetSkipped: number;
    readonly strengthMax: number;
  };
  readonly nomads: { readonly marches: number; readonly raids: number; readonly retargets: number };
  /** 보호 레이드(D-500): 예고, 이김, 막힘, 건너뜀(그 도시에 이미 웨이브가 옴·공격자 도시 없음) */
  readonly protection: {
    readonly noticed: number;
    readonly won: number;
    readonly repelled: number;
    readonly skipped: number;
  };
  /** 끝 날 살아 있는 세력의 관계도 단계별 수·최저·최고(49 N52) */
  readonly relations: {
    readonly allied: number;
    readonly friendly: number;
    readonly neutral: number;
    readonly wary: number;
    readonly hostile: number;
    readonly min: number;
    readonly max: number;
  };
  /** 막아 낸 도시 웨이브 보상 합(D-499): 보상을 준 웨이브 수, 명성, 유전자 조각·크리쳐 재료(아이템 하나 몫) */
  readonly rewards: {
    readonly waves: number;
    readonly renown: number;
    readonly genes: number;
    readonly materials: number;
  };
  /**
   * 웨이브 결과 목표(49 C16a, D-468): 끝난 웨이브를 생길 때 영향권 오염 합이 기준 이상(band)·미만(below)으로 나눈 웨이브 승률.
   * goalPm = 목표 승률. 흩어진 웨이브는 세지 않는다
   */
  readonly target: {
    readonly sumAtLeast: number;
    readonly goalPm: number;
    readonly band: { readonly waves: number; readonly won: number; readonly winPm: number };
    readonly below: { readonly waves: number; readonly won: number; readonly winPm: number };
  };
}

export interface GardenerRestore {
  readonly layer: PollutionLayer;
  readonly waves: readonly GardenerWave[];
  readonly cooldownUntil: ReadonlyMap<number, number>;
  readonly nomads: readonly NomadParty[];
  readonly nextWaveId: number;
  /** 이어 돌린 시각(지난 도착은 이 시각으로 다시 건다) */
  readonly nowMs: number;
  /** 세력 → 정원 세력 관계도·명성(없으면 빈 표) */
  readonly relations?: ReadonlyMap<number, number> | undefined;
  readonly renown?: ReadonlyMap<number, number> | undefined;
}

export interface GardenerOptions {
  readonly world: SimWorld;
  /** 지금 계수(서버는 설정 칸 실효 값을 부를 때마다 읽는다) */
  readonly rules: () => GardenerCoefficients;
  readonly grid: PollutionGrid;
  /** 도시 → 1차맵 칸(폐허가 된 도시도 칸을 안다) */
  readonly cellOf: (cityId: number) => number | undefined;
  readonly isForest?: ((cell: number) => boolean) | undefined;
  /** 모함 칸(유목 부대 처음 자리, D-379) */
  readonly mothershipCell: number;
  readonly recorder: MetricsRecorder;
  readonly society: SocietyRun;
  readonly schedule: (atMs: number, kind: string, subject: number) => number;
  readonly cancel: (eventId: number) => void;
  /** 웨이브 공성 전투: true = 웨이브가 이김, false = 짐, "pending" = 나중에 resolve(서버) */
  readonly fight: (wave: GardenerWave, defenders: readonly SimUnit[], nowMs: number) => boolean | "pending";
  /**
   * 그 도시에 싸울 수 있는 수호신이 있나(기획 답 472 가, D-311 "방어전에 나선다"): 있으면 수비 휴먼이 없어도 웨이브 전투를 연다(서버 = 신전
   * 서비스, 전투 시작 길이 수호신을 수비 편에 넣는다). 없으면(시뮬) 수비 휴먼이 없는 도시는 전투 없이 웨이브가 이긴다(질문 218 가)
   */
  readonly hasGuardians?: ((cityId: number) => boolean) | undefined;
  /** 세력 국고(질문 220 가: 그 세력 화폐 그대로) */
  readonly treasuryOf: (faction: SimFaction) => bigint;
  /** 시간 배율(예고·쉬는 시간·유목 제외 기간에 곱한다). 서버 측정용 하루 줄이기(NPC_DAY_MS)만 1 아래로 쓴다 */
  readonly timeScale?: number | undefined;
  readonly seed: number;
  /** 이어 돌리기(서버): 저장한 상태 */
  readonly restore?: GardenerRestore | undefined;
  /**
   * 막아 낸 도시 웨이브의 보상을 받는 쪽에 준다(D-499): 서버 = 유전자 조각·크리쳐 재료 아이템을 그 세력 장부에. 시뮬은 세기만 한다
   * (요약 rewards). 명성은 attachGardener가 세력마다 쌓는다
   */
  readonly onReward?:
    | ((wave: GardenerWave, ownerId: number, reward: WaveReward, nowMs: number) => void)
    | undefined;
}

export interface GardenerRun {
  /** 시설이 생산했다(레벨 × 오염 값 × 일한 ms) — 하루 끝에 1시간 단위로 내림해 더한다 */
  addWork(cityId: number, weightedWorkMs: number): void;
  /** 전투 한 번(그 도시 칸에 +battle) */
  addBattle(cityId: number): void;
  /**
   * 세력이 도시를 치려 한다(NPC 판단 치기, 공성 전). 대상이 필수 NPC 세력(고정 국가)이면 공격자의 가장 오래된 도시로 보호 레이드를
   * 보낸다(D-500). 레이드를 보냈으면 true
   */
  protect(attacker: SimFaction, target: SimFaction, cityId: number, nowMs: number): boolean;
  /** 그 도시 칸 정화 한 번(정화 직무 D-310이 부른다 — 아직 부르는 곳 없음): 오염 −purifyAmount, 그 도시 주인 관계도 +(D-510) */
  purify(cityId: number): void;
  endOfDay(nowMs: number, day: number): void;
  /** 예약 처리(EVENT_WAVE·EVENT_NOMAD). 그 종류가 아니면 false */
  handle(kind: string, subject: number, nowMs: number): boolean;
  /** 싸우던 웨이브의 결과(서버: 전투가 끝났을 때) */
  resolve(waveId: number, won: boolean, nowMs: number): void;
  /** 웨이브를 흩는다(서버: 전투를 열지 못했을 때). 쉬는 시간은 걸지 않는다 */
  disband(waveId: number, nowMs: number): void;
  /** 지난 호출 뒤 끝난 웨이브(꺼내면 비운다) */
  takeResolved(): ResolvedWave[];
  readonly layer: () => PollutionLayer;
  readonly waves: ReadonlyMap<number, GardenerWave>;
  readonly cooldownUntil: ReadonlyMap<number, number>;
  readonly nomads: readonly NomadParty[];
  /** 세력 → 정원 세력 관계도(하루 끝에 바뀐다, 49 N52)·명성(D-499)·지난 하루 끝의 세력 오염(D-509) */
  readonly relations: ReadonlyMap<number, number>;
  readonly renown: ReadonlyMap<number, number>;
  readonly factionPollution: ReadonlyMap<number, number>;
  nextWaveId(): number;
  /** 진군·전투 중인 정원사 유닛 수(모함 몫) */
  inUse(): number;
  summary(): GardenerSummary;
  check(): string[];
}
