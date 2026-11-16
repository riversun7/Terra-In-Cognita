// 플레이어 가문 설정값 — 콘텐츠 팩 `tuning`을 얹은 세력·사회 계수표(@terra/sim societyCoefficientsFrom)의 house 칸에서 고른다
// (질문 926~935 답, docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 926~935 답)"). 부를 때마다 읽어 개발자 패널에서 바꾸면 다음
// 요청부터 쓴다. 팩 없이 띄운 서버·시험은 sim 시험 계수표(팩 출발값과 같다).
import { type FactionShortRange, clampShortRange } from "@terra/shared/factionIdentity";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";

export interface HouseRules {
  /** 새로 정하는 약어 폭(S20) */
  readonly shortRange: FactionShortRange;
  /** 이름·약어 다시 바꾸기 대기(ms, S20) */
  readonly renameWaitMs: number;
  /** 계정마다 하루 신고 횟수 */
  readonly reportDaily: number;
  /** 마크를 이만큼 내리면 올리기 자동 막기(0 = 끔) */
  readonly takedownBlock: number;
  /** 가문 가입(질문 985 다): 인원 상한·가문마다 대기 수·사람마다 신청 수(모두 1 이상)·요청 유효 시간(ms) */
  readonly memberMax: number;
  readonly pendingMax: number;
  readonly applyMax: number;
  readonly requestTtlMs: number;
  /** 운영자가 이름을 이만큼 되돌리면 이름·약어 바꾸기 자동 막기(질문 1006 나, 0 = 끔) */
  readonly nameResetBlock: number;
  /** 가문 마을 세우기 값(최소 단위)·새 마을 주거 수(1 이상) — 질문 1005 가 */
  readonly villageCost: bigint;
  readonly villageHousing: number;
  /** 가문 소속 도시 바꾸기 대기(ms, 0 = 바로 — 기획 D-565, 질문 1741) */
  readonly homeWaitMs: number;
  /** 가문 소속 도시 바꾸기 공고 기간(ms, 0 = 바로 옮김 — 기획 D-570) */
  readonly homeNoticeMs: number;
  /** NPC 나라의 가문 이동 정책 규칙식 입력(D-570·D-323 — @terra/sim npcHouseEntryFee): 상업 성향 범위와 가입비·지원금 최대(최소 단위) */
  readonly npcEntry: {
    readonly traitMin: number;
    readonly traitMax: number;
    readonly feeMax: number;
    readonly grantMax: number;
  };
  /** 가문세율 상한(‰, 0~1000 — D-574 2150) */
  readonly taxMaxPm: number;
  /** 가문 도시가 같은 나라 다른 가문 짓기를 정하지 않았을 때 허용하나(D-574 2124) */
  readonly cityBuildDefault: boolean;
  /** 독재 NPC 나라 지배 가문 금고 → 국고 몫(‰, 상업 성향 높음 = minPm·낮음 = maxPm — 2223 고침, @terra/sim npcRulingVaultReturnPm) */
  readonly npcVaultReturn: { readonly minPm: number; readonly maxPm: number };
}

const whole = (value: number): number => (Number.isSafeInteger(value) && value > 0 ? value : 0);
/** ‰ 칸(0~1000) */
const permille = (value: number): number => Math.min(1000, whole(value));
/** 1 이상(틀리거나 0이면 1 — 상한이 0이면 아무도 들 수 없어 가문장만 남는다) */
const atLeastOne = (value: number): number => Math.max(1, whole(value));

/** 세력·사회 계수표 → 가문 설정값(틀린 값은 0·저장 폭으로 좁힌다) */
export function houseRulesFrom(c: SocietyCoefficients): HouseRules {
  const h = c.house;
  return {
    shortRange: clampShortRange({ min: h.shortMin, max: h.shortMax }),
    renameWaitMs: whole(h.renameWaitMs),
    reportDaily: whole(h.reportDaily),
    takedownBlock: whole(h.takedownBlock),
    memberMax: atLeastOne(h.memberMax),
    pendingMax: atLeastOne(h.pendingMax),
    applyMax: atLeastOne(h.applyMax),
    requestTtlMs: Math.max(60_000, whole(h.requestTtlMs)),
    nameResetBlock: whole(h.nameResetBlock),
    villageCost: BigInt(whole(h.villageCost)),
    villageHousing: atLeastOne(h.villageHousing),
    homeWaitMs: whole(h.homeWaitMs),
    homeNoticeMs: whole(h.homeNoticeMs),
    npcEntry: {
      traitMin: c.npc.traitMin,
      traitMax: c.npc.traitMax,
      feeMax: whole(h.npcEntryFeeMax),
      grantMax: whole(h.npcEntryGrantMax),
    },
    taxMaxPm: permille(h.taxMaxPm),
    cityBuildDefault: h.cityBuildDefault !== 0,
    npcVaultReturn: { minPm: permille(h.npcVaultReturnMinPm), maxPm: permille(h.npcVaultReturnMaxPm) },
  };
}

/** 팩 없이 띄운 서버·시험 */
export const TEST_HOUSE_RULES: HouseRules = houseRulesFrom(TEST_SOCIETY_COEFFICIENTS);
