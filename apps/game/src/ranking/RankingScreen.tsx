// 랭킹 화면(/cyborg/ranking·/faction/ranking) — 경로별 랭킹(D-040·D-041 백분위 등급)과 세력 순위. 메뉴 항목이 아니라 사이보그·세력 화면
// 안에서 연다(D-6010). 지연 로딩 조각이다(default export, shell/routeViews.tsx). docs/adr/2026-11-07-ranking.md.
// - 자료: ranking.board 하나(판마다 다시 받는다 — 판 주소가 바뀌면 key로 새로 그린다). 셈은 서버 집계(하루 한 번 [임시]).
// - 배치(모바일 우선): 판 고르기 → 재는 것 → 내 자리 → 등급 문턱 → 순위(위 50줄, 내 줄이 밖이면 끝에 한 줄 더) → 집계 안내.
// - 안 연 경로는 "곧 열림"(D-392). 시간제 버프는 빼고 센다는 안내(D-7022). 세력 명성은 정원사 2 값, 유저 명성은 칸만(값 없음 — 확인 대기).
import type { RouteMatch } from "@terra/shared";
import type { RankingBoardRequest, RankingBoardResponse, RankingRow } from "@terra/shared/ranking";
import { useId, useState } from "react";
import { formatCount } from "../home/numbers.ts";
import { m } from "../paraglide/messages.js";
import { BackButton } from "../shell/BackButton.tsx";
import { navigate } from "../shell/routerStore.ts";
import {
  PreviewNotice,
  PreviewSwitch,
  PreviewTag,
  QueryFailure,
  StateChip,
} from "../sections/screenParts.tsx";
import { dateText, relativeText } from "../sections/screenText.ts";
import { useScreenQuery } from "../sections/useScreenQuery.ts";
import { loadRankingBoard } from "./rankingQueries.ts";
import {
  AREA_NAMES,
  KIND_NAMES,
  MEASURE_NAMES,
  boardFromValue,
  boardRequestOf,
  boardTarget,
  boardValue,
  nameText,
  pathsByArea,
  rankChange,
  rankChangeText,
  tierPercent,
  tierText,
} from "./rankingText.ts";
import "../sections/screenParts.css";
import "./ranking.css";

/** 순위 변화 표(▲·▼는 그림이고 뜻은 글자로) */
function Change({ row }: { row: Pick<RankingRow, "rank" | "prevRank"> }) {
  const change = rankChange(row.rank, row.prevRank);
  const mark = change.kind === "up" ? "▲" : change.kind === "down" ? "▼" : change.kind === "new" ? "✦" : "–";
  return (
    <span className="ranking-change" data-kind={change.kind}>
      <span aria-hidden="true">{mark}</span>
      <span>{rankChangeText(change)}</span>
    </span>
  );
}

/** 판 고르기: 세력 판 + 영역마다 묶은 경로(안 연 경로는 "곧 열림"을 붙이되 고를 수 있다 — 고르면 곧 열림 안내) */
function BoardPicker({ view }: { view: RankingBoardResponse }) {
  const id = useId();
  const board = view.board;
  const known = board.kind === "faction" || view.paths.some((path) => path.id === board.path);
  return (
    <div className="ranking-picker">
      <label className="field-label" htmlFor={id}>
        {m.ranking_board_label()}
      </label>
      <select
        id={id}
        value={boardValue(board)}
        onChange={(event) => {
          const next = boardFromValue(event.currentTarget.value);
          if (next) navigate(boardTarget(next), { replace: true });
        }}
      >
        <optgroup label={m.ranking_group_faction()}>
          <option value="faction:">{m.ranking_board_faction()}</option>
        </optgroup>
        {pathsByArea(view.paths).map((group) => (
          <optgroup key={group.area} label={AREA_NAMES[group.area]()}>
            {group.paths.map((path) => (
              <option key={path.id} value={`path:${path.id}`}>
                {path.open ? nameText(path.name) : m.ranking_soon_option({ name: nameText(path.name) })}
              </option>
            ))}
          </optgroup>
        ))}
        {known ? null : <option value={boardValue(board)}>{m.ranking_unknown()}</option>}
      </select>
    </div>
  );
}

