// 세계 배치 화면(/dev/world-layout) — 기획 D-528(사용자 원문 "개발자/관리자 페이지에서 행성에 고정npc 세력을 배치하는것. 수도는
// 발전도가 높은곳이나 적정한 곳을 npc가 설정하고 상황에 따라 바꿀 수있음"), docs/adr/2026-11-07-world-layout.md "바뀜 (D-528)".
// dev·admin, 틀 안, 촘촘(개발 화면 층 ADR 2026-11-02-dev-ui).
// - 위: 행성 평면 지도(WorldLayoutMap — 1차맵 타일 + 국가 도시·수도·놓은 자리·제안 표시). 누르면 고른 곳.
// - 판: 놓을 국가 고르기 → [여기에 놓기](tRPC worldLayout.place) · [놓은 자리 지우기](clear) · [자동 제안 보기](suggest) → [제안 모두 놓기].
// - 표: 국가마다 도시 수·수도(발전도)·자리 상태(자동·다음 시작 때 듦·적용됨·막힘 + 막는 것)·놓은 사람.
// 놓은 자리는 서버가 다음에 켤 때 세계에 든다(실행 중인 세계는 바꾸지 않는다). 390px에서는 지도 → 판 → 표가 한 칸씩 쌓인다.
// 조각 이름 WorldLayoutScreen-*([Ww]orldLayout).
import { decodeCellKey } from "@terra/planet";
import type {
  WorldLayoutPlanetView,
  WorldPlaceResult,
  WorldPlacementNationView,
} from "@terra/shared/worldPlacementApi";
import { useEffect, useMemo, useRef, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { apiErrorInfo } from "../../net/apiErrors.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { BackButton } from "../../shell/BackButton.tsx";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";
import { useMountFocus } from "../../ui/useMountFocus.ts";
import { cellAtLatLon } from "../planet/cellReport.ts";
import type { LatLon } from "../planet/flatMapRender.ts";
import { WorldLayoutMap } from "./WorldLayoutMap.tsx";
import { STATUS_TEXT, blockersText, placeFailText } from "./worldLayoutMessages.ts";
import { capitalCity, marksOf, nationStatus } from "./worldLayoutModel.ts";
import { type FlatPlanet, loadFlatPlanet } from "./worldLayoutPlanet.ts";
import "./worldLayout.css";

/** 세계 행성(시험 행성) */
const PLANET_ID = "s2_test_planet";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: WorldLayoutPlanetView }
  | { readonly status: "failed"; readonly notReady: boolean };

type PlanetLoad =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly planet: FlatPlanet }
  | { readonly status: "failed" };

function loadView(): Promise<Load> {
  return api.worldLayout.view.query({ planetId: PLANET_ID }).then(
    (data): Load => ({ status: "ready", data }),
    (error: unknown): Load => {
      const info = apiErrorInfo(error);
      if (info.sessionEnded) void refreshSession();
      return { status: "failed", notReady: info.code === "PRECONDITION_FAILED" };
    },
  );
}

