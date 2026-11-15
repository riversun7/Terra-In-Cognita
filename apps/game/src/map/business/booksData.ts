// 사업장 장부 자료 공용 — 장부 읽기(tRPC facilities.books)·건물 주인 이름표(facilities.owner)·금액 글자. docs/adr/2026-11-15-building-screen.md
// 건물 판 칸(BuildingPanel)과 재무 화면(BuildingBooksScreen)이 같이 쓴다.
import type { BuildingOwnerResponse, BusinessBooksResponse } from "@terra/shared/businessBooks";
import { useCallback, useEffect, useState } from "react";
import { formatAmount } from "../../economy/amount.ts";
import { api } from "../../net/api.ts";

const REQUEST_TIMEOUT_MS = 10_000;
export const BOOK_PERIODS = [1, 7, 30] as const;
export type BookPeriod = (typeof BOOK_PERIODS)[number];

/** 장부 응답 가운데 읽은 것 */
export type BooksOk = Extract<BusinessBooksResponse, { status: "ok" }>;

const withTimeout = (signal?: AbortSignal): AbortSignal => {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
};

/** 장부 읽기(시간 제한 REQUEST_TIMEOUT_MS) */
export function loadBooks(
  buildingId: number,
  days: number,
  signal?: AbortSignal,
): Promise<BusinessBooksResponse> {
  return api.facilities.books.query({ buildingId, days }, { signal: withTimeout(signal) });
}

/** 건물 주인 이름표 읽기 */
export function loadOwner(buildingId: number, signal?: AbortSignal): Promise<BuildingOwnerResponse> {
  return api.facilities.owner.query({ buildingId }, { signal: withTimeout(signal) });
}

/** 장부 하나(켜졌을 때만 읽는다). reload는 명령 뒤에 부른다 */
export function useBooks(
  buildingId: number,
  days: number,
  enabled: boolean,
): { readonly books: BusinessBooksResponse | null; readonly failed: boolean; readonly reload: () => void } {
  const [books, setBooks] = useState<BusinessBooksResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return () => undefined;
    const controller = new AbortController();
    loadBooks(buildingId, days, controller.signal)
      .then((response) => {
        setBooks(response);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [buildingId, days, enabled]);
  // 명령 뒤 다시 읽기(효과 밖 — 다시 실행 신호를 의존성에 넣지 않는다)
  const reload = useCallback(() => {
    if (!enabled) return;
    loadBooks(buildingId, days)
      .then((response) => {
        setBooks(response);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [buildingId, days, enabled]);
  return { books: books?.status === "ok" && books.buildingId !== buildingId ? null : books, failed, reload };
}

/** 부호 있는 최소 단위 글 → 자리 나눔 글(음수는 −, 양수는 +) */
export function signedAmount(value: string, locale: string): string {
  const negative = value.startsWith("-");
  const body = formatAmount(negative ? value.slice(1) : value, locale);
  return negative ? `−${body}` : value === "0" ? body : `+${body}`;
}

/** 시각 글(월·일 시:분) */
export function timeText(atMs: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(atMs));
}
