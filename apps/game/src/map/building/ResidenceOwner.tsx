// 건물 판 [사는 곳] 카드의 주인 칸 — 사용자 결정 D-591(줄기 residence-3). 내 주거 건물일 때만 보인다.
// - 집세(D-591 2): 지금 한 기간 집세(또는 세를 놓지 않음), 입력 + [집세 정하기]·[세 거두기](residence_rent — 바뀐 집세는 다음 기간부터, 이미 낸 기간은 끝까지).
// - 층 올리기(D-591 1): 다음 층 재료(가진 수 / 필요한 수)·시간, [층 올리기](facility_floor — 짓기처럼 작업), 올리는 중이면 남은 시간, 최고 층이면 한 줄.
// 판정은 서버다. 결과 문구는 카드가 띄우고 자료를 다시 읽는다(onDone).
import type { ResidenceBuildingView } from "@terra/shared/residence";
import { useState } from "react";
import { fmt, formatDuration } from "../../economy/economyText.ts";
import { sendFacilityCommand } from "../../economy/facilityCommands.ts";
import { FACILITY_ERROR_TEXT } from "../../economy/facilityText.ts";
import { serverLink } from "../../net/serverLink.ts";
import { m } from "../../paraglide/messages.js";
import { nameText } from "../gather/gatherData.ts";
import { isRentText, residenceRentErrorText, sendResidenceRent } from "./residenceData.ts";

const serverNow = (): number => Date.now() + serverLink.clockOffsetMs();

export function ResidenceOwner(props: {
  readonly buildingId: number;
  readonly view: ResidenceBuildingView;
  readonly periodMs: number;
  /** 결과 한 줄(성공·실패)을 띄우고 자료를 다시 읽는다 */
  readonly onDone: (ok: boolean, text: string) => void;
}) {
  const { buildingId, view, periodMs, onDone } = props;
  const [rent, setRent] = useState("");
  const [busy, setBusy] = useState(false);
  const period = formatDuration(periodMs);
  const floor = view.floor ?? null;
  const now = serverNow();
  const building = floor?.untilMs !== null && floor?.untilMs !== undefined && floor.untilMs > now;
  const affordable = floor?.materials.every((stack) => stack.have >= stack.qty) ?? false;

  const run = async (task: () => Promise<{ ok: boolean; text: string }>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await task();
      onDone(outcome.ok, outcome.text);
    } finally {
      setBusy(false);
    }
  };
  const sendRent = (value: string | null) =>
    void run(async () => {
      const outcome = await sendResidenceRent(buildingId, value === null ? null : value.trim());
      if (!outcome.ok) return { ok: false, text: residenceRentErrorText(outcome.code) };
      setRent("");
      return { ok: true, text: outcome.rent === null ? m.residence_rent_cleared() : m.residence_rent_done() };
    });
  const raise = () =>
    void run(async () => {
      const outcome = await sendFacilityCommand({ t: "facility_floor", buildingId });
      return outcome.ok
        ? { ok: true, text: m.residence_floor_done() }
        : { ok: false, text: FACILITY_ERROR_TEXT[outcome.code]() };
    });

  return (
    <div className="bp-residence-owner" data-part="residence-owner">
      <p className="bp-card-subtitle">{m.residence_rent_title()}</p>
      <p data-part="residence-rent-line">
        {view.rent === null || view.rent === undefined
          ? m.residence_rent_none()
          : m.residence_rent_current({ period, rent: fmt(view.rent) })}
      </p>
      <div className="bp-form-row">
        <label className="bp-field">
          <span>{m.residence_rent_label({ period })}</span>
          <input
            className="bp-input"
            inputMode="numeric"
            value={rent}
            placeholder={view.rent ?? "0"}
            onChange={(event) => setRent(event.target.value)}
            data-part="residence-rent-input"
          />
        </label>
        <button
          type="button"
          className="button-small"
          disabled={busy || !isRentText(rent)}
          data-part="residence-rent-set"
          onClick={() => sendRent(rent)}
        >
          {m.residence_rent_set()}
        </button>
        {view.rent === null || view.rent === undefined ? null : (
          <button
            type="button"
            className="button-small"
            disabled={busy}
            data-part="residence-rent-clear"
            onClick={() => sendRent(null)}
          >
            {m.residence_rent_clear()}
          </button>
        )}
      </div>
      {floor ? (
        <>
          <p className="bp-card-subtitle">{m.residence_floor_title()}</p>
          {building ? (
            <p data-part="residence-floor-building">
              {m.residence_floor_running({ time: formatDuration((floor.untilMs ?? now) - now) })}
            </p>
          ) : floor.block === "floor_full" ? (
            <p className="bp-muted" data-part="residence-floor-max">
              {m.residence_floor_max()}
            </p>
          ) : (
            <>
              <p className="bp-muted" data-part="residence-floor-cost">
                {m.residence_floor_cost({
                  materials: floor.materials
                    .map((stack) =>
                      m.station_upgrade_material({
                        name: nameText(stack.name, stack.item),
                        have: fmt(String(stack.have)),
                        qty: fmt(String(stack.qty)),
                      }),
                    )
                    .join(" · "),
                })}
              </p>
              <div className="bp-actions">
                <button
                  type="button"
                  className="button-small"
                  disabled={busy || !affordable || floor.block !== null}
                  data-part="residence-floor-raise"
                  onClick={raise}
                >
                  {m.residence_floor_button({ time: formatDuration(floor.timeMs) })}
                </button>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
