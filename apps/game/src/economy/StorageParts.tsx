// 건물 칸의 창고 부분 — 창고 시설 넣기·꺼내기 폼, 내 물건 자리 목록(도시 창고·건물 창고·화물·자리 없음)
// docs/adr/2026-11-07-buildings-runtime.md "바뀜 (창고·직무)", 기획 49 N50·D-117·D-121·D-516(361·382).
// - 넣기 = 그 건물이 선 도시의 내 도시 창고 → 이 2차맵 내 유닛 화물 차례로 꺼내 창고 시설에(서버 판정: 용량·상태·물자만).
// - 꺼내기 = 그 건물 창고의 내 몫 → 그 도시의 내 도시 창고. 남의 건물(임대 몫)도 꺼낸다(유예 동안 가져가기).
// - 바꾸는 명령은 WebSocket storage_move(프로토콜 11)이고, 화면은 가진 수로 단추만 막는다.
import type { FacilitiesOverviewResponse, FacilityView, GoodsPlaceView } from "@terra/shared/facilities";
import { useState } from "react";
import { m } from "../paraglide/messages.js";
import { fmt, pickName } from "./economyText.ts";
import type { FacilityRun } from "./facilityText.ts";

/** 프로토콜 입력 한도(게임 값 아님) */
const MOVE_MAX = 1_000_000;

const lineName = (line: GoodsPlaceView["lines"][number]): string =>
  pickName(line.name ?? undefined, line.item ?? line.asset);

/** 자리 이름 */
function placeTitle(place: GoodsPlaceView, data: FacilitiesOverviewResponse): string {
  const id = place.id ?? 0;
  if (place.kind === "city") return m.facility_place_city({ id });
  if (place.kind === "cargo") return m.facility_place_cargo({ id });
  if (place.kind === "ledger") return m.facility_place_ledger();
  const mine = data.facilities.find((facility) => facility.buildingId === id);
  return place.storage && mine
    ? m.facility_place_storage({ name: pickName(mine.name, mine.facilityId), id })
    : m.facility_place_building({ id });
}

/** 자산 → 수량 합(goodsOnly면 물자 item:<ID>만) */
function addLines(into: Map<string, bigint>, place: GoodsPlaceView | undefined, goodsOnly = false): void {
  for (const line of place?.lines ?? [])
    if (!goodsOnly || line.item !== null)
      into.set(line.asset, (into.get(line.asset) ?? 0n) + BigInt(line.qty));
}

export function StorageMoveForm({
  facility,
  data,
  run,
  busy,
}: {
  facility: FacilityView;
  data: FacilitiesOverviewResponse;
  run: FacilityRun;
  busy: boolean;
}) {
  // 넣을 수 있는 것: 그 도시 창고 + 이 2차맵 화물의 물자, 꺼낼 수 있는 것: 이 창고의 내 몫
  const outside = new Map<string, bigint>();
  for (const place of data.places)
    if (
      (place.kind === "city" && facility.cityId !== null && place.id === facility.cityId) ||
      (place.kind === "cargo" && place.mapKey === facility.mapKey)
    )
      addLines(outside, place, true);
  const inside = new Map<string, bigint>();
  addLines(
    inside,
    data.places.find((place) => place.kind === "building" && place.id === facility.buildingId),
  );
  const assets = [...new Set([...outside.keys(), ...inside.keys()])].toSorted();
  const [picked, setPicked] = useState("");
  const [qty, setQty] = useState("1");
  const asset = assets.includes(picked) ? picked : (assets[0] ?? "");
  const amount = /^[0-9]{1,7}$/.test(qty) ? Math.min(MOVE_MAX, Number(qty)) : 0;
  const fieldId = `facility-move-${facility.buildingId}`;
  const nameOf = (code: string): string => {
    const line = data.places.flatMap((place) => place.lines).find((entry) => entry.asset === code);
    return line ? lineName(line) : code;
  };
  const send = (direction: "in" | "out") =>
    void run({ t: "storage_move", buildingId: facility.buildingId, asset, qty: amount, direction });
  return (
    <fieldset className="facility-move" data-part="facility-move">
      <legend className="eco-subtitle">{m.facility_move_title()}</legend>
      {assets.length === 0 ? (
        <p className="eco-empty">{m.facility_move_empty()}</p>
      ) : (
        <>
          <div className="facility-cells">
            <label className="eco-field" htmlFor={`${fieldId}-goods`}>
              <span>{m.facility_field_goods()}</span>
              <select
                id={`${fieldId}-goods`}
                className="eco-select"
                value={asset}
                onChange={(event) => setPicked(event.target.value)}
              >
                {assets.map((code) => (
                  <option key={code} value={code}>
                    {m.facility_move_option({
                      name: nameOf(code),
                      outside: fmt(outside.get(code) ?? 0n),
                      inside: fmt(inside.get(code) ?? 0n),
                    })}
                  </option>
                ))}
              </select>
            </label>
            <label className="eco-field" htmlFor={`${fieldId}-qty`}>
              <span>{m.facility_field_qty()}</span>
              <input
                id={`${fieldId}-qty`}
                className="eco-input"
                inputMode="numeric"
                autoComplete="off"
                value={qty}
                aria-invalid={amount === 0}
                onChange={(event) => setQty(event.target.value.trim())}
              />
            </label>
          </div>
          <div className="labor-actions">
            <button
              type="button"
              className="button-small"
              disabled={busy || amount === 0 || (outside.get(asset) ?? 0n) < BigInt(amount)}
              onClick={() => send("in")}
            >
              {m.facility_move_in()}
            </button>
            <button
              type="button"
              className="button-small"
              disabled={busy || amount === 0 || (inside.get(asset) ?? 0n) < BigInt(amount)}
              onClick={() => send("out")}
            >
              {m.facility_move_out()}
            </button>
          </div>
        </>
      )}
    </fieldset>
  );
}

/** 내 물건 자리 목록. 남의 건물 창고(임대 몫)는 줄마다 [꺼내기](그 도시의 내 도시 창고로) */
export function PlacesList({
  data,
  run,
  busy,
}: {
  data: FacilitiesOverviewResponse;
  run: FacilityRun;
  busy: boolean;
}) {
  if (data.places.length === 0) return <p className="eco-empty">{m.facility_places_empty()}</p>;
  return (
    <ul className="eco-rows" data-part="facility-places">
      {data.places.map((place) => (
        <li key={place.key} className="eco-row facility-place" data-kind={place.kind}>
          <div className="eco-row-main">
            <span className="eco-row-title">{placeTitle(place, data)}</span>
            <span className="eco-row-meta">
              {place.lines.map((line) => `${lineName(line)} ${fmt(line.qty)}`).join(" · ")}
            </span>
          </div>
          {place.kind === "building" && !place.storage && place.id !== null
            ? place.lines.map((line) => (
                <button
                  key={line.asset}
                  type="button"
                  className="button-small"
                  disabled={busy}
                  onClick={() =>
                    void run({
                      t: "storage_move",
                      buildingId: place.id ?? 0,
                      asset: line.asset,
                      qty: Math.min(MOVE_MAX, Number(line.qty)),
                      direction: "out",
                    })
                  }
                >
                  {m.facility_take_out({ name: lineName(line) })}
                </button>
              ))
            : null}
        </li>
      ))}
    </ul>
  );
}
