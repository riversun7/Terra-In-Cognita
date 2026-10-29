// 처리할 일·복귀 요약 문구 — 서버는 종류 ID와 값(params)만 보내고 문구는 기기가 메시지 키로 만든다(ADR 2026-10-29-app-shell 7·12절).
// 분류 이름(inbox_category_*)은 0단계 키라 그대로 쓴다.
// [임시] 종류·동작·복귀 요약 칸 문구는 W3의 inbox/inboxText.ts(종류 → 문구 표)가 맡는다. W3이 합쳐지기 전에는 시안 자료
// 8종만 W4 자리의 임시 키(home_tmp_*)로 그린다. W3 뒤(꽂는 줄): itemTitle·actionLabel·summaryLine 세 함수의 몸을
// W3 표로 바꾸고, 아래 KIND_TEXT·ACTION_TEXT·SUMMARY_TEXT와 messages의 home_tmp_* 키를 지운다.
// - 모르는 종류(더 새 서버)는 분류 이름 + "새 알림"이다. 모르는 동작은 그리지 않는다(null). 모르는 요약 칸도 그리지 않는다.
import type {
  InboxCategory,
  InboxItem,
  InboxKindId,
  SummarySection,
  SummarySectionKind,
} from "@terra/shared/inbox";
import { m } from "../paraglide/messages.js";
import { formatCount } from "./numbers.ts";

/** 분류 이름(0단계 키). 분류는 닫힌 목록이라 빠지면 타입 오류다 */
const CATEGORY_TEXT = {
  threat: m.inbox_category_threat,
  money_survival: m.inbox_category_money_survival,
  stalled: m.inbox_category_stalled,
  decision: m.inbox_category_decision,
  done: m.inbox_category_done,
} satisfies Record<InboxCategory, () => string>;

/** [임시] 종류 → 제목. 묶은 줄은 개수를 넣는다 */
const KIND_TEXT = {
  wave_incoming: () => m.home_tmp_kind_wave_incoming(),
  siege_declared: () => m.home_tmp_kind_siege_declared(),
  goods_spoiling: (count: number) => m.home_tmp_kind_goods_spoiling({ count: formatCount(count) }),
  unit_injured: (count: number) => m.home_tmp_kind_unit_injured({ count: formatCount(count) }),
  unit_idle: (count: number) => m.home_tmp_kind_unit_idle({ count: formatCount(count) }),
  building_stopped: (count: number) => m.home_tmp_kind_building_stopped({ count: formatCount(count) }),
  contract_match: () => m.home_tmp_kind_contract_match(),
  craft_done: () => m.home_tmp_kind_craft_done(),
} satisfies Record<InboxKindId, (count: number) => string>;

/** [임시] 바로 처리 동작 → 단추 이름(0단계 종류 표에 있는 동작) */
const ACTION_TEXT: { readonly [action: string]: () => string } = {
  deploy_defense: m.home_tmp_action_deploy_defense,
  sell: m.home_tmp_action_sell,
  auto_assign: m.home_tmp_action_auto_assign,
  repair: m.home_tmp_action_repair,
  accept: m.home_tmp_action_accept,
  decline: m.home_tmp_action_decline,
};

/** [임시] 복귀 요약 칸 → 한 줄 */
const SUMMARY_TEXT = {
  production: (count: number) => m.home_tmp_summary_production({ count: formatCount(count) }),
  raid: (count: number) => m.home_tmp_summary_raid({ count: formatCount(count) }),
  injury: (count: number) => m.home_tmp_summary_injury({ count: formatCount(count) }),
  world_news: (count: number) => m.home_tmp_summary_world_news({ count: formatCount(count) }),
} satisfies Record<SummarySectionKind, (count: number) => string>;

/** 표에서 글자 키로 찾는다(원형의 칸은 보지 않는다). 더 새 서버가 보낸 모르는 값이면 undefined */
function lookup<T>(table: { readonly [key: string]: T }, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

export function categoryName(category: InboxCategory): string {
  return CATEGORY_TEXT[category]();
}

/** 처리할 일 한 줄의 제목. 모르는 종류는 "새 알림"(분류 이름은 줄의 다른 칸이 보인다) */
export function itemTitle(item: InboxItem): string {
  const text = lookup<(count: number) => string>(KIND_TEXT, item.kind);
  return text === undefined ? m.home_tmp_kind_unknown() : text(item.count);
}

/** 바로 처리 단추 이름. 모르는 동작은 null(그리지 않는다) */
export function actionLabel(action: string): string | null {
  const text = lookup(ACTION_TEXT, action);
  return text === undefined ? null : text();
}

/** 복귀 요약 한 칸. 모르는 칸은 null(그리지 않는다) */
export function summaryLine(section: SummarySection): string | null {
  const text = lookup<(count: number) => string>(SUMMARY_TEXT, section.kind);
  return text === undefined ? null : text(section.count);
}
