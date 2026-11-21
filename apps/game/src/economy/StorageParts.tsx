// 건물 칸의 창고 부분 — 창고 시설 넣기·꺼내기 폼, 내 물건 자리 목록(도시 창고·건물 창고·화물·자리 없음)
// docs/adr/2026-11-07-buildings-runtime.md "바뀜 (창고·직무)", 기획 49 N50·D-117·D-121·D-516(361·382).
// - 넣기 = 그 건물이 선 도시의 내 도시 창고 → 이 2차맵 내 유닛 화물 차례로 꺼내 창고 시설에(서버 판정: 용량·상태·물자만).
// - 꺼내기 = 그 건물 창고의 내 몫 → 그 도시의 내 도시 창고. 남의 건물(임대 몫)도 꺼낸다(유예 동안 가져가기). 운반꾼(그 건물 일꾼·내 유닛)이
//   걸어 나른다(기획 D-569 1784). 내 사업장 물건(sale)은 꺼내지 못하고 건물 판 [장부]에서 판매가로 산다(1781) — 단추 대신 안내 한 줄.
// - 거래소 건물(기획 D-561·D-564 1628, docs/adr/2026-11-16-exchange-buildings.md): 도시 창고 줄마다 [거래소로](그 도시 물자 거래소 건물 storage_move in —
//   서버가 운반꾼으로 나른다), 거래소 건물 창고는 "물자 거래소 #id"로 보이고 [꺼내기](도시 창고로, 운반꾼)를 쓴다.
// - 물류센터(기획 D-576, docs/adr/2026-11-16-logistics-center.md): [거래소로] 위에 운반 고르기 — 내 유닛만(via own), 내 유닛·없으면 물류센터(via auto),
//   그 도시 물류센터(한 단위 요금 + 나라 화폐·나를 수 있는 일꾼 수, via = 건물 ID). 처음 고른 칸은 계정 자동 맡기기(서버 overview autoHaul — 기획 대조
//   2272)를 따른다. 남의 건물 몫·거래소 건물 창고 [꺼내기]에도 같은 고르기(기획 대조 2273). 요금은 서버가 떠날 때 받는다.
// - 바꾸는 명령은 WebSocket storage_move(프로토콜 11)이고, 화면은 가진 수로 단추만 막는다.
import type { FacilitiesOverviewResponse, FacilityView, GoodsPlaceView } from "@terra/shared/facilities";
import type { HaulCenterView } from "@terra/shared/logistics";
import { useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { type CityText, useCityText } from "./cityText.ts";
import { fmt, pickName } from "./economyText.ts";
import type { FacilityRun } from "./facilityText.ts";

/** 프로토콜 입력 한도(게임 값 아님) */
const MOVE_MAX = 1_000_000;

const lineName = (line: GoodsPlaceView["lines"][number]): string =>
  pickName(line.name ?? undefined, line.item ?? line.asset);

/** 자리 이름 */
function placeTitle(place: GoodsPlaceView, data: FacilitiesOverviewResponse, cityText: CityText): string {
  const id = place.id ?? 0;
  if (place.kind === "city") return m.facility_place_city({ city: cityText(id) });
  if (place.kind === "cargo") return m.facility_place_cargo({ id });
  if (place.kind === "ledger") return m.facility_place_ledger();
  const mine = data.facilities.find((facility) => facility.buildingId === id);
  if (place.exchange !== undefined)
    return m.facility_place_exchange({
      name: pickName(
        data.catalog.find((entry) => entry.id === place.facilityId)?.name,
        place.facilityId ?? "",
      ),
      id,
    });
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

/** 운반 고르기 글: 물류센터 한 줄(단위당 값 + 나라 화폐 — 기획 대조 2277) */
function centerLabel(center: HaulCenterView): string {
  if (center.perUnit === "0") return m.facility_haul_center_closed({ id: center.buildingId });
  const price = center.currency ? `${fmt(center.perUnit)} ${center.currency}` : fmt(center.perUnit);
  return center.mine
    ? m.facility_haul_center_mine({ id: center.buildingId, price, workers: center.workers })
    : m.facility_haul_center({ id: center.buildingId, price, workers: center.workers });
}

/** 운반 맡기기(프로토콜 haulViaSchema) */
type HaulVia = number | "auto" | "own";

/**
 * 운반 고르기(물류센터가 있을 때만 보인다): 내 유닛만·내 유닛·없으면 물류센터·그 도시 물류센터. 처음 칸은 계정 자동 맡기기를 따른다. 고른 via를 돌려준다
 */
function useHaulPick(centers: readonly HaulCenterView[], autoHaul: boolean) {
  const [picked, setPicked] = useState<string | null>(null);
  const fieldId = useId();
  const open = centers.filter((center) => center.perUnit !== "0");
  const fallback = autoHaul ? "auto" : "own";
  const wanted = picked ?? fallback;
  const choice =
    wanted === "own" || wanted === "auto" || open.some((center) => String(center.buildingId) === wanted)
      ? wanted
      : fallback;
  const via: HaulVia = choice === "own" || choice === "auto" ? choice : Number(choice);
  const unit = centers[0];
  const view =
    centers.length === 0 ? null : (
      <>
        <label className="eco-field" htmlFor={fieldId}>
          <span className="visually-hidden">{m.facility_haul_pick()}</span>
          <select
            id={fieldId}
            className="eco-select"
            data-part="facility-haul-pick"
            value={choice}
            onChange={(event) => setPicked(event.target.value)}
          >
            <option value="own">{m.facility_haul_own()}</option>
            <option value="auto">{m.facility_haul_own_auto()}</option>
            {centers.map((center) => (
              <option
                key={center.buildingId}
                value={String(center.buildingId)}
                disabled={center.perUnit === "0"}
              >
                {centerLabel(center)}
              </option>
            ))}
          </select>
        </label>
        {unit === undefined ? null : (
          <span className="eco-row-meta" data-part="facility-haul-unit">
            {m.facility_haul_unit({ kg: fmt(BigInt(Math.floor(unit.unitG / 1000))), cells: unit.unitCells })}
          </span>
        )}
      </>
    );
  // 물류센터가 없으면 via를 보내지 않는다(서버가 계정 설정을 따른다)
  return { view, via: centers.length === 0 ? undefined : via };
}

/** 도시 창고 → 물자 거래소 건물 옮기기 단추들(물류센터 고르기 포함, D-576) */
function ExchangeMoves({
  place,
  run,
  busy,
  autoHaul,
}: {
  place: GoodsPlaceView;
  run: FacilityRun;
  busy: boolean;
  autoHaul: boolean;
}) {
  const pick = useHaulPick(place.haulCenters ?? [], autoHaul);
  const via = pick.via;
  return (
    <div className="facility-exchange-moves" data-part="facility-exchange-moves">
      {pick.view}
      {place.lines
        .filter((line) => line.item !== null)
        .map((line) => (
          <button
            key={`exchange-${line.asset}`}
            type="button"
            className="button-small"
            data-part="facility-to-exchange"
            disabled={busy}
            onClick={() =>
              void run({
                t: "storage_move",
                buildingId: place.exchangeId ?? 0,
                asset: line.asset,
                qty: Math.min(MOVE_MAX, Number(line.qty)),
                direction: "in",
                ...(via === undefined ? {} : { via }),
              })
            }
          >
            {m.facility_to_exchange({ name: lineName(line) })}
          </button>
        ))}
    </div>
  );
}

/** 남의 건물 몫·거래소 건물 창고 [꺼내기] 단추들(물류센터 고르기 포함 — 기획 대조 2273) */
function TakeOutMoves({
  place,
  run,
  busy,
  autoHaul,
}: {
  place: GoodsPlaceView;
  run: FacilityRun;
  busy: boolean;
  autoHaul: boolean;
}) {
  const pick = useHaulPick(place.haulCenters ?? [], autoHaul);
  const via = pick.via;
  return (
    <div className="facility-exchange-moves" data-part="facility-take-out-moves">
      {pick.view}
      {place.lines.map((line) => (
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
              ...(via === undefined ? {} : { via }),
            })
          }
        >
          {m.facility_take_out({ name: lineName(line) })}
        </button>
      ))}
    </div>
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
  const cityText = useCityText();
  if (data.places.length === 0) return <p className="eco-empty">{m.facility_places_empty()}</p>;
  return (
    <ul className="eco-rows" data-part="facility-places">
      {data.places.map((place) => (
        <li key={place.key} className="eco-row facility-place" data-kind={place.kind}>
          <div className="eco-row-main">
            <span className="eco-row-title">{placeTitle(place, data, cityText)}</span>
            <span className="eco-row-meta">
              {place.lines.map((line) => `${lineName(line)} ${fmt(line.qty)}`).join(" · ")}
            </span>
          </div>
          {place.kind === "city" && typeof place.exchangeId === "number" ? (
            <ExchangeMoves place={place} run={run} busy={busy} autoHaul={data.autoHaul === true} />
          ) : null}
          {place.kind === "building" && place.sale === true ? (
            <span className="eco-row-meta" data-part="facility-place-sale">
              {m.facility_place_sale_only()}
            </span>
          ) : null}
          {place.kind === "building" && !place.storage && place.sale !== true && place.id !== null ? (
            <TakeOutMoves place={place} run={run} busy={busy} autoHaul={data.autoHaul === true} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
