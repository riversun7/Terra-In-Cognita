// 시뮬 세력·사회의 모양(society.ts가 쓴다) — docs/adr/2026-10-31-faction-society-core.md "시뮬레이터"
import type { OccupationChoice } from "../npc/policy.ts";
import type { SocietyCoefficients } from "../society/coefficients.ts";
import type { WarOutcome, WarStateEndReason } from "../society/warOutcomes.ts";
import type { CombatRun } from "./combatRun.ts";
import type { MetricsRecorder } from "./metrics.ts";
import type { ScenarioSociety } from "./scenario.ts";
import type { SimHooks } from "./npcRun.ts";
import type { RecruitView } from "./societyRecruit.ts";
import type { RuinsSummary, SocietyRuins } from "./societyRuins.ts";
import type { WarSummary } from "./societyWar.ts";
import type { SimFaction, SimOccupation, SimUnit, SimWorld } from "./world.ts";

export interface SocietySummary {
  /** 구인 카드로 고용한 휴먼 수(D-469 출생 없음, 출력 형식 판 9에서 births를 바꿈) */
  readonly recruited: number;
  /** 구인에 쓴(소각한) 값, 국고 화폐 자산 → 최소 단위 */
  readonly recruitSpent: Record<string, string>;
  readonly deaths: number;
  readonly reborn: number;
  readonly deified: number;
  readonly rebellions: { readonly won: number; readonly suppressed: number; readonly calmed: number };
  readonly independence: number;
  readonly founded: number;
  /**
   * 공성 결과 수(D-520, 출력 형식 13 — 12의 razed는 뺐다): 약탈(소유 그대로)·점령·귀속·점령 상태, 상장폐지, 점령 상태 세금 거래·끝난 수,
   * 재건 비용을 낸 수, 끝 날 남은 점령 상태·회복 불이익 수(societyWar.ts WarSummary). 출력 형식 14(D-527): 약탈 꺼내 가기 거래·정부 재건·
   * 남은 약탈 상태, 점령 상태 몰아냄·저절로 회복
   */
  readonly occupations: WarSummary & {
    readonly loot: number;
    readonly integrate: number;
    readonly occupy: number;
    readonly delisted: number;
  };
  readonly offers: { readonly accepted: number; readonly refused: number; readonly expired: number };
  readonly shareSales: number;
  readonly researchBuilt: number;
  readonly vassalBreaks: number;
  /** 도시 세금 정산(D-304): 이익이 난 도시·기간 수, 주주에게 나눈 거래 수, 국고에 남긴 수(민주주의) */
  readonly dividends: { readonly settlements: number; readonly payouts: number; readonly toTreasury: number };
  /** 봉신 공물 거래 수 */
  readonly tributes: number;
  /** 전쟁(docs/adr/2026-11-01-npc-brain-r5.md 5절): 선포, 강화 조약, 백지 강화 수 */
  readonly wars: { readonly declared: number; readonly treaties: number; readonly whitePeace: number };
  /** 굶어 멈춤에 닿은 세력 수(D-220, 기술 정의) */
  readonly stalled: number;
  /**
   * 정원사 웨이브 결과(docs/adr/2026-11-01-gardener-r5b.md, D-464 217): 폐허가 된 도시, 건물 피해를 받은 시작 도시, 피난한·노숙이 된
   * 휴먼, 떠도는 세력이 된 수, 구성원이 모두 떠나 사라진 떠도는 세력 수. 폐허 복원(docs/adr/2026-11-07-ruins-restoration.md, 출력 형식 11):
   * 남은 폐허·정부를 지은 수·복원된 수·돌려준 수·넣은 거래 수·넣은 값. 출력 형식 12(기획 답 480~489): 기한이 지나 돌려준 수(expired)·
   * 정부 건물이 무너져 다시 지은 쪽이 주인이 된 수(reclaimed)
   */
  readonly ruins: RuinsSummary & {
    readonly ruined: number;
    readonly damaged: number;
    readonly fled: number;
    readonly homeless: number;
    readonly wandering: number;
    readonly dispersed: number;
  };
  /** 끝 날 휴먼 평균 만족도(0~100) */
  readonly satisfaction: number;
}

