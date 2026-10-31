// 사이보그 환생 — docs/adr/2026-10-31-faction-society-core.md "바뀜 (2026-11-01)"·"바뀜 (2026-11-01, D-444)", 기획 20 §2.4·48 §2,
// D-026·D-031·D-417·D-427·D-440·D-441·D-444·D-5001
// - 조건(D-441): 만렙(N7) + 신앙도 + 화폐(양은 N34 설정값, 출발값 D-5032). 진로별 종교 아이템은 있으면 더하는 추가 조건이다(지금은
//   부르는 쪽이 목록을 넘기는 데이터 고리만, 아이템은 쓰지 않고 가졌는지만 본다 — 기술 해석). 유전자 조각은 비용이 아니다(생명공학용).
// - 결과(D-440): 레벨 1·경험치 0(이전 최고 레벨까지 가속 없음), 환생 횟수 +1, 신앙도·화폐를 쓴다(D-444 165: 신앙도는 써서
//   줄어든다, 범위 0~100. 얻는 길은 REL-1 종교 활동이고 아직 만들지 않았다). 스탯 분포 변경 = 생성 때처럼 성향을 골라 다시 굴린
//   값(cyborgStats.ts, 다시 굴리기 횟수는 생성과 같은 N9 설정값, D-444 164. 직접 나누기는 없다. 안 굴리면 그대로 — 기술 해석),
//   K 리롤(N6 범위 균등, 시드 굴림 여섯)은 D-026 그대로.
//   인공장기·장비 등 다른 칸은 손대지 않는다(D-026: 인공장기 유지). 스킬 최대 등급(D-031·D-5001)과 스킬 칸(D-427,
//   combat/equipment.ts skillSlotCount)은 환생 횟수에서 계산하므로 +1씩 따라 오른다.
// - 화폐는 그 신전 도시의 화폐다(D-441 해석). 내는 곳(NPC 신전 = 소멸, 유저 신전 = 주인 수입, 46 §7.4)은 부르는 쪽이 원장에 쓴다.
// 장소(환생 시설·신전)와 연출(모항 몸 교체, D-058)은 부르는 쪽 몫이다.
import type { Primaries } from "../combat/stats.ts";
import type { SocietyCoefficients } from "./coefficients.ts";
import { PRIMARY_STATS, type StatRolls, kFromRolls, temperamentOf } from "./cyborgStats.ts";

/** 규칙이 보는 사이보그 성장 상태(서버·화면이 이 모양을 넓혀 쓴다) */
export interface CyborgProgress {
  readonly level: number;
  /** 지금 레벨 안 경험치 */
  readonly exp: number;
  readonly rebirths: number;
  /** 신앙도(0~100, D-441로 사이보그도 가진다. 범위는 REL-1과 같다 — D-444 165) */
  readonly faith: number;
  /** 초기 스탯 분포(N9 합) */
  readonly initial: Primaries;
  /** 숨은 성장 K(‰, N6) */
  readonly kPm: Primaries;
}

export interface ItemNeed {
  readonly asset: string;
  readonly amount: bigint;
}

export interface RebirthWallet {
  /** 신전 도시 화폐 잔고(최소 단위) */
  readonly currency: bigint;
  /** 가진 아이템 수(종교 아이템 추가 조건). 없으면 0으로 본다 */
  readonly item?: ((asset: string) => bigint) | undefined;
}

export type RebirthBlocker = "level" | "faith" | "currency" | "items" | "distribution";

export interface RebirthChoice {
  /** 성향을 골라 다시 굴린 분포(cyborgStats.ts firstStatRoll·rerollStats의 마지막 값, D-444 164). 없으면 그대로 */
  readonly spread?: StatRolls | undefined;
  /** K 리롤 굴림 여섯(0~9999, STR·DEX·AGI·VIT·INT·WIS 차례) */
  readonly kRolls: readonly number[];
}

export type RebirthResult<T extends CyborgProgress> =
  | {
      readonly ok: true;
      readonly state: T;
      readonly spent: { readonly faith: number; readonly currency: bigint };
    }
  | { readonly ok: false; readonly blockers: RebirthBlocker[] };

/** 스킬 최대 등급 = min(기본 3 + 환생 횟수, 상한 10)(D-031·D-5001) */
export function skillGradeCap(rebirths: number, c: SocietyCoefficients): number {
  return Math.min(c.cyborg.skillGradeMax, c.cyborg.skillGradeBase + Math.max(0, rebirths));
}

/** 환생을 막는 것(비어 있으면 할 수 있다): 만렙, 신앙도, 화폐, 추가 조건 아이템 차례 */
export function rebirthBlockers(
  state: CyborgProgress,
  wallet: RebirthWallet,
  c: SocietyCoefficients,
  extraItems: readonly ItemNeed[] = [],
): RebirthBlocker[] {
  const out: RebirthBlocker[] = [];
  if (state.level < c.cyborg.maxLevel) out.push("level");
  if (state.faith < c.cyborg.rebirthFaith) out.push("faith");
  if (wallet.currency < BigInt(c.cyborg.rebirthCurrency)) out.push("currency");
  if (extraItems.some((need) => (wallet.item?.(need.asset) ?? 0n) < need.amount)) out.push("items");
  return out;
}

/** 굴린 분포가 N9 안(합·칸 범위), 아는 성향, 다시 굴리기 횟수 안인지(굴림 상태는 서버가 들고 있다. 넘겨받은 값을 다시 본다) */
function validRolls(rolls: StatRolls, c: SocietyCoefficients): boolean {
  if (temperamentOf(rolls.temperament, c) === undefined) return false;
  if (
    !Number.isInteger(rolls.rerollsLeft) ||
    rolls.rerollsLeft < 0 ||
    rolls.rerollsLeft > c.cyborg.initialRerolls
  )
    return false;
  let sum = 0;
  for (const stat of PRIMARY_STATS) {
    const value = rolls.spread[stat];
    if (!Number.isInteger(value) || value < c.cyborg.initialMin || value > c.cyborg.initialMax) return false;
    sum += value;
  }
  return sum === c.cyborg.initialSum;
}

/** 환생 한 번. 막히면 까닭 목록, 되면 새 상태(다른 칸은 그대로)와 쓴 비용 */
export function rebirthCyborg<T extends CyborgProgress>(
  state: T,
  wallet: RebirthWallet,
  choice: RebirthChoice,
  c: SocietyCoefficients,
  extraItems: readonly ItemNeed[] = [],
): RebirthResult<T> {
  const kPm = kFromRolls(choice.kRolls, c);
  const blockers = rebirthBlockers(state, wallet, c, extraItems);
  if (choice.spread && !validRolls(choice.spread, c)) blockers.push("distribution");
  if (blockers.length > 0) return { ok: false, blockers };
  return {
    ok: true,
    state: {
      ...state,
      level: 1,
      exp: 0,
      rebirths: state.rebirths + 1,
      faith: state.faith - c.cyborg.rebirthFaith,
      initial: choice.spread?.spread ?? state.initial,
      kPm,
    },
    spent: { faith: c.cyborg.rebirthFaith, currency: BigInt(c.cyborg.rebirthCurrency) },
  };
}
