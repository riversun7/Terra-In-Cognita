// 처리할 일 접기 — 바로 처리 [기다림](기획 대조 2163 — D-573 원문 "기다릴지 해지하고 다른곳으로 갈지 정함"). [기다림]은 서버 상태를 바꾸지 않는다(계약은 이미
// 일시 중지 — 기다리면 사업장에 수익이 날 때 다시 일한다). 그래서 그 경고를 이 기기에서만 접는다(localStorage — 기기마다의 편의, 막히면 접히지 않을 뿐).
// - 접은 줄 = 항목 ID + 처음 생긴 시각. 같은 계약이 다시 돌다가 또 멈추면 처음 생긴 시각이 바뀌어 다시 보인다.
// - 목록을 받을 때마다 접은 줄을 빼고 분류 수를 줄인다(종 배지도 준다). 지금 목록에 없는 접힘은 지운다(쌓이지 않게).
// 첫 화면 묶음(store.ts)이 가져온다 — 종류 표는 타입으로만.
import type { InboxListResponse } from "@terra/shared/inbox";

const KEY = "terra.inbox.folded.v1";

function read(): Record<string, number> {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Record<string, number> = {};
    for (const [id, at] of Object.entries(parsed)) if (typeof at === "number") out[id] = at;
    return out;
  } catch {
    return {};
  }
}

function write(folded: Record<string, number>): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(folded));
  } catch {
    // 저장소가 막힘(사생활 창 등): 접지 못한다
  }
}

/** 이 줄을 접는다(항목 ID·처음 생긴 시각) */
export function foldInboxItem(id: string, firstSeenAt: number): void {
  write({ ...read(), [id]: firstSeenAt });
}

/** 받은 목록에서 접은 줄을 뺀다(분류 수도 줄인다) */
export function withoutFolded(data: InboxListResponse): InboxListResponse {
  const folded = read();
  const ids = Object.keys(folded);
  if (ids.length === 0) return data;
  const counts = { ...data.counts };
  const keep: Record<string, number> = {};
  const items = data.items.filter((item) => {
    if (folded[item.id] !== item.firstSeenAt) return true;
    keep[item.id] = item.firstSeenAt;
    const category = item.category;
    if (Object.hasOwn(counts, category)) counts[category] = Math.max(0, counts[category] - 1);
    return false;
  });
  if (Object.keys(keep).length !== ids.length) write(keep);
  return items.length === data.items.length ? data : { ...data, items, counts };
}