export interface SocietyRun {
  /** 폐허 복원(D-510): 정부 짓기·모금·복원. 서버 유저 명령도 이 함수를 부른다 */
  readonly ruins: SocietyRuins;
  /** 공성에서 이긴 뒤: 결과 셋(D-520 약탈·점령 상태·점령·귀속 — 점령·귀속이면 46 §5.1 처리). decision = 점령자가 고른 결과(NPC 규칙식) */
  occupy(
    attacker: SimFaction,
    target: SimFaction,
    cityId: number,
    decision: OccupationChoice,
    nowMs: number,
  ): void;
  /** 붐비는 도시에서 마을 세우기(봉신 | 독립은 세우는 가문의 규칙식) */
  found(parent: SimFaction, nowMs: number): void;
  /**
   * 알박기 도시를 지은 NPC 가문(기획 D-580 — 질문 2335 나, simulator/npcClaim.ts): 새 가문 세력을 세우고(봉신 | 독립 + 체제는 그 가문 성향 규칙식 —
   * 마을 세우기와 같은 foundingChoice), settle이 그 가문 도시를 만든다(도시 ID). 재료를 낸 도시(source)의 부모 휴먼 가운데 가문원(마을 세우기 수
   * founders까지, 경비대 빼고)이 새 도시로 옮기고, 지분 1,000주는 그 가문(최초 설립자, D-575). 세운 가문
   */
  claimHouse(
    parent: SimFaction,
    source: number,
    nowMs: number,
    settle: (house: SimFaction) => number,
  ): SimFaction;
  /** 선전포고(무명분 비용, 질문 196 가). 이미 전쟁이면 아무것도 안 한다 */
  declareWar(attacker: SimFaction, target: SimFaction, nowMs: number): void;
  /** 강화 조약(백지 + 불가침, 질문 195 가). 받는지는 부르는 쪽(판단)이 정했다 */
  makePeace(a: SimFaction, b: SimFaction, nowMs: number): void;
  /**
   * 도시 하나를 새 세력으로 떼어 낸다(서버만 — 빈자리 도시 독립 투표 가결, 질문 2434 (가) 답 D-583. 체제 = 옛 나라 체제). 시작 도시·없는 도시면 undefined, 아니면 새 세력 ID
   */
  cityIndependence(cityId: number, nowMs: number): number | undefined;
  /** 그 도시 지분 100주를 국고가 가장 많은 다른 세력에 판다(어느 도시를 팔지는 판단이 고른다) */
  sellShares(seller: SimFaction, cityId: number, nowMs: number): void;
  buildResearch(faction: SimFaction, nowMs: number): void;
  /** 도시 주인이 그 도시 행정 건물에서 지금 보는 구인 카드(D-469). 주인이 아니면 undefined */
  recruitView(hirer: SimFaction, cityId: number, nowMs: number): RecruitView | undefined;
  /**
   * 구인 카드 한 장을 산다(도시 주인만, 값은 국고에서 소각). 산 휴먼, 못 사면 undefined. guard면 그 휴먼을 경비대로 들인다(직무 없음,
   * 기획 답 920 나 — NPC 구인 규칙식의 경비대 다시 채우기)
   */
  recruit(
    hirer: SimFaction,
    cityId: number,
    slot: number,
    nowMs: number,
    guard?: boolean,
    prepaid?: boolean,
  ): SimUnit | undefined;
  breakVassal(faction: SimFaction): void;
  /** 웨이브에 진 시작 도시가 아닌 도시: 폐허(D-105·D-464 217) */
  ruin(cityId: number, nowMs: number): void;
  /** 웨이브에 진 시작 도시: 건물 피해(D-341) */
  damage(cityId: number, nowMs: number): void;
  endOfDay(nowMs: number): void;
  /** 하루 줄의 세력 칸(만족도·체제·상위·그날 구인 수) */
  dayFields(faction: SimFaction): {
    satisfaction: number;
    regime: string;
    overlord: number | null;
    recruited: number;
  };
  check(nowMs: number): string[];
  summary(): SocietySummary;
  /** 지금까지 돈 하루 끝 수(이어 돌리기 저장용) */
  currentDay(): number;
}

