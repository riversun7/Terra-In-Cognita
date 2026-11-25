// 홈 대시보드: 카드·크기·템플릿 ID, 기본 카드, 유저 설정 `home` 읽기, 카드 상태 전송 타입(ADR 2026-10-29-app-shell 6절, D-6001·D-6005).
// 진입점은 @terra/shared/dashboard다. 첫 화면 묶음에 들어가지 않게 index.ts에서 내보내지 않는다(ADR 37 6절·11절).
// 카드를 그리는 부품과 이름 키는 게임 앱 home/cards/에 둔다.
// 카드·템플릿 ID는 계정에 저장된다(user_settings.home). 한 번 쓴 ID는 다시 쓰지 않는다(docs/PROTECTED.md).
import type { Role } from "./roles.ts";
import { isSavedId } from "./savedId.ts";

/** 카드 크기 = 가로×세로 칸 수 */
export const CARD_SIZES = ["1x1", "2x1", "2x2"] as const;

export type CardSize = (typeof CARD_SIZES)[number];

/** 카드 자료 출처: server = dashboard.cards(카드 제공 함수), inbox = inbox.list·summary.get, device = 기기 */
export type CardSource = "server" | "inbox" | "device";

export interface CardDefinition {
  /** 고를 수 있는 크기 */
  readonly sizes: readonly CardSize[];
  readonly defaultSize: CardSize;
  readonly source: CardSource;
}

/**
 * 카드 목록. 줄 순서는 [편집]의 "카드 더하기" 순서다. 지금 모든 카드는 누구나 더할 수 있다(ADR 37 6절).
 * 크기는 처음 값이다. 바꿔도 저장값은 깨지지 않는다(고를 수 없는 크기는 읽을 때 기본 크기가 된다).
 */
export const HOME_CARDS = {
  inbox: { sizes: ["2x1", "2x2"], defaultSize: "2x1", source: "inbox" },
  // 빠른 도시 활동: 고른 내 유닛이 있는 2차맵의 건물·유닛·자원·정보를 2차맵에 들어가지 않고 본다(자료는 카드가 직접 묻는다)
  city: { sizes: ["2x2"], defaultSize: "2x2", source: "device" },
  cyborg: { sizes: ["1x1", "2x1"], defaultSize: "1x1", source: "server" },
  units: { sizes: ["1x1", "2x1"], defaultSize: "1x1", source: "server" },
  assets: { sizes: ["1x1", "2x1"], defaultSize: "1x1", source: "server" },
  faction: { sizes: ["1x1", "2x1"], defaultSize: "1x1", source: "server" },
  timeline: { sizes: ["2x1", "2x2"], defaultSize: "2x1", source: "inbox" },
  briefing: { sizes: ["2x1", "2x2"], defaultSize: "2x1", source: "inbox" },
  // [임시] 2차맵·1차맵 여는 버튼
  maps: { sizes: ["2x1"], defaultSize: "2x1", source: "device" },
  // 연결·성능(ui/DiagnosticsPanel.tsx). dev·admin의 기본 카드에만 들어간다
  diagnostics: { sizes: ["2x1", "2x2"], defaultSize: "2x1", source: "device" },
} as const satisfies { readonly [id: string]: CardDefinition };

export type CardId = keyof typeof HOME_CARDS;

/** 서버의 카드 제공 함수가 상태를 주는 카드(dashboard.cards) */
export type ServerCardId = {
  [K in CardId]: (typeof HOME_CARDS)[K]["source"] extends "server" ? K : never;
}[CardId];

/** 템플릿(D-6005). 6개 모두 시안이다. 바꿔 보는 것은 dev·admin만 한다(사용자 결정 2) */
export const HOME_TEMPLATES = [
  "dt_grid",
  "dt_inbox",
  "dt_timeline",
  "dt_city",
  "dt_brief",
  "dt_hybrid",
] as const;

export type HomeTemplate = (typeof HOME_TEMPLATES)[number];

/** 기본 템플릿 = 플레이어가 늘 보는 템플릿(조합, 사용자 결정 2). 첫 기본값이고 확정이 아니다(D-6005) */
export const DEFAULT_HOME_TEMPLATE: HomeTemplate = "dt_hybrid";

/** 카드 목록 길이 상한(서버 입력 검사, ADR 37 5절) */
export const HOME_CARDS_MAX = 24;

/** 홈의 카드 한 장. 모르는 카드(더 새 버전이 넣은 것)도 그대로 남는다 — 그릴 때 isCardId로 거른다 */
export interface HomeCardEntry {
  readonly id: string;
  readonly size: string;
}

export interface HomeSettings {
  /** 저장한 템플릿. 모르는 값이면 기본값. 플레이어 화면은 이 값과 상관없이 기본 템플릿을 그린다 */
  readonly template: HomeTemplate;
  /** 카드 순서(= 보이는 순서 = 초점 순서)와 크기 */
  readonly cards: readonly HomeCardEntry[];
}

