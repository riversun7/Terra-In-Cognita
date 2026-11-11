// 플레이어 가문 설정값 — 콘텐츠 팩 `tuning`을 얹은 세력·사회 계수표(@terra/sim societyCoefficientsFrom)의 house 칸에서 고른다
// (질문 926~935 답, docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 926~935 답)"). 부를 때마다 읽어 개발자 패널에서 바꾸면 다음
// 요청부터 쓴다. 팩 없이 띄운 서버·시험은 sim 시험 계수표(팩 출발값과 같다).
import { type FactionShortRange, clampShortRange } from "@terra/shared/factionIdentity";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";

export interface HouseRules {
  /** 가문 창설 비용(최소 단위, 0 이상) */
  readonly foundCost: bigint;
  /** 새로 정하는 약어 폭(S20) */
  readonly shortRange: FactionShortRange;
  /** 이름·약어 다시 바꾸기 대기(ms, S20) */
  readonly renameWaitMs: number;
  /** 계정마다 하루 신고 횟수 */
  readonly reportDaily: number;
  /** 마크를 이만큼 내리면 올리기 자동 막기(0 = 끔) */
  readonly takedownBlock: number;
}

const whole = (value: number): number => (Number.isSafeInteger(value) && value > 0 ? value : 0);

/** 세력·사회 계수표 → 가문 설정값(틀린 값은 0·저장 폭으로 좁힌다) */
export function houseRulesFrom(c: SocietyCoefficients): HouseRules {
  const h = c.house;
  return {
    foundCost: BigInt(whole(h.foundCost)),
    shortRange: clampShortRange({ min: h.shortMin, max: h.shortMax }),
    renameWaitMs: whole(h.renameWaitMs),
    reportDaily: whole(h.reportDaily),
    takedownBlock: whole(h.takedownBlock),
  };
}

/** 팩 없이 띄운 서버·시험 */
export const TEST_HOUSE_RULES: HouseRules = houseRulesFrom(TEST_SOCIETY_COEFFICIENTS);
