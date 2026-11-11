// 시작 국가 설정 편집기(/dev/nations) 공용 자료 모양·범위 — 서버(apps/server/src/nationEdit/)와 화면(apps/game/src/editor/nations/)이 같이 쓴다.
// docs/adr/2026-11-10-nation-editor.md. 사용자 요청(2026-11-10): "시작 기본 npc국가세팅 에디터추가하고 반영하라. 임시국가, 임시화폐같은 명칭을
// 제대로 생성하나, 국가마크도 생성 및 유저는 업로드하여 일정 사이즈를 크롭?자를수있게 그외 사이보그나 유닛 수 등등 디테일한 조정".
// 팩 분류 nation_presets의 덮어쓰기(스킬·아이템·건물 편집기와 같은 층 — ./contentEdit.ts)와 올린 국가 마크·이 세계에 반영 요청의 모양.
import type {
  ContentEditOrigin,
  ContentHistoryRow,
  ContentIssueView,
  ContentOverrideView,
  ContentSleepingRow,
  LocalizedName,
} from "./contentEdit.ts";
import type { NameStyleId } from "./nameGen.ts";
import type { NationEmblemSpec } from "./nationEmblem.ts";
import type { NationTierJson, PowerTier } from "./nationTier.ts";

/**
 * 국가마다 세계 씨앗 값의 범위(팩 스키마·편집기 입력이 같이 쓴다). 설정 칸(49 worldSeed — npc_seed_housing·npc_seed_population_pm·
 * npc_seed_farms 등)과 같은 범위다
 */
export const NATION_SEED_LIMITS = {
  // 등급이 있는 프리셋은 8곳까지(등급 표와 같은 범위 — ./nationTier.ts), 등급이 없으면 설정 칸 아래 끝~위 끝 안으로 자른다
  startCities: { min: 1, max: 8 },
  housing: { min: 4, max: 1000 },
  populationPm: { min: 0, max: 1000 },
  facility: { min: 0, max: 4 },
  guards: { min: 0, max: 12 },
  tech: { min: 1, max: 5 },
  necessityHours: { min: 0, max: 24 * 30 },
  tradeTaxBp: { min: 0, max: 10_000 },
  stockQty: { min: 1, max: 1_000_000 },
} as const;

/** 목록 칸의 길이 상한(팩 스키마와 같다) */
export const NATION_LIST_LIMITS = {
  cityNames: 32,
  cityNameLength: 24,
  humanNames: 64,
  humanNameLength: 16,
  cityJobs: 8,
  startStock: 16,
  nameLength: 24,
  /** 한 줄 소개(intro) 한 언어 글자 수 상한(첫 접속 나라 카드, 2026-11-11) */
  introLength: 160,
  changesMax: 40,
  historyLimit: 30,
} as const;

/** 올리는 국가 마크: 정사각 PNG 한 장(기기가 잘라 이 크기로 줄여 보낸다), 바이트 상한 */
export const NATION_EMBLEM_UPLOAD = {
  size: 256,
  maxBytes: 200_000,
} as const;

/** 올린 마크를 받는 길(해시가 주소라 오래 캐시한다) */
export const nationEmblemUrl = (hash: string): string => `/api/nation-emblems/${hash}.png`;

export interface NationPersonalityJson {
  readonly startCities?: number | undefined;
  readonly startNecessityHours?: number | undefined;
  readonly cityJobs?: readonly { readonly facility: string; readonly recipe: string }[] | undefined;
  readonly startStock?: readonly { readonly item: string; readonly qty: number }[] | undefined;
  readonly startHousing?: number | undefined;
  readonly startPopulationPm?: number | undefined;
  readonly startFarms?: number | undefined;
  readonly startLumberCamps?: number | undefined;
  readonly startMines?: number | undefined;
  readonly startStorehouses?: number | undefined;
  /** 시작 도시 하나의 경비대 수·처음 기술 단계(국가마다 값 — 없으면 등급 표, 등급도 없으면 0·1) */
  readonly startGuards?: number | undefined;
  readonly startTech?: number | undefined;
}

