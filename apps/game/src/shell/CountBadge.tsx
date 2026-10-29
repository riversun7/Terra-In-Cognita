// 숫자 배지(종·메뉴 항목) — 꾸밈이다. 수는 감싸는 단추·링크의 이름("알림 3개")이 읽는다(ADR 2026-10-29-app-shell 10절).
// 0이면 그리지 않는다. 100 이상은 "99+"로 줄인다. 색은 대비 검사를 받는 위험 상태색 쌍(--color-danger / --color-danger-surface)이다.

/** 배지에 그대로 쓰는 가장 큰 수. 넘으면 "99+" */
export const BADGE_MAX = 99;

export function badgeText(count: number): string {
  return count > BADGE_MAX ? `${BADGE_MAX}+` : String(count);
}

export function CountBadge({ count }: { count: number }) {
  if (!(count > 0)) return null;
  return (
    <span className="count-badge" aria-hidden="true">
      {badgeText(Math.floor(count))}
    </span>
  );
}
