// 처리할 일·복귀 요약: 분류와 순위, 종류 표, 항목 ID 규칙, 전송 타입(ADR 2026-10-29-app-shell 7·8절, D-6006·D-6009·D-6014·D-6015).
// 진입점은 @terra/shared/inbox다. 첫 화면 묶음에 넣지 않는다(종 배지 저장소는 타입만 가져온다, ADR 37 7절).
// 처리할 일은 서버가 계정 상태에서 요청 때 만든다(서버 권위). 기기는 받은 값을 메시지 키로 그리기만 한다.
// 분류·종류·동작 ID는 주소(?item=)·계정·나중의 푸시 설정에 남는다. 한 번 쓴 ID는 다시 쓰지 않는다(docs/PROTECTED.md).
// 시각은 모두 서버 시각(UTC ms)이다(ADR 2026-10-28-time-and-session-protocol). 기기는 시계 차이를 맞춰 남은 시간을 그린다.
import type { NavItemId } from "./navigation.ts";
import type { RouteId, RouteTarget } from "./routes.ts";

/** 분류. 이 순서가 정렬 순위다: 위협 1 → 돈·생존 2 → 멈춤 3 → 제안·결정 4 → 완료 5(D-6006·D-6009). 닫힌 목록이다 */
export const INBOX_CATEGORIES = ["threat", "money_survival", "stalled", "decision", "done"] as const;

export type InboxCategory = (typeof INBOX_CATEGORIES)[number];

export function isInboxCategory(value: unknown): value is InboxCategory {
  return typeof value === "string" && (INBOX_CATEGORIES as readonly string[]).includes(value);
}

/** 분류의 정렬 순위(1부터, 작을수록 위) */
export function inboxCategoryRank(category: InboxCategory): number {
  return INBOX_CATEGORIES.indexOf(category) + 1;
}

/** 종류 표의 한 줄 */
export interface InboxKindDefinition {
  readonly category: InboxCategory;
  /**
   * 같은 종류·같은 묶음 키를 한 줄로 묶는다(예: "명령 없는 유닛 6"). 묶은 줄은 개수와 가장 이른 마감을 갖는다.
   * 완료 분류는 묶지 않는다: 항목 ID가 사건 ID이고 확인(inbox.ack)도 사건마다 한다(시험이 본다)
   */
  readonly grouped: boolean;
  /** 누르면 갈 화면의 주소 ID. 매개변수·검색어 값은 항목마다 다르므로 항목의 target에 싣는다. null이면 처리함 */
  readonly route: RouteId | null;
  /**
   * 바로 처리 동작 ID 0~2개. 기획(D-6015)은 항목마다 1~2개다. 0개는 기술 해석이다: 완료(확인만 한다)와
   * 그 화면에서만 처리하는 종류(예: 공성 방어 시각 고르기)는 줄을 눌러 화면으로 간다(ADR 37 "구현하며 정한 것").
   * 동작 ID는 자료라 더해도 프로토콜 판을 올리지 않는다
   */
  readonly actions: readonly string[];
  /** 줄 수를 배지로 걸 메뉴 항목(예: 명령 없는 유닛 → 유닛). 없으면 null */
  readonly badge: NavItemId | null;
  /** 제공 함수가 아직 없다(시안 자료만 쓴다). 그 시스템이 제공 함수를 등록할 때 false로 바꾼다 */
  readonly planned: boolean;
}

/**
 * 종류 표. 시안 자료(dev·admin만, 권한 home: preview)가 쓰는 8개 + 정찰 끝(scout_returned)·가문 초대·가입 신청·가문 소식(house_*, 시안
 * 자료 없음)·배(boat_in_dock·boat_homeless, D-559). 제공 함수가 있는 종류는 planned: false다(wave_incoming·scout_returned·house_invite·house_application·
 * house_notice·boat_in_dock·boat_homeless).
 * 5분류를 모두 보이고, 묶기·마감 없음·바로 처리 0~2개를 고루 넣었다. 나머지 예약 ID는 ADR 37 7절 표에 있다.
 * 새 종류를 더하는 순서(ADR 37 7절): 이 표 → messages의 inbox_<종류>_title(ko·en) → 기기 inboxText.ts →
 * 그 시스템의 제공 함수·등록부 한 줄·시험 → 바로 처리 처리기 → 푸시 분류(W6, 이 표에 칸을 더한다).
 */