export function isCardId(value: unknown): value is CardId {
  return typeof value === "string" && Object.hasOwn(HOME_CARDS, value);
}

export function isCardSize(value: unknown): value is CardSize {
  return typeof value === "string" && (CARD_SIZES as readonly string[]).includes(value);
}

export function isHomeTemplate(value: unknown): value is HomeTemplate {
  return typeof value === "string" && (HOME_TEMPLATES as readonly string[]).includes(value);
}

/** 그 카드가 고를 수 있는 크기인지 */
export function isCardSizeAllowed(id: CardId, size: unknown): size is CardSize {
  const sizes: readonly CardSize[] = HOME_CARDS[id].sizes;
  return isCardSize(size) && sizes.includes(size);
}

/** 기본 카드에 연결·성능을 더하는 역할 */
const DIAGNOSTICS_DEFAULT_ROLES: readonly Role[] = ["dev", "admin"];

/**
 * 카드 구성을 이미 저장한 계정에도 한 번 끼워 넣는 카드(사용자 결정 2026-11-25 "새 카드, 기존 계정에도 자동 추가").
 * 저장값의 `offered`(이미 권한 카드 ID 목록)에 없고 카드 목록에도 없으면 parseHome이 처리할 일 다음에 넣는다.
 * 카드 목록을 저장할 때 mergeHome이 `offered`에 적는다 — 유저가 뺀 카드는 다시 들어오지 않는다.
 */
export const HOME_AUTO_ADD_CARDS: readonly CardId[] = ["city"];

/** 처음 카드 순서: 처리할 일(위 고정), 도시 활동(2×2), 내 사이보그·보유 유닛·자산·세력(1×1), 지도(2×1). dev·admin은 연결·성능을 끝에 더한다 */
export function defaultHomeCards(roles: readonly Role[]): HomeCardEntry[] {
  const ids: CardId[] = ["inbox", "city", "cyborg", "units", "assets", "faction", "maps"];
  if (roles.some((role) => DIAGNOSTICS_DEFAULT_ROLES.includes(role))) ids.push("diagnostics");
  return ids.map((id) => ({ id, size: HOME_CARDS[id].defaultSize }));
}

/** 배열이 아닌 객체인지(JSON 객체) */
function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 객체의 자기 칸(배열·원형의 칸은 보지 않는다) */
function ownField(value: unknown, key: string): unknown {
  return isRecord(value) && Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
}

/** 카드 한 장 읽기. 버릴 카드면 null */
function parseCard(raw: unknown): HomeCardEntry | null {
  if (!isRecord(raw)) return null;
  const id = ownField(raw, "id");
  const size = ownField(raw, "size");
  if (!isSavedId(id)) return null;
  // 아는 카드: 고를 수 없는 크기(없음·문자열 아님 포함)는 기본 크기로 바꾼다
  if (isCardId(id)) {
    return { ...raw, id, size: isCardSizeAllowed(id, size) ? size : HOME_CARDS[id].defaultSize };
  }
  // 모르는 카드(더 새 버전이 넣은 것): 크기를 모르므로 문자열이어야 남긴다
  return typeof size === "string" ? { ...raw, id, size } : null;
}

/**
 * 저장된 `home`(모양을 모르는 JSON 값)을 읽는다. 홈 조각이 그릴 때 부른다(ADR 37 5절).
 * - template: 모르는 값이면 기본 템플릿.
 * - cards: 배열이 아니면(저장한 적 없음) 그 역할의 기본 카드. 빈 배열은 유저가 모두 뺀 것이라 그대로 둔다.
 *   카드 하나는 { id: 저장 ID 모양, size }이다. 아는 카드는 고를 수 없는 크기(없음·문자열 아님 포함)를 기본 크기로 바꾼다.
 *   모르는 카드는 size가 문자열이어야 남는다. 아니면 그 카드를 버린다.
 *   모르는 카드와 카드 안의 모르는 칸은 지우지 않는다. 겹친 카드는 앞의 것만 남기고, 상한(24장)을 넘으면 뒤를 버린다.
 *   비지 않은 배열인데 남는 카드가 하나도 없으면 저장한 적 없는 것으로 본다(그 역할의 기본 카드). 모양이 다른 값을
 *   "유저가 모두 뺀 것"과 같게 읽지 않으려는 것이다.
 * - offered: 이미 권한 자동 추가 카드(HOME_AUTO_ADD_CARDS). 저장한 카드 목록에 없고 offered에도 없는 자동 추가 카드는 처리할 일
 *   다음에 끼워 그린다(저장은 다음에 카드 목록을 바꿀 때 mergeHome이 한다).
 * - 저장할 때는 mergeHome으로 읽은 원래 값에 바꾼 칸만 덮어 쓴다(더 새 버전이 넣은 칸이 남게).
 */
