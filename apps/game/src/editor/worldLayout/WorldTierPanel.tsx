// 세계 배치 화면의 국력 등급 판 — 사용자 답(2026-11-11, 원문) "현재 테스트 맵에 실제 강대국 분포처럼 알아서 배치해달라".
// docs/adr/2026-11-07-world-layout.md "바뀜 (2026-11-11)".
// 1. 등급 배치 계획(미리 보기): 빈 세계로 보고 등급대로 고른 국가 수도·시작 도시(tRPC worldLayout.suggest의 plan). 지도에 마름모(수도,
//    등급이 클수록 크다)·점(도시)으로 겹쳐 보이고, [계획 다시 만들기]로 다시 받는다. 자리를 실제로 놓는 것은 위 판의 [제안 모두 놓기]다.
// 2. 이 세계에 반영(미리 보기 → 예약): 이미 선 세계에 등급 분포를 들이면 더해지는 것(worldLayout.tierPlan — DB 읽기만). [반영 예약]을
//    누르면 서버가 다음에 켤 때 든다(requestTierApply). 지우거나 옮기는 것은 없다 — 무엇이 바뀌고 바뀌지 않는지 글로 적는다.
// 3. 이 세계에 세울 수 있는 국가: 차례 밖 프리셋(새로 만든 프리셋 포함). 위 판에서 고르고 지도를 눌러 [여기에 놓기]하면 다음 시작 때 선다.
import type { WorldFoundingView, WorldTierApplyView, WorldTierPlan } from "@terra/shared/worldPlacementApi";
import { m } from "../../paraglide/messages.js";
import { tierText } from "./worldLayoutMessages.ts";
import type { NationLook } from "./worldLayoutModel.ts";

interface Props {
  readonly plan: WorldTierPlan | null;
  readonly apply: WorldTierApplyView | null;
  readonly founding: readonly WorldFoundingView[];
  readonly looks: ReadonlyMap<string, NationLook>;
  readonly locale: "ko" | "en";
  readonly busy: boolean;
  readonly onPlan: () => void;
  readonly onHidePlan: () => void;
  readonly onApplyPreview: () => void;
  readonly onHideApply: () => void;
  readonly onRequest: () => void;
  readonly onCancel: () => void;
  readonly onChoose: (code: string) => void;
}

const when = (ms: number, locale: string): string => new Date(ms).toLocaleString(locale);

function Swatch({ look }: { look: NationLook | undefined }) {
  return (
    <span
      className="wl-swatch"
      data-nation={(look?.index ?? 0) % 6}
      data-colored={look?.color === undefined ? undefined : ""}
      style={look?.color === undefined ? undefined : { color: look.color }}
      aria-hidden="true"
    />
  );
}

