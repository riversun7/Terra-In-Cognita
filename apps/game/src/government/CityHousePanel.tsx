// 정부 판의 [가문 도시 가입 · 추방 · 블랙리스트] 칸 — ADR 2026-11-25-house-city-approval-and-blacklist.md.
// - 모두에게: 이 도시의 가입 승인 방식(시장/원수/자동 + 최소 우호도), 가문 가입 신청 버튼(또는 차단 사유 + 적대 거주 유닛 경고), 나라 블랙리스트(현상수배) 목록.
// - 통치 권한자(canSetPolicy / canManage): 가입 승인 정책 저장, 대기 중인 가입 신청 승인/거절, 소속 가문 추방, 블랙리스트 등록/해제.
import type { CityJoinApprover, HouseCityTaxSetter } from "@terra/protocol";
import {
  type GovernmentCityMembership,
  HOUSE_CITY_TAX_PERIOD_DAYS,
  type HouseCityTaxSetterKind,
} from "@terra/shared/government";
import { useId, useState } from "react";
import { sendHouseMember } from "../faction/identity/houseCommands.ts";
import { HOUSE_ACTION_TEXT, HOUSE_MEMBER_ERROR_TEXT } from "../faction/identity/houseText.ts";
import { m } from "../paraglide/messages.js";
import { formatAmount } from "../roster/rosterText.ts";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { applyBlockText, approverLabel } from "./cityJoinText.ts";

function taxSetterLabel(kind: HouseCityTaxSetterKind): string {
  return kind === "leader" ? m.gov_house_tax_setter_leader() : m.gov_house_tax_setter_mayor();
}

