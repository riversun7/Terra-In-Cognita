// 사이보그 만들기·상태 조회 응답 — tRPC cyborg.status·cyborg.creation·cyborg.nameCheck의 모양.
// ADR 2026-11-01-first-login-cyborg 4절·"바뀜 (D-450~D-453)". 바꾸는 명령(굴리기·만들기·속성 분배)은 WebSocket(packages/protocol
// cyborg.ts)으로만 보낸다.
import type { CharacterLook } from "./characterLook.ts";
import type { CyborgNameProblem } from "./cyborgName.ts";
import type { Regime } from "./faction.ts";
import type { NationEmblemView } from "./nationEditor.ts";
import type { PowerTier } from "./nationTier.ts";
import type { LocalizedName, PrimaryStat } from "./roster.ts";

/** 1차 스탯 여섯(STR·DEX·AGI·VIT·INT·WIS) */
export type CyborgStats = { readonly [S in PrimaryStat]: number };

/**
 * cyborg.status — 틀 길잡이(사이보그가 없으면 /start)와 위 띠 얼굴이 쓴다. elementsPending = 속성 분배(D-450)가 없는 사이보그
 * (프로토콜 5 전에 만든 것): 길잡이가 /start의 속성 분배로 한 번 보낸다
 */
export type CyborgStatusResponse =
  | { readonly cyborg: null }
  | {
      readonly cyborg: {
        readonly name: string;
        /**
         * 3D 외형(docs/adr/2026-11-11-character-3d.md 5절 — 옛 2D만 있던 사이보그는 서버가 넘겨 채웠다). 옛 2D 칸 appearance는 뺐다
         * (기획 D-560 1421)
         */
        readonly look: CharacterLook;
        readonly elementsPending: boolean;
      };
    };

/** 지금 굴림(서버가 굴리고 저장한다). 남은 횟수가 0이면 이 값으로 만든다 */
export interface CyborgRollView {
  readonly temperament: string;
  readonly stats: CyborgStats;
  readonly rollsLeft: number;
  readonly rollsMax: number;
}

/** 성향(질문 168): ID와 치우친 스탯. 이름은 기기가 ID로 고른다(모르는 ID는 치우친 스탯으로 보인다) */
export interface CyborgTemperamentView {
  readonly id: string;
  readonly favored: readonly PrimaryStat[];
}

/** 붐빔 띠(질문 175 [임시] 문턱: 그 도시에서 시작한 사이보그 수) */
export const CROWDING_BANDS = ["quiet", "normal", "busy"] as const;
export type CrowdingBand = (typeof CROWDING_BANDS)[number];

export interface CreationCity {
  readonly id: number;
  /** 세력 안 차례(1부터). 이름이 없는 도시의 [임시] 이름 "시작 도시 n" */
  readonly number: number;
  /** 도시 이름(번역하지 않는다 D-476, NPC 도시는 팩 국가 프리셋 목록 — 기획 답 510 다). 없으면 null */
  readonly name: string | null;
  /** 2차맵 키(셀 키, 16자리까지라 글자) */
  readonly mapKey: string;
  /** 그 도시에서 시작한 사이보그 수 */
  readonly cyborgs: number;
  readonly crowding: CrowdingBand;
}

/**
 * 나라 고르기 카드의 자세한 정보(사용자 요청 2026-11-11 "인구수, 정책, 간단소개 등" — docs/adr/2026-11-01-first-login-cyborg.md "바뀜 (2026-11-11)").
 * 서버가 이미 가진 값을 읽기만 한다(팩 국가 프리셋 + NPC 사회 런타임 거울 세계 + 도시 경제 세율). 모르는 값은 null(화면 "—" 또는 줄 없음)
 */
