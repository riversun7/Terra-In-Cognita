// 지도 화면(1·2차맵)만 쓰는 아이콘 — 아래 탭(도시·주변)·운영 메뉴·시설 무리 표시·1차맵 레이어 단추. 앱 틀 아이콘(ui/icons.tsx)과 같은 둥근 선·크기 규칙이고,
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
  /** 1차맵 레이어: 겹친 마름모 둘 */
  layers: (
    <>
      <path d="M12 4 3.5 8.5 12 13l8.5-4.5z" />
      <path d="M3.5 12.5 12 17l8.5-4.5" />
      <path d="M3.5 16.5 12 21l8.5-4.5" />
    </>
  ),
  /** 운영 메뉴: 렌치 */
  tools: (
    <>
      <path d="M14.5 5.2a4 4 0 0 0 4.3 5.5l-7.6 7.6a2 2 0 1 1-2.8-2.8l7.6-7.6a4 4 0 0 1-1.5-2.7z" />
    </>
  ),
  /** 채집: 곡괭이 */
  gathering: (
    <>
      <path d="M5 19 14 10" />
      <path d="M8.5 6.5c3-2 7-2 10 1-2.2-.7-4.6-.6-6.5.4" />
      <path d="M17.5 15.5c2-3 2-7-1-10 .7 2.2.6 4.6-.4 6.5" />
    </>
  ),
  /** 저장·물류: 상자 */
  storage: (
    <>
      <path d="M4 8.5 12 5l8 3.5v8L12 20l-8-3.5z" />
      <path d="M4 8.5 12 12l8-3.5M12 12v8" />
    </>
  ),
  /** 가공·제작: 톱니 */
  processing: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4v2.5M12 17.5V20M4 12h2.5M17.5 12H20M6.3 6.3l1.8 1.8M15.9 15.9l1.8 1.8M6.3 17.7l1.8-1.8M15.9 8.1l1.8-1.8" />
    </>
  ),
  /** 행정(정부): 기둥 지붕 */
  administration: (
    <>
      <path d="M4 9.5 12 5l8 4.5z" />
      <path d="M6 10v7M10 10v7M14 10v7M18 10v7M4 19.5h16" />
    </>
  ),
  /** 공공·서비스(병원·신전·연구소): 둥근 칸 안 십자 */
  public: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  /** 주거(숙소·집) */
  housing: (
    <>
      <path d="M4.5 11.5 12 5.5l7.5 6" />
      <path d="M6.5 10v9.5h11V10" />
      <path d="M10.5 19.5v-4h3v4" />
    </>
  ),
  /** 상업(거래소·상점): 동전 */
  commerce: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M14 9.5c-.6-.7-1.3-1-2.2-1-1.3 0-2.3.7-2.3 1.7 0 2.3 4.8 1.2 4.8 3.6 0 1-1 1.7-2.4 1.7-1 0-1.8-.4-2.4-1.1M12 7v1.5M12 15.5V17" />
    </>
  ),
  /** 교통·항만: 닻 */
  transport: (
    <>
      <circle cx="12" cy="6.5" r="1.8" />
      <path d="M12 8.3V19M8.5 11h7M5.5 13.5c.5 3.3 3.2 5.5 6.5 5.5s6-2.2 6.5-5.5" />
    </>
  ),
  /** 군사·방어(성벽·영토 비콘): 방패 */
  military: (
    <>
      <path d="M12 4.5 18.5 7v4.8c0 3.6-2.6 6.6-6.5 7.7-3.9-1.1-6.5-4.1-6.5-7.7V7z" />
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
