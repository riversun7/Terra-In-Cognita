// 처리할 일 문구 — 종류·분류·마감 → 지금 언어의 문장, 줄을 누르면 갈 주소(ADR 2026-10-29-app-shell 7·12절).
// 처리함 화면과 홈 조각에만 들어간다(첫 화면 묶음의 종 배지는 수만 쓴다).
// - 키로 고르는 문구는 정적 표에 둔다(m[키]는 oxlint가 막는다). 종류가 늘면 satisfies가 빠진 종류를 알려 준다.
//   새 종류를 더하는 순서는 ADR 37 7절: 종류 표 → messages의 inbox_<종류>_title(ko·en) → 이 표 한 줄.
// - 서버는 값(params: 이름·수)만 보낸다. 문장은 여기서 만든다. 이름 뒤에 조사를 붙이지 않게 이름은 따로 보인다(place).
// - 모르는 종류(더 새 서버)는 "새 알림"이고 처리함으로 간다. 값은 뜻을 모르므로 보이지 않는다. 마감은 보인다.
// - 모르는 분류(더 새 서버)의 줄은 목록 끝 "그 밖의 알림" 묶음에 보인다(처리함에는 늘 모든 항목이 나온다, D-6011).
// - 줄이 가리키는 곳은 화면(RouteTarget)으로 돌려준다. 앱 안 이동은 화면 틀(W1) 라우터가 화면으로 받는다.
// 종류 표 값(INBOX_KINDS)은 가져오지 않는다. 화면에 필요한 것(분류·이동 화면·동작)은 항목에 실려 온다.
import { type RouteTarget, isRouteTarget, targetPath } from "@terra/shared";
import type { InboxCategory, InboxItem, InboxKindId } from "@terra/shared/inbox";
import { m } from "../paraglide/messages.js";
import { type Locale, getLocale } from "../paraglide/runtime.js";

/** 종류 → 제목(count = 언어에 맞게 자리를 나눈 개수) */
const KIND_TITLES = {
  wave_incoming: (_count, locale) => m.inbox_wave_incoming_title({}, { locale }),
  siege_declared: (_count, locale) => m.inbox_siege_declared_title({}, { locale }),
  goods_spoiling: (count, locale) => m.inbox_goods_spoiling_title({ count }, { locale }),
  unit_injured: (count, locale) => m.inbox_unit_injured_title({ count }, { locale }),
  unit_idle: (count, locale) => m.inbox_unit_idle_title({ count }, { locale }),
  building_stopped: (count, locale) => m.inbox_building_stopped_title({ count }, { locale }),
  contract_match: (_count, locale) => m.inbox_contract_match_title({}, { locale }),
  craft_done: (_count, locale) => m.inbox_craft_done_title({}, { locale }),
  scout_returned: (_count, locale) => m.inbox_scout_returned_title({}, { locale }),
  house_invite: (_count, locale) => m.inbox_house_invite_title({}, { locale }),
  house_application: (count, locale) => m.inbox_house_application_title({ count }, { locale }),
  house_notice: (_count, locale) => m.inbox_house_notice_title({}, { locale }),
} satisfies Record<InboxKindId, (count: string, locale: Locale) => string>;

/**
 * 분류 순서(정렬 순위, D-6009). @terra/shared/inbox INBOX_CATEGORIES와 같다(inboxText.test.ts가 본다).
 * 공용 값을 가져오지 않고 따로 적는다: 그 모듈에 든 종류 표를 기기 묶음에 넣지 않으려고다
 */
export const CATEGORY_ORDER = [
  "threat",
  "money_survival",
  "stalled",
  "decision",
  "done",
] as const satisfies readonly InboxCategory[];

/** 분류 이름(0단계 키 inbox_category_<분류>) */
export const CATEGORY_NAMES = {
  threat: m.inbox_category_threat,
  money_survival: m.inbox_category_money_survival,
  stalled: m.inbox_category_stalled,
  decision: m.inbox_category_decision,
  done: m.inbox_category_done,
} satisfies Record<InboxCategory, () => string>;

/** 모르는 분류(더 새 서버)의 줄을 모은 묶음 이름. 목록 끝에 둔다(순위를 모른다) */
export const OTHER_GROUP_NAME = m.inbox_group_other;

/** 기기가 아는 종류인지(문구 표에 있는지) */
export function isKnownKind(kind: string): kind is InboxKindId {
  return Object.hasOwn(KIND_TITLES, kind);
}

