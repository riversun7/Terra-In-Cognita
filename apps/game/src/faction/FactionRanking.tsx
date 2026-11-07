// 세력 화면 옆 판의 세력 순위 칸 — 내 세력의 순위·백분위 등급·점수·규모·세력 명성(정원사 2, 쌓은 적 없으면 "아직 없음")과 순위표 링크.
// 랭킹은 따로 메뉴가 아니라 세력 화면 안에 둔다(D-6010). 자료는 ranking.mine(세력 화면 조회와 따로, 실패해도 세력 화면은 그대로).
// docs/adr/2026-11-07-ranking.md
import type { RankingMineResponse } from "@terra/shared/ranking";
import { formatCount } from "../home/numbers.ts";
import { m } from "../paraglide/messages.js";
import { loadRankingMine } from "../ranking/rankingQueries.ts";
import { nameText, rankChange, rankChangeText, tierText } from "../ranking/rankingText.ts";
import { PreviewTag, StateChip } from "../sections/screenParts.tsx";
import { useScreenQuery } from "../sections/useScreenQuery.ts";
import { AppLink } from "../shell/AppLink.tsx";

function Standing({ faction }: { faction: NonNullable<RankingMineResponse["faction"]> }) {
  const standing = faction.standing;
  if (standing === null) return <p className="faction-muted">{m.faction_ranking_none()}</p>;
  const detail = faction.detail;
  return (
    <>
      <p className="faction-ranking-rank">
        {m.ranking_rank_of({ rank: formatCount(standing.rank), total: formatCount(standing.total) })}
      </p>
      <p className="faction-chips">
        <StateChip tone={standing.tierPm === null ? "plain" : "good"} label={tierText(standing.tierPm)} />
        {standing.top ? <StateChip tone="warn" label={m.ranking_top()} /> : null}
        <StateChip tone="plain" label={rankChangeText(rankChange(standing.rank, standing.prevRank))} />
      </p>
      <p className="faction-muted">
        {[
          m.ranking_score({ score: formatCount(standing.score) }),
          ...(detail === null
            ? []
            : [
                m.ranking_faction_size({
                  cities: formatCount(detail.cities),
                  humans: formatCount(detail.humans),
                }),
                detail.renown === null
                  ? m.ranking_renown_none()
                  : m.ranking_renown({ renown: formatCount(detail.renown) }),
              ]),
        ].join(" · ")}
      </p>
    </>
  );
}

export function FactionRanking() {
  const { state } = useScreenQuery(loadRankingMine);
  const view = state.data;
  // 세력이 없거나(개인) 아직 못 받았으면 칸을 그리지 않는다(세력 화면 본문이 먼저다)
  if (view === null || view.faction === null) return null;
  return (
    <section className="panel faction-ranking" aria-labelledby="faction-ranking-title">
      <div className="screen-section-head">
        <h2 id="faction-ranking-title" className="screen-section-title">
          {m.faction_ranking_title()}
        </h2>
        {view.preview ? <PreviewTag /> : null}
      </div>
      <p className="faction-muted" translate="no">
        {nameText(view.faction.name)}
      </p>
      <Standing faction={view.faction} />
      <AppLink className="faction-ranking-link" to={{ route: "faction_ranking" }}>
        {m.faction_ranking_open()}
      </AppLink>
    </section>
  );
}
