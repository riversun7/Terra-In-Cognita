// 개발자 홈 아이콘 — 인라인 SVG(아이콘 꾸러미 없음). ui/icons.tsx와 같은 둥근 선이다.
// ui/icons.tsx는 첫 화면 묶음이라, 개발자 홈만 쓰는 아이콘은 이 폴더에 둔다(ui/icons.tsx 머리 주석).
// 꾸밈이라 읽기 프로그램에는 숨긴다(이름은 옆 글자가 알린다). 글자와 같은 색이고 크기는 CSS(.icon)가 정한다.
import type { ReactNode } from "react";

function DevIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** 셰이더 측정(속도계) */
export function GaugeIcon() {
  return (
    <DevIcon>
      <path d="M4.6 17.3a8.5 8.5 0 1 1 14.8 0" />
      <path d="m12 13 3.6-3.6" />
    </DevIcon>
  );
}

/** 항성계 편집기(가운데 별과 궤도 하나, 궤도 위 행성) */
export function OrbitIcon() {
  return (
    <DevIcon>
      <circle cx="12" cy="12" r="2.6" />
      <ellipse cx="12" cy="12" rx="9" ry="5.2" />
      <circle cx="19.4" cy="9" r="1.4" />
    </DevIcon>
  );
}

/** 줄 끝의 "들어가기" 표시(ui/icons.tsx back의 거울) */
export function ForwardIcon() {
  return (
    <DevIcon>
      <path d="m9.5 6 6 6-6 6" />
    </DevIcon>
  );
}
