// 카드 격자 — 상단 3열 프로 커맨드 데크(내 사이보그 · 경제 요약/자산 · 실시간 시장 시세) + 하단 운영 카드 격자.
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
            <li key={card.id} className="home-cell" data-size={card.size}>
              <HomeCard card={card} {...view} />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  // 기본 격자: 내 사이보그 · 자산(경제 요약)이 있으면 상단 3열 프로 커맨드 데크로 시장 시세 카드와 함께 배치한다
  const cyborgCard = cards.find((card) => card.id === "cyborg");
  const assetsCard = cards.find((card) => card.id === "assets");
  const showHeroDeck = cyborgCard !== undefined || assetsCard !== undefined;
  const restCards = showHeroDeck
    ? cards.filter((card) => card.id !== "cyborg" && card.id !== "assets")
    : cards;

  return (
    <div className="dash-deck-stack">
      {showHeroDeck ? (
        <ul className="dash-hero-deck">
          {cyborgCard === undefined ? null : (
            <li key={cyborgCard.id} className="home-cell dash-hero-cell">
              <HomeCard card={cyborgCard} {...view} />
            </li>
          )}
          {assetsCard === undefined ? null : (
            <li key={assetsCard.id} className="home-cell dash-hero-cell">
              <HomeCard card={assetsCard} {...view} />
            </li>
          )}
          {assetsCard === undefined ? null : (
            <li key="market" className="home-cell dash-hero-cell">
              <MarketTickerCard />
            </li>
          )}
        </ul>
      ) : null}
      {restCards.length > 0 ? (
        <ul className="home-grid">
          {restCards.map((card) => (
            <li key={card.id} className="home-cell" data-size={card.size}>
              <HomeCard card={card} {...view} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
