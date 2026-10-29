// 처리할 일 서버 타입 — 제공 함수가 내는 건과 계정(ADR 2026-10-29-app-shell 7절, D-6006·D-6009).
// 흐름: 등록부(registry.ts)의 제공 함수 → 건(InboxEntry) 목록 → 정렬·묶기(order.ts) → inbox.list 응답.
// 건은 서버 안에서만 쓴다. 기기에는 묶은 줄(@terra/shared/inbox의 InboxItem)만 보낸다.
import type { Role, RouteTarget } from "@terra/shared";
import type { InboxKindId, InboxParams } from "@terra/shared/inbox";

/** 처리할 일을 만드는 계정(로그인한 본인). 제공 함수는 이 계정의 상태만 읽는다 */
export interface InboxAccount {
  readonly userId: string;
  readonly roles: readonly Role[];
}

/**
 * 제공 함수가 내는 한 건(묶기 전).
 * - 묶는 종류(종류 표의 grouped)는 같은 key의 건이 한 줄이 된다(예: 거점 city_12의 명령 없는 유닛 6명 → 건 6개, 줄 1개).
 * - 묶지 않는 종류는 건마다 한 줄이다. key가 대상 하나(완료는 사건 ID)를 가리킨다.
 */
export interface InboxEntry {
  readonly kind: InboxKindId;
  /** 항목 ID(`<종류>:<키>`)의 키. 숫자·영문 소문자·_ 1~64자(inbox.ts INBOX_ITEM_ID_PATTERN) */
  readonly key: string;
  /** 마감(도착·만기·썩는 시각 등, 서버 UTC ms). 없으면 null(그 분류의 끝) */
  readonly deadlineAt: number | null;
  /** 처음 생긴 시각(서버 UTC ms) */
  readonly firstSeenAt: number;
  /** 문구에 넣는 값(이름·수). 묶는 종류는 묶음 전체의 값(거점 이름 등)을 넣는다 */
  readonly params: InboxParams;
  /** 누르면 갈 화면. null이면 처리함 */
  readonly target: RouteTarget | null;
  /** 시안 자료(preview.ts만 붙인다) */
  readonly preview?: true;
}

/**
 * 제공 함수 — 그 계정의 지금 상태에서 한 종류의 건을 만든다. 요청 때 부른다(서버가 들고 있지 않는다).
 * 그 시스템을 만들 때 시스템 모듈에 두고 등록부(registry.ts)에 한 줄 더한다(ADR 37 7절 "새 시스템이 종류를 더하는 순서").
 */
export interface InboxProvider {
  readonly kind: InboxKindId;
  collect(account: InboxAccount, now: number): Promise<readonly InboxEntry[]>;
}
