// 처리할 일 화면만 쓰는 아이콘. 분류 아이콘 5개와 "그 밖의 알림"(bell)은 화면 틀 아이콘(ui/icons.tsx, 분류 ID와 같은 이름)을 쓴다
// (InboxList.tsx). 분류는 늘 아이콘 + 이름과 함께 보인다(색만으로 알리지 않는다, ADR 2026-10-29-app-shell 3·10절).
// 꾸밈이라 읽기 프로그램에는 숨긴다. 글자와 같은 색(currentColor)이다.
import type { InboxCategory } from "@terra/shared/inbox";

/** 그릴 묶음: 분류 5개 + 이 기기가 모르는 분류를 모은 묶음 */
export type InboxGroupKind = InboxCategory | "other";

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
