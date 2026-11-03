// 구인 카드 시험(/dev/recruit) — 기획 D-469(출생 없음, 인구는 정부기관(행정 건물) 구인 카드로만, NPC 세력도 같다), 49 N45,
// docs/adr/2026-10-31-faction-society-core.md "바뀜 (D-469 구인 카드)". dev·admin, 틀 안, 촘촘(개발 화면 층).
// 행정 건물 화면(어느 도시에서·어떤 건물을 눌러 고용하는지, 행정 건물 레벨 올리기)은 UX가 정해지지 않았다. 그때까지 이 화면이
// 같은 서버 명령을 쓴다: tRPC recruit.board(도시·카드·잔고) → WebSocket recruit_hire(프로토콜 7).
// - 위: 구인 도시 표(.dev-table: 도시·주인 세력·행정 건물 Lv·휴먼/주거). 고르면 그 도시 카드를 다시 받는다(?city=<ID>).
// - 가운데: 내 카드(고용 주체 = 나). 카드마다 토탈·스탯 묶음 막대·속성·값과 [고용]. 390px에서는 한 줄에 하나, 넓으면 여럿.
// - 아래: 도시 주인(NPC 세력)이 같은 창에 보는 카드(dev·admin, 산 칸 표시) — NPC 구인 규칙식이 무엇을 샀는지 본다.
// 조각 이름 RecruitLabScreen-*([Rr]ecruitLab).
import type { RecruitResultCode } from "@terra/protocol";
import type { RecruitBoardResponse, RecruitCardView } from "@terra/shared/recruit";
import { useEffect, useRef, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { field } from "../../net/json.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { BackButton } from "../../shell/BackButton.tsx";
import { navigate } from "../../shell/routerStore.ts";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { sendRecruitHire } from "./recruitCommands.ts";
import { RECRUIT_STAT_PAIRS, activeElements, hireState, refreshLeft, statShare } from "./recruitModel.ts";
import "./recruitLab.css";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly board: RecruitBoardResponse }
  | { readonly status: "failed"; readonly message: string };

const STAT_CODE = {
  str: m.roster_stat_str_code,
  vit: m.roster_stat_vit_code,
  int: m.roster_stat_int_code,
  wis: m.roster_stat_wis_code,
  dex: m.roster_stat_dex_code,
  agi: m.roster_stat_agi_code,
} as const;

const ELEMENT_NAME = {
  water: m.cyborg_element_water,
  fire: m.cyborg_element_fire,
  wind: m.cyborg_element_wind,
  earth: m.cyborg_element_earth,
} as const;

const RESULT_TEXT: Readonly<Record<RecruitResultCode | "offline" | "timeout", () => string>> = {
  sign_in_required: m.dev_recruit_err_sign_in,
  busy: m.dev_recruit_err_busy,
  rate_limited: m.dev_recruit_err_rate_limited,
  no_cyborg: m.dev_recruit_err_no_cyborg,
  unknown_city: m.dev_recruit_err_unknown_city,
  cards_changed: m.dev_recruit_err_cards_changed,
  taken: m.dev_recruit_err_taken,
  insufficient_funds: m.dev_recruit_err_funds,
  no_room: m.dev_recruit_err_no_room,
  internal_error: m.dev_recruit_err_internal,
  offline: m.dev_recruit_err_offline,
  timeout: m.dev_recruit_err_timeout,
};

/** 조회 실패 문구: 런타임이 꺼져 있거나 부팅 중(PRECONDITION_FAILED)은 따로 알린다 */
function loadError(error: unknown): string {
  const code = field(field(error, "data"), "code");
  if (code === "UNAUTHORIZED") {
    void refreshSession();
    return m.auth_notice_session_ended();
  }
  if (code === "PRECONDITION_FAILED") return m.dev_recruit_not_ready();
  return m.dev_recruit_load_failed();
}

const parseCity = (value: string | undefined): number | undefined => {
  const id = value === undefined ? Number.NaN : Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
};

