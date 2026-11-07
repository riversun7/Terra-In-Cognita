// 신전·생명과학 연구소 칸(생산 칸, 건물 아래) — 기획 D-517(수명이 다한 휴먼은 비활성 → 신전에서 환생·신격화하거나 생명과학 연구소에서
// 유전자로 변환)·D-311·D-441·D-451, docs/adr/2026-11-07-temple-religion.md. 기술 기본 화면이다(옛 화면 없음).
// - 자료는 tRPC temple.overview(실제 자료만). 바꾸는 명령은 WebSocket: 기도·헌금·의식·비활성 만들기(templeCommands.ts, 프로토콜 12),
//   유전자 변환(units/fusionCommands.ts gene_convert). 서버가 판정한다(비활성·선 도시·신앙도·잔고·도시당 수호신). 화면은 막는 까닭만 미리 보인다.
// - 차례: 설명·규칙 → 내 신앙도 → 신전 카드(기도·헌금, 그 도시에 선 내 비활성 휴먼마다 [환생]·[신격화]) → 연구소 카드(그 도시 비활성 휴먼마다
//   [유전자로 변환]) → 내 휴먼(신앙도·비활성·수명) → 수호신. 신전·연구소는 위 건물 칸 [새로 짓기]에서 짓는다(건물 런타임 그대로).
import type { TempleHumanView, TempleOverviewResponse, TempleView } from "@terra/shared/temple";
import { useState } from "react";
import { m } from "../paraglide/messages.js";
import { formatAmount, formatNumber } from "../roster/rosterText.ts";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { sendFusionCommand } from "../units/fusionCommands.ts";
import { RESULT_TEXT as FUSION_RESULT_TEXT } from "../units/fusionParts.tsx";
import { formatDuration, pickName } from "./economyText.ts";
import { Loaded } from "./parts.tsx";
import { NO_ARGS, useNowTick, useTemple } from "./queries.ts";
import { type TempleCommand, type TempleOutcome, sendTempleCommand } from "./templeCommands.ts";
import "./temple.css";

type TempleCode = Extract<TempleOutcome, { ok: false }>["code"];

const TEMPLE_ERROR_TEXT: Readonly<Record<TempleCode, () => string>> = {
  sign_in_required: m.temple_err_sign_in,
  busy: m.temple_err_busy,
  rate_limited: m.temple_err_rate_limited,
  internal_error: m.temple_err_internal,
  forbidden: m.temple_err_forbidden,
  no_cyborg: m.temple_err_no_cyborg,
  not_temple: m.temple_err_not_temple,
  temple_closed: m.temple_err_closed,
  unknown_unit: m.temple_err_unknown_unit,
  wrong_kind: m.temple_err_wrong_kind,
  captive: m.temple_err_captive,
  not_inactive: m.temple_err_not_inactive,
  already_inactive: m.temple_err_already_inactive,
  wrong_city: m.temple_err_wrong_city,
  cost_changed: m.temple_err_cost_changed,
  faith_low: m.temple_err_faith_low,
  insufficient_funds: m.temple_err_funds,
  guardian_cap: m.temple_err_guardian_cap,
  cooldown: m.temple_err_cooldown,
  offline: m.temple_err_offline,
  timeout: m.temple_err_timeout,
};

/** 명령 하나의 결과 문구(성공·실패) */
interface Said {
  readonly ok: boolean;
  readonly text: string;
}

/** 화면의 명령 하나: 신전 명령 또는 유전자 변환. 결과 문구를 돌려받아 보인다 */
type Run = (key: string, action: () => Promise<Said>) => Promise<void>;

type TempleSuccess = Extract<TempleOutcome, { ok: true }>;

/** 신전 명령 하나를 보내고 결과 문구를 만든다 */
const templeAction =
  (command: TempleCommand, success: (outcome: TempleSuccess) => string) => async (): Promise<Said> => {
    const outcome = await sendTempleCommand(command);
    return outcome.ok
      ? { ok: true, text: success(outcome) }
      : { ok: false, text: TEMPLE_ERROR_TEXT[outcome.code]() };
  };

/** 개발 시험 화폐 한 번(최소 단위) */
const DEV_CURRENCY = 100_000;

/** 10진 최소 단위 금액(앞 0 없음) */
const isAmount = (value: string): boolean => /^[1-9][0-9]{0,30}$/.test(value);

/** 그 시설 도시에 선 내 비활성 휴먼(포로 아님) */
const inactiveIn = (data: TempleOverviewResponse, place: TempleView): TempleHumanView[] =>
  data.humans.filter((human) => human.inactive && !human.captive && human.cityId === place.cityId);