export const INBOX_KINDS = {
  // 위협: 내 도시로 오는 웨이브(D-196). 마감 = 도착 시각
  wave_incoming: {
    category: "threat",
    grouped: false,
    route: "map",
    actions: ["deploy_defense"],
    badge: null,
    // 제공 함수: 서버 npc/waveInbox.ts(정원사 웨이브, docs/adr/2026-11-01-gardener-r5b.md)
    planned: false,
  },
  // 위협: 공성 선포(D-200). 마감 = 방어 시각을 고르지 않으면 열리는 시각
  siege_declared: {
    category: "threat",
    grouped: false,
    route: "faction",
    actions: [],
    badge: "faction",
    planned: true,
  },
  // 돈·생존: 곧 썩는 물건(D-121). 창고마다 묶는다
  goods_spoiling: {
    category: "money_survival",
    grouped: true,
    route: "economy",
    actions: ["sell"],
    badge: "economy",
    planned: true,
  },
  // 돈·생존: 치료를 기다리는 부상 유닛(D-145). 거점마다 묶는다
  unit_injured: {
    category: "money_survival",
    grouped: true,
    route: "units",
    actions: [],
    badge: "units",
    planned: true,
  },
  // 멈춤: 직무 없는 유닛. 거점마다 묶는다. 마감 없음
  unit_idle: {
    category: "stalled",
    grouped: true,
    route: "units",
    actions: ["auto_assign"],
    badge: "units",
    planned: true,
  },
  // 멈춤: 내구도가 낮아 멈춘 건물(D-171)
  building_stopped: {
    category: "stalled",
    grouped: true,
    route: "map",
    actions: ["repair"],
    badge: null,
    planned: true,
  },
  // 멈춤: 조선소 도크에서 출고를 기다리는 내 배(D-559 1523 — 꺼내지 않으면 도크를 막고, 남의 조선소면 장기 보관료가 쌓인다). 한 줄로 묶는다
  boat_in_dock: {
    category: "stalled",
    grouped: true,
    route: "map",
    actions: [],
    badge: null,
    // 제공 함수: 서버 boats/inbox.ts(docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (2026-11-15) D-559")
    planned: false,
  },
  // 멈춤: 집 정박장이 없는 내 배(D-559 1528 "집 잃으면 우편 알림" — 더 빨리 닳는다). 한 줄로 묶는다
  boat_homeless: {
    category: "stalled",
    grouped: true,
    route: "map",
    actions: [],
    badge: null,
    // 제공 함수: 서버 boats/inbox.ts
    planned: false,
  },
  // 멈춤: 고른 사는 곳을 쓸 수 없게 된 내 유닛(질문 2485 가 — 집을 잃음·숙소 배정이 바뀜·정원이 줄어 쉰다, 쉬는 동안은 옛 길 숙소 배정). 계정마다 한 줄로
  // 묶는다(사는 곳이 쉬는 유닛 N명). 다시 쓸 수 있게 되거나 다른 집을 고르면 사라진다. 줄기 governance-6
  residence_paused: {
    category: "stalled",
    grouped: true,
    route: "map",
    actions: [],
    badge: null,
    // 제공 함수: 서버 residence/inbox.ts
    planned: false,
  },
  // 제안·결정: 정찰이 목표 2차맵을 보고 돌아섰다(기획 답 612 나) — 들어가 볼지 고른다. 정찰 길마다 한 줄, 마감 없음. 확인 저장이 아직 없어
  // 돌아온 뒤 이동 서비스가 끝난 길을 보이는 동안만 있다(docs/adr/2026-11-07-play-flow.md "WP13")
  scout_returned: {
    category: "decision",
    grouped: false,
    route: "map",
    actions: [],
    badge: null,
    // 제공 함수: 서버 travel/scoutInbox.ts
    planned: false,
  },
  // 제안·결정: 내 유닛의 임금형 노동 계약이 일시 중지됐다(고용한 사업장 보증금이 바닥남 — 기획 D-573 2045 "일꾼이 중단된 상태로 소유자에게 경고창이 뜨고
  // 기다릴지 해지하고 다른곳으로 갈지 정함"). 자동 해지는 없다: 기다리면 사업장에 수익이 나 임금 정산이 다시 될 때 일한다.
  // 바뀜 (기획 대조 2163): 계약마다 한 줄(key = c<계약 ID>, params.contractId)이고 바로 처리 [기다림](이 기기에서 경고를 접는다 — 계약은 멈춘 채)·
  // [해지](labor_terminate — 경제 화면과 같은 명령)를 둔다. 예전: 계정마다 한 줄(key = labor), 해지는 경제 화면에서만
  labor_paused: {
    category: "decision",
    grouped: false,
    route: "economy",
    actions: ["wait", "terminate"],
    badge: null,
    // 제공 함수: 서버 labor/pausedInbox.ts
    planned: false,
  },
  // 제안·결정: 맞는 의뢰(D-036)
  contract_match: {
    category: "decision",
    grouped: false,
    route: null,
    actions: ["accept", "decline"],
    badge: null,
    planned: true,
  },
  // 제안·결정: 받은 가문 초대(질문 985 다). 초대마다 한 줄, 마감 = 초대가 사라지는 시각. 세력 화면 "내 가문" 칸에서 받거나 거절한다
  house_invite: {
    category: "decision",
    grouped: false,
    route: "faction",
    actions: [],
    badge: "faction",
    // 제공 함수: 서버 factionIdentity/houseInbox.ts(docs/adr/2026-11-11-faction-identity.md "바뀜 (981~986 답)")
    planned: false,
  },
  // 제안·결정: 내 가문(가문장)에 온 가입 신청. 가문마다 묶는다(가입 신청 N건), 마감 = 가장 이른 신청이 사라지는 시각
  house_application: {
    category: "decision",
    grouped: true,
    route: "faction",
    actions: [],
    badge: "faction",
    // 제공 함수: 서버 factionIdentity/houseInbox.ts
    planned: false,
  },
  // 완료: 제작 완료(D-114). 사건마다 한 줄이고 확인하면 사라진다(inbox.ack, 첫 완료 종류와 함께 만든다)
  craft_done: {
    category: "done",
    grouped: false,
    route: "economy",
    actions: [],
    badge: null,
    planned: true,
  },
  // 완료: 가문 소식(@terra/shared/house HOUSE_NOTICE_KINDS — 받음·거절·나감·내보냄·나라가 달라져 빠짐·가문 이름 되돌림). 소식마다 한 줄,
  // 세력 화면 "내 가문" 칸에서 [확인]하면 사라진다(inbox.ack가 아직 없어 그 칸이 확인 저장이다)
  house_notice: {
    category: "done",
    grouped: false,
    route: "faction",
    actions: [],
    badge: null,
    // 제공 함수: 서버 factionIdentity/houseInbox.ts
    planned: false,
  },
} as const satisfies { readonly [kind: string]: InboxKindDefinition };

