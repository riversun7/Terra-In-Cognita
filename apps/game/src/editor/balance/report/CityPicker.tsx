// 실제 세계 도시 고르기(기획 D-543·D-545 1383) — 이름·ID로 찾는 목록(서버 battleReport.cities, 읽기만). 고른 도시는 폼 city.cityId와 보이는
// 이름(cityLabel). 2차맵이 내려간 도시는 고를 수 없다(배치를 읽을 수 없다). 행정 건물이 없는 도시는 열린 맵으로 돈다(서버 정원사와 같다).
// 시험용: .rp-city(data-status loading·ready·unavailable·failed), .rp-city-item(data-city-id, aria-selected).
import type { ReportCityListItem } from "@terra/shared/battleReportCity";
import { useEffect, useId, useState } from "react";
import { refreshSession } from "../../../auth/session.ts";
import { api } from "../../../net/api.ts";
import { m } from "../../../paraglide/messages.js";
import { cityName, reasonText } from "./reportMessages.ts";
import { type ReportErrorKey, reportErrorOf } from "./reportModel.ts";

/** 찾기 글을 고친 뒤 묻기까지(ms) */
const SEARCH_DELAY_MS = 250;

type ListState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly cities: readonly ReportCityListItem[] }
  | { readonly status: "unavailable" }
  | { readonly status: "failed"; readonly key: ReportErrorKey };

export function CityPicker(props: {
  readonly cityId: number | undefined;
  readonly label: string;
  readonly onPick: (city: ReportCityListItem) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [list, setList] = useState<ListState>({ status: "loading" });

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      api.battleReport.cities.query({ query: query.trim() || undefined }).then(
        (answer) => {
          if (!live) return;
          setList(answer.available ? { status: "ready", cities: answer.cities } : { status: "unavailable" });
        },
        (error: unknown) => {
          if (!live) return;
          const info = reportErrorOf(error);
          if (info.sessionEnded) void refreshSession();
          setList({ status: "failed", key: info.key });
        },
      );
    }, SEARCH_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="field rp-wide rp-city" data-status={list.status}>
      <label className="field-label" htmlFor={`${id}-search`}>
        {m.dev_report_city_search()}
      </label>
      <input
        id={`${id}-search`}
        className="rp-city-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <p className="field-hint rp-city-picked" aria-live="polite">
        {props.cityId === undefined
          ? m.dev_report_city_not_selected()
          : m.dev_report_city_selected({ name: props.label || cityName(null, props.cityId) })}
      </p>
      {list.status === "unavailable" ? (
        <p className="field-hint">{m.dev_report_city_unavailable()}</p>
      ) : list.status === "failed" ? (
        <p className="field-error">{reasonText(list.key)}</p>
      ) : list.status === "ready" && list.cities.length === 0 ? (
        <p className="field-hint">{m.dev_report_city_none()}</p>
      ) : list.status === "ready" ? (
        <ul className="rp-city-list" aria-label={m.dev_report_city_list()}>
          {list.cities.map((city) => {
            const picked = city.id === props.cityId;
            return (
              <li key={city.id}>
                <button
                  type="button"
                  className="rp-city-item"
                  data-city-id={city.id}
                  aria-pressed={picked}
                  disabled={!city.loaded}
                  onClick={() => props.onPick(city)}
                >
                  <span className="rp-city-name">
                    {m.dev_report_city_item({
                      name: cityName(city.name, city.id),
                      id: city.id,
                      humans: city.humans,
                    })}
                  </span>
                  {!city.loaded ? (
                    <span className="rp-city-note">{m.dev_report_city_unloaded()}</span>
                  ) : !city.hall ? (
                    <span className="rp-city-note">{m.dev_report_city_no_hall()}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
