// 처리할 일 분류 아이콘 5개 — 분류는 늘 아이콘 + 이름과 함께 보인다(색만으로 알리지 않는다, ADR 2026-10-29-app-shell 3·10절).
// 꾸밈이라 읽기 프로그램에는 숨긴다(이름은 옆 글자가 알린다). 글자와 같은 색(currentColor), 크기는 inbox.css의 .inbox-icon.
// 통합 때: 화면 틀(W1)의 ui/icons.tsx에도 분류 아이콘 5개가 생긴다. 그쪽이 합쳐지면 이 파일의 CategoryIcon을 그것으로 바꾸고 지운다.
import type { InboxCategory } from "@terra/shared/inbox";
import type { ReactElement } from "react";

const PATHS = {
  // 위협: 세모 경고
  threat: (
    <>
      <path d="M10 2.9 18 16.6H2Z" />
      <path d="M10 7.8v4" strokeWidth={2.1} />
      <path d="M10 14.2h.01" strokeWidth={2.4} />
    </>
  ),
  // 돈·생존: 동전
  money_survival: (
    <>
      <circle cx="10" cy="10" r="7.6" />
      <path d="M12.4 7.6c-.4-.9-1.3-1.4-2.4-1.4-1.4 0-2.4.8-2.4 1.8 0 2.4 4.9 1.3 4.9 3.9 0 1-1 1.9-2.5 1.9-1.2 0-2.1-.6-2.5-1.5M10 4.9v1.3M10 13.8v1.3" />
    </>
  ),
  // 멈춤: 동그라미 안의 멈춤 표시
  stalled: (
    <>
      <circle cx="10" cy="10" r="7.6" />
      <path d="M8.1 7.2v5.6M11.9 7.2v5.6" strokeWidth={2} />
    </>
  ),
  // 제안·결정: 말풍선
  decision: (
    <>
      <path d="M3.4 4.4h13.2v8.7H10l-3.6 3v-3h-3Z" />
      <path d="M6.6 8.8h6.8" />
    </>
  ),
  // 완료: 동그라미 안의 체크
  done: (
    <>
      <circle cx="10" cy="10" r="7.6" />
      <path d="m6.4 10.2 2.5 2.5 4.8-5" strokeWidth={2} />
    </>
  ),
} satisfies Record<InboxCategory, ReactElement>;

export function CategoryIcon({ category }: { category: InboxCategory }) {
  return (
    <svg
      className="inbox-icon"
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[category]}
    </svg>
  );
}

/** 줄을 누르면 다른 화면으로 간다는 표시(꾸밈) */
export function ChevronIcon() {
  return (
    <svg
      className="inbox-chevron"
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />
    </svg>
  );
}