export type InboxKindId = keyof typeof INBOX_KINDS;

export function isInboxKindId(value: unknown): value is InboxKindId {
  return typeof value === "string" && Object.hasOwn(INBOX_KINDS, value);
}

/**
 * 항목 ID = `<종류>:<묶음 키>`(예: `unit_idle:city_12`), 묶지 않는 종류는 대상 하나의 키, 완료는 `<종류>:<사건 ID>`.
 * 키는 숫자·영문 소문자·_ 1~64자다. 계정에 하나뿐인 종류는 고정 키(`all`)를 쓴다.
 * uuid처럼 `-`가 든 ID는 키가 될 수 없다. 그런 ID를 쓰는 종류를 만들 때 키 규칙을 넓히거나 숫자 ID를 쓴다.
 * 서버는 늘 상태에서 같은 ID를 만든다. 처리함의 ?item=, 바로 처리, 확인이 모두 이 ID를 쓰고, 서버는 그때 상태를 다시 만들어 확인한다.
 */
export const INBOX_ITEM_ID_PATTERN = /^([a-z][a-z0-9_]{1,47}):([a-z0-9_]{1,64})$/;

/** 항목 ID를 만든다. 모양이 틀리면 예외(서버 제공 함수의 실수를 바로 드러낸다) */
export function inboxItemId(kind: string, key: string): string {
  const id = `${kind}:${key}`;
  if (!INBOX_ITEM_ID_PATTERN.test(id)) throw new RangeError(`invalid inbox item id: ${id}`);
  return id;
}

/** 항목 ID → 종류·키. 모양이 틀리면 null(?item= 값은 누구나 바꿔 넣을 수 있다) */
export function parseInboxItemId(value: unknown): { kind: string; key: string } | null {
  if (typeof value !== "string") return null;
  const match = INBOX_ITEM_ID_PATTERN.exec(value);
  const kind = match?.[1];
  const key = match?.[2];
  return kind === undefined || key === undefined ? null : { kind, key };
}

