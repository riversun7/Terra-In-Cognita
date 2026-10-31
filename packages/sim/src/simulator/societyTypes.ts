// 시뮬 세력·사회의 모양(society.ts가 쓴다) — docs/adr/2026-10-31-faction-society-core.md "시뮬레이터"
import type { SocietyCoefficients } from "../society/coefficients.ts";
import type { CombatRun } from "./combatRun.ts";
import type { MetricsRecorder } from "./metrics.ts";
import type { Scenario } from "./scenario.ts";
import type { StubHooks } from "./stubRules.ts";
import type { SimFaction, SimWorld } from "./world.ts";

export interface SocietySummary {
  readonly births: number;
  readonly deaths: number;
  readonly reborn: number;
  readonly deified: number;
  readonly rebellions: { readonly won: number; readonly suppressed: number; readonly calmed: number };
  readonly independence: number;
  readonly founded: number;
  readonly occupations: { readonly loot: number; readonly integrate: number; readonly delisted: number };
  readonly offers: { readonly accepted: number; readonly refused: number; readonly expired: number };
  readonly shareSales: number;
  readonly researchBuilt: number;
  readonly vassalBreaks: number;
  /** 끝 날 휴먼 평균 만족도(0~100) */
  readonly satisfaction: number;
}

export interface SocietyRun {
  /** 공성에서 이긴 뒤: 점령 처리(46 §5.1). rolls = 대리 판단의 고르기 굴림 */
  occupy(
    attacker: SimFaction,
    target: SimFaction,
    cityId: number,
    rolls: readonly number[],
    nowMs: number,
  ): void;
  found(parent: SimFaction, roll: number, nowMs: number): void;
  sellShares(seller: SimFaction, roll: number, nowMs: number): void;
  buildResearch(faction: SimFaction, nowMs: number): void;
  breakVassal(faction: SimFaction): void;
  endOfDay(nowMs: number): void;
  /** 하루 줄의 세력 칸(만족도·체제·상위) */
  dayFields(faction: SimFaction): { satisfaction: number; regime: string; overlord: number | null };
  check(nowMs: number): string[];
  summary(): SocietySummary;
}

export interface SocietyOptions {
  readonly world: SimWorld;
  readonly scenario: Scenario;
  readonly recorder: MetricsRecorder;
  readonly c: SocietyCoefficients;
  readonly hooks: StubHooks | undefined;
  readonly combat: CombatRun | undefined;
  /** 새 세력의 판단 예약, 새 유닛의 이동 예약, 예약 지우기(stubRules·loop) */
  readonly scheduleFaction: (faction: SimFaction, nowMs: number) => void;
  readonly scheduleUnit: (unitId: number, nowMs: number) => void;
  readonly cancel: (eventId: number) => void;
}
