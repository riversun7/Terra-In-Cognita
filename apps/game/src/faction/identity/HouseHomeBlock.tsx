// "내 가문" 칸의 소속 도시 부분(기획 D-565) — 가문은 소속 도시를 골라 그 도시가 속한 나라의 가문이 된다(세금 납부·랭킹 집계).
// - 가문원: 지금 소속 도시·나라. 가문장: 후보 고르기 + [소속 도시 바꾸기](WebSocket house_home, 프로토콜 39). 대기 중이면 다음 시각을 보이고
//   단추를 막는다. 도시를 가진 가문은 아직 바꾸지 못한다(서버 has_city — 안내만).
// - 공고(D-570): 가문장이 고르면 바로 옮기지 않고 공고한다(공고 기간 = 설정 칸). 공고 중이면 모두에게 새 도시·옮기는 시각·그 나라 정책(가입비·
//   지원금)과 "원치 않으면 그 전에 가문을 나갈 수 있다"를 보이고, 가문장에게는 [공고 거두기](지금 소속 도시를 다시 보낸다)를 준다.
// - 무소속(가문 없음): 내 도시가 소속 도시이고 개인 세금을 낸다는 안내, 유닛을 고용하려면 가문이 필요하다는 안내.
// docs/adr/2026-11-11-faction-identity.md "바뀜 (2026-11-15, D-565)"
import type { HouseCityTaxView, HouseHomeView } from "@terra/shared/house";
import { useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { formatAmount } from "../../roster/rosterText.ts";
import { dateText } from "../../sections/screenText.ts";
import { homeChoiceText } from "./homeText.ts";

export function HouseHomeBlock({
  home,
  inHouse,
  leader,
  memberCount = 1,
  cityTax,
  busy,
  onChange,
  onLeaveCity,
  onPayCityTax,
}: {
  home: HouseHomeView;
  /** 가문에 들어 있나(아니면 무소속 안내) */
  inHouse: boolean;
  leader: boolean;
  /** 가문원 수(1인 가문은 공고 없이 바로 가입·이동한다 — ADR 2026-11-24-house-membership-separation.md) */
  memberCount?: number;
  /** 가문 도시세 현황(소속 도시에 내는 일정액 세금·체납 빚 — ADR 2026-11-25-house-city-tax.md) */
  cityTax?: HouseCityTaxView | null | undefined;
  busy: boolean;
  onChange: (cityId: number) => void;
  /** 소속 도시 탈퇴(ADR 2026-11-25) */
  onLeaveCity?: () => void;
  /** 가문 도시세 체납 빚 납부(ADR 2026-11-25-house-city-tax.md) */
  onPayCityTax?: () => void;
}) {
  const id = useId();
  const [picked, setPicked] = useState(String(home.city?.id ?? home.choices[0]?.id ?? ""));
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
  const canChange = leader && !home.locked && home.choices.length > 0;
  const waiting = home.changeAt !== null;
  const pending = home.pending ?? null;
  const same = picked === String(home.city?.id ?? "") || picked === String(pending?.city.id ?? "");
  const selectedChoice = home.choices.find((city) => String(city.id) === picked);
  const hostileUnits = selectedChoice?.hostileResidentUnits ?? 0;
  const needsNotice = memberCount > 1 && (home.noticeMs ?? 0) > 0;
  const noticeDays = Math.max(0, Math.round((home.noticeMs ?? 0) / 86_400_000));
  const submitLabel = needsNotice
    ? m.fid_home_announce()
    : home.city === null
      ? m.fid_home_join()
      : m.fid_home_change();
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
          {leader && home.city ? (
            <button
              type="button"
              className="button-small"
              aria-disabled={busy}
              onClick={() => {
                if (!busy && home.city) onChange(home.city.id);
              }}
            >
              {m.fid_home_pending_cancel()}
            </button>
          ) : null}
        </div>
      ) : null}
      {canChange ? (
        <form
          className="fid-house-home-form"
          onSubmit={(event) => {
            event.preventDefault();
            const cityId = Number(picked);
            if (!Number.isSafeInteger(cityId) || cityId <= 0 || same || waiting) return;
            onChange(cityId);
          }}
        >
          <label className="fid-house-sub" htmlFor={`${id}-home`}>
            {m.fid_home_change_label()}
          </label>
          <span className="fid-house-invite-row">
            <select
              id={`${id}-home`}
              className="input"
              value={picked}
              onChange={(event) => setPicked(event.target.value)}
            >
              {home.choices.map((city) => (
                <option key={city.id} value={String(city.id)}>
                  {homeChoiceText(city)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="button-small button-primary"
              aria-disabled={busy || same || waiting}
            >
              {submitLabel}
            </button>
          </span>
          {hostileUnits > 0 && !same ? (
            <p className="field-error" role="alert" data-part="house-home-hostile-warning">
              {m.fid_home_hostile_warning({ count: String(hostileUnits) })}
            </p>
          ) : null}
          <span className="faction-muted">
            {waiting
              ? m.fid_home_wait({ when: dateText(home.changeAt ?? 0) })
              : m.fid_home_wait_rule({ days: Math.max(0, Math.round(home.waitMs / 86_400_000)) })}
          </span>
        </form>
      ) : null}
      {/* 나라는 하나(D-569): 소속 도시를 바꾸면 가문원 모두의 나라가 바뀐다 */}
      {canChange ? <p className="faction-muted">{m.fid_home_change_note()}</p> : null}
      {canChange && needsNotice && noticeDays > 0 ? (
        <p className="faction-muted">{m.fid_home_notice_rule({ days: noticeDays })}</p>
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
