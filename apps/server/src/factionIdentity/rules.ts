// 플레이어 가문 설정값 — 콘텐츠 팩 `tuning`을 얹은 세력·사회 계수표(@terra/sim societyCoefficientsFrom)의 house 칸에서 고른다
// (질문 926~935 답, docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-11, 926~935 답)"). 부를 때마다 읽어 개발자 패널에서 바꾸면 다음
// 요청부터 쓴다. 팩 없이 띄운 서버·시험은 sim 시험 계수표(팩 출발값과 같다).
import type { CityShareRules } from "../cityShares/market.ts";
import { type FactionShortRange, clampShortRange } from "@terra/shared/factionIdentity";
import { type SocietyCoefficients, TEST_SOCIETY_COEFFICIENTS } from "@terra/sim";
import { type GovernanceRules, governanceRulesFrom } from "../governance/rules.ts";
import type { HouseLeagueVoteRules } from "./houseLeague.ts";
import type { NpcLeagueRules } from "./npcLeague.ts";

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
  /** 블랙리스트 현상금 한 건 상한(최소 단위, 0 = 현상금 없음 — 설정 칸 house_blacklist_bounty_max, ADR 2026-11-25-blacklist-bounty-limits.md) */
  readonly blacklistBountyMax: bigint;
  /** 가문 도시가 같은 나라 다른 가문 짓기를 정하지 않았을 때 허용하나(D-574 2124) */
  readonly cityBuildDefault: boolean;
  /** 독재 NPC 나라 지배 가문 금고 → 국고 몫(‰, 상업 성향 높음 = minPm·낮음 = maxPm — 2223 고침, @terra/sim npcRulingVaultReturnPm) */
  readonly npcVaultReturn: { readonly minPm: number; readonly maxPm: number };
  /** NPC 가문 연맹 만들기·들기 문턱(npc-invest-2 — npcLeague.ts, 1001이면 하지 않는다), 나가기·투표 열기 문턱(npc-fix-3, 0이면 하지 않는다) */
  readonly npcLeague: NpcLeagueRules;
  /** 가문 연맹 대표 투표 기간·정족수(npc-fix-3 — houseLeague.ts, 설정 칸 house_league_vote_*) */
  readonly leagueVote: HouseLeagueVoteRules;
  /** 나라 의결 설정값(governance 칸 — 가문 게이트웨이와 한 소켓으로 묶어 같은 설정 고리로 읽는다, docs/adr/2026-11-21-governance.md) */
  readonly governance: GovernanceRules;
  /** 도시(정부) 지분 시장 설정값(설정 칸 city_share_round_ms·city_share_order_max — D-583, docs/adr/2026-11-21-share-market.md) */
  readonly cityShares: CityShareRules;
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
    // 블랙리스트 현상금 상한 [임시]
    blacklistBountyMax: BigInt(whole(h.blacklistBountyMax ?? 5000)),
    cityBuildDefault: h.cityBuildDefault !== 0,
    npcVaultReturn: { minPm: permille(h.npcVaultReturnMinPm), maxPm: permille(h.npcVaultReturnMaxPm) },
    // NPC 가문 연맹 판단 문턱(npc-invest-2 — npcLeague.ts) [임시]
    npcLeague: {
      foundScore: Math.min(1001, whole(h.npcLeagueFoundScore ?? 750)),
      joinScore: Math.min(1001, whole(h.npcLeagueJoinScore ?? 550)),
      // 나가기·투표 열기 문턱(npc-fix-3 — 2563 다·2562 라) [임시]
      leaveScore: Math.min(1001, whole(h.npcLeagueLeaveScore ?? 300)),
      voteStartScore: Math.min(1001, whole(h.npcLeagueVoteStartScore ?? 400)),
      // NPC 대표의 초대 문턱(league-2 — D-590 2502 다) [임시]
      inviteScore: Math.min(1001, whole(h.npcLeagueInviteScore ?? 600)),
    },
    // 대표 투표 기간·정족수(npc-fix-3 — 기술 기본값)
    leagueVote: {
      periodMs: whole(h.leagueVotePeriodMs ?? 259_200_000),
      quorumPm: permille(h.leagueVoteQuorumPm ?? 500),
    },
    governance: governanceRulesFrom(c),
    cityShares: {
      roundMs: Math.max(60_000, whole(c.business.cityShareRoundMs ?? c.business.shareRoundMs)),
      orderMax: atLeastOne(c.business.cityShareOrderMax ?? c.business.shareOrderMax),
      // NPC 지분 주문(D-587 질문 2471 다 — cityShares/npcTrade.ts): 시뮬 지분 팔기와 같은 수·값, 사기 예산, 성향 범위
      npc: {
        lot: BigInt(whole(c.shareSaleAmount)),
        price: BigInt(whole(c.shareSalePrice)),
        budgetPm: whole(c.business.cityShareNpcBuyBudgetPm ?? 50),
        traitMin: c.npc.traitMin,
        traitMax: c.npc.traitMax,
      },
    },
  };
}

/** 팩 없이 띄운 서버·시험 */
export const TEST_HOUSE_RULES: HouseRules = houseRulesFrom(TEST_SOCIETY_COEFFICIENTS);
