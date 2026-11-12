// 2차맵 화면만 쓰는 아이콘 — 아래 탭(도시·주변)·운영 메뉴·시설 무리 표시. 앱 틀 아이콘(ui/icons.tsx)과 같은 둥근 선·크기 규칙이고,
// 2차맵 조각에만 든다(첫 화면 묶음을 키우지 않는다). 꾸밈이라 읽기 프로그램에는 숨긴다: 이름은 옆 글자가 알린다.
import type { ReactNode } from "react";

const PATHS = {
  /** 도시: 지붕 둘 + 탑 */
  city: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M5 20.5v-8l4-3 4 3v8" />
      <path d="M13 20.5V8.5l3.5-3 3.5 3v12" />
      <path d="M8 20.5v-3h2v3M16.5 11v2" />
    </>
  ),
  /** 주변: 과녁(가운데 점 + 두 고리) */
  nearby: (
    <>
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2" />
    </>
  ),
  /** 운영 메뉴: 렌치 */
  tools: (
    <>
      <path d="M14.5 5.2a4 4 0 0 0 4.3 5.5l-7.6 7.6a2 2 0 1 1-2.8-2.8l7.6-7.6a4 4 0 0 1-1.5-2.7z" />
    </>
  ),
  /** 채집소: 곡괭이 */
  gather: (
    <>
      <path d="M5 19 14 10" />
      <path d="M8.5 6.5c3-2 7-2 10 1-2.2-.7-4.6-.6-6.5.4" />
      <path d="M17.5 15.5c2-3 2-7-1-10 .7 2.2.6 4.6-.4 6.5" />
    </>
  ),
  /** 창고: 상자 */
  storage: (
    <>
      <path d="M4 8.5 12 5l8 3.5v8L12 20l-8-3.5z" />
      <path d="M4 8.5 12 12l8-3.5M12 12v8" />
    </>
  ),
  /** 생산: 톱니 */
  craft: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4v2.5M12 17.5V20M4 12h2.5M17.5 12H20M6.3 6.3l1.8 1.8M15.9 15.9l1.8 1.8M6.3 17.7l1.8-1.8M15.9 8.1l1.8-1.8" />
    </>
  ),
  /** 공공(행정·신전·병원·연구소): 기둥 지붕 */
  civic: (
    <>
      <path d="M4 9.5 12 5l8 4.5z" />
      <path d="M6 10v7M10 10v7M14 10v7M18 10v7M4 19.5h16" />
    </>
  ),
  /** 집·숙소 */
  housing: (
    <>
      <path d="M4.5 11.5 12 5.5l7.5 6" />
      <path d="M6.5 10v9.5h11V10" />
      <path d="M10.5 19.5v-4h3v4" />
    </>
  ),
  /** 그 밖 */
  other: (
    <>
      <rect x="5.5" y="5.5" width="13" height="13" rx="2.5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type MapIconName = keyof typeof PATHS;

export function MapIcon({ name, className }: { readonly name: MapIconName; readonly className?: string }) {
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
