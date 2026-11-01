// 상세 전투 스펙 줄 아이콘 — 옛 프로젝트 SecondaryStatsCard처럼 2차 스탯마다 작은 그림 하나(꾸밈, aria-hidden).
// 새 아이콘 꾸러미를 들이지 않고 24칸 선 그림으로 직접 그린다. 색은 줄의 2차 스탯 색(currentColor). 모르는 행은 점 하나.
import type { ReactNode } from "react";

const PATHS: Readonly<Record<string, ReactNode>> = {
  // 하트
  hp: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  // 방패
  armor_hp: <path d="M12 3l7 3v5c0 5-3.4 8.4-7 10-3.6-1.6-7-5-7-10V6z" />,
  // 육각 보호막
  shield_hp: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 8l4 2.3v4.4L12 17l-4-2.3v-4.4z" />
    </>
  ),
  // 물방울(에너지)
  mp: <path d="M12 3c3 4 6 7.2 6 10.5a6 6 0 0 1-12 0C6 10.2 9 7 12 3z" />,
  // 계기판
  stamina: (
    <>
      <path d="M4 16a8 8 0 1 1 16 0" />
      <path d="M12 16l4-5" />
    </>
  ),
  // 칼
  physical_attack: (
    <>
      <path d="M19 4l-9.5 9.5" />
      <path d="M15 4h4v4" />
      <path d="M6 13l5 5" />
      <path d="M4 20l3.5-3.5" />
    </>
  ),
  // 불꽃
  elemental_attack: (
    <path d="M12 3c.6 3.6 5 5.4 5 10a5 5 0 0 1-10 0c0-2.7 1.6-4.2 2.4-6.2.9 1.5 1.6 2.2 2.6 2.4z" />
  ),
  // 조준선
  hit: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </>
  ),
  // 번개
  crit_chance: <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
  // 반짝임
  crit_multiplier: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  // 방패 + 금
  defense_rate: (
    <>
      <path d="M12 3l7 3v5c0 5-3.4 8.4-7 10-3.6-1.6-7-5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  // 바람
  evade: (
    <>
      <path d="M3 9h11a3 3 0 1 0-3-3" />
      <path d="M3 15h15a3 3 0 1 1-3 3" />
    </>
  ),
  // 초시계
  action_speed: (
    <>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 13V9.5M10 3h4" />
    </>
  ),
  // 눈
  sight: (
    <>
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
};

export function StatIcon({ id }: { id: string }) {
  return (
    <svg
      className="combat-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[id] ?? <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}
