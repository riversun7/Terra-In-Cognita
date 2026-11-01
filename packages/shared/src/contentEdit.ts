// 팩 항목 덮어쓰기(D-461 바로 적용) 공용 모양 — 스킬 편집기(/dev/skills)·아이템 편집기(/dev/items)가 같이 쓴다.
// docs/adr/2026-11-01-skill-editor.md(덮어쓰기 층), docs/adr/2026-11-01-item-editor.md 3·4절(분류 넓힘·baseHash·은퇴 ID·잠든 줄).
// 서버(apps/server/src/contentEdit/)와 화면(apps/game/src/editor/content/)이 같이 쓴다.

/**
 * 덮어쓸 수 있는 팩 분류(코드 목록). 스킬 편집기 = skills(+ 행동별 소모: items 무기·unit_kinds 타고난 무기), 아이템 편집기 = items +
 * 분류 자료(item_subcategories·item_tags·weapon_types). DB 검사(content_overrides_category)는 effects까지 넓혀 두었다(효과 사전 편집 WP-6).
 * 이 판이 모르는 분류의 줄은 읽지도 지우지도 않는다(켤 때 잠든 줄 unknown_category)
 */
export const CONTENT_EDIT_CATEGORIES = [
  "skills",
  "items",
  "unit_kinds",
  "item_subcategories",
  "item_tags",
  "weapon_types",
] as const;
export type ContentEditCategory = (typeof CONTENT_EDIT_CATEGORIES)[number];

export function isContentEditCategory(value: unknown): value is ContentEditCategory {
  return typeof value === "string" && (CONTENT_EDIT_CATEGORIES as readonly string[]).includes(value);
}

export interface LocalizedName {
  readonly ko: string;
  readonly en: string;
}

/** 항목이 어디서 왔나: 팩 그대로 · 팩 위에 덮어씀 · 편집기에서 만듦(팩에 없음) */
export type ContentEditOrigin = "pack" | "edited" | "created";

/** 세계의 덮어쓰기 하나(누가·언제·메모) */
export interface ContentOverrideView {
  readonly note: string | null;
  readonly updatedBy: string | null;
  readonly updatedAt: number;
  readonly contentVersionAtSave: string;
}

/** 켤 때 덮어쓰기를 지운 까닭 */
export const CONTENT_DROP_REASONS = ["unknown_entry", "invalid_entry"] as const;
export type ContentDropReason = (typeof CONTENT_DROP_REASONS)[number];

/**
 * 켤 때 지우지 않고 잠재운 까닭(적용하지 않고 DB에 둔다): 지금 팩보다 새 판에서 저장해 이 판이 읽지 못함(newer_pack), 편집기에서 만든
 * 항목과 같은 ID가 팩에 생겼는데 내용이 다름(id_collision), 이 판이 모르는 분류(unknown_category)
 */
export const CONTENT_SLEEP_REASONS = ["newer_pack", "id_collision", "unknown_category"] as const;
export type ContentSleepReason = (typeof CONTENT_SLEEP_REASONS)[number];

/** 잠든 줄 하나(편집기가 띠로 보인다. id_collision이면 [새 ID로 옮기기]·[버리기]) */
export interface ContentSleepingRow {
  readonly category: string;
  readonly id: string;
  readonly reason: ContentSleepReason;
  readonly contentVersion: string;
}

/**
 * 검사 문제 하나(팩 검사기 @terra/content ContentIssue를 화면에 보내는 모양). 화면은 code(+ params)로 메시지 키를 고르고, 코드가 없는
 * 옛 검사 문구는 content_other로 보이고 message(한국어 원문)는 "자세히"에만 둔다
 */
export interface ContentIssueView {
  readonly level: "error" | "warning";
  readonly file: string | null;
  readonly id: string | null;
  readonly path: string | null;
  readonly code: string | null;
  readonly params: Readonly<Record<string, string | number | boolean>>;
  readonly message: string;
}

/** 최근 바꿈 한 줄(감사 기록 요약, 항목 통째는 싣지 않는다) */
export interface ContentHistoryRow {
  /** 감사 기록 줄 ID(그 판 항목을 따로 받을 때) */
  readonly auditId: number | null;
  readonly at: number;
  readonly action: "apply" | "pack_won" | "dropped" | "slept";
  readonly actor: string | null;
  readonly revision: number | null;
  readonly note: string | null;
  readonly changes: readonly {
    readonly category: ContentEditCategory;
    readonly id: string;
    /** apply: put·revert, 켤 때: 까닭 */
    readonly what: string;
  }[];
}

/**
 * 내보내기 차이의 팩 항목 한 줄(terra-tuning-diff entries, `pnpm tuning:apply`가 분류 파일에 넣는다). from = 내보낼 때의 팩 항목
 * 정규 JSON SHA-256(팩에 없던 항목이면 null), entry = 덮어쓴 항목 통째
 */
export interface EntryDiffChange {
  readonly category: ContentEditCategory;
  readonly id: string;
  readonly from: string | null;
  readonly entry: Readonly<Record<string, unknown>>;
}

/** 은퇴 ID 한 줄(그 세계에서 만든 뒤 지운 항목 ID. 다시 쓰지 못한다, 내보내기 retiredIds) */
export interface RetiredIdRow {
  readonly category: ContentEditCategory;
  readonly id: string;
}
