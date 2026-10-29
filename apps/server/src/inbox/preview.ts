// 시안 자료 — dev·admin이 홈 템플릿을 비교할 때 보는 처리할 일·복귀 요약(ADR 2026-10-29-app-shell 6절 "시안 자료", 사용자 결정 2).
// 권한 home: preview(dev·admin)를 프로시저가 확인한 뒤에만 부른다. 플레이어에게는 늘 빈 상태만 보인다.
// - 기획 목록에 있는 종류만 쓴다: 종류 표(@terra/shared/inbox INBOX_KINDS)의 8종류, 복귀 요약 칸 4종(D-6014).
//   사이보그·보유 유닛·자산·세력 카드의 항목은 지어내지 않는다(그 카드는 시안에서도 "준비 중", home/cards.ts).
// - 모든 건에 preview를 붙인다. 기기는 항목마다 "시험 자료"를 표시하고 바로 처리 명령을 보내지 않는다.
// - 키는 preview_로 시작한다. 실제 제공 함수의 항목과 섞여도 항목 ID가 겹치지 않는다.
// - 시각은 지금(now)을 기준으로 만든다: 처음 생긴 시각은 과거, 마감은 미래. 5분류·묶음·마감 없음·바로 처리 0~2개가 모두 보인다.
// - 이름(place)은 사람이 지은 이름처럼 두 언어에서 같은 글자다(유저가 지은 이름은 번역하지 않는다, D-6046).
import type { SummarySection } from "@terra/shared/inbox";
import type { InboxEntry } from "./types.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** 복귀 요약 시안 자료가 덮는 길이(마지막 확인 → 지금) */
export const PREVIEW_SUMMARY_SPAN_MS = 8 * HOUR;

/** 묶는 종류의 건 n개(처음 생긴 시각이 5분씩 다르다) */
function many(count: number, make: (index: number) => InboxEntry): InboxEntry[] {
  return Array.from({ length: count }, (_, index) => make(index));
}

/** 처리할 일 시안 자료(건 목록). 정렬·묶기는 order.ts가 한다 */
export function previewInboxEntries(now: number): InboxEntry[] {
  return [
    // 위협: 내 도시로 오는 웨이브(마감 = 도착)
    {
      kind: "wave_incoming",
      key: "preview_wave_1",
      deadlineAt: now + 2 * HOUR,
      firstSeenAt: now - 20 * MINUTE,
      params: { place: "Nova" },
      target: { route: "map" },
      preview: true,
    },
    // 위협: 공성 선포(마감 = 방어 시각을 고르지 않으면 열리는 시각)
    {
      kind: "siege_declared",
      key: "preview_siege_1",
      deadlineAt: now + 26 * HOUR,
      firstSeenAt: now - 3 * HOUR,
      params: { place: "Nova" },
      target: { route: "faction" },
      preview: true,
    },
    // 돈·생존: 곧 썩는 물건 — 창고 하나에 2묶음(마감은 이른 쪽)
    ...many(2, (index) => ({
      kind: "goods_spoiling",
      key: "preview_store_1",
      deadlineAt: now + (5 + 4 * index) * HOUR,
      firstSeenAt: now - (6 - 4 * index) * HOUR,
      params: { place: "Nova" },
      target: { route: "economy" },
      preview: true,
    })),
    // 돈·생존: 치료를 기다리는 부상 유닛 2(마감 없음 → 분류의 끝)
    ...many(2, (index) => ({
      kind: "unit_injured",
      key: "preview_base_1",
      deadlineAt: null,
      firstSeenAt: now - (60 - 20 * index) * MINUTE,
      params: { place: "Nova" },
      target: { route: "units" },
      preview: true,
    })),
    // 멈춤: 내구도가 낮아 멈춘 건물 1
    {
      kind: "building_stopped",
      key: "preview_base_2",
      deadlineAt: null,
      firstSeenAt: now - 5 * HOUR,
      params: { place: "Vega" },
      target: { route: "map" },
      preview: true,
    },
    // 멈춤: 명령 없는 유닛 6(D-6009 예 "명령 없는 유닛 6")
    ...many(6, (index) => ({
      kind: "unit_idle",
      key: "preview_base_1",
      deadlineAt: null,
      firstSeenAt: now - (45 - 5 * index) * MINUTE,
      params: { place: "Nova" },
      target: { route: "units" },
      preview: true,
    })),
    // 제안·결정: 맞는 의뢰(마감 = 의뢰가 닫히는 시각). 이동 화면이 없어 처리함에서 고른다
    {
      kind: "contract_match",
      key: "preview_contract_1",
      deadlineAt: now + 20 * HOUR,
      firstSeenAt: now - 15 * MINUTE,
      params: {},
      target: null,
      preview: true,
    },
    // 완료: 제작 완료(사건 하나)
    {
      kind: "craft_done",
      key: "preview_event_1",
      deadlineAt: null,
      firstSeenAt: now - 10 * MINUTE,
      params: {},
      target: { route: "economy" },
      preview: true,
    },
  ];
}

/** 복귀 요약 시안 자료: 생산·습격과 방어·부상·세계 소식(D-6014). 숫자를 누르면 갈 화면이 있다(세계 소식은 아직 화면이 없다) */
export function previewSummarySections(): SummarySection[] {
  return [
    { kind: "production", count: 3, params: {}, target: { route: "economy" }, preview: true },
    { kind: "raid", count: 1, params: {}, target: { route: "map" }, preview: true },
    { kind: "injury", count: 2, params: {}, target: { route: "units" }, preview: true },
    { kind: "world_news", count: 4, params: {}, target: null, preview: true },
  ];
}
