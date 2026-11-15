// 돈 표시 — 사용자 지적 2026-11-15 "화폐단위가 너무 많으므로 화폐를 상징하는 골드코인같은 아이콘을 화폐앞에 붙여 표시하며 폰트나 색상도 구별되게하라".
// 동전 아이콘 + 금색 굵은 숫자(고정폭 숫자) + 작은 화폐 이름. 색·크기는 money.css 토큰. 동전은 꾸밈이라 읽기 프로그램에는 숨긴다(숫자·이름이 읽힌다).
// 여러 화폐 합(추정 가치 등)은 MoneyList로 화폐마다 한 덩어리씩 이어 놓는다.
import "./money.css";

/** 동전(금색 원 + 안쪽 고리) */
function Coin() {
  return (
    <svg className="money-coin" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle className="money-coin-face" cx="8" cy="8" r="7" />
      <circle className="money-coin-ring" cx="8" cy="8" r="4.2" />
    </svg>
  );
}

export function Money({
  amount,
  unit,
  size = "md",
  className,
}: {
  /** 이미 자리 쉼표를 넣은 금액 글 */
  readonly amount: string;
  /** 화폐 이름(없으면 숫자만) */
  readonly unit?: string | null | undefined;
  readonly size?: "sm" | "md" | "lg";
  readonly className?: string | undefined;
}) {
  return (
    <span className={className ? `money ${className}` : "money"} data-size={size}>
      <Coin />
      <span className="money-amount">{amount}</span>
      {unit ? (
        <>
          {" "}
          <span className="money-unit">{unit}</span>
        </>
      ) : null}
    </span>
  );
}

/** 화폐 여러 개(화폐마다 Money 하나, 가운뎃점 없이 줄바꿈 되는 묶음) */
export function MoneyList({
  items,
  size = "md",
}: {
  readonly items: readonly { readonly key: string; readonly amount: string; readonly unit: string }[];
  readonly size?: "sm" | "md" | "lg";
}) {
  return (
    <span className="money-list">
      {items.map((item, index) => (
        <span key={item.key}>
          {index > 0 ? " " : null}
          <Money amount={item.amount} unit={item.unit} size={size} />
        </span>
      ))}
    </span>
  );
}
