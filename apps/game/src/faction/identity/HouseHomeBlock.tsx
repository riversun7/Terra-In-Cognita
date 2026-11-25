// "내 가문" 칸의 소속 도시 부분(기획 D-565 · ADR 2026-11-24/25) — 가문은 사이보그 본체가 원하는 도시의 행정 건물(정부)에 직접 방문해
// 가입 신청(house_city_apply)을 해서 그 도시·나라에 소속된다. 세력 탭에서는 원격으로 도시를 골라 가입할 수 없으며, 현재 소속 도시·가문 도시세·
// 진행 중인 이동 공고(거두기)·재가입 대기 시각·소속 도시 탈퇴만 표시한다.
import type { HouseCityTaxView, HouseHomeView } from "@terra/shared/house";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { formatAmount } from "../../roster/rosterText.ts";
import { dateText } from "../../sections/screenText.ts";
import { homeChoiceText } from "./homeText.ts";

export function HouseHomeBlock({
  home,
  inHouse,
  leader,
  cityTax,
  busy,
  onCancelPending,
  onLeaveCity,
  onPayCityTax,
}: {
  home: HouseHomeView;
  /** 가문에 들어 있나(아니면 무소속 안내) */
  inHouse: boolean;
  leader: boolean;
  /** 가문 도시세 현황(소속 도시에 내는 일정액 세금·체납 빚 — ADR 2026-11-25-house-city-tax.md) */
  cityTax?: HouseCityTaxView | null | undefined;
  busy: boolean;
  /** 진행 중인 이동 공고 거두기(지금 소속 도시 ID로 house_home 전송) */
  onCancelPending?: ((cityId: number) => void) | undefined;
  /** 소속 도시 탈퇴(ADR 2026-11-25) */
  onLeaveCity?: () => void;
  /** 가문 도시세 체납 빚 납부(ADR 2026-11-25-house-city-tax.md) */
  onPayCityTax?: () => void;
}) {
  const [askingLeave, setAskingLeave] = useState(false);
  const where = home.city === null ? m.fid_home_none() : homeChoiceText(home.city);
  if (!inHouse)
    return (
      <div className="fid-house-block" data-testid="house-home" data-unaffiliated="">
        <h3 className="fid-house-sub">{m.fid_home_unaffiliated_title()}</h3>
        <p>
          {m.fid_home_unaffiliated({
            where: home.city === null ? m.fid_home_unknown() : homeChoiceText(home.city),
          })}
        </p>
        <p className="faction-muted">{m.fid_home_unaffiliated_hint()}</p>
      </div>
    );
  const waiting = home.changeAt !== null;
  const pending = home.pending ?? null;
  return (
    <div className="fid-house-block" data-testid="house-home">
      <h3 className="fid-house-sub">{m.fid_home_title()}</h3>
      <p data-part="house-home-city">{m.fid_home_current({ where })}</p>
      <p className="faction-muted">{m.fid_home_hint()}</p>
      {cityTax ? (
        <div className="fid-house-block" data-part="house-city-tax">
          <h4 className="fid-house-sub">{m.fid_house_city_tax_title()}</h4>
          <p>
            {cityTax.amount === "0"
              ? m.fid_house_city_tax_free()
              : m.fid_house_city_tax_line({
                  days: cityTax.periodDays,
                  amount: formatAmount(cityTax.amount),
                })}
          </p>
          {cityTax.nextDueAtMs !== null ? (
            <p className="faction-muted">
              {m.fid_house_city_tax_next({ when: dateText(cityTax.nextDueAtMs) })}
            </p>
          ) : null}
          {cityTax.debt !== "0" ? (
            <div className="fid-house-actions">
              <p className="field-error" role="alert" data-part="house-city-tax-debt">
                {m.fid_house_city_tax_debt({
                  amount: formatAmount(cityTax.debt),
                  cycles: cityTax.missedCycles,
                })}
              </p>
              {leader && onPayCityTax ? (
                <button
                  type="button"
                  className="button-small button-primary"
                  aria-disabled={busy}
                  onClick={() => {
                    if (!busy) onPayCityTax();
                  }}
                >
                  {m.fid_house_city_tax_pay()}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {leader && home.locked ? <p className="faction-muted">{m.fid_home_locked()}</p> : null}
      {pending ? (
        // 공고 중(D-570): 새 도시·옮기는 시각·그 나라 정책, 원치 않으면 그 전에 나간다
        <div className="fid-house-block" data-part="house-home-pending">
          <p>{m.fid_home_pending({ where: homeChoiceText(pending.city), when: dateText(pending.at) })}</p>
          <p className="faction-muted">
            {pending.terms.startsWith("-")
              ? m.fid_home_pending_grant({ amount: formatAmount(pending.terms.slice(1)) })
              : pending.terms === "0"
                ? m.fid_home_pending_free()
                : m.fid_home_pending_fee({ amount: formatAmount(pending.terms) })}
          </p>
          {leader ? null : <p className="faction-muted">{m.fid_home_pending_leave()}</p>}
          {leader && home.city && onCancelPending ? (
            <button
              type="button"
              className="button-small"
              aria-disabled={busy}
              onClick={() => {
                if (!busy && home.city) onCancelPending(home.city.id);
              }}
            >
              {m.fid_home_pending_cancel()}
            </button>
          ) : null}
        </div>
      ) : null}
      {leader && !home.locked ? (
        <p className="faction-muted" data-part="house-home-visit-hint">
          {m.fid_home_visit_to_join()}
        </p>
      ) : null}
      {leader && !home.locked && waiting ? (
        <p className="faction-muted">{m.fid_home_wait({ when: dateText(home.changeAt ?? 0) })}</p>
      ) : null}
      {leader && home.city !== null && !home.locked && onLeaveCity ? (
        <div className="fid-house-actions" data-part="house-home-leave">
          {askingLeave ? (
            <span className="fid-house-confirm" role="group" aria-label={m.fid_home_leave_city_confirm()}>
              <span>{m.fid_home_leave_city_confirm()}</span>
              <button
                type="button"
                className="button-small button-primary"
                aria-disabled={busy}
                onClick={() => {
                  setAskingLeave(false);
                  if (!busy) onLeaveCity();
                }}
              >
                {m.fid_home_leave_city_yes()}
              </button>
              <button type="button" className="button-small" onClick={() => setAskingLeave(false)}>
                {m.cancel()}
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="button-small"
              aria-disabled={busy}
              onClick={() => setAskingLeave(true)}
            >
              {m.fid_home_leave_city()}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
