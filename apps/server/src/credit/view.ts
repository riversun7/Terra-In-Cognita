// 내 신용 조회(economy.credit — 경제 화면) — docs/adr/2026-11-21-credit.md. 바뀜(governance-5, D-584 "한 점수"): 줄 = (주체, 나라). 내가 지금 속한 나라 줄(소속 줄)은
// 늘 보이고, 내린 몫이 남은 다른 나라·유닛 줄을 더한다. 소속 줄도 내린 몫도 없으면 줄 없음(화면이 시작값을 보인다).
import type { CreditLine, CreditMarkView, CreditResponse } from "@terra/shared/credit";
import { tenureRise } from "@terra/shared/credit";
import type { CreditBook, CreditMark } from "./book.ts";

/** 줄 열쇠: (유닛, 나라) */
const lineKey = (unitId: number | null, nationId: number): string => `${unitId ?? ""}|${nationId}`;

const markView = (mark: CreditMark): CreditMarkView => ({
  cause: mark.kind,
  points: mark.points,
  count: mark.count,
  sinceMs: mark.sinceMs,
});

/** 그 주인(과 그 주인 유닛)의 신용 줄: 주인 자신이 먼저(지금 나라 먼저), 그다음 유닛 ID·나라 ID 차례 */
export function creditLines(book: CreditBook, ownerId: number, nowMs: number): CreditLine[] {
  const groups = new Map<string, { unitId: number | null; nationId: number; marks: CreditMark[] }>();
  const standing = book.standingOf(ownerId);
  if (standing)
    groups.set(lineKey(null, standing.nationId), { unitId: null, nationId: standing.nationId, marks: [] });
  for (const mark of book.marksOf(ownerId)) {
    const key = lineKey(mark.unitId, mark.nationId);
    const group = groups.get(key) ?? { unitId: mark.unitId, nationId: mark.nationId, marks: [] };
    group.marks.push(mark);
    groups.set(key, group);
  }
  const rules = book.rules();
  const lines: CreditLine[] = [...groups.values()].map((group) => {
    const current = group.unitId === null && standing?.nationId === group.nationId;
    return {
      subject: group.unitId === null ? "owner" : "unit",
      unitId: group.unitId,
      nationId: group.nationId,
      current,
      score: book.score({ ownerId, unitId: group.unitId }, group.nationId, nowMs),
      tenure:
        current && standing ? tenureRise(standing.sinceMs, nowMs, rules.tenurePerDay, rules.tenureCap) : 0,
      rise: current && standing ? standing.rise : 0,
      marks: group.marks.map(markView),
    };
  });
  return lines.toSorted(
    (a, b) =>
      (a.unitId ?? -1) - (b.unitId ?? -1) || Number(b.current) - Number(a.current) || a.nationId - b.nationId,
  );
}

/** 응답(장부가 없으면 not_ready — 범위는 설정 칸 출발값) */
export function creditResponse(
  book: CreditBook | undefined,
  ownerId: number | undefined,
  now: number,
): CreditResponse {
  if (!book)
    return { generatedAt: now, status: "not_ready", range: { min: 0, max: 1000, start: 100 }, lines: [] };
  return {
    generatedAt: now,
    status: "ready",
    range: book.rules().range,
    lines: ownerId === undefined ? [] : creditLines(book, ownerId, now),
  };
}