/** 팩 국가 프리셋 한 줄(JSON 모양 — 참조는 ID 글) */
export interface NationPresetJson {
  readonly id: string;
  readonly name: LocalizedName;
  readonly shortName?: string | undefined;
  readonly color?: string | undefined;
  readonly emblem?: NationEmblemSpec | undefined;
  readonly nameStyle?: NameStyleId | undefined;
  /** 국력 등급(없으면 등급 없이 옛 규칙 — ./nationTier.ts) */
  readonly powerTier?: PowerTier | undefined;
  readonly currency: {
    readonly code: string;
    readonly name: LocalizedName;
    readonly symbol?: string | undefined;
    readonly ticker?: string | undefined;
  };
  readonly tradeTaxBp: number;
  readonly personality?: NationPersonalityJson | undefined;
  readonly cityNames?: readonly string[] | undefined;
  readonly leaderName?: LocalizedName | undefined;
  /** 한 줄 소개(첫 접속 나라 고르기 카드, [임시] 글 — docs/adr/2026-11-01-first-login-cyborg.md "바뀜 (2026-11-11)") */
  readonly intro?: LocalizedName | undefined;
  readonly humanNames?:
    | { readonly given: readonly string[]; readonly family?: readonly string[] | undefined }
    | undefined;
  readonly enabled: boolean;
}

/** 올린 국가 마크 한 장의 정보(그림은 nationEmblemUrl(hash)로 받는다) */
export interface NationEmblemUploadView {
  readonly hash: string;
  readonly bytes: number;
  readonly uploadedAt: number;
  readonly uploadedBy: string | null;
}

export interface NationEditorRow {
  readonly entry: NationPresetJson;
  readonly origin: ContentEditOrigin;
  readonly pack: NationPresetJson | null;
  readonly override: ContentOverrideView | null;
  readonly hash: string;
  /** 이 세계에 올린 마크(있으면 만든 마크 대신 보인다) */
  readonly uploaded: NationEmblemUploadView | null;
  /** 이 세계에서 이 프리셋을 쓰는 고정 국가 차례(1 = 시험 NPC 세력, 2부터 팩 차례). 지금 설정으로 서지 않으면 null */
  readonly slot: number | null;
}

/** 국력 등급 표 한 줄(실효·팩·덮어쓰기·해시 — 같은 편집기의 등급 판) */
export interface NationTierRow {
  readonly entry: NationTierJson;
  readonly origin: ContentEditOrigin;
  readonly pack: NationTierJson | null;
  readonly override: ContentOverrideView | null;
  readonly hash: string;
}

/** 세계 씨앗 설정 칸의 지금 실효 값(국가 칸이 비었을 때 드는 값 — 편집기가 "기본값 N"으로 보인다) */
export interface NationSeedDefaults {
  readonly startCitiesMin: number;
  readonly startCitiesMax: number;
  readonly housing: number;
  readonly populationPm: number;
  readonly farms: number;
  readonly lumberCamps: number;
  readonly mines: number;
  readonly storehouses: number;
  /** 처음 창고 생필품 시간분 기본(서버 기본 48시간, 554 다) */
  readonly necessityHours: number;
  /** 한 국가 시작 도시 사이 칸(설정 칸 world_layout_city_step_cells) */
  readonly cityStepCells: number;
}

export interface NationEditorOption {
  readonly id: string;
  readonly name: LocalizedName;
}

export interface NationEditorRecipeOption extends NationEditorOption {
  /** 그 레시피를 돌리는 시설 ID */
  readonly facility: string;
}

export interface NationEditorListResponse {
  readonly contentVersion: string;
  readonly revision: number;
  readonly nations: readonly NationEditorRow[];
  /** 국력 등급 표(등급 차례 — 줄이 없는 등급은 없다) */
  readonly tiers: readonly NationTierRow[];
  readonly defaults: NationSeedDefaults;
  /** 도시 직무 고르기: 시설·레시피(레시피의 시설이 맞아야 한다) */
  readonly facilities: readonly NationEditorOption[];
  readonly recipes: readonly NationEditorRecipeOption[];
  /** 처음 창고 특산 물건 고르기 */
  readonly items: readonly NationEditorOption[];
  readonly sleeping: readonly ContentSleepingRow[];
  /** 한 번 쓰고 지운 국가 프리셋 ID(새 프리셋 ID로 다시 쓰지 못한다 — 랜덤 국가 추가가 건너뛴다) */
  readonly retiredIds: readonly string[];
  /** 이 서버에서 서는 고정 국가 수(NPC_TEST_NATIONS). NPC 사회를 끈 서버는 null */
  readonly testNations: number | null;
  /** 마크 올리기·이 세계에 반영을 쓸 수 있나(DB가 있는 서버) */
  readonly worldTools: boolean;
}

