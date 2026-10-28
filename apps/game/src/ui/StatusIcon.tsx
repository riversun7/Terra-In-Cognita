// 상태 아이콘 — 알림 상자·칸 오류·새 버전 배너의 문구 앞에 둔다. 색만으로 상태를 알리지 않는다(선명 테마 규칙,
// ADR 2026-10-28-design-system). 꾸밈이라 읽기 프로그램에는 숨긴다: 상태는 옆 글자와 role=alert·status가 알린다.
// 글자와 같은 색(currentColor)이고 크기는 styles.css의 .status-icon(--icon-sm)이다.
export type StatusTone = "error" | "success" | "info";

export function StatusIcon({ tone }: { tone: StatusTone }) {
  return (
    <svg
      className="status-icon"
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="10" cy="10" r="8.1" />
      {tone === "success" ? <path d="M6.3 10.2l2.6 2.6 4.8-5.1" strokeWidth={2} /> : null}
      {tone === "error" ? <path d="M10 5.7v5.1M10 14.2h.01" strokeWidth={2.2} /> : null}
      {tone === "info" ? <path d="M10 5.9h.01M10 9.1v5" strokeWidth={2.2} /> : null}
    </svg>
  );
}