/** 문구에 넣는 값(이름·수). 문장이 아니다. 금액은 최소 단위 정수를 문자열로 보낸다(PLAN 4.7) */
export type InboxParams = { readonly [name: string]: string | number };

/** 처리할 일 한 줄(inbox.list 항목) */
export interface InboxItem {
  readonly id: string;
  /** 종류 ID. 더 새 서버는 기기가 모르는 종류를 보낼 수 있다 → 분류 이름 + "새 알림"으로 그리고 처리함으로 간다 */
  readonly kind: string;
  readonly category: InboxCategory;
  /** 묶은 줄의 개수. 묶지 않는 종류는 1 */
  readonly count: number;
  /** 가장 이른 마감. null이면 마감 없음(그 분류의 끝) */
  readonly deadlineAt: number | null;
  /** 처음 생긴 시각 */
  readonly firstSeenAt: number;
  readonly params: InboxParams;
  /** 누르면 갈 화면. null이면 처리함(/inbox?item=<id>). 기기는 isRouteTarget으로 다시 본다(모르는 주소가 올 수 있다) */
  readonly target: RouteTarget | null;
  /** 바로 처리 동작 ID. 모르는 동작은 그리지 않는다 */
  readonly actions: readonly string[];
  /** 시안 자료(dev·admin). 화면은 항목마다 "시험 자료"를 표시하고 바로 처리 명령을 보내지 않는다 */
  readonly preview?: true;
}

/** inbox.list 입력. preview는 dev·admin만(권한 home: preview, 아니면 403) */
export interface InboxListRequest {
  readonly preview?: boolean;
}

/** inbox.list 응답. 정렬은 서버가 한다: (분류 순위, 마감 시각, 처음 생긴 시각, 항목 ID) */
export interface InboxListResponse {
  /** 이 목록을 만든 시각 */
  readonly generatedAt: number;
  readonly items: readonly InboxItem[];
  /** 분류별 줄 수(묶은 줄은 1). 종 배지 = 완료를 뺀 줄 수 */
  readonly counts: { readonly [C in InboxCategory]: number };
  /** 메뉴 항목 ID → 줄 수. 더 새 서버는 기기가 모르는 항목을 보낼 수 있다(그리지 않는다) */
  readonly badges: { readonly [navItemId: string]: number };
}

/**
 * 복귀 요약 칸(D-6014): 생산·습격과 방어·부상·세계 소식, 거래(없는 동안 체결·만료된 내 주문, 질문 538 다 — docs/adr/2026-11-07-play-flow.md WP6.
 * D-6014의 네 칸 밖이라 기술 제안, 확인 대기 질문 562). 한 번 쓴 칸 ID는 다시 쓰지 않는다
 */
export const SUMMARY_SECTION_KINDS = ["production", "raid", "injury", "world_news", "market"] as const;

export type SummarySectionKind = (typeof SUMMARY_SECTION_KINDS)[number];

export function isSummarySectionKind(value: unknown): value is SummarySectionKind {
  return typeof value === "string" && (SUMMARY_SECTION_KINDS as readonly string[]).includes(value);
}

/** 복귀 요약 한 칸. 숫자를 누르면 target으로 가고 확인한 것으로 친다 */
export interface SummarySection {
  /** 칸 종류. 더 새 서버는 기기가 모르는 칸을 보낼 수 있다(그리지 않는다) */
  readonly kind: string;
  readonly count: number;
  readonly params: InboxParams;
  readonly target: RouteTarget | null;
  /** 시안 자료(dev·admin) */
  readonly preview?: true;
}

/** summary.get 입력. preview는 dev·admin만(권한 home: preview) */
export interface SummaryGetRequest {
  readonly preview?: boolean;
}

/** summary.get 응답. show는 서버가 정한다(처음 기준: 마지막 확인 뒤 사건이 0개면 false) */
export interface SummaryGetResponse {
  readonly show: boolean;
  /** 마지막으로 확인한 시각. 확인한 적이 없으면 null */
  readonly since: number | null;
  /** 이 요약이 덮는 끝 시각. 확인(summary.ack, 첫 사건 출처와 함께 만든다)이 이 값을 보낸다 */
  readonly until: number;
  readonly sections: readonly SummarySection[];
}