export interface SocietyOptions {
  readonly world: SimWorld;
  /** 마을·연구 값과 반란 쉬는 날(시나리오 society 칸, 서버는 서버 설정) */
  readonly settings: ScenarioSociety;
  /**
   * 이어 돌리기(서버, docs/adr/2026-11-01-npc-brain-r5.md 7절): 있으면 차리기를 건너뛰고(수명·기술은 저장 값) 그 날부터 센다.
   * 지분이 없는 도시에만 지분을 낸다
   */
  readonly restoreDay?: number | undefined;
  readonly recorder: MetricsRecorder;
  readonly c: SocietyCoefficients;
  readonly hooks: SimHooks | undefined;
  readonly combat: CombatRun | undefined;
  /** 새 세력의 판단 예약, 새 유닛의 이동 예약, 예약 지우기(stubRules·loop) */
  readonly scheduleFaction: (faction: SimFaction, nowMs: number) => void;
  readonly scheduleUnit: (unitId: number, nowMs: number) => void;
  readonly cancel: (eventId: number) => void;
  /**
   * 수명이 다해 죽은 휴먼(환생·신격화가 아닌 사망, 상속 뒤 지우기 전)을 알리는 고리(D-478, docs/adr/2026-11-07-cyborg-fusion-genes.md).
   * 지금은 아무도 넘기지 않는다: NPC 세력 휴먼의 유전자는 남기지 않는다(D-516 줄기 — 쓰는 곳이 없고 인스턴스가 끝없이 쌓인다, 질문 397).
   * 시뮬레이터도 넘기지 않는다(출력 그대로)
   */
  readonly onDeath?: ((unit: SimUnit, nowMs: number) => void) | undefined;
  /**
   * 마을 세우기 자리 검사(사용자 지적 2026-11-07 "다른 세력 범위에 도시를 건설할 수 없다", docs/adr/2026-11-07-world-layout.md): 붐비는
   * 도시(fromCityId)에서 마을을 세울 자리가 있나. false면 값을 내지 않고 세우지 않는다. 자리(다른 세력 영향권 밖)를 아는 서버만 넘긴다 —
   * 시뮬레이터에는 도시 자리가 없어 넘기지 않는다(출력 그대로)
   */
  readonly canFound?: ((parent: SimFaction, fromCityId: number, nowMs: number) => boolean) | undefined;
  /** 공성 결과 하나(D-520, 서버가 기록 표·복귀 요약에 적는다). 시뮬레이터는 넘기지 않는다 */
  readonly onWarOutcome?: ((event: WarOutcomeEvent) => void) | undefined;
  /** 공성 결과의 남은 상태가 끝남(D-527 — 서버가 war_outcomes.end_reason에 적는다). 시뮬레이터는 넘기지 않는다 */
  readonly onWarStateEnd?:
    | ((entry: SimOccupation, reason: WarStateEndReason, nowMs: number) => void)
    | undefined;
}

/**
 * 공성 결과 하나(D-520·D-527): 약탈·점령 상태 = taken 0(꺼내 가기·세금은 남은 상태가 쌓는다), 점령·귀속 = taken(재건 비용)·shares,
 * untilMs = 약탈 재건할 수 있는 시각·점령 상태 저절로 회복되는 시각·회복 불이익 끝
 */
export interface WarOutcomeEvent {
  readonly atMs: number;
  readonly city: number;
  readonly attacker: SimFaction;
  readonly target: SimFaction;
  readonly outcome: WarOutcome;
  readonly taken: bigint;
  readonly shares?: "delist" | "keep" | undefined;
  readonly untilMs?: number | undefined;
}
