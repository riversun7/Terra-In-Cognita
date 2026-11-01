// 사이보그 만들기·상태 조회 응답 — tRPC cyborg.status·cyborg.creation·cyborg.nameCheck의 모양.
// ADR 2026-11-01-first-login-cyborg 4절·"바뀜 (D-450~D-453)". 바꾸는 명령(굴리기·만들기·속성 분배)은 WebSocket(packages/protocol
// cyborg.ts)으로만 보낸다.
import type { CyborgAppearance } from "./cyborgLooks.ts";
import type { CyborgNameProblem } from "./cyborgName.ts";
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
        readonly appearance: CyborgAppearance;
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
  /** 세력 안 차례(1부터). 도시 이름이 생기기 전 [임시] 이름 "시작 도시 n" */
  readonly number: number;
  /** 2차맵 키(셀 키, 16자리까지라 글자) */
  readonly mapKey: string;
  /** 그 도시에서 시작한 사이보그 수 */
  readonly cyborgs: number;
  readonly crowding: CrowdingBand;
}

export interface CreationFaction {
  readonly id: number;
  readonly name: LocalizedName;
  /** 추천 지역(D-218: 사이보그가 가장 적은 세력) */
  readonly recommended: boolean;
  /** 이 세력에 든 사이보그 수 */
  readonly cyborgs: number;
  /** 시작 도시(D-6041). 기본 선택은 가장 덜 붐비는 곳(처음 것) */
  readonly cities: readonly CreationCity[];
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