/** 기기가 아는 분류인지. 분류는 닫힌 목록이지만 받은 값은 다시 본다 */
export function isKnownCategory(category: string): category is InboxCategory {
  return Object.hasOwn(CATEGORY_NAMES, category);
}

/** 줄 제목. 모르는 종류는 "새 알림" */
export function inboxItemTitle(item: InboxItem, locale: Locale = getLocale()): string {
  if (!isKnownKind(item.kind)) return m.inbox_kind_unknown({}, { locale });
  return KIND_TITLES[item.kind](new Intl.NumberFormat(locale).format(item.count), locale);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 마감 문구. 남은 시간을 내림해서 보인다(마감을 늘려 말하지 않는다. 위협·대출 마감을 놓치지 않게):
 * 1분 안은 "1분 안에 마감", 1시간 안은 분, 48시간 안은 시간, 그 뒤는 날. 지났으면 "마감 지남". 없으면 null.
 * 예: 2일 12시간 → "2일 후", 1시간 31분 → "1시간 후", 59분 30초 → "59분 후".
 * now는 목록을 만든 서버 시각(generatedAt)이다. 화면을 오래 열어 두면 늦은 값이 된다(주기 타이머 없음, 다시 받을 때 고쳐진다).
 */
export function formatDue(
  deadlineAt: number | null,
  now: number,
  locale: Locale = getLocale(),
): string | null {
  if (deadlineAt === null) return null;
  const left = deadlineAt - now;
  if (left <= 0) return m.inbox_overdue({}, { locale });
  if (left < MINUTE) return m.inbox_deadline_soon({}, { locale });
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  let time: string;
  if (left < HOUR) time = format.format(Math.floor(left / MINUTE), "minute");
  else if (left < 2 * DAY) time = format.format(Math.floor(left / HOUR), "hour");
  else time = format.format(Math.floor(left / DAY), "day");
  return m.inbox_deadline({ time }, { locale });
}

/** 처리함에서 이 항목을 강조하는 화면(/inbox?item=<항목 ID>) */
export function inboxItemTarget(item: InboxItem): RouteTarget {
  return { route: "inbox", search: { item: item.id } };
}

/** 처리함의 한 줄을 가리키는 화면인지(그리로 옮기면 초점을 그 줄에 둔다) */
export function isInboxItemTarget(target: RouteTarget): boolean {
  return target.route === "inbox" && target.search?.item !== undefined;
}

/**
 * 줄을 누르면 갈 화면. 아는 종류이고 이동 화면이 이 기기가 아는 화면이면 그 화면, 아니면 처리함(?item=).
 * 처리함 화면 안(onInboxScreen)에서는 처리함으로 가는 링크를 두지 않는다(null): 그 줄이 이미 여기 있다.
 */
export function itemTarget(item: InboxItem, onInboxScreen: boolean): RouteTarget | null {
  const target: unknown = item.target;
  if (isKnownKind(item.kind) && isRouteTarget(target)) return target;
  return onInboxScreen ? null : inboxItemTarget(item);
}

/** 줄 하나를 그리는 데 필요한 값 */
export interface ItemView {
  readonly title: string;
  /** 곳 이름(params.place, 유저가 지은 이름은 번역하지 않는다). 없으면 null */
  readonly place: string | null;
  readonly due: string | null;
  /** 누르면 갈 화면. 없으면 링크가 없다 */
  readonly target: RouteTarget | null;
  /** target의 주소(링크의 href) */
  readonly href: string | null;
  readonly preview: boolean;
  /** 기기가 아는 종류인지(모르면 값·바로 처리를 보이지 않는다) */
  readonly known: boolean;
}

export function describeItem(
  item: InboxItem,
  options: { readonly now: number; readonly onInboxScreen: boolean; readonly locale?: Locale },
): ItemView {
  const locale = options.locale ?? getLocale();
  const known = isKnownKind(item.kind);
  const place = known ? item.params["place"] : undefined;
  const target = itemTarget(item, options.onInboxScreen);
  return {
    title: inboxItemTitle(item, locale),
    place: typeof place === "string" && place !== "" ? place : null,
    due: formatDue(item.deadlineAt, options.now, locale),
    target,
    href: target === null ? null : targetPath(target),
    preview: item.preview === true,
    known,
  };
}