export function WorldTierPanel(props: Props) {
  const { plan, apply, founding, looks, locale, busy } = props;
  const nameOf = (code: string): string => looks.get(code)?.name ?? code;
  const pendingFound = founding.filter((entry) => entry.mapKey !== null);
  const candidates = founding.filter((entry) => entry.mapKey === null);
  const request = apply?.request ?? null;
  const nothing =
    apply !== null &&
    apply.totals.cities === 0 &&
    apply.totals.humans === 0 &&
    apply.totals.guards === 0 &&
    apply.totals.housingRaised === 0;
  return (
    <section className="wl-tier" aria-labelledby="wl-tier-title" data-testid="wl-tier">
      <h2 id="wl-tier-title" className="wl-tier-title">
        {m.dev_world_layout_tier_title()}
      </h2>
      <p className="field-hint">{m.dev_world_layout_tier_lead()}</p>

      <div className="wl-tier-block" data-block="plan" data-open={plan ? "" : undefined}>
        <div className="wl-actions">
          <button type="button" className="button-small wl-plan-show" disabled={busy} onClick={props.onPlan}>
            {plan ? m.dev_world_layout_plan_again() : m.dev_world_layout_plan_show()}
          </button>
          {plan ? (
            <button type="button" className="button-small wl-plan-hide" onClick={props.onHidePlan}>
              {m.dev_world_layout_plan_hide()}
            </button>
          ) : null}
        </div>
        {plan ? (
          <>
            <p className="dev-muted" data-testid="wl-plan-summary">
              {m.dev_world_layout_plan_summary({
                nations: plan.nations.length,
                gap: plan.minGapCells ?? 0,
                region: plan.regionCells,
                short: plan.short,
              })}
            </p>
            <ul className="wl-legend">
              <li data-mark="plan_home">{m.dev_world_layout_legend_plan_home()}</li>
              <li data-mark="plan_city">{m.dev_world_layout_legend_plan_city()}</li>
            </ul>
            <div className="dev-table-wrap">
              <table className="dev-table wl-plan-table">
                <thead>
                  <tr>
                    <th scope="col">{m.dev_world_layout_col_nation()}</th>
                    <th scope="col">{m.dev_world_layout_col_tier()}</th>
                    <th scope="col">{m.dev_world_layout_col_cities()}</th>
                    <th scope="col">{m.dev_world_layout_col_people()}</th>
                    <th scope="col">{m.dev_world_layout_col_guards()}</th>
                    <th scope="col">{m.dev_world_layout_col_home()}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.nations.map((nation) => (
                    <tr key={nation.code} data-plan-code={nation.code} data-tier={nation.tier ?? "none"}>
                      <th scope="row">
                        <Swatch look={looks.get(nation.code)} />
                        {nameOf(nation.code)}
                      </th>
                      <td>{tierText(nation.tier)}</td>
                      <td className="dev-num">
                        {m.dev_world_layout_plan_cities({
                          have: nation.cities.length,
                          want: nation.wantCities,
                        })}
                      </td>
                      <td className="dev-num">{nation.population}</td>
                      <td className="dev-num">{nation.guards}</td>
                      <td>
                        {nation.placed ? m.dev_world_layout_plan_placed() : m.dev_world_layout_plan_auto()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>

      <div className="wl-tier-block" data-block="apply" data-open={apply ? "" : undefined}>
        <h3 className="wl-tier-subtitle">{m.dev_world_layout_apply_title()}</h3>
        <ul className="wl-tier-notes">
          <li>{m.dev_world_layout_apply_will()}</li>
          <li>{m.dev_world_layout_apply_wont()}</li>
          <li>{m.dev_world_layout_apply_reset_note()}</li>
        </ul>
        <div className="wl-actions">
          <button
            type="button"
            className="button-small wl-apply-show"
            disabled={busy}
            onClick={props.onApplyPreview}
          >
            {m.dev_world_layout_apply_show()}
          </button>
          {apply ? (
            <button type="button" className="button-small wl-apply-hide" onClick={props.onHideApply}>
              {m.dev_world_layout_plan_hide()}
            </button>
          ) : null}
        </div>
        {apply ? (
          <>
            <ul className="wl-legend">
              <li data-mark="add_city">{m.dev_world_layout_legend_add_city()}</li>
            </ul>
            <div className="dev-table-wrap">
              <table className="dev-table wl-apply-table">
                <thead>
                  <tr>
                    <th scope="col">{m.dev_world_layout_col_nation()}</th>
                    <th scope="col">{m.dev_world_layout_col_tier()}</th>
                    <th scope="col">{m.dev_world_layout_col_cities()}</th>
                    <th scope="col">{m.dev_world_layout_col_housing()}</th>
                    <th scope="col">{m.dev_world_layout_col_people()}</th>
                    <th scope="col">{m.dev_world_layout_col_guards()}</th>
                    <th scope="col">{m.dev_world_layout_col_tech()}</th>
                  </tr>
                </thead>
                <tbody>
                  {apply.nations.map((nation) => (
                    <tr key={nation.code} data-apply-code={nation.code} data-add={nation.cities.add}>
                      <th scope="row">
                        <Swatch look={looks.get(nation.code)} />
                        {nation.name?.[locale] ?? nameOf(nation.code)}
                      </th>
                      <td>{tierText(nation.tier)}</td>
                      <td>
                        {m.dev_world_layout_apply_cities({
                          have: nation.cities.have,
                          want: nation.cities.want,
                          add: nation.cities.add,
                        })}
                        {nation.cities.surplus > 0 ? (
                          <span className="wl-blocked">
                            {m.dev_world_layout_apply_surplus({ count: nation.cities.surplus })}
                          </span>
                        ) : null}
                      </td>
                      <td className="dev-num">
                        {m.dev_world_layout_apply_plus({ count: nation.housingRaised })}
                      </td>
                      <td className="dev-num">
                        {m.dev_world_layout_apply_have_plus({
                          have: nation.humans.have,
                          add: nation.humans.add + nation.newHumans,
                        })}
                      </td>
                      <td className="dev-num">
                        {m.dev_world_layout_apply_have_plus({
                          have: nation.guards.have,
                          add: nation.guards.add + nation.newGuards,
                        })}
                      </td>
                      <td className="dev-num">
                        {m.dev_world_layout_apply_tech({ from: nation.tech.from, to: nation.tech.to })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="wl-tier-totals" data-testid="wl-apply-totals">
              {m.dev_world_layout_apply_totals({
                cities: apply.totals.cities,
                humans: apply.totals.humans,
                guards: apply.totals.guards,
                units: apply.unitsNow,
                after: apply.unitsNow + apply.totals.humans + apply.totals.guards,
              })}
            </p>
            {apply.totals.surplusCities > 0 ? (
              <p className="field-hint">
                {m.dev_world_layout_apply_surplus_note({ count: apply.totals.surplusCities })}
              </p>
            ) : null}
            {request ? (
              <p className="dev-badge" data-tone={request.appliedAtMs === null ? "pending" : "applied"}>
                {request.appliedAtMs === null
                  ? m.dev_world_layout_apply_pending({ when: when(request.requestedAtMs, locale) })
                  : m.dev_world_layout_apply_done({ when: when(request.appliedAtMs, locale) })}
              </p>
            ) : null}
            {nothing ? <p className="field-hint">{m.dev_world_layout_apply_nothing()}</p> : null}
            <div className="wl-actions">
              <button
                type="button"
                className="button-small button-primary wl-apply-request"
                disabled={busy || nothing || (request !== null && request.appliedAtMs === null)}
                onClick={props.onRequest}
              >
                {m.dev_world_layout_apply_request()}
              </button>
              <button
                type="button"
                className="button-small wl-apply-cancel"
                disabled={busy || request === null || request.appliedAtMs !== null}
                onClick={props.onCancel}
              >
                {m.dev_world_layout_apply_cancel()}
              </button>
            </div>
          </>
        ) : null}
      </div>

      <div className="wl-tier-block" data-block="found">
        <h3 className="wl-tier-subtitle">{m.dev_world_layout_found_title()}</h3>
        <p className="field-hint">{m.dev_world_layout_found_note()}</p>
        {founding.length === 0 ? <p className="dev-muted">{m.dev_world_layout_found_none()}</p> : null}
        {pendingFound.length > 0 ? (
          <ul className="wl-found-list" data-list="pending">
            {pendingFound.map((entry) => (
              <li key={entry.code} data-found-code={entry.code}>
                <Swatch look={looks.get(entry.code)} />
                {m.dev_world_layout_found_pending({
                  nation: nameOf(entry.code),
                  tier: tierText(entry.start.tier),
                })}
              </li>
            ))}
          </ul>
        ) : null}
        {candidates.length > 0 ? (
          <ul className="wl-found-list" data-list="candidates">
            {candidates.map((entry) => (
              <li key={entry.code} data-found-code={entry.code}>
                <Swatch look={looks.get(entry.code)} />
                <button type="button" className="wl-pick" onClick={() => props.onChoose(entry.code)}>
                  {nameOf(entry.code)}
                </button>
                <span className="dev-muted">
                  {m.dev_world_layout_found_candidate({
                    tier: tierText(entry.start.tier),
                    cities: entry.start.cities,
                    people: entry.start.cities * entry.start.populationPerCity,
                  })}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
