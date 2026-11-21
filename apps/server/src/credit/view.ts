// 내 신용 조회(economy.credit — 경제 화면) — docs/adr/2026-11-21-credit.md. 깎인 곳만 줄로 보인다(없으면 모든 도시·나라에서 시작값).
import type { CreditLine, CreditMarkView, CreditResponse } from "@terra/shared/credit";
import type { CreditBook, CreditMark } from "./book.ts";

/** 줄 열쇠: (유닛, 도시, 나라) */
const lineKey = (mark: CreditMark): string => `${mark.unitId ?? ""}|${mark.cityId}|${mark.nationId}`;

const markView = (mark: CreditMark): CreditMarkView => ({
  cause: mark.kind,
  cityPoints: mark.cityPoints,
  nationPoints: mark.nationPoints,
  count: mark.count,
  sinceMs: mark.sinceMs,
});

/** 그 주인(과 그 주인 유닛)의 신용 줄: 주인 자신이 먼저, 그다음 유닛 ID·도시 ID 차례 */
export function creditLines(
  book: CreditBook,
  ownerId: number,
  cityName: (cityId: number) => string | undefined,
): CreditLine[] {
  const groups = new Map<string, CreditMark[]>();
  for (const mark of book.marksOf(ownerId)) {
    const list = groups.get(lineKey(mark)) ?? [];
    list.push(mark);
    groups.set(lineKey(mark), list);
  }
  const lines: CreditLine[] = [];
  for (const list of groups.values()) {
    const head = list[0];
    if (!head) continue;
    const subject = { ownerId, unitId: head.unitId };
    lines.push({
      subject: head.unitId === null ? "owner" : "unit",
      unitId: head.unitId,
      cityId: head.cityId,
      cityName: cityName(head.cityId) ?? null,
      nationId: head.nationId,
      cityScore: book.score(subject, { city: head.cityId }),
      nationScore: book.score(subject, { nation: head.nationId }),
      marks: list.map(markView),
    });
  }
  return lines.toSorted(
    (a, b) => (a.unitId ?? -1) - (b.unitId ?? -1) || a.cityId - b.cityId || a.nationId - b.nationId,
  );
}

/** 응답(장부가 없으면 not_ready — 범위는 설정 칸 출발값) */
export function creditResponse(
  book: CreditBook | undefined,
  ownerId: number | undefined,
  now: number,
  cityName: (cityId: number) => string | undefined,
): CreditResponse {
  if (!book)
    return { generatedAt: now, status: "not_ready", range: { min: 0, max: 1000, start: 1000 }, lines: [] };
  return {
    generatedAt: now,
    status: "ready",
    range: book.rules().range,
    lines: ownerId === undefined ? [] : creditLines(book, ownerId, cityName),
  };
}