export default function WorldLayoutScreen() {
  const locale = getLocale() === "en" ? "en" : "ko";
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [planet, setPlanet] = useState<PlanetLoad>({ status: "loading" });
  const [chosen, setChosen] = useState<string | null>(null);
  const [picked, setPicked] = useState<LatLon | null>(null);
  const [ideas, setIdeas] = useState<ReadonlyMap<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const notice = useLiveLines();
  const problem = useLiveLines();

  // 처음 한 번 읽는다(setState는 비동기 콜백 안이다). 지도 받기는 화면을 떠나면 멈춘다
  const first = useRef(true);
  useEffect(() => {
    const abort = new AbortController();
    if (first.current) {
      first.current = false;
      void loadView().then(setLoad);
    }
    loadFlatPlanet(PLANET_ID, abort.signal).then(
      (value) => setPlanet({ status: "ready", planet: value }),
      () => {
        if (!abort.signal.aborted) setPlanet({ status: "failed" });
      },
    );
    return () => abort.abort();
  }, []);

  const data = load.status === "ready" ? load.data : null;
  const nameOf = (nation: WorldPlacementNationView): string => nation.name?.[locale] ?? nation.code;
  const nations = data?.nations ?? [];
  const current = nations.find((nation) => nation.code === chosen) ?? nations[0];
  const marks = useMemo(
    () => (data ? marksOf(data.nations, ideas, (nation) => nation.name?.[locale] ?? nation.code) : []),
    [data, ideas, locale],
  );
  const pickedCell = picked && data ? cellAtLatLon(data.faceLevel, picked.latDeg, picked.lonDeg) : null;

  const reload = async (): Promise<void> => setLoad(await loadView());

  const report = (
    results: readonly WorldPlaceResult[],
    asked: ReadonlyMap<string, string>,
    gap: number,
  ): void => {
    const good: string[] = [];
    const bad: string[] = [];
    for (const result of results) {
      const nation = nations.find((entry) => entry.code === result.code);
      const label = nation ? nameOf(nation) : result.code;
      if (result.result !== "ok") {
        const near = nations.find((entry) => entry.code === result.near);
        bad.push(`${label}: ${placeFailText(result.result, near ? nameOf(near) : (result.near ?? ""), gap)}`);
      } else if (result.blocked.length > 0)
        bad.push(m.dev_world_layout_placed_blocked({ nation: label, reasons: blockersText(result.blocked) }));
      else if (result.mapKey !== asked.get(result.code))
        good.push(m.dev_world_layout_placed_snapped({ nation: label }));
      else good.push(m.dev_world_layout_placed({ nation: label }));
    }
    notice.show(good);
    problem.show(bad);
  };

  const run = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    notice.show([]);
    problem.show([]);
    try {
      await work();
    } catch (error) {
      const info = apiErrorInfo(error);
      if (info.sessionEnded) void refreshSession();
      problem.show([m.dev_world_layout_code_failed()]);
    }
    await reload();
    setBusy(false);
  };

  const place = (entries: readonly { code: string; mapKey: string }[]): Promise<void> =>
    run(async () => {
      const results = await api.worldLayout.place.mutate({ planetId: PLANET_ID, placements: [...entries] });
      report(results, new Map(entries.map((entry) => [entry.code, entry.mapKey])), data?.gapCells ?? 0);
      const placed = new Set(results.filter((result) => result.result === "ok").map((result) => result.code));
      setIdeas((old) => new Map([...old].filter(([code]) => !placed.has(code))));
    });

  const clear = (nation: WorldPlacementNationView): Promise<void> =>
    run(async () => {
      await api.worldLayout.clear.mutate({ planetId: PLANET_ID, code: nation.code });
      notice.show([m.dev_world_layout_cleared({ nation: nameOf(nation) })]);
    });

  const suggest = (): Promise<void> =>
    run(async () => {
      const result = await api.worldLayout.suggest.query({ planetId: PLANET_ID });
      setIdeas(new Map(result.homes.map((home) => [home.code, home.mapKey])));
      notice.show([
        result.homes.length === 0
          ? m.dev_world_layout_suggest_none()
          : m.dev_world_layout_suggest_shown({ count: result.homes.length }),
      ]);
    });

  return (
    <section
      className="screen screen-wide wl-screen"
      aria-labelledby="world-layout-title"
      data-density="compact"
      data-status={load.status}
      data-planet={planet.status}
      data-nations={data?.nations.length}
    >
      <div className="screen-header">
        <h1 id="world-layout-title" className="screen-title" tabIndex={-1} ref={headingRef}>
          {m.shell_route_dev_world_layout()}
        </h1>
        <BackButton />
      </div>
      <p className="lead wl-lead">{m.dev_world_layout_lead()}</p>
      {load.status === "loading" ? <p className="field-hint">{m.dev_world_layout_loading()}</p> : null}
      {load.status === "failed" ? (
        <div className="wl-actions">
          <p role="alert" className="field-error">
            {load.notReady ? m.dev_world_layout_not_ready() : m.dev_world_layout_failed()}
          </p>
          <button type="button" className="button-small" onClick={() => void reload()}>
            {m.dev_world_layout_reload()}
          </button>
        </div>
      ) : null}
      {data ? (
        <>
          <div className="wl-summary">
            <span className="dev-badge">
              {m.dev_world_layout_summary({
                nations: data.nations.length,
                placed: data.nations.filter((nation) => nation.placement !== null).length,
                gap: data.gapCells,
              })}
            </span>
            <span className="dev-muted">{data.planetId}</span>
            <button type="button" className="button-small" disabled={busy} onClick={() => void suggest()}>
              {m.dev_world_layout_suggest()}
            </button>
            <button type="button" className="button-small" disabled={busy} onClick={() => void reload()}>
              {m.dev_world_layout_reload()}
            </button>
          </div>
          <ul className="wl-legend">
            <li data-mark="city">{m.dev_world_layout_legend_city()}</li>
            <li data-mark="capital">{m.dev_world_layout_legend_capital()}</li>
            <li data-mark="placed">{m.dev_world_layout_legend_placed()}</li>
            <li data-mark="suggested">{m.dev_world_layout_legend_suggested()}</li>
          </ul>
          <div className="wl-split">
            <div className="wl-map-box">
              {planet.status === "ready" ? (
                <WorldLayoutMap planet={planet.planet} marks={marks} picked={picked} onPick={setPicked} />
              ) : (
                <p className={planet.status === "failed" ? "field-error" : "field-hint"}>
                  {planet.status === "failed"
                    ? m.dev_world_layout_map_failed()
                    : m.dev_world_layout_map_loading()}
                </p>
              )}
            </div>
            <div className="wl-panel">
              <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
              <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
              <label className="wl-field">
                <span>{m.dev_world_layout_nation()}</span>
                <select value={current?.code ?? ""} onChange={(event) => setChosen(event.target.value)}>
                  {data.nations.map((nation) => (
                    <option key={nation.code} value={nation.code}>
                      {nameOf(nation)}
                    </option>
                  ))}
                </select>
              </label>
              {pickedCell && picked ? (
                <p className="dev-code" data-cell={pickedCell.key}>
                  {m.dev_world_layout_point({
                    lat: picked.latDeg.toFixed(1),
                    lon: picked.lonDeg.toFixed(1),
                    cell: `${decodeCellKey(pickedCell.key).face}:${pickedCell.i},${pickedCell.j}`,
                  })}
                </p>
              ) : (
                <p className="field-hint">{m.dev_world_layout_pick()}</p>
              )}
              <div className="wl-actions">
                <button
                  type="button"
                  className="button-small button-primary"
                  disabled={busy || !current || !pickedCell}
                  onClick={() =>
                    current && pickedCell
                      ? void place([{ code: current.code, mapKey: String(pickedCell.key) }])
                      : undefined
                  }
                >
                  {m.dev_world_layout_place()}
                </button>
                <button
                  type="button"
                  className="button-small"
                  disabled={busy || !current?.placement}
                  onClick={() => (current ? void clear(current) : undefined)}
                >
                  {m.dev_world_layout_clear()}
                </button>
                {ideas.size > 0 ? (
                  <button
                    type="button"
                    className="button-small"
                    disabled={busy}
                    onClick={() => void place([...ideas].map(([code, mapKey]) => ({ code, mapKey })))}
                  >
                    {m.dev_world_layout_apply_suggest()}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="dev-table-wrap">
            <table className="dev-table wl-table">
              <thead>
                <tr>
                  <th scope="col">{m.dev_world_layout_col_nation()}</th>
                  <th scope="col">{m.dev_world_layout_col_cities()}</th>
                  <th scope="col">{m.dev_world_layout_col_capital()}</th>
                  <th scope="col">{m.dev_world_layout_col_status()}</th>
                </tr>
              </thead>
              <tbody>
                {data.nations.map((nation, index) => {
                  const capital = capitalCity(nation);
                  const status = nationStatus(nation);
                  const blocked = nation.placement?.blocked ?? [];
                  return (
                    <tr
                      key={nation.code}
                      data-nation-code={nation.code}
                      data-state={status}
                      aria-current={nation.code === current?.code ? "true" : undefined}
                    >
                      <th scope="row">
                        <span className="wl-swatch" data-nation={index % 6} aria-hidden="true" />
                        <button type="button" className="wl-pick" onClick={() => setChosen(nation.code)}>
                          {nameOf(nation)}
                        </button>
                      </th>
                      <td className="dev-num">{nation.cities.length}</td>
                      <td>
                        {capital
                          ? m.dev_world_layout_capital({
                              name: capital.name ?? m.dev_world_layout_city_unnamed({ id: capital.id }),
                              dev: capital.development,
                            })
                          : m.dev_world_layout_capital_none()}
                      </td>
                      <td>
                        <span className="dev-badge" data-tone={status}>
                          {STATUS_TEXT[status]()}
                        </span>
                        {nation.placement ? (
                          <span className="dev-muted wl-by">
                            {nation.placement.placedBy
                              ? m.dev_world_layout_placed_by({ who: nation.placement.placedBy })
                              : m.dev_world_layout_placed_by_unknown()}
                          </span>
                        ) : null}
                        {blocked.length > 0 ? (
                          <span className="wl-blocked">
                            {m.dev_world_layout_blocked_list({ reasons: blockersText(blocked) })}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
