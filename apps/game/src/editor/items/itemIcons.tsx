// 아이템 편집기 아이콘 — 대분류 타일 9개 + 전체, 줄 빠른 동작(복제·열기·되돌리기·지우기), 보기 바꿈(목록·격자).
// 인라인 SVG(아이콘 꾸러미 없음), editor/devIcons.tsx와 같은 둥근 선. 글자와 같은 색이고 크기는 CSS(.icon)가 정한다.
// 꾸밈이라 읽기 프로그램에는 숨긴다(이름은 옆 글자나 단추 이름이 알린다). 옛 아이템 편집기의 대분류 타일(사용자 2026-11-09)을 되살린다.
import type { ItemCategoryId } from "@terra/shared/itemEditor";
import type { ReactNode } from "react";

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** 대분류마다 그림(원자재 곡괭이 · 가공 재료 괴 · 부품 톱니 · 장비 칼 · 식품·소모품 물약 · 보석 · 건축 벽돌 · 문서 두루마리 · 귀금속 동전) */
const CATEGORY_PATHS: Readonly<Record<ItemCategoryId | "all", ReactNode>> = {
  all: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
    </>
  ),
  raw: (
    <>
      <path d="M4 10.5C7.5 6 14 4.6 20 7.2l-1 1.6c-4.6-1.7-9.6-.8-13.4 2.6z" />
      <path d="M12.6 7.4 6.5 20" />
    </>
  ),
  processed: (
    <>
      <path d="M3.5 18h9l1.5-4.5h-9z" />
      <path d="M10.5 13.5h9L21 18h-8.5" />
      <path d="M7 9.5h9l1.2 4" />
      <path d="M8.2 9.5 9.5 6h6l1 3.5" />
    </>
  ),
  part: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9 18 18M6 18l2.1-2.1M15.9 8.1 18 6" />
    </>
  ),
  equipment: (
    <>
      <path d="M14.5 4.5H19.5V9.5L10 19l-5-5z" />
      <path d="m7.5 16.5-3 3" />
      <path d="m6.5 12.5 5 5" />
    </>
  ),
  consumable: (
    <>
      <path d="M9.5 3.5h5" />
      <path d="M10.5 3.5v5.2L6 16.5a2.6 2.6 0 0 0 2.3 4h7.4a2.6 2.6 0 0 0 2.3-4l-4.5-7.8V3.5" />
      <path d="M7.6 14h8.8" />
    </>
  ),
  gem: (
    <>
      <path d="M7 4.5h10L21 9l-9 11L3 9z" />
      <path d="M3 9h18M9.5 4.5 8 9l4 11 4-11-1.5-4.5" />
    </>
  ),
  construction: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="1" />
      <path d="M3.5 9.7h17M3.5 14.3h17M9 5v4.7M15 5v4.7M12 9.7v4.6M7 14.3V19M17 14.3V19" />
    </>
  ),
  document: (
    <>
      <path d="M7 3.5h8.5L19 7v13.5H7z" />
      <path d="M15.5 3.5V7H19" />
      <path d="M10 11h6M10 14.5h6M10 18h3.5" />
    </>
  ),
  precious: (
    <>
      <ellipse cx="12" cy="7.5" rx="7" ry="3" />
      <path d="M5 7.5v4.5c0 1.7 3.1 3 7 3s7-1.3 7-3V7.5" />
      <path d="M5 12v4.5c0 1.7 3.1 3 7 3s7-1.3 7-3V12" />
    </>
  ),
};

export function CategoryIcon({ category }: { category: ItemCategoryId | "all" }) {
  return <Svg>{CATEGORY_PATHS[category]}</Svg>;
}

/** 줄 빠른 동작·보기 바꿈 */
const ACTION_PATHS = {
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="1.5" />
      <path d="M15.5 8.5V5.5a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3" />
    </>
  ),
  edit: (
    <>
      <path d="M4.5 19.5h4l10-10-4-4-10 10z" />
      <path d="m13 7 4 4" />
    </>
  ),
  revert: (
    <>
      <path d="M9 7.5 4.5 12 9 16.5" />
      <path d="M4.5 12h10a5 5 0 0 1 0 10h-2" />
    </>
  ),
  remove: (
    <>
      <path d="M4.5 7h15M10 4.5h4M6.5 7l1 13h9l1-13" />
      <path d="M10.5 11v5.5M13.5 11v5.5" />
    </>
  ),
  rows: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.5M4.5 12h.5M4.5 18h.5" />
    </>
  ),
  cards: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
} as const;

export type ActionIconName = keyof typeof ACTION_PATHS;

export function ActionIcon({ name }: { name: ActionIconName }) {
  return <Svg>{ACTION_PATHS[name]}</Svg>;
}