export function CityHousePanel({
  cityId,
  buildingId,
  membership,
}: {
  cityId: number;
  buildingId: number;
  membership: GovernmentCityMembership;
}) {
  const titleId = useId();
  const [shown, setShown] = useState(membership);
  const [busy, setBusy] = useState(false);
  const [approverDraft, setApproverDraft] = useState<string>(membership.ownApprover ?? "default");
  const [minStandingDraft, setMinStandingDraft] = useState<string>(
    membership.ownMinStanding === null ? "" : String(membership.ownMinStanding),
  );
  const [expelConfirmId, setExpelConfirmId] = useState<number | null>(null);
  const [blName, setBlName] = useState("");
  const [blBounty, setBlBounty] = useState("0");
  const [blReason, setBlReason] = useState("");
  const [taxAmountDraft, setTaxAmountDraft] = useState<string>(membership.houseCityTax?.ownAmount ?? "");
  const [taxPeriodDraft, setTaxPeriodDraft] = useState<string>(
    String(membership.houseCityTax?.periodDays ?? 7),
  );
  const [taxSetterDraft, setTaxSetterDraft] = useState<string>(
    membership.houseCityTax?.ownSetter ?? "default",
  );
  const notice = useLiveLines();
  const problem = useLiveLines();

  const runAction = async (
    task: () => ReturnType<typeof sendHouseMember>,
    onSuccess: (action: string) => void,
  ): Promise<void> => {
    if (busy) return;
    setBusy(true);
    notice.clear();
    problem.clear();
    try {
      const outcome = await task();
      if (outcome.ok) {
        notice.show([HOUSE_ACTION_TEXT[outcome.action]()]);
        onSuccess(outcome.action);
      } else {
        problem.show([HOUSE_MEMBER_ERROR_TEXT[outcome.code]()]);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="gov-section gov-band"
      aria-labelledby={titleId}
      data-part="government-city-membership"
    >
      <h3 id={titleId} className="gov-section-title">
        {m.gov_city_join_title()}
      </h3>

      {/* 현재 가입 정책 요약 + 가문 가입 신청 */}
      <dl className="gov-facts">
        <div className="gov-fact">
          <dt>{m.gov_city_join_approver_label()}</dt>
          <dd>
            <span>{approverLabel(shown.approver)}</span>
            {shown.approver === "auto" ? (
              <span className="gov-person-note">
                {m.gov_city_join_min_standing({ min: shown.minStanding })}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      {shown.hostileResidentUnits > 0 && shown.applyBlock !== "same_city" ? (
        <p className="field-error" role="alert" data-part="gov-city-join-hostile-warning">
          {m.fid_home_hostile_warning({ count: String(shown.hostileResidentUnits) })}
        </p>
      ) : null}

      {shown.canApply ? (
        <div className="gov-actions">
          <button
            type="button"
            className="button-small button-primary"
            disabled={busy}
            data-part="gov-city-join-apply"
            onClick={() =>
              void runAction(
                () => sendHouseMember({ t: "house_city_apply", buildingId }),
                (action) => {
                  setShown((prev) => ({
                    ...prev,
                    canApply: false,
                    applyBlock: action === "city_applied" ? "already_applied" : "same_city",
                  }));
                },
              )
            }
          >
            {m.gov_city_join_apply_btn()}
          </button>
        </div>
      ) : shown.applyBlock ? (
        <p className="gov-muted" data-part="gov-city-join-block">
          {applyBlockText(shown.applyBlock)}
        </p>
      ) : null}

      {/* 승인 정책 변경(도시·국가 통치 가문장) */}
      {shown.canSetPolicy ? (
        <div className="gov-fact gov-entry-row" data-part="gov-city-join-policy">
          <dt>{m.gov_city_join_policy_title()}</dt>
          <dd>
            <span className="gov-entry-edit">
              <select
                className="input"
                value={approverDraft}
                disabled={busy}
                aria-label={m.gov_city_join_approver_label()}
                onChange={(e) => setApproverDraft(e.target.value)}
              >
                <option value="default">{m.gov_city_join_approver_default()}</option>
                <option value="mayor">{m.gov_city_join_approver_mayor()}</option>
                <option value="leader">{m.gov_city_join_approver_leader()}</option>
                <option value="auto">{m.gov_city_join_approver_auto()}</option>
              </select>
              <input
                className="gov-entry-input"
                type="number"
                min={-100}
                max={100}
                placeholder={m.gov_city_join_min_standing_input()}
                aria-label={m.gov_city_join_min_standing_input()}
                value={minStandingDraft}
                disabled={busy}
                onChange={(e) => setMinStandingDraft(e.target.value)}
              />
              <button
                type="button"
                className="button-small"
                disabled={busy}
                onClick={() => {
                  const approver: CityJoinApprover | null =
                    approverDraft === "mayor" || approverDraft === "leader" || approverDraft === "auto"
                      ? approverDraft
                      : null;
                  const trimmed = minStandingDraft.trim();
                  const parsed = trimmed === "" ? null : Number.parseInt(trimmed, 10);
                  if (parsed !== null && (!Number.isInteger(parsed) || parsed < -100 || parsed > 100)) {
                    problem.show([m.government_entry_invalid()]);
                    return;
                  }
                  void runAction(
                    () =>
                      sendHouseMember({
                        t: "house_join_policy",
                        cityId,
                        approver,
                        minStanding: parsed,
                      }),
                    () => {
                      setShown((prev) => ({
                        ...prev,
                        ownApprover: approver,
                        approver: approver ?? prev.approver,
                        ownMinStanding: parsed,
                        minStanding: parsed ?? -20,
                      }));
                    },
                  );
                }}
              >
                {m.gov_city_join_policy_save()}
              </button>
            </span>
          </dd>
        </div>
      ) : null}

      {/* 가문 도시세 정책(일정액·주기·세율 결정권 — ADR 2026-11-25-house-city-tax.md) */}
      {shown.houseCityTax ? (
        <div data-part="gov-house-city-tax">
          <h4 className="gov-section-title">{m.gov_house_tax_title()}</h4>
          <p className="gov-muted">{m.gov_house_tax_hint()}</p>
          <dl className="gov-facts">
            <div className="gov-fact">
              <dt>{m.gov_house_tax_title()}</dt>
              <dd>
                {shown.houseCityTax.amount === "0"
                  ? m.gov_house_tax_free({
                      days: shown.houseCityTax.periodDays,
                      setter: taxSetterLabel(shown.houseCityTax.setter),
                    })
                  : m.gov_house_tax_current({
                      amount: formatAmount(shown.houseCityTax.amount),
                      days: shown.houseCityTax.periodDays,
                      setter: taxSetterLabel(shown.houseCityTax.setter),
                    })}
              </dd>
            </div>
          </dl>
          {shown.houseCityTax.canSet ? (
            <div className="gov-entry-edit" data-part="gov-house-city-tax-edit">
              <input
                className="gov-entry-input"
                inputMode="numeric"
                autoComplete="off"
                placeholder={m.gov_house_tax_amount_input()}
                aria-label={m.gov_house_tax_amount_input()}
                value={taxAmountDraft}
                disabled={busy}
                onChange={(e) => setTaxAmountDraft(e.target.value)}
              />
              <select
                className="input"
                value={taxPeriodDraft}
                disabled={busy}
                aria-label={m.gov_house_tax_period_label()}
                onChange={(e) => setTaxPeriodDraft(e.target.value)}
              >
                {HOUSE_CITY_TAX_PERIOD_DAYS.map((days) => (
                  <option key={days} value={String(days)}>
                    {m.gov_house_tax_period_days({ days })}
                  </option>
                ))}
              </select>
              {shown.houseCityTax.canSetAuthority ? (
                <select
                  className="input"
                  value={taxSetterDraft}
                  disabled={busy}
                  aria-label={m.gov_house_tax_setter_label()}
                  onChange={(e) => setTaxSetterDraft(e.target.value)}
                >
                  <option value="default">{m.gov_city_join_approver_default()}</option>
                  <option value="mayor">{m.gov_house_tax_setter_mayor()}</option>
                  <option value="leader">{m.gov_house_tax_setter_leader()}</option>
                </select>
              ) : null}
              <button
                type="button"
                className="button-small"
                disabled={busy}
                onClick={() => {
                  const trimmed = taxAmountDraft.trim();
                  const amount = trimmed === "" ? null : trimmed;
                  if (amount !== null && !/^(0|[1-9][0-9]{0,14})$/.test(amount)) {
                    problem.show([m.government_entry_invalid()]);
                    return;
                  }
                  const periodDays = Number.parseInt(taxPeriodDraft, 10);
                  const setter: HouseCityTaxSetter | null = shown.houseCityTax?.canSetAuthority
                    ? taxSetterDraft === "mayor" || taxSetterDraft === "leader"
                      ? taxSetterDraft
                      : null
                    : (shown.houseCityTax?.ownSetter ?? null);
                  void runAction(
                    () =>
                      sendHouseMember({
                        t: "house_city_tax_policy",
                        cityId,
                        amount,
                        periodDays,
                        setter,
                      }),
                    () => {
                      setShown((prev) =>
                        prev.houseCityTax
                          ? {
                              ...prev,
                              houseCityTax: {
                                ...prev.houseCityTax,
                                amount: amount ?? "0",
                                ownAmount: amount,
                                periodDays,
                                ownPeriodDays: periodDays,
                                setter: setter ?? "mayor",
                                ownSetter: setter,
                              },
                            }
                          : prev,
                      );
                    },
                  );
                }}
              >
                {m.gov_house_tax_save()}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 대기 중인 가문 가입 신청(승인권자) */}
      {shown.canManage ? (
        <div data-part="gov-city-join-apps">
          <h4 className="gov-section-title">{m.gov_city_join_apps_title()}</h4>
          {shown.applications.length === 0 ? (
            <p className="gov-muted">{m.gov_city_join_apps_empty()}</p>
          ) : (
            <dl className="gov-facts">
              {shown.applications.map((app) => (
                <div key={app.id} className="gov-fact">
                  <dt>
                    <span translate="no">{app.houseName}</span>
                    <span className="gov-person-note">
                      {m.gov_city_join_app_meta({
                        leader: app.leaderName ?? "—",
                        count: app.memberCount,
                      })}
                    </span>
                  </dt>
                  <dd className="gov-actions">
                    <button
                      type="button"
                      className="button-small button-primary"
                      disabled={busy}
                      onClick={() =>
                        void runAction(
                          () =>
                            sendHouseMember({ t: "house_city_decide", applicationId: app.id, accept: true }),
                          () => {
                            setShown((prev) => ({
                              ...prev,
                              applications: prev.applications.filter((item) => item.id !== app.id),
                            }));
                          },
                        )
                      }
                    >
                      {m.gov_city_join_accept()}
                    </button>
                    <button
                      type="button"
                      className="button-small"
                      disabled={busy}
                      onClick={() =>
                        void runAction(
                          () =>
                            sendHouseMember({ t: "house_city_decide", applicationId: app.id, accept: false }),
                          () => {
                            setShown((prev) => ({
                              ...prev,
                              applications: prev.applications.filter((item) => item.id !== app.id),
                            }));
                          },
                        )
                      }
                    >
                      {m.gov_city_join_decline()}
                    </button>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ) : null}

      {/* 소속 가문 목록 및 추방(승인권자) */}
      {shown.canManage ? (
        <div data-part="gov-city-houses">
          <h4 className="gov-section-title">{m.gov_city_join_houses_title()}</h4>
          {shown.houses.length === 0 ? (
            <p className="gov-muted">{m.gov_city_join_houses_empty()}</p>
          ) : (
            <dl className="gov-facts">
              {shown.houses.map((house) => (
                <div key={house.houseId} className="gov-fact">
                  <dt>
                    <span translate="no">{house.houseName}</span>
                    <span className="gov-person-note">
                      {m.gov_city_join_app_meta({
                        leader: house.leaderName ?? "—",
                        count: house.memberCount,
                      })}
                      {house.taxDebt && house.taxDebt !== "0"
                        ? ` · ${m.gov_house_tax_house_debt({ amount: formatAmount(house.taxDebt) })}`
                        : ""}
                    </span>
                  </dt>
                  <dd className="gov-actions">
                    {house.own ? null : expelConfirmId === house.houseId ? (
                      <>
                        <span className="gov-muted">
                          {m.gov_city_join_expel_confirm({ house: house.houseName })}
                        </span>
                        <button
                          type="button"
                          className="button-small button-primary"
                          disabled={busy}
                          onClick={() => {
                            setExpelConfirmId(null);
                            void runAction(
                              () =>
                                sendHouseMember({
                                  t: "house_city_expel",
                                  cityId,
                                  houseId: house.houseId,
                                }),
                              () => {
                                setShown((prev) => ({
                                  ...prev,
                                  houses: prev.houses.filter((item) => item.houseId !== house.houseId),
                                }));
                              },
                            );
                          }}
                        >
                          {m.gov_city_join_expel_yes()}
                        </button>
                        <button
                          type="button"
                          className="button-small"
                          onClick={() => setExpelConfirmId(null)}
                        >
                          {m.cancel()}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="button-small"
                        disabled={busy}
                        onClick={() => setExpelConfirmId(house.houseId)}
                      >
                        {m.gov_city_join_expel()}
                      </button>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ) : null}

      {/* 국가 블랙리스트(모두 공개, 승인권자 등록·해제) */}
      <div data-part="gov-nation-blacklist">
        <h4 className="gov-section-title">{m.gov_blacklist_title()}</h4>
        <p className="gov-muted">{m.gov_blacklist_hint()}</p>
        {shown.blacklist.length === 0 ? (
          <p className="gov-muted">{m.gov_blacklist_empty()}</p>
        ) : (
          <dl className="gov-facts">
            {shown.blacklist.map((entry) => (
              <div key={entry.id} className="gov-fact">
                <dt>
                  <span translate="no">{entry.cyborgName ?? entry.userId.slice(0, 8)}</span>
                  <span className="gov-person-note">
                    {m.gov_blacklist_meta({
                      bounty: formatAmount(entry.bounty),
                      renown: entry.renownReward,
                    })}
                    {entry.reason ? ` · ${entry.reason}` : ""}
                  </span>
                </dt>
                <dd className="gov-actions">
                  {shown.canManage ? (
                    <button
                      type="button"
                      className="button-small"
                      disabled={busy}
                      onClick={() =>
                        void runAction(
                          () =>
                            sendHouseMember({
                              t: "nation_blacklist",
                              action: "remove",
                              cityId,
                              targetUserId: entry.userId,
                            }),
                          () => {
                            setShown((prev) => ({
                              ...prev,
                              blacklist: prev.blacklist.filter((item) => item.userId !== entry.userId),
                            }));
                          },
                        )
                      }
                    >
                      {m.gov_blacklist_remove()}
                    </button>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {shown.canManage ? (
          <form
            className="gov-entry-edit"
            onSubmit={(event) => {
              event.preventDefault();
              const name = blName.trim();
              const bountyText = blBounty.trim() || "0";
              if (!name || !/^(0|[1-9][0-9]{0,30})$/.test(bountyText)) {
                problem.show([m.government_entry_invalid()]);
                return;
              }
              const reason = blReason.trim();
              void runAction(
                () =>
                  sendHouseMember({
                    t: "nation_blacklist",
                    action: "add",
                    cityId,
                    targetName: name,
                    bounty: bountyText,
                    ...(reason ? { reason } : {}),
                  }),
                () => {
                  setBlName("");
                  setBlBounty("0");
                  setBlReason("");
                },
              );
            }}
          >
            <input
              className="gov-entry-input"
              maxLength={32}
              autoComplete="off"
              placeholder={m.gov_blacklist_name_input()}
              aria-label={m.gov_blacklist_name_input()}
              value={blName}
              disabled={busy}
              onChange={(e) => setBlName(e.target.value)}
            />
            <input
              className="gov-entry-input"
              inputMode="numeric"
              autoComplete="off"
              placeholder={m.gov_blacklist_bounty_input()}
              aria-label={m.gov_blacklist_bounty_input()}
              value={blBounty}
              disabled={busy}
              onChange={(e) => setBlBounty(e.target.value)}
            />
            <input
              className="gov-entry-input"
              maxLength={200}
              autoComplete="off"
              placeholder={m.gov_blacklist_reason_input()}
              aria-label={m.gov_blacklist_reason_input()}
              value={blReason}
              disabled={busy}
              onChange={(e) => setBlReason(e.target.value)}
            />
            <button type="submit" className="button-small button-primary" disabled={busy || !blName.trim()}>
              {m.gov_blacklist_add()}
            </button>
          </form>
        ) : null}
      </div>

      <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
      <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
    </section>
  );
}