/** 이 판이 재는 것 */
function Measures({ view }: { view: RankingBoardResponse }) {
  const board = view.board;
  const text =
    board.kind === "faction"
      ? m.ranking_faction_measures()
      : (view.paths
          .find((path) => path.id === board.path)
          ?.measures.map((item) => MEASURE_NAMES[item.measure]())
          .join(" · ") ?? "");
  if (text === "") return null;
  return (
    <p className="ranking-measures">
      <span className="ranking-measures-label">{m.ranking_measures_title()}</span> {text}
    </p>
  );
}

/** 세력 줄 덧붙임 글: 규모·명성(정원사 명성 전에는 "아직 없음") */
function factionSizeTexts(row: RankingRow): string[] {
  if (row.detail === null) return [];
  return [
    m.ranking_faction_size({
      cities: formatCount(row.detail.cities),
      humans: formatCount(row.detail.humans),
    }),
    row.detail.renown === null
      ? m.ranking_renown_none()
      : m.ranking_renown({ renown: formatCount(row.detail.renown) }),
  ];
}

/** 내 자리 판 */
function MyStanding({ view }: { view: RankingBoardResponse }) {
  const me = view.me;
  const faction = view.board.kind === "faction";
  return (
    <section className="panel ranking-me" aria-labelledby="ranking-me-title">
      <h2 id="ranking-me-title" className="screen-section-title">
        {faction ? m.ranking_me_faction_title() : m.ranking_me_title()}
      </h2>
      {me === null ? (
        <p className="ranking-muted">{faction ? m.ranking_me_no_faction() : m.ranking_me_none()}</p>
      ) : (
        <>
          {faction ? (
            <p className="ranking-me-name" translate="no">
              {nameText(me.name)}
            </p>
          ) : null}
          <p className="ranking-me-rank">
            {m.ranking_rank_of({ rank: formatCount(me.rank), total: formatCount(view.total) })}
          </p>
          <p className="ranking-chips">
            <StateChip tone={me.tierPm === null ? "plain" : "good"} label={tierText(me.tierPm)} />
            {me.top ? <StateChip tone="warn" label={m.ranking_top()} /> : null}
            <Change row={me} />
          </p>
          <p className="ranking-me-score">
            {[m.ranking_score({ score: formatCount(me.score) }), ...factionSizeTexts(me)].join(" · ")}
          </p>
        </>
      )}
      {faction ? null : (
        <p className="ranking-muted ranking-renown">
          {view.renown === null
            ? m.ranking_renown_none()
            : m.ranking_renown({ renown: formatCount(view.renown) })}
        </p>
      )}
    </section>
  );
}

