// 속성 아이콘 — 12속성(기본 4원소 + 강화 4원소 + 빛/신성 + 어둠/암흑).
// 기획 D-182·D-450·D-5011, 50 §2.1 코드(ELEMENT_CODES).
// 외부 의존성 없이 24x24 선 그림(stroke="currentColor", fill="none")으로 직접 그린다(statIcons.tsx와 같은 틀).
// 꾸밈 요소이므로 기본 aria-hidden="true"로 숨긴다.
import type { ElementCode } from "@terra/shared/roster";
import type { ReactNode } from "react";

const ICON_PATHS: Readonly<Record<ElementCode, ReactNode>> = {
  // ── 물 계열 ──
  // 물 (water): 물방울과 내부 굴절 곡선
  water: (
    <>
      <path d="M12 2.5C9.5 6 6 10.2 6 14.5a6 6 0 0 0 12 0c0-4.3-3.5-8.5-6-12z" />
      <path d="M12 9c-1.8 2.2-2.5 4-2.5 5.5a2.5 2.5 0 0 0 5 0" />
    </>
  ),
  // 빙결 (frost): 6방향 얼음 눈꽃 결정
  frost: (
    <>
      <path d="M12 2.5v19M2.5 12h19" />
      <path d="m5.3 5.3 13.4 13.4M18.7 5.3 5.3 18.7" />
      <path d="m9.5 4 2.5 2.5 2.5-2.5M9.5 20l2.5-2.5 2.5 2.5" />
      <path d="m4 9.5 2.5 2.5-2.5 2.5M20 9.5l-2.5 2.5 2.5 2.5" />
    </>
  ),

  // ── 불 계열 ──
  // 불 (fire): 일렁이는 화염
  fire: (
    <>
      <path d="M12 2.5c.8 3.5 4.5 5.5 4.5 10a5 5 0 0 1-10 0c0-2.8 1.6-4.5 2.5-6.5 1 1.5 1.8 2.2 3 2.5z" />
      <path d="M12 14a2 2 0 0 0 2-2c0-1.2-1-2.2-2-3.5-.8 1.2-1.8 2-1.8 3.5a1.8 1.8 0 0 0 1.8 2z" />
    </>
  ),
  // 폭렬 (blaze): 격렬한 화염 폭발과 스파크
  blaze: (
    <>
      <path d="M12 2 9.5 8 3.5 9.5 8 13.5 7 19.5 12 16.5l5 3-1-6 4.5-4-6-1.5z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),

  // ── 바람 계열 ──
  // 바람 (wind): 흐르는 두 가닥 바람결과 회오리 끝
  wind: (
    <>
      <path d="M3.5 8h11a3 3 0 1 0-3-3" />
      <path d="M2.5 13.5h14a3.5 3.5 0 1 1-3.5 3.5" />
      <path d="M4 19h7a2 2 0 1 0-2-2" />
    </>
  ),
  // 번개 (lightning): 날카로운 번개 화살
  lightning: <path d="M13 2.5 4.5 13.5h6l-1.5 8 9-11.5h-6z" />,

  // ── 땅 계열 ──
  // 땅 (earth): 견고한 쌍둥이 산봉우리와 대지 지평선
  earth: (
    <>
      <path d="m2.5 19.5 6.5-11 5 7.5 2.5-4 5 7.5z" />
      <path d="M2 19.5h20" />
      <path d="m6.5 13 3 2" />
    </>
  ),
  // 크리스탈 (crystal): 다면체 다이아몬드 결정
  crystal: (
    <>
      <path d="M6 3.5h12l4.5 6.5L12 21.5 1.5 10z" />
      <path d="m1.5 10 10.5 2 10.5-2" />
      <path d="M6 3.5 12 12l6-8.5" />
      <path d="M12 12v9.5" />
    </>
  ),

  // ── 빛 계열 ──
  // 빛 (light): 방사형으로 퍼지는 8방향 햇살
  light: (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <path d="m4.9 4.9 2.2 2.2M16.9 16.9l2.2 2.2M4.9 19.1l2.2-2.2M16.9 7.1l2.2-2.2" />
    </>
  ),
  // 신성 (holy): 빛나는 신성한 십자 섬광
  holy: (
    <>
      <path d="M12 2.5c0 4.5 5 9.5 9.5 9.5-4.5 0-9.5 5-9.5 9.5 0-4.5-5-9.5-9.5-9.5 4.5 0 9.5-5 9.5-9.5z" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),

  // ── 어둠 계열 ──
  // 어둠 (dark): 초승달과 어둠의 별
  dark: (
    <>
      <path d="M19.5 13.5A7.5 7.5 0 1 1 10.5 4.5a6 6 0 0 0 9 9z" />
      <path d="M18 4v3M19.5 5.5h-3" />
    </>
  ),
  // 암흑 (necro): 사령의 영혼 불꽃 / 해골 마크
  necro: (
    <>
      <circle cx="12" cy="10" r="5.5" />
      <path d="M9 15.5v3h6v-3" />
      <circle cx="10" cy="10" r="1.2" />
      <circle cx="14" cy="10" r="1.2" />
      <path d="M11 18.5v-1.5M13 18.5v-1.5" />
    </>
  ),
};

export function ElementIcon({ code, className = "element-icon" }: { code: ElementCode; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[code] ?? <circle cx="12" cy="12" r="4" />}
    </svg>
  );
}