function PlaceHead({ place }: { place: TempleView }) {
  return (
    <div className="temple-card-head">
      <p className="temple-card-title">
        {m.temple_card_title({
          name: pickName(place.name, place.facilityId),
          id: place.buildingId,
          level: place.level,
        })}
      </p>
      <p className="eco-footnote">
        {m.temple_card_meta({
          city: place.cityId === null ? "—" : `#${place.cityId}`,
          state: Math.round(place.conditionPpm / 10_000),
        })}
        {place.mine ? <span className="eco-tag">{m.temple_card_mine()}</span> : null}
        {place.works ? null : <span className="eco-tag">{m.temple_card_closed()}</span>}
      </p>
    </div>
  );
}

function TempleCard({
  temple,
  data,
  now,
  busy,
  run,
}: {
  temple: TempleView;
  data: TempleOverviewResponse;
  now: number;
  busy: string | null;
  run: Run;
}) {
  const [amount, setAmount] = useState("");
  const rules = data.rules;
  const ghosts = inactiveIn(data, temple);
  const prayWait = data.prayReadyAtMs > now ? data.prayReadyAtMs - now : 0;
  const balance = BigInt(data.balance);
  return (
    <li className="temple-card" data-part="temple-card" data-building={temple.buildingId}>
      <PlaceHead place={temple} />
      <p className="eco-footnote">
        {m.temple_guardians_count({ count: temple.guardians, cap: rules.guardianCap })}
      </p>
      <div className="labor-actions">
        <button
          type="button"
          className="button-small temple-pray"
          disabled={busy !== null || !temple.works || prayWait > 0}
          aria-busy={busy === `pray-${temple.buildingId}`}
          onClick={() =>
            void run(
              `pray-${temple.buildingId}`,
              templeAction({ t: "temple_pray", buildingId: temple.buildingId }, (outcome) =>
                m.temple_prayed({ gained: outcome.gained ?? 0, faith: outcome.faith ?? 0 }),
              ),
            )
          }
        >
          {prayWait > 0 ? m.temple_pray_wait({ wait: formatDuration(prayWait) }) : m.temple_pray()}
        </button>
      </div>
      <form
        className="temple-offer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isAmount(amount)) return;
          void run(
            `offer-${temple.buildingId}`,
            templeAction({ t: "temple_offer", buildingId: temple.buildingId, amount }, (outcome) =>
              m.temple_offered({ gained: outcome.gained ?? 0, faith: outcome.faith ?? 0 }),
            ),
          );
        }}
      >
        <label className="temple-field">
          <span>{m.temple_offer_amount({ per: formatAmount(rules.offeringPerFaith) })}</span>
          <input
            className="eco-input"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value.trim())}
            aria-invalid={amount !== "" && !isAmount(amount)}
          />
        </label>
        <button
          type="submit"
          className="button-small temple-offer-go"
          disabled={
            busy !== null ||
            !temple.works ||
            !isAmount(amount) ||
            BigInt(isAmount(amount) ? amount : "0") > balance
          }
          aria-busy={busy === `offer-${temple.buildingId}`}
        >
          {m.temple_offer()}
        </button>
      </form>
      <p className="eco-subtitle">{m.temple_inactive_here({ count: ghosts.length })}</p>
      {ghosts.length === 0 ? <p className="eco-empty">{m.temple_inactive_none()}</p> : null}
      <ul className="temple-humans">
        {ghosts.map((human) => (
          <li key={human.unitId} className="temple-human" data-unit={human.unitId}>
            <p>
              {m.temple_human_line({
                id: human.unitId,
                level: human.level,
                rebirths: human.rebirths,
                faith: human.faith,
              })}
            </p>
            <div className="labor-actions">
              {(["rebirth", "deify"] as const).map((rite) => {
                const faith = rite === "rebirth" ? rules.rebirthFaith : rules.deifyFaith;
                const cost = rite === "rebirth" ? rules.rebirthCurrency : rules.deifyCurrency;
                const capped = rite === "deify" && temple.guardians >= rules.guardianCap;
                const blocked = !temple.works || human.faith < faith || balance < BigInt(cost) || capped;
                return (
                  <button
                    key={rite}
                    type="button"
                    className={`button-small temple-${rite}`}
                    disabled={busy !== null || blocked}
                    aria-busy={busy === `${rite}-${human.unitId}`}
                    onClick={() =>
                      void run(
                        `${rite}-${human.unitId}`,
                        templeAction(
                          { t: "temple_rite", buildingId: temple.buildingId, unit: human.unitId, rite, cost },
                          () =>
                            rite === "rebirth"
                              ? m.temple_reborn({ id: human.unitId })
                              : m.temple_deified({ id: human.unitId }),
                        ),
                      )
                    }
                  >
                    {rite === "rebirth"
                      ? m.temple_rebirth({ faith, cost: formatAmount(cost) })
                      : m.temple_deify({ faith, cost: formatAmount(cost) })}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </li>
  );
}

function LabCard({
  lab,
  data,
  busy,
  run,
}: {
  lab: TempleView;
  data: TempleOverviewResponse;
  busy: string | null;
  run: Run;
}) {
  const ghosts = inactiveIn(data, lab);
  const cost = data.rules.convertCurrency;
  const affordable = BigInt(data.balance) >= BigInt(cost);
  return (
    <li className="temple-card" data-part="lab-card" data-building={lab.buildingId}>
      <PlaceHead place={lab} />
      <p className="eco-subtitle">{m.temple_inactive_here({ count: ghosts.length })}</p>
      {ghosts.length === 0 ? <p className="eco-empty">{m.temple_inactive_none()}</p> : null}
      <ul className="temple-humans">
        {ghosts.map((human) => (
          <li key={human.unitId} className="temple-human" data-unit={human.unitId}>
            <p>
              {m.temple_human_line({
                id: human.unitId,
                level: human.level,
                rebirths: human.rebirths,
                faith: human.faith,
              })}
            </p>
            <div className="labor-actions">
              <button
                type="button"
                className="button-small temple-convert"
                disabled={busy !== null || !lab.works || !affordable}
                aria-busy={busy === `convert-${human.unitId}`}
                onClick={() =>
                  void run(`convert-${human.unitId}`, async () => {
                    const outcome = await sendFusionCommand({
                      t: "gene_convert",
                      buildingId: lab.buildingId,
                      unit: human.unitId,
                      cost,
                    });
                    return outcome.ok
                      ? {
                          ok: true,
                          text: m.temple_converted({ id: human.unitId, count: outcome.genes?.length ?? 0 }),
                        }
                      : { ok: false, text: FUSION_RESULT_TEXT[outcome.code]() };
                  })
                }
              >
                {m.temple_convert({ cost: formatAmount(cost) })}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </li>
  );
}

function HumanRow({
  human,
  now,
  dev,
  busy,
  run,
}: {
  human: TempleHumanView;
  now: number;
  dev: boolean;
  busy: string | null;
  run: Run;
}) {
  return (
    <li className="temple-human" data-unit={human.unitId} data-inactive={human.inactive}>
      <p>
        {m.temple_human_line({
          id: human.unitId,
          level: human.level,
          rebirths: human.rebirths,
          faith: human.faith,
        })}
      </p>
      <p className="eco-footnote">
        {human.inactive ? <span className="eco-tag temple-inactive">{m.temple_inactive_tag()}</span> : null}
        {human.inactive
          ? human.departsAtMs === null
            ? m.temple_inactive_stays({ city: human.cityId === null ? "—" : `#${human.cityId}` })
            : m.temple_inactive_departs({
                wait: formatDuration(Math.max(0, human.departsAtMs - now)),
                city: human.cityId === null ? "—" : `#${human.cityId}`,
              })
          : m.temple_lifespan_left({ wait: formatDuration(Math.max(0, human.lifespanEndsAtMs - now)) })}
      </p>
      {dev && !human.inactive ? (
        <div className="labor-actions">
          <button
            type="button"
            className="button-small temple-dev-inactivate"
            disabled={busy !== null}
            aria-busy={busy === `inactivate-${human.unitId}`}
            onClick={() =>
              void run(
                `inactivate-${human.unitId}`,
                templeAction({ t: "dev_inactivate_unit", unit: human.unitId }, () =>
                  m.temple_inactivated({ id: human.unitId }),
                ),
              )
            }
          >
            {m.temple_dev_inactivate()}
          </button>
        </div>
      ) : null}
    </li>
  );
}

export function TemplePanel() {
  const temple = useTemple(NO_ARGS);
  const tick = useNowTick();
  const live = useLiveLines();
  const [busy, setBusy] = useState<string | null>(null);
  const [tone, setTone] = useState<"success" | "error">("success");
  const run: Run = async (key, action) => {
    if (busy !== null) return;
    setBusy(key);
    try {
      const said = await action();
      setTone(said.ok ? "success" : "error");
      live.show([said.text]);
    } finally {
      temple.refresh();
      setBusy(null);
    }
  };
  const data = temple.data;
  const now = data ? data.generatedAt + Math.max(0, tick - temple.receivedAt) : tick;
  return (
    <section className="panel labor temple" aria-labelledby="temple-title" data-part="temple">
      <h2 id="temple-title" className="eco-section-title">
        {m.temple_title()}
      </h2>
      <p className="eco-footnote">{m.temple_lead()}</p>
      <Loaded view={temple}>
        {(loaded) => {
          if (loaded.status === "not_ready") return <p className="eco-empty">{m.temple_not_ready()}</p>;
          const rules = loaded.rules;
          return (
            <>
              <ul className="temple-rules">
                <li>
                  {m.temple_rule_rebirth({
                    faith: rules.rebirthFaith,
                    cost: formatAmount(rules.rebirthCurrency),
                  })}
                </li>
                <li>
                  {m.temple_rule_deify({
                    faith: rules.deifyFaith,
                    cost: formatAmount(rules.deifyCurrency),
                    cap: rules.guardianCap,
                  })}
                </li>
                <li>{m.temple_rule_convert({ cost: formatAmount(rules.convertCurrency) })}</li>
                <li>
                  {m.temple_rule_devotion({
                    faith: rules.prayFaith,
                    wait: formatDuration(rules.prayCooldownMs),
                    per: formatAmount(rules.offeringPerFaith),
                  })}
                </li>
                <li className="field-hint">
                  {rules.inactiveCapMs > 0
                    ? m.temple_rule_cap({ wait: formatDuration(rules.inactiveCapMs) })
                    : m.temple_rule_no_cap()}
                </li>
              </ul>
              {loaded.devGrant ? (
                <div className="labor-actions">
                  <button
                    type="button"
                    className="button-small temple-dev-currency"
                    disabled={busy !== null}
                    aria-busy={busy === "dev-currency"}
                    onClick={() =>
                      void run("dev-currency", async () => {
                        // 개발 시험 화폐(융합 개발 물자 받기와 같은 명령, dev·admin)
                        const outcome = await sendFusionCommand({
                          t: "dev_grant_goods",
                          item: "currency",
                          quantity: DEV_CURRENCY,
                        });
                        return outcome.ok
                          ? { ok: true, text: m.temple_dev_currency_done() }
                          : { ok: false, text: FUSION_RESULT_TEXT[outcome.code]() };
                      })
                    }
                  >
                    {m.temple_dev_currency({ amount: formatAmount(String(DEV_CURRENCY)) })}
                  </button>
                </div>
              ) : null}
              <p className="temple-faith" data-part="temple-faith">
                {loaded.cyborgFaith
                  ? m.temple_my_faith({
                      faith: loaded.cyborgFaith.faith,
                      points: formatNumber(loaded.cyborgFaith.faithPoints),
                      balance: formatAmount(loaded.balance),
                    })
                  : m.temple_no_cyborg()}
              </p>
              <h3 className="eco-subtitle">{m.temple_temples_title()}</h3>
              {loaded.temples.length === 0 ? <p className="eco-empty">{m.temple_temples_empty()}</p> : null}
              <ul className="temple-list">
                {loaded.temples.map((place) => (
                  <TempleCard
                    key={place.buildingId}
                    temple={place}
                    data={loaded}
                    now={now}
                    busy={busy}
                    run={run}
                  />
                ))}
              </ul>
              <h3 className="eco-subtitle">{m.temple_labs_title()}</h3>
              {loaded.labs.length === 0 ? <p className="eco-empty">{m.temple_labs_empty()}</p> : null}
              <ul className="temple-list">
                {loaded.labs.map((place) => (
                  <LabCard key={place.buildingId} lab={place} data={loaded} busy={busy} run={run} />
                ))}
              </ul>
              <h3 className="eco-subtitle">{m.temple_humans_title({ count: loaded.humans.length })}</h3>
              {loaded.humans.length === 0 ? <p className="eco-empty">{m.temple_humans_empty()}</p> : null}
              <ul className="temple-humans" data-part="temple-humans">
                {loaded.humans.map((human) => (
                  <HumanRow
                    key={human.unitId}
                    human={human}
                    now={now}
                    dev={loaded.devGrant}
                    busy={busy}
                    run={run}
                  />
                ))}
              </ul>
              <h3 className="eco-subtitle">{m.temple_guardians_title({ count: loaded.guardians.length })}</h3>
              {loaded.guardians.length === 0 ? (
                <p className="eco-empty">{m.temple_guardians_empty()}</p>
              ) : null}
              <ul className="temple-humans" data-part="temple-guardians">
                {loaded.guardians.map((guardian) => (
                  <li key={guardian.unitId} className="temple-human" data-guardian={guardian.unitId}>
                    <p>
                      {m.temple_guardian_line({
                        id: guardian.unitId,
                        city: guardian.cityId,
                        level: guardian.level,
                        rebirths: guardian.rebirths,
                      })}
                      {guardian.mine ? <span className="eco-tag">{m.temple_card_mine()}</span> : null}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          );
        }}
      </Loaded>
      <LiveMessage tone={tone} lines={live.lines} version={live.version} />
    </section>
  );
}