function TierCuts({ view }: { view: RankingBoardResponse }) {
  return (
    <section className="ranking-tiers" aria-labelledby="ranking-tiers-title">
      <h2 id="ranking-tiers-title" className="ranking-subtitle">
        {m.ranking_tiers_title()}
      </h2>
      <ul className="ranking-tier-list">
        {view.tiers.map((cut) => (
          <li key={cut.tierPm} className="ranking-tier-cut" data-empty={cut.minScore === null || undefined}>
            {cut.minScore === null
              ? m.ranking_tier_cut_none({ percent: tierPercent(cut.tierPm) })
              : m.ranking_tier_cut({ percent: tierPercent(cut.tierPm), score: formatCount(cut.minScore) })}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ row }: { row: RankingRow }) {
  return (
    <li className="ranking-row" data-me={row.me || undefined} data-top={row.top || undefined}>
      <span className="ranking-rank">{formatCount(row.rank)}</span>
      <span className="ranking-who">
        <span className="ranking-name" translate="no">
          {nameText(row.name)}
        </span>
        <span className="ranking-meta">
          {row.me ? <StateChip tone="good" label={m.ranking_me_tag()} /> : null}
          {row.kind === "user" ? null : <StateChip tone="plain" label={KIND_NAMES[row.kind]()} />}
          {row.faction === null ? null : <span translate="no">{nameText(row.faction)}</span>}
          {factionSizeTexts(row).map((text) => (
            <span key={text}>{text}</span>
          ))}
          {row.preview === true ? <PreviewTag /> : null}
        </span>
      </span>
      <span className="ranking-side">
        <span className="ranking-score">{formatCount(row.score)}</span>
        <span className="ranking-tier" data-tier={row.tierPm === null ? undefined : "in"}>
          {tierText(row.tierPm)}
        </span>
        <Change row={row} />
      </span>
    </li>
  );
}

function Leaderboard({ view }: { view: RankingBoardResponse }) {
  const me = view.me;
  const meOutside = me !== null && !view.rows.some((row) => row.me);
  return (
    <section className="ranking-board" aria-labelledby="ranking-list-title">
      <div className="screen-section-head">
        <h2 id="ranking-list-title" className="screen-section-title">
          {m.ranking_list_title()}
        </h2>
        <span className="ranking-muted">{m.ranking_list_count({ total: formatCount(view.total) })}</span>
      </div>
      {view.rows.length === 0 ? (
        <p className="ranking-muted">{m.ranking_empty()}</p>
      ) : (
        <ol className="ranking-list">
          {view.rows.map((row) => (
            <Row key={`${row.rank}-${nameText(row.name)}-${row.me}`} row={row} />
          ))}
          {meOutside ? (
            <>
              <li className="ranking-gap" aria-hidden="true">
                {m.ranking_list_gap()}
              </li>
              <Row row={me} />
            </>
          ) : null}
        </ol>
      )}
    </section>
  );
}

/** 집계 시각·규칙 안내 */
function Notes({ view }: { view: RankingBoardResponse }) {
  const snapshot = view.snapshot;
  return (
    <footer className="ranking-notes">
      {snapshot === null ? (
        <p>{m.ranking_pending()}</p>
      ) : (
        <>
          <p>
            {m.ranking_snapshot({
              at: dateText(snapshot.computedAtMs),
              next: relativeText(snapshot.nextAtMs, view.generatedAt),
            })}
          </p>
          <p>{m.ranking_rules_note({ decay: formatCount(snapshot.decayPm / 10) })}</p>
        </>
      )}
      {view.board.kind === "faction" ? <p>{m.ranking_renown_note()}</p> : null}
    </footer>
  );
}

function BoardBody({ view }: { view: RankingBoardResponse }) {
  if (view.status === "closed") return <p className="panel ranking-soon">{m.ranking_closed()}</p>;
  if (view.status === "unknown") return <p className="panel ranking-soon">{m.ranking_unknown()}</p>;
  return (
    <>
      <Measures view={view} />
      <div className="ranking-layout">
        <div className="ranking-aside">
          <MyStanding view={view} />
          <TierCuts view={view} />
        </div>
        <Leaderboard view={view} />
      </div>
      <Notes view={view} />
    </>
  );
}

/** 판 하나(판 주소가 바뀌면 key로 새로 만든다 — 저장소는 마운트 때 한 번) */
function BoardView({ request }: { request: RankingBoardRequest }) {
  const [load] = useState(() => (preview: boolean) => loadRankingBoard(request, preview));
  const { state, refresh } = useScreenQuery(load);
  const view = state.data;
  return (
    <>
      {view?.preview === true ? <PreviewNotice message={m.ranking_preview_notice()} /> : null}
      <QueryFailure
        error={state.status === "failed" ? state.error : null}
        title={m.ranking_load_failed()}
        onRetry={refresh}
      />
      {view === null ? (
        state.status === "failed" ? null : (
          <p className="status" role="status">
            {m.ranking_loading()}
          </p>
        )
      ) : (
        <>
          <BoardPicker view={view} />
          <BoardBody view={view} />
        </>
      )}
    </>
  );
}

export default function RankingScreen({ match }: { match: RouteMatch }) {
  const request = boardRequestOf(match);
  return (
    <section className="screen screen-wide ranking" aria-labelledby="ranking-title">
      <div className="screen-header">
        <h1 id="ranking-title" className="screen-title" tabIndex={-1}>
          {m.ranking_title()}
        </h1>
        <BackButton />
      </div>
      <PreviewSwitch />
      <BoardView key={JSON.stringify(request)} request={request} />
    </section>
  );
}
