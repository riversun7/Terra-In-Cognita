// 아이콘 — 화면 틀(메뉴 항목·위 띠·하단 탭·사이드 메뉴)과 처리할 일 분류 5개(ADR 2026-10-29-app-shell 3·10·11절).
// 아이콘 꾸러미 없이 인라인 SVG로 그린다(첫 화면 묶음). 선 굵기·모서리는 상태 아이콘(StatusIcon)과 같은 둥근 선이다.
// 글자와 같은 색(currentColor)이고 크기는 CSS(.icon, --icon-md)가 정한다. 꾸밈이라 읽기 프로그램에는 숨긴다:
// 이름은 늘 옆 글자(또는 단추의 aria-label)가 알린다. 처리할 일 화면·홈 카드가 더 쓰는 아이콘은 그 폴더에 둔다.
import type { ReactNode } from "react";

const PATHS = {
  home: (
    <>
      <path d="M4 11.5 12 5l8 6.5" />
      <path d="M6.5 10v8.5h11V10" />
      <path d="M10 18.5V14h4v4.5" />
    </>
  ),
  map: (
    <>
      <path d="M4 6.5 9 4.5l6 2.5 5-2v12.5l-5 2-6-2.5-5 2z" />
      <path d="M9 4.5V17M15 7v12.5" />
    </>
  ),
  units: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <circle cx="16.5" cy="9.5" r="2.4" />
      <path d="M15.6 14.1c2.4-.3 4.3 1.2 4.9 4.4" />
    </>
  ),
  economy: (
    <>
      <ellipse cx="12" cy="7" rx="6.5" ry="2.5" />
      <path d="M5.5 7v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V7" />
      <path d="M5.5 12v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5" />
    </>
  ),
  faction: (
    <>
      <path d="M6 20.5V4" />
      <path d="M6 5h11l-2.5 4 2.5 4H6" />
    </>
  ),
  cyborg: (
    <>
      <rect x="5.5" y="7" width="13" height="11.5" rx="4" />
      <path d="M12 4v3" />
      <path d="M9.3 12.2h.01M14.7 12.2h.01" strokeWidth={2.6} />
      <path d="M10 15.4h4" />
    </>
  ),
  // 인벤토리: 상자(docs/adr/2026-11-14-inventory-screen.md)
  inventory: (
    <>
      <path d="M4 8.5 12 5l8 3.5v8L12 20l-8-3.5z" />
      <path d="M4 8.5 12 12l8-3.5M12 12v8" />
    </>
  ),
  menu: <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />,
  bell: (
    <>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5L19 18H5z" />
      <path d="M10 20.5h4" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="2.5" />
      <path d="m4.5 7.5 7.5 6 7.5-6" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  dev: (
    <>
      <path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4" />
      <path d="m13.5 5.5-3 13" />
    </>
  ),
  admin: (
    <>
      <path d="M12 3.5 19 6v5.5c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  logout: (
    <>
      <path d="M13.5 4.5h-7v15h7" />
      <path d="M10.5 12H20M16.5 8.5 20 12l-3.5 3.5" />
    </>
  ),
  back: <path d="m14.5 6-6 6 6 6" />,
  up: <path d="m6 14.5 6-6 6 6" />,
  down: <path d="m6 9.5 6 6 6-6" />,
  close: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5z" />
    </>
  ),
  rotate: (
    <>
      <rect x="3.5" y="8" width="9" height="13" rx="2" />
      <path d="M15 4a6 6 0 0 1 5.5 5.5" />
      <path d="m21 7-.5 2.5L18 9" />
    </>
  ),
  // 처리할 일 분류(packages/shared inbox.ts의 분류 ID). 분류는 늘 아이콘 + 이름 + 색으로 보인다(ADR 37 3·10절)
  threat: (
    <>
      <path d="M12 4 21 19.5H3z" />
      <path d="M12 10v4.5M12 17h.01" />
    </>
  ),
  money_survival: (
    <path d="M12 19.5s-7-4.3-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.3c0 4.9-7 9.2-7 9.2z" />
  ),
  stalled: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 9v6M14 9v6" />
    </>
  ),
  decision: (
    <>
      <path d="M12 4.5v15M7.5 19.5h9M5 8h14" />
      <path d="m5 8-2.5 5.5h5zM19 8l-2.5 5.5h5z" />
    </>
  ),
  done: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.3 12.2 2.6 2.6 4.8-5.1" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className === undefined ? "icon" : `icon ${className}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
