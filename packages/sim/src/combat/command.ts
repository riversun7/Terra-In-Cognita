// 지휘관 정원(파티 수)과 승계 순서 — 기획 D-179("군단 크기는 지휘관 정원"), 49 C7, D-558(사용자 1543·1544 "군단은 3~10개 분대다. 능력은 스탯이
// 아니라, 환생시 +1까지만, 전투계열 랭킹이나 해당국가 작위로 지휘가능한 분대수가 정해짐(군대 계급처럼). 군단 지휘관도 하나의 분대에 속함",
// 1545 "해당군단내 국가 작위가 순서대로 이어받음. 없거나 예외경우 전투랭킹순. 자동 승계"). D-549의 3~20·INT·WIS 지휘 점수 식을 대체한다.
// D-571(사용자 답 1962 "작위로만 하는거고 전투중 사망등으로 임시로 군단지휘권을 받는게 전투랭킹일뿐"): 정원 = 아래 끝 ~ 위 끝 안으로 자른
// (작위 표[작위] + 환생 덤(환생했으면, 한 번만)). 전투 랭킹 등급은 정원에 들지 않고 승계 순서(commanderOrder — 작위가 같을 때)에만 쓴다.
// D-558 때의 max(작위, 랭킹 등급 표)와 등급 표 칸 넷(c7_command_tier_*)은 지웠다(id-changes 124). 수는 모두 설정 칸 [임시](c7_command_*).
// 정수만 쓴다. 계수표에 command가 없으면(옛 계수표) 0 = 지휘하지 않음.
import type { CombatCoefficients } from "./coefficients.ts";

/** 작위 단계 수(D-326: 민간인 → 시민 → 공훈자 → 기사 → 영주 → 대공) */
export const COMMAND_TITLE_STEPS = 6;
/** 전투 랭킹 등급 수(랭킹 백분위 등급 문턱 넷 — ranking tiersPm과 같은 차례, 0 = 가장 위). 승계 순서에만 쓴다(D-571) */
export const COMMAND_TIER_STEPS = 4;

/** 지휘관 정원 식의 수(설정 칸 C7) */
export interface CommandCapCoefficients {
  /** 작위 단계(0 민간인 ~ 5 대공)마다 지휘 파티 수 */
  readonly titleParties: readonly number[];
  /** 환생했을 때 더하는 파티 수(D-558 "환생시 +1까지만" — 환생 횟수와 상관없이 한 번) */
  readonly rebirthBonus: number;
  /** 아래 끝·위 끝(파티 수, D-558 군단 = 분대 3~10개) */
  readonly min: number;
  readonly max: number;
}

/**
 * 지휘 계급(D-558): 국가 작위 단계와 전투 계열 랭킹 등급. 전투 사양(CombatUnitSpec.commandRank)에도 실어 승계 순서를 정한다.
 * 작위·랭킹이 없는 유닛(NPC 휴먼·크리쳐·옛 시작 자료)은 칸이 없다
 */
export interface CommandRank {
  /** 국가 작위 단계(0 민간인 ~ 5 대공, D-326 — 그 나라 명성 구간, 서버 world/titles.ts) */
  readonly title: number;
  /** 전투 계열 랭킹 등급(0 = 가장 위 ~ 3, 등급 밖이면 null). 정원에는 들지 않고 승계 순서에만(D-571) */
  readonly combatTier: number | null;
}

const clampInt = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, Math.trunc(value)));

/**
 * 지휘관 정원(파티 수, D-571 — 작위로만). rank가 없으면 작위 0. rebirths = 환생 횟수(1 이상이면 덤 한 번). 전투 랭킹 등급은 보지 않는다
 * (승계 순서에만 — commanderOrder)
 */
export function commandCapOf(
  rank: CommandRank | undefined,
  rebirths: number,
  c: Pick<CombatCoefficients, "command">,
): number {
  const k = c.command;
  if (!k) return 0;
  const title = clampInt(rank?.title ?? 0, 0, COMMAND_TITLE_STEPS - 1);
  const byTitle = k.titleParties[title] ?? k.min;
  const bonus = rebirths > 0 ? Math.max(0, k.rebirthBonus) : 0;
  return Math.min(k.max, Math.max(k.min, byTitle + bonus));
}

/** 전투 랭킹 등급 문턱(‰, 오름차순) 가운데 그 주체 등급 문턱이 몇 번째인가(0 = 가장 위). 등급 밖·없는 문턱이면 null */
export function combatTierIndex(tierPm: number | null, tiersPm: readonly number[]): number | null {
  if (tierPm === null) return null;
  const index = tiersPm.toSorted((a, b) => a - b).indexOf(tierPm);
  return index < 0 ? null : index;
}

/**
 * 승계 순서 비교(D-558 1545): 작위 높은 쪽 → 전투 랭킹 등급 높은 쪽(등급 밖은 뒤) → 정원 큰 쪽 → 작은 ID. 음수면 a가 먼저.
 * 계급이 없는 유닛끼리는 정원 → ID(옛 D-331 선출과 같다)
 */
export function commanderOrder(
  a: { readonly id: number; readonly commandCap: number; readonly commandRank?: CommandRank | undefined },
  b: { readonly id: number; readonly commandCap: number; readonly commandRank?: CommandRank | undefined },
): number {
  const titleA = a.commandRank?.title ?? 0;
  const titleB = b.commandRank?.title ?? 0;
  if (titleA !== titleB) return titleB - titleA;
  const tierA = a.commandRank?.combatTier ?? COMMAND_TIER_STEPS;
  const tierB = b.commandRank?.combatTier ?? COMMAND_TIER_STEPS;
  if (tierA !== tierB) return tierA - tierB;
  if (a.commandCap !== b.commandCap) return b.commandCap - a.commandCap;
  return a.id - b.id;
}
