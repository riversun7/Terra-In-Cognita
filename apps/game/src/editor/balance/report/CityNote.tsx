// 보고서 결과의 실제 도시 칸(기획 D-543·D-545 1383)과 군단 모양 — 어느 도시·어느 때의 스냅숏을 썼는지, 지금 도시와 견줘 저장 뒤 바뀐 곳
// (서버 battleReport.city, 읽기만 — 바뀜 판정은 @terra/shared reportCityChanges). 군단 모양은 편마다 파티·유닛·지휘 정원·지휘 없음.
// 시험용: .rp-city-note(data-state checking·same·changed·failed), .rp-legion-view, .rp-edges(공격 변 판 수), .rp-orders-result(명령 거절).
import type { ReportResult } from "@terra/shared/battleReport";
import {
  type ReportCityChange,
  type ReportCityInfo,
  reportCityChanges,
} from "@terra/shared/battleReportCity";
import { useEffect, useState } from "react";
import { api } from "../../../net/api.ts";
import { m } from "../../../paraglide/messages.js";
import { cityChangeText, cityName } from "./reportMessages.ts";

type CheckState =
  | { readonly state: "checking" }
  | { readonly state: "done"; readonly changes: readonly ReportCityChange[] }
  | { readonly state: "failed" };

function CityCheck({ saved }: { readonly saved: ReportCityInfo }) {
  const [check, setCheck] = useState<CheckState>({ state: "checking" });
  useEffect(() => {
    let live = true;
    api.battleReport.city.query({ id: saved.cityId }).then(
      (answer) => {
        if (live) setCheck({ state: "done", changes: reportCityChanges(saved, answer.info) });
      },
      () => {
        if (live) setCheck({ state: "failed" });
      },
    );
    return () => {
      live = false;
    };
  }, [saved]);
  if (check.state === "checking")
    return (
      <p className="field-hint rp-city-check" data-state="checking">
        {m.dev_report_city_checking()}
      </p>
    );
  if (check.state === "failed") return <p className="field-hint rp-city-check" data-state="failed" />;
  return check.changes.length === 0 ? (
    <p className="field-hint rp-city-check" data-state="same">
      {m.dev_report_city_same()}
    </p>
  ) : (
    <p role="status" className="field-error rp-city-check" data-state="changed">
      {m.dev_report_city_changed({ list: check.changes.map(cityChangeText).join(", ") })}
    </p>
  );
}

export function CityNote(props: { readonly result: ReportResult; readonly locale: string }) {
  const { result, locale } = props;
  const city = result.city ?? null;
  const n = (value: number) => new Intl.NumberFormat(locale).format(value);
  const legion = result.legion;
  const edges = result.edges;
  const orders = result.orders;
  if (!city && !legion && !edges && !orders) return null;
  return (
    <section className="rp-section rp-city-section">
      {city ? (
        <>
          <h3 className="bl-subtitle">{m.dev_report_city_title()}</h3>
          <p className="rp-city-info" data-city-id={city.cityId}>
            {m.dev_report_city_info({
              name: cityName(city.name, city.cityId),
              id: city.cityId,
              time: new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(
                city.atMs,
              ),
              buildings: n(city.buildings),
              walls: n(city.walls),
              nexus: city.hall ? n(city.nexusDurability) : m.dev_report_city_no_hall(),
              defenders: n(city.defenders),
              guardians: n(city.guardians),
              humans: n(city.humans),
            })}
          </p>
          <CityCheck saved={city} />
        </>
      ) : null}
      {legion ? (
        <ul className="rp-chips rp-legion-view">
          {(["a", "b"] as const).map((team) => (
            <li key={team} data-team={team}>
              {m.dev_report_legion_view({
                team: team.toUpperCase(),
                parties: n(legion[team].parties),
                units: n(legion[team].units),
                cap: n(legion[team].commandCap),
                uncommanded: n(legion[team].uncommanded),
              })}
            </li>
          ))}
        </ul>
      ) : null}
      {edges || orders ? (
        <ul className="rp-chips">
          {edges ? (
            <li className="rp-edges">
              {m.dev_report_edges_result({
                north: n(edges[0] ?? 0),
                east: n(edges[1] ?? 0),
                south: n(edges[2] ?? 0),
                west: n(edges[3] ?? 0),
              })}
            </li>
          ) : null}
          {orders ? (
            <li className="rp-orders-result" data-rejected={orders.rejected}>
              {m.dev_report_orders_result({ given: n(orders.given), rejected: n(orders.rejected) })}
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}
