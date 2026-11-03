// 영토 화면 표 — 세력(도시·비콘·영토 칸 수, 지도 색)과 도시(등급·발전도·영향권·비콘 수/상한·비콘 거리). 공용 .dev-table
import type { TerritoryPlanetView } from "@terra/shared/territoryApi";
import { m } from "../../paraglide/messages.js";
import { cellsText } from "./territoryMessages.ts";

interface Props {
  readonly data: TerritoryPlanetView;
  readonly nameOf: (factionId: number) => string;
  readonly colorToken: (factionId: number) => string;
}

function Swatch({ token }: { token: string }) {
  return <span className="tl-swatch" style={{ background: `var(${token})` }} aria-hidden="true" />;
}

const count = (list: readonly { readonly factionId: number }[], id: number) =>
  list.filter((item) => item.factionId === id).length;

export function TerritoryTables({ data, nameOf, colorToken }: Props) {
  return (
    <>
      <h2 className="tl-heading">{m.dev_territory_factions()}</h2>
      <div className="dev-table-wrap">
        <table className="dev-table tl-table">
          <thead>
            <tr>
              <th scope="col">{m.dev_territory_col_faction()}</th>
              <th scope="col">{m.dev_territory_col_cities()}</th>
              <th scope="col">{m.dev_territory_col_beacons()}</th>
              <th scope="col">{m.dev_territory_col_cells()}</th>
            </tr>
          </thead>
          <tbody>
            {data.factions.map((faction) => (
              <tr key={faction.id} data-faction={faction.id}>
                <th scope="row">
                  <Swatch token={colorToken(faction.id)} />
                  {nameOf(faction.id)}
                </th>
                <td className="dev-num">{count(data.cities, faction.id)}</td>
                <td className="dev-num">{count(data.beacons, faction.id)}</td>
                <td className="dev-num">{data.cells.filter((row) => row[1] === faction.id).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="tl-heading">{m.dev_territory_cities()}</h2>
      <div className="dev-table-wrap">
        <table className="dev-table tl-table">
          <thead>
            <tr>
              <th scope="col">{m.dev_territory_col_id()}</th>
              <th scope="col">{m.dev_territory_col_faction()}</th>
              <th scope="col">{m.dev_territory_col_grade()}</th>
              <th scope="col">{m.dev_territory_col_development()}</th>
              <th scope="col">{m.dev_territory_col_radius()}</th>
              <th scope="col">{m.dev_territory_col_beacons()}</th>
              <th scope="col">{m.dev_territory_col_range()}</th>
            </tr>
          </thead>
          <tbody>
            {data.cities.map((city) => (
              <tr key={city.id} data-city={city.id}>
                <td className="dev-num">{city.id}</td>
                <td>
                  <Swatch token={colorToken(city.factionId)} />
                  {nameOf(city.factionId)}
                </td>
                <td className="dev-num">{city.grade}</td>
                <td className="dev-num">{city.development}</td>
                <td className="dev-num">{cellsText(city.radiusMilli)}</td>
                <td className="dev-num">
                  {city.beaconsUsed}/{city.beaconsMax}
                </td>
                <td className="dev-num">{cellsText(city.rangeMilli)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
