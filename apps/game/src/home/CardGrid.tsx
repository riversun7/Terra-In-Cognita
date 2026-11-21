// 카드 격자 — 테라 인코그니타 비대칭 12열 커맨드 벤토(좌 5열 사이보그 도시에 · 우 7열 가로 3분할 재무 데스크 + 2×3 실시간 시세) + 하단 3열 작전 데크.
// DOM 순서 = 보이는 순서 = 초점 순서. grid-auto-flow: dense를 쓰지 않는다(ADR 2026-10-29-app-shell 6절).
// strip: 처리함 템플릿의 "아래 요약 카드 한 줄" — 가로로 넘기는 한 줄(화면 전체는 가로로 넘치지 않는다).
import { m } from "../paraglide/messages.js";
import { MarketTickerCard } from "./cards/MarketTickerCard.tsx";
import { HomeCard } from "./cards/registry.tsx";
import type { TemplateProps } from "./homeTypes.ts";

interface CardGridProps extends TemplateProps {
  readonly variant?: "grid" | "strip";
}

export function CardGrid({ cards, variant = "grid", ...view }: CardGridProps) {
  if (cards.length === 0) return null;
  if (variant === "strip") {
    return (
      <section className="home-strip-region" aria-label={m.home_strip_label()} tabIndex={0}>
        <ul className="home-strip">
          {cards.map((card) => (
            <li key={card.id} className="home-cell" data-size={card.size} data-card-id={card.id}>
              <HomeCard card={card} {...view} />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  // 기본 격자: 좌측 사이보그 텔레메트리(5열) + 우측 경제 요약(가로 3분할) & 실시간 시세 매트릭스(7열) 비대칭 커맨드 벤토
  const cyborgCard = cards.find((card) => card.id === "cyborg");
  const assetsCard = cards.find((card) => card.id === "assets");
  const showHeroBento = cyborgCard !== undefined || assetsCard !== undefined;
  const restCards = showHeroBento
    ? cards.filter((card) => card.id !== "cyborg" && card.id !== "assets")
    : cards;

  return (
    <div className="dash-deck-stack">
      {showHeroBento ? (
        <div
          className="dash-hero-bento"
          data-layout={
            cyborgCard !== undefined && assetsCard !== undefined
              ? "split"
              : cyborgCard !== undefined
                ? "cyborg-only"
                : "finance-only"
          }
        >
          {cyborgCard === undefined ? null : (
            <div className="dash-hero-primary">
              <HomeCard card={cyborgCard} {...view} />
            </div>
          )}
          {assetsCard === undefined ? null : (
            <div className="dash-hero-finance">
              <HomeCard card={assetsCard} {...view} />
              <MarketTickerCard />
            </div>
          )}
        </div>
      ) : null}
      {restCards.length > 0 ? (
        <ul className="home-grid">
          {restCards.map((card) => (
            <li key={card.id} className="home-cell" data-size={card.size} data-card-id={card.id}>
              <HomeCard card={card} {...view} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