export interface CreationNationProfile {
  /** 국력 등급(팩 프리셋 powerTier, ./nationTier.ts). 없으면 null */
  readonly tier: PowerTier | null;
  /** 나라 인구 = 그 나라 도시에 사는 휴먼 수(NPC 사회 런타임). 런타임이 없으면 null */
  readonly humans: number | null;
  /** 그 나라가 지금 가진 도시 수(시작 도시 + 얻은 도시). 런타임이 없으면 null */
  readonly cityCount: number | null;
  /** 정권 체제(D-217) */
  readonly regime: Regime | null;
  /** 기술 단계 */
  readonly tech: number | null;
  /** 거래세(만분율, 도시 경제의 지금 세율 — 없으면 팩 프리셋 값) */
  readonly taxBp: number | null;
  /** 나라 화폐(팩 프리셋). 기호·3글자 약어는 없으면 null */
  readonly currency: {
    readonly name: LocalizedName;
    readonly symbol: string | null;
    readonly ticker: string | null;
  } | null;
  /** 국가 지도자 이름(팩 프리셋 leaderName) */
  readonly leaderName: LocalizedName | null;
  /** 국가 마크(만든 마크 + 이 세계에 올린 그림) */
  readonly emblem: NationEmblemView | null;
  /** 한 줄 소개(팩 프리셋 intro, [임시] 글) */
  readonly intro: LocalizedName | null;
}

export interface CreationFaction {
  readonly id: number;
  readonly name: LocalizedName;
  /**
   * 추천 나라(D-218 "사이보그가 가장 적은 세력"을 2026-11-11에 좁힘): 시작 도시 하나당 시작한 사이보그 수가 적은 차례 → 시작 도시가 많은 차례 →
   * 세력 ID 차례로 앞의 3곳(열린 나라가 3곳 이하면 1곳). 새로 온 사람에게 자리(시작 도시)가 넉넉하고 지원금이 큰 나라다
   */
  readonly recommended: boolean;
  /** 이 세력에 든 사이보그 수 */
  readonly cyborgs: number;
  /**
   * 강하 때 한 번 받는 정착 지원금(D-455 190·N39: 기본액 × 세력 배율, 사이보그가 적게 시작한 세력일수록 많다). 최소 단위 정수 글자.
   * [임시] 세력 화폐가 서버에 없어 세력 국고의 시험 화폐로 낸다. 국고가 모자라면 실제로 받는 양이 적을 수 있다
   */
  readonly grant: string;
  /** 시작 도시(D-6041). 기본 선택은 가장 덜 붐비는 곳(처음 것) */
  readonly cities: readonly CreationCity[];
  /** 자세한 정보(2026-11-11). 옛 서버·프리셋이 없는 나라는 없음 */
  readonly profile?: CreationNationProfile | undefined;
  /**
   * 이 나라가 가문 가입비를 받으면 그 값(가문원마다, 최소 단위 정수 문자열). 있으면 이 나라에서 시작할 수 없다(사용자 결정
   * 2026-11-25 — 서버도 만들기를 거절한다). 가입비가 없거나 지원금을 주는 나라는 없음
   */
  readonly entryFee?: string | undefined;
}

/** cyborg.creation — /start 화면 자료 */
export interface CyborgCreationResponse {
  /** 이미 만들었는가(그러면 기기는 홈으로. 속성 분배가 없으면 분배 단계만) */
  readonly created: boolean;
  /** 만든 사이보그에 속성 분배가 없다(프로토콜 5 전에 만든 것, D-450): /start가 분배 단계만 보인다 */
  readonly elementsPending: boolean;
  readonly roll: CyborgRollView | null;
  /**
   * 합·칸 범위(팩 tuning N9)와 굴림 상한(처음 1 + 다시 굴리기), 속성 분배(N36: 4원소 가운데 고를 수 있는 칸 수·나눌 점수, 칸마다
   * 상한 10 D-182)
   */
  readonly rules: {
    readonly statSum: number;
    readonly statMin: number;
    readonly statMax: number;
    readonly rollsMax: number;
    /**
     * 운영진(gm·admin·dev)은 다시 굴리기 횟수 제한이 없다(사용자 요청 2026-11-11 — 서버가 센다, 화면은 "제한 없음"). 옛 서버면 없음
     */
    readonly rollsUnlimited?: boolean | undefined;
    readonly elementCells: number;
    readonly elementPoints: number;
  };
  readonly temperaments: readonly CyborgTemperamentView[];
  readonly factions: readonly CreationFaction[];
  readonly generatedAt: number;
}

/** cyborg.nameCheck — 이름 단계 [다음] 때 묻는다(최종 확인은 만들 때 서버가 다시 한다) */
export type CyborgNameCheckResponse =
  | { readonly ok: true; readonly display: string }
  | { readonly ok: false; readonly code: CyborgNameProblem | "taken" };