export function parseHome(value: unknown, roles: readonly Role[]): HomeSettings {
  const rawTemplate = ownField(value, "template");
  const template = isHomeTemplate(rawTemplate) ? rawTemplate : DEFAULT_HOME_TEMPLATE;
  const rawCards = ownField(value, "cards");
  if (!Array.isArray(rawCards)) return { template, cards: defaultHomeCards(roles) };
  const cards: HomeCardEntry[] = [];
  const seen = new Set<string>();
  for (const raw of rawCards) {
    const card = parseCard(raw);
    if (card === null || seen.has(card.id)) continue;
    seen.add(card.id);
    cards.push(card);
    if (cards.length === HOME_CARDS_MAX) break;
  }
  if (cards.length === 0 && rawCards.length > 0) return { template, cards: defaultHomeCards(roles) };
  return { template, cards: withAutoAdded(cards, ownField(value, "offered")) };
}

/** 저장값의 `offered`(이미 권한 카드 ID) — 배열이 아니면 빈 목록, 글자가 아닌 칸은 버린다 */
function offeredIds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}

/** 아직 권하지 않은 자동 추가 카드를 처리할 일 다음(없으면 맨 앞)에 넣는다. 상한(24장)이면 넣지 않는다 */
function withAutoAdded(cards: readonly HomeCardEntry[], rawOffered: unknown): HomeCardEntry[] {
  const offered = offeredIds(rawOffered);
  const next = [...cards];
  let at = next.findIndex((card) => card.id === "inbox") + 1;
  for (const id of HOME_AUTO_ADD_CARDS) {
    if (offered.includes(id) || next.some((card) => card.id === id)) continue;
    if (next.length >= HOME_CARDS_MAX) break;
    next.splice(at, 0, { id, size: HOME_CARDS[id].defaultSize });
    at += 1;
  }
  return next;
}

/** mergeHome에 줄 바꾼 칸. 적은 칸만 덮어 쓴다 */
export interface HomePatch {
  readonly template?: HomeTemplate;
  /** 카드 전체 목록(순서·크기). parseHome이 남긴 모르는 카드와 카드 안의 칸을 그대로 넘기면 그것도 남는다 */
  readonly cards?: readonly HomeCardEntry[];
}

/**
 * 저장할 `home` 값을 만든다: 읽은 원래 값(모양을 모르는 JSON)에 바꾼 칸만 덮어 쓴다(ADR 37 5·6절).
 * 더 새 버전이 넣은 칸과 바꾸지 않은 칸(예: 이 기기가 모르는 template 값)은 그대로 남는다.
 * 원래 값이 객체가 아니면 빈 객체에서 시작한다. 돌려준 값은 새 객체다(원래 값을 고치지 않는다).
 */
export function mergeHome(raw: unknown, patch: HomePatch): { readonly [key: string]: unknown } {
  const merged: Record<string, unknown> = isRecord(raw) ? { ...raw } : {};
  if (patch.template !== undefined) merged["template"] = patch.template;
  if (patch.cards !== undefined) {
    merged["cards"] = patch.cards.map((card) => ({ ...card }));
    // 카드 목록을 저장하면 자동 추가 카드를 "이미 권함"으로 적는다(뺀 카드가 다시 들어오지 않게). 앞서 적힌 ID는 남긴다
    merged["offered"] = [...new Set([...offeredIds(merged["offered"]), ...HOME_AUTO_ADD_CARDS])];
  }
  return merged;
}

// ── 카드 상태 전송(tRPC dashboard.cards, ADR 37 6절) ──

/** 카드 상태: not_ready = 그 시스템이 아직 없음, empty = 시스템은 있고 보일 것이 없음, ready = 카드별 자료 */
export const CARD_STATUSES = ["not_ready", "empty", "ready"] as const;

export type CardStatus = (typeof CARD_STATUSES)[number];

/**
 * 카드별 ready 자료. 그 시스템이 카드 제공 함수를 등록할 때 모양을 정한다. 지금은 모두 없다(never = ready를 보낼 수 없다).
 * 금액은 최소 단위 정수를 문자열로 보낸다(PLAN 4.7). 칸은 ServerCardId와 같아야 한다(시험이 확인).
 */
export interface ServerCardData {
  readonly cyborg: never;
  readonly units: never;
  readonly assets: never;
  readonly faction: never;
}

/** 서버 카드 하나의 상태 */
export type CardState<Id extends ServerCardId = ServerCardId> = {
  [K in Id]:
    | { readonly id: K; readonly status: "not_ready" }
    | { readonly id: K; readonly status: "empty" }
    | { readonly id: K; readonly status: "ready"; readonly data: ServerCardData[K] };
}[Id];

/** dashboard.cards 입력. ids는 홈에 있는 서버 카드(모르는 ID는 서버가 빼고 답한다). preview는 dev·admin만(권한 home: preview) */
export interface DashboardCardsRequest {
  readonly ids: readonly string[];
  readonly preview?: boolean;
}

/** dashboard.cards 응답. 시안 자료에서도 사이보그·보유 유닛·자산·세력 카드는 "준비 중"이다(사용자 결정 2) */
export interface DashboardCardsResponse {
  readonly cards: readonly CardState[];
}
