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

/** 설정 칸 패널(밀개 셋) */
export function SlidersIcon() {
  return (
    <DevIcon>
      <path d="M5 6h14M5 12h14M5 18h14" />
      <circle cx="9" cy="6" r="1.9" />
      <circle cx="15" cy="12" r="1.9" />
      <circle cx="8" cy="18" r="1.9" />
    </DevIcon>
  );
}

/** 밸런스 화면(저울) */
export function ScaleIcon() {
  return (
    <DevIcon>
      <path d="M12 4v16M7 20h10M5 7h14" />
      <path d="M5 7l-2.5 6h5zM19 7l-2.5 6h5z" />
    </DevIcon>
  );
}

/** 스킬 편집기(번쩍임 별) */
export function SparkIcon() {
  return (
    <DevIcon>
      <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7-5.6-1.9L10.1 9z" />
      <path d="M18.5 3.5v3M17 5h3" />
    </DevIcon>
  );
}

/** 아이템 편집기(뚜껑 있는 상자) */
export function CrateIcon() {
  return (
    <DevIcon>
      <path d="M3.5 8.5 12 4l8.5 4.5v8L12 21l-8.5-4.5z" />
      <path d="M3.5 8.5 12 13l8.5-4.5M12 13v8" />
    </DevIcon>
  );
}

/** 구인 카드 시험(사람 카드) */
export function PersonCardIcon() {
  return (
    <DevIcon>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
      <circle cx="12" cy="10" r="2.6" />
      <path d="M7.5 17.5c.9-2.2 2.6-3.3 4.5-3.3s3.6 1.1 4.5 3.3" />
    </DevIcon>
  );
}

/** 건물 편집기(지붕 있는 집) */
export function HouseIcon() {
  return (
    <DevIcon>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </DevIcon>
  );
}

/** 1차 생산 티어 확률(주사위 — 티어 추첨) */
export function DiceIcon() {
  return (
    <DevIcon>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="9" cy="9" r="1" />
      <circle cx="15" cy="15" r="1" />
      <circle cx="15" cy="9" r="1" />
      <circle cx="9" cy="15" r="1" />
    </DevIcon>
  );
}

/** 영토 층(꼭짓점 넷을 이은 볼록 도형과 꼭짓점) */
export function TerritoryIcon() {
  return (
    <DevIcon>
      <path d="M5 8.5 11 4l8 5-2 10-10-1.5Z" />
      <circle cx="11" cy="4" r="1.2" />
      <circle cx="17" cy="19" r="1.2" />
    </DevIcon>
  );
}

/** 세계 배치(지구본 위 깃발) */
export function GlobePinIcon() {
  return (
    <DevIcon>
      <circle cx="11" cy="13" r="7" />
      <path d="M4 13h14M11 6c-2.4 2-2.4 12 0 14M11 6c2.4 2 2.4 12 0 14" />
      <path d="M17 3v6M17 3h4l-1 1.5 1 1.5h-4" />
    </DevIcon>
  );
}

/** 크리처 편집기(발바닥 표식) */
export function PawIcon() {
  return (
    <DevIcon>
      <circle cx="7" cy="9" r="1.7" />
      <circle cx="10.5" cy="6.8" r="1.7" />
      <circle cx="13.5" cy="6.8" r="1.7" />
      <circle cx="17" cy="9" r="1.7" />
      <path d="M9.2 13.5c1.1-1.3 4.5-1.3 5.6 0 1.4 1.6 2 4-.8 4.9-1.3.4-2.7.4-4 0-2.8-.9-2.2-3.3-.8-4.9Z" />
    </DevIcon>
  );
}