export type NationEditorChange =
  | { readonly op: "put"; readonly entry: NationPresetJson; readonly baseHash: string }
  | { readonly op: "revert"; readonly id: string; readonly baseHash: string }
  | { readonly op: "discard_sleeping"; readonly id: string }
  /** 새 프리셋 만들기(랜덤 국가 추가 — 새 ID, 목록 끝에 붙는다) */
  | { readonly op: "create"; readonly entry: NationPresetJson }
  /** 국력 등급 표 한 줄 고치기·팩 값으로 되돌리기 */
  | { readonly op: "put_tier"; readonly entry: NationTierJson; readonly baseHash: string }
  | { readonly op: "revert_tier"; readonly id: string; readonly baseHash: string };

/** 새로 만드는 프리셋 ID·화폐 코드의 모양(팩 16개의 placeholder_* 와 겹치지 않는다. 한 번 쓴 ID는 다시 쓰지 않는다) */
export const NATION_CREATED_ID = /^nation_[a-z0-9]{2,24}_[0-9]{1,4}$/;
export const NATION_CREATED_CURRENCY = /^cur_[a-z0-9]{2,24}_[0-9]{1,4}$/;

export const NATION_EDITOR_REASONS = [
  "invalid_entry",
  "unknown_entry",
  "duplicate_entry",
  "invalid_note",
  "entry_changed",
  "entry_too_large",
  "revision_conflict",
  // 만든 프리셋: 이 세계에 이미 선 국가는 지우지 못한다
  "nation_standing",
  // 마크 올리기
  "emblem_not_png",
  "emblem_wrong_size",
  "emblem_too_large",
  "emblem_unavailable",
  // 이 세계에 반영
  "world_unavailable",
] as const;
export type NationEditorReason = (typeof NATION_EDITOR_REASONS)[number];

export interface NationEditorCheckResponse {
  readonly ok: boolean;
  readonly issues: readonly ContentIssueView[];
}

export type NationEditorHistoryRow = ContentHistoryRow;

/** 이 세계에 반영 한 줄의 결과 */
export const NATION_APPLY_ACTIONS = ["update", "same", "skip_admin", "skip_taken", "skip_invalid"] as const;
export type NationApplyAction = (typeof NATION_APPLY_ACTIONS)[number];

/** 이 세계에 반영: 세력 정체성 한 줄(프리셋 값 → faction_profiles) */
export interface NationApplyFactionRow {
  readonly kind: "faction";
  readonly factionId: number;
  /** 프리셋 ID */
  readonly preset: string;
  readonly before: { readonly name: string; readonly shortName: string; readonly color: string };
  readonly after: { readonly name: string; readonly shortName: string; readonly color: string };
  readonly action: NationApplyAction;
}

/** 이 세계에 반영: 화폐 표시 한 줄(프리셋 값 → currency_profiles) */
export interface NationApplyCurrencyRow {
  readonly kind: "currency";
  readonly asset: string;
  readonly preset: string;
  readonly before: { readonly name: string; readonly symbol: string; readonly ticker: string };
  readonly after: { readonly name: string; readonly symbol: string; readonly ticker: string };
  readonly action: NationApplyAction;
}

export type NationApplyRow = NationApplyFactionRow | NationApplyCurrencyRow;

export interface NationApplyResponse {
  /** 참이면 미리 보기만 했다(바꾼 것 없음) */
  readonly dryRun: boolean;
  readonly rows: readonly NationApplyRow[];
  readonly updated: number;
  readonly skipped: number;
}

/** 게임 화면이 국가 이름 곁에 그리는 마크(만든 사양 또는 올린 그림) */
export interface NationEmblemView {
  readonly spec: NationEmblemSpec;
  readonly color: string;
  /** 올린 그림 해시(있으면 그림이 먼저) */
  readonly uploaded: string | null;
}