function CardStats({ card }: { card: RecruitCardView }) {
  return (
    <div className="rl-stats">
      {RECRUIT_STAT_PAIRS.map((pair) => (
        <div key={pair.join("-")} className="rl-stat-pair">
          {pair.map((stat) => (
            <div key={stat} className="rl-stat" data-stat={stat}>
              <span className="rl-stat-code">{STAT_CODE[stat]()}</span>
              <span className="rl-stat-bar" aria-hidden="true">
                <span className="rl-stat-fill" style={{ inlineSize: `${statShare(card, stat)}%` }} />
              </span>
              <span className="dev-num">{card.stats[stat]}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function elementText(card: RecruitCardView): string {
  return activeElements(card)
    .map((entry) => m.dev_recruit_element({ name: ELEMENT_NAME[entry.element](), value: entry.value }))
    .join(" · ");
}

export default function RecruitLabScreen({ initialCity }: { initialCity?: string | undefined }) {
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const locale = getLocale() === "en" ? "en" : "ko";
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const notice = useLiveLines();
  const problem = useLiveLines();
  const requested = useRef<number | undefined>(parseCity(initialCity));

  const fetchBoard = (cityId: number | undefined): Promise<void> =>
    api.recruit.board.query(cityId === undefined ? undefined : { cityId }).then(
      (board) => setLoad({ status: "ready", board }),
      (error: unknown) => setLoad({ status: "failed", message: loadError(error) }),
    );

  // 처음 한 번 받는다(받은 뒤 setLoad는 비동기 콜백 안이다)
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    const cityId = requested.current;
    void api.recruit.board.query(cityId === undefined ? undefined : { cityId }).then(
      (board) => setLoad({ status: "ready", board }),
      (error: unknown) => setLoad({ status: "failed", message: loadError(error) }),
    );
  }, []);

  const board = load.status === "ready" ? load.board : null;

  const choose = (cityId: number): void => {
    requested.current = cityId;
    navigate({ route: "dev_recruit", search: { city: String(cityId) } }, { replace: true });
    notice.clear();
    problem.clear();
    void fetchBoard(cityId);
  };

  const hire = async (card: RecruitCardView): Promise<void> => {
    if (!board || board.cityId === null || busySlot !== null) return;
    setBusySlot(card.slot);
    problem.clear();
    try {
      const outcome = await sendRecruitHire({
        cityId: board.cityId,
        window: board.window,
        slot: card.slot,
        cost: card.cost,
      });
      if (outcome.ok) notice.show([m.dev_recruit_hired({ unit: outcome.unitId, total: card.total })]);
      else problem.show([RESULT_TEXT[outcome.code]()]);
      await fetchBoard(board.cityId);
    } finally {
      setBusySlot(null);
    }
  };

  const money = (value: string): string => new Intl.NumberFormat(locale).format(BigInt(value));
  const left = board ? refreshLeft(board.endsAtMs, board.generatedAt) : null;

  return (
    <section
      className="screen screen-wide rl-screen"
      aria-labelledby="recruit-title"
      data-density="compact"
      data-status={load.status}
    >
      <div className="screen-header">
        <h1 id="recruit-title" className="screen-title" tabIndex={-1} ref={headingRef}>
          {m.shell_route_dev_recruit()}
        </h1>
        <BackButton />
      </div>
      <p className="lead rl-lead">{m.dev_recruit_lead()}</p>
      <p className="field-hint rl-gap">{m.dev_recruit_ux_gap()}</p>
      {load.status === "loading" ? <p className="field-hint">{m.dev_recruit_loading()}</p> : null}
      {load.status === "failed" ? (
        <div className="rl-actions">
          <p role="alert" className="field-error">
            {load.message}
          </p>
          <button type="button" className="button-small" onClick={() => void fetchBoard(requested.current)}>
            {m.dev_recruit_retry()}
          </button>
        </div>
      ) : null}
      <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
      <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
      {board ? (
        <>
          <section className="rl-panel" aria-labelledby="recruit-cities">
            <h2 id="recruit-cities" className="rl-heading">
              {m.dev_recruit_cities({ count: board.cities.length })}
            </h2>
            {board.cities.length === 0 ? (
              <p className="field-hint">{m.dev_recruit_no_cities()}</p>
            ) : (
              <div className="dev-table-wrap">
                <table className="dev-table rl-cities">
                  <thead>
                    <tr>
                      <th scope="col">{m.dev_recruit_col_city()}</th>
                      <th scope="col">{m.dev_recruit_col_faction()}</th>
                      <th scope="col">{m.dev_recruit_col_level()}</th>
                      <th scope="col">{m.dev_recruit_col_people()}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.cities.map((city) => (
                      <tr key={city.id} aria-selected={city.id === board.cityId}>
                        <td>
                          <button
                            type="button"
                            className="button-text rl-city"
                            aria-pressed={city.id === board.cityId}
                            onClick={() => choose(city.id)}
                          >
                            {m.dev_recruit_city({ id: city.id })}
                          </button>
                          {city.start ? <span className="dev-badge">{m.dev_recruit_start()}</span> : null}
                        </td>
                        <td className="dev-code">{city.factionCode ?? "—"}</td>
                        <td className="dev-num">{m.dev_recruit_level({ level: city.adminLevel })}</td>
                        <td className="dev-num">
                          {m.dev_recruit_people({ people: city.population, housing: city.housing })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {board.cityId === null ? null : (
            <>
              <div className="rl-summary">
                <span className="dev-badge">{m.dev_recruit_city({ id: board.cityId })}</span>
                <span className="dev-badge">{m.dev_recruit_level({ level: board.level })}</span>
                <span className="dev-muted">
                  {m.dev_recruit_window({
                    window: board.window,
                    hours: left?.hours ?? 0,
                    minutes: left?.minutes ?? 0,
                  })}
                </span>
                <span className="rl-balance">{m.dev_recruit_balance({ amount: money(board.balance) })}</span>
              </div>
              {board.hasCyborg ? null : <p className="field-hint">{m.dev_recruit_need_cyborg()}</p>}

              <section className="rl-panel" aria-labelledby="recruit-mine">
                <h2 id="recruit-mine" className="rl-heading">
                  {m.dev_recruit_mine({ count: board.cards.length })}
                </h2>
                <ul className="rl-cards">
                  {board.cards.map((card) => {
                    const state = hireState(card, board.balance, board.hasCyborg);
                    return (
                      <li key={card.slot} className="rl-card" data-state={state}>
                        <div className="rl-card-head">
                          <span className="rl-total">{m.dev_recruit_total({ total: card.total })}</span>
                          <span className="dev-muted">{m.dev_recruit_slot({ slot: card.slot + 1 })}</span>
                        </div>
                        <CardStats card={card} />
                        <p className="rl-elements">{elementText(card)}</p>
                        <div className="rl-card-foot">
                          <span className="rl-cost">{m.dev_recruit_cost({ amount: money(card.cost) })}</span>
                          <button
                            type="button"
                            className="button-small button-primary"
                            disabled={state !== "ready" || busySlot !== null}
                            aria-busy={busySlot === card.slot}
                            onClick={() => void hire(card)}
                          >
                            {state === "taken" ? m.dev_recruit_taken() : m.dev_recruit_hire()}
                          </button>
                        </div>
                        {state === "funds" ? <p className="field-hint">{m.dev_recruit_err_funds()}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              </section>

              {board.owner ? (
                <section className="rl-panel" aria-labelledby="recruit-owner">
                  <h2 id="recruit-owner" className="rl-heading">
                    {m.dev_recruit_owner({ count: board.owner.cards.length })}
                  </h2>
                  <p className="field-hint">{m.dev_recruit_owner_hint()}</p>
                  <div className="dev-table-wrap">
                    <table className="dev-table rl-owner">
                      <thead>
                        <tr>
                          <th scope="col">{m.dev_recruit_col_slot()}</th>
                          <th scope="col">{m.dev_recruit_col_total()}</th>
                          <th scope="col">{m.dev_recruit_col_stats()}</th>
                          <th scope="col">{m.dev_recruit_col_elements()}</th>
                          <th scope="col">{m.dev_recruit_col_cost()}</th>
                          <th scope="col">{m.dev_recruit_col_state()}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {board.owner.cards.map((card) => (
                          <tr key={card.slot}>
                            <td className="dev-num">{card.slot + 1}</td>
                            <td className="dev-num">{card.total}</td>
                            <td className="dev-code">
                              {RECRUIT_STAT_PAIRS.flat()
                                .map((stat) => `${STAT_CODE[stat]()} ${card.stats[stat]}`)
                                .join(" · ")}
                            </td>
                            <td>{elementText(card)}</td>
                            <td className="dev-num">{money(card.cost)}</td>
                            <td>{card.taken ? m.dev_recruit_taken() : m.dev_recruit_open()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
