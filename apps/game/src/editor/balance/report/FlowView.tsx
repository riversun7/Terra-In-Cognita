// 피해 흐름도 — 공격 한 번이 판정 차례대로 지나는 단계(시도 → 명중 굴림 → 회피 굴림 → 크리 굴림 → 공격력 → 방어 … → 반영)를
// 편마다·공격자→방어자 짝마다 보인다. 단계마다 들어온·나간 수(굴림)나 명중 한 번 평균 값(p10·p90), 그 단계가 줄이거나 늘린 몫.
// 가장 크게 줄인 단계와 늘린 단계를 표시한다(밸런스가 어느 단계에서 어긋나는지). 넓은 화면은 가로 사슬, 좁은 화면(390px)은 세로.
// 아래 한 대 풀이: 첫 판 표본, 또는 기록의 N번째 판을 서버가 저장된 시드로 다시 돌린 공격 단계(battleReport.trace).
import type { ReportFlow, ReportHitTrace, ReportResult } from "@terra/shared/battleReport";
import { REPORT_LIMITS } from "@terra/shared/battleReport";
import { useId, useMemo, useState } from "react";
import { refreshSession } from "../../../auth/session.ts";
import { api } from "../../../net/api.ts";
import { m } from "../../../paraglide/messages.js";
import { NumberField } from "../lab/fields.tsx";
import { HitTrace } from "./HitTrace.tsx";
import { reasonText, rowLabel, stageText } from "./reportMessages.ts";
import {
  type FlowStep,
  type ReportErrorKey,
  flowExtremes,
  flowSteps,
  pairKeys,
  reportErrorOf,
} from "./reportModel.ts";

const pct = (pm: number, locale: string): string =>
  `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(pm / 10)}%`;

/** 단계 칸 안의 입력 평균 한 줄 */
function detailText(step: FlowStep, locale: string): string | null {
  const d = step.detail;
  const n = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  switch (step.id) {
    case "attack":
      return m.dev_report_detail_attack({ skills: n(d.skillAttacks ?? 0) });
    case "hitRoll":
      return m.dev_report_detail_hit({ chance: pct(d.hitPm ?? 0, locale) });
    case "evadeRoll":
      return m.dev_report_detail_evade({
        base: pct(d.evadeBasePm ?? 0, locale),
        relative: pct(d.evadeRelativePm ?? 0, locale),
        final: pct(d.evadePm ?? 0, locale),
        low: n(d.evadeAtMin ?? 0),
        high: n(d.evadeAtMax ?? 0),
      });
    case "critRoll":
      return m.dev_report_detail_crit_roll({ chance: pct(d.critPm ?? 0, locale), crits: n(d.crits ?? 0) });
    case "raw":
      return m.dev_report_detail_raw({
        stat: n(d.statAttack ?? 0),
        weapon: n(d.weaponAttack ?? 0),
        physical: n(d.physicalRaw ?? 0),
        elemental: n(d.elementalRaw ?? 0),
      });
    case "rate":
      return m.dev_report_detail_rate({
        rate: pct(d.ratePm ?? 0, locale),
        defense: pct(d.defenseRatePm ?? 0, locale),
        penetration: pct(d.penetrationPm ?? 0, locale),
      });
    case "flat":
      return m.dev_report_detail_flat({ flat: n(d.defenseFlat ?? 0) });
    case "matchup":
      return (d.elementalHits ?? 0) > 0
        ? m.dev_report_detail_matchup({ value: pct(d.matchupPm ?? 0, locale) })
        : m.dev_report_detail_no_elemental();
    case "elementalDefense":
      return m.dev_report_detail_elemental_defense({ value: pct(d.elementalDefensePm ?? 0, locale) });
    case "resist":
      return m.dev_report_detail_resist({ value: pct(d.resistPm ?? 0, locale) });
    case "crit":
      return m.dev_report_detail_crit({ value: `×${n((d.critMulPm ?? 0) / 1000)}`, crits: n(d.crits ?? 0) });
    case "skill":
      return m.dev_report_detail_skill({ value: `×${n((d.skillMulPm ?? 0) / 1000)}` });
    case "buff":
      return m.dev_report_detail_buff({ value: `×${n((d.buffPm ?? 0) / 1000)}` });
    case "floor":
      return m.dev_report_detail_floor({ count: n(d.floored ?? 0) });
    case "applied": {
      const total = (d.toArmor ?? 0) + (d.toShield ?? 0) + (d.toHp ?? 0);
      const share = (value: number) => pct(total <= 0 ? 0 : Math.round((value * 1000) / total), locale);
      return m.dev_report_detail_applied({
        armor: share(d.toArmor ?? 0),
        shield: share(d.toShield ?? 0),
        hp: share(d.toHp ?? 0),
        overkill: n(d.overkill ?? 0),
      });
    }
    default:
      return null;
  }
}

function FlowChain({ flow, locale }: { readonly flow: ReportFlow; readonly locale: string }) {
  const steps = flowSteps(flow);
  const { loss, gain } = flowExtremes(steps);
  const n = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  if (flow.attacks === 0) return <p className="field-hint">{m.dev_report_flow_empty()}</p>;
  return (
    <ol className="rp-flow" aria-label={m.dev_report_flow_title()}>
      {steps.map((step) => {
        const extreme = step.id === loss ? "loss" : step.id === gain ? "gain" : undefined;
        return (
          <li
            key={step.id}
            className="rp-flow-step"
            data-stage={step.id}
            data-kind={step.kind}
            data-extreme={extreme}
            data-idle={step.idle ? "" : undefined}
          >
            <span className="rp-flow-name">{stageText(step.id)}</span>
            {step.kind === "count" ? (
              <span className="rp-flow-main">
                {m.dev_report_flow_count({ into: n(step.into), out: n(step.out) })}
              </span>
            ) : (
              <span className="rp-flow-main">
                {step.id === "raw"
                  ? n(step.avgOut)
                  : m.dev_report_flow_value({ into: n(step.avgIn), out: n(step.avgOut) })}
              </span>
            )}
            {step.kind === "value" ? (
              <span className="rp-flow-range">
                {m.dev_report_flow_range({ p10: n(step.p10), p90: n(step.p90) })}
              </span>
            ) : null}
            {step.changePm !== null && step.id !== "attack" && step.id !== "raw" ? (
              <span
                className="rp-flow-change"
                data-sign={step.changePm < 0 ? "minus" : step.changePm > 0 ? "plus" : "zero"}
              >
                {`${step.changePm > 0 ? "+" : ""}${pct(step.changePm, locale)}`}
              </span>
            ) : null}
            {extreme ? (
              <span className="rp-flow-flag">
                {extreme === "loss" ? m.dev_report_flow_biggest_loss() : m.dev_report_flow_biggest_gain()}
              </span>
            ) : null}
            <span className="rp-flow-detail">{detailText(step, locale)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function FlowView(props: {
  readonly result: ReportResult;
  readonly reportId: string;
  readonly which: "a" | "b";
  readonly runs: number;
  readonly locale: string;
}) {
  const { result, locale } = props;
  const id = useId();
  const labels = useMemo(() => new Map(result.units.map((row) => [row.key, row.label])), [result]);
  const [scope, setScope] = useState<string>("a");
  const pairs = pairKeys(result.flows.pairs);
  const flow: ReportFlow | undefined =
    scope === "a" ? result.flows.a : scope === "b" ? result.flows.b : result.flows.pairs[scope];
  const [sample, setSample] = useState<number | null>(null);
  const [run, setRun] = useState(0);
  const [trace, setTrace] = useState<{ hits: readonly ReportHitTrace[]; same: boolean; run: number } | null>(
    null,
  );
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReportErrorKey | null>(null);
  const label = (key: string) => rowLabel(key, labels.get(key) ?? "");

  const loadTrace = (): void => {
    if (busy || props.reportId === "") return;
    setBusy(true);
    setError(null);
    api.battleReport.trace
      .mutate({ reportId: props.reportId, which: props.which, run })
      .then(
        (response) => {
          setTrace({ hits: response.hits, same: response.same, run });
          setPick(0);
        },
        (cause: unknown) => {
          const info = reportErrorOf(cause);
          if (info.sessionEnded) void refreshSession();
          setError(info.key);
        },
      )
      .finally(() => setBusy(false));
  };

  const picked = trace?.hits[pick];
  const shownSample = sample === null ? undefined : result.samples[sample];
  return (
    <section className="rp-section rp-flow-section" aria-labelledby={`${id}-flow`}>
      <h3 id={`${id}-flow`} className="bl-subtitle">
        {m.dev_report_flow_title()}
      </h3>
      <p className="field-hint">{m.dev_report_flow_hint()}</p>
      <div className="field rp-flow-scope">
        <label className="field-label" htmlFor={`${id}-scope`}>
          {m.dev_report_flow_scope()}
        </label>
        <select id={`${id}-scope`} value={scope} onChange={(event) => setScope(event.target.value)}>
          <option value="a">{m.dev_report_flow_side_a()}</option>
          <option value="b">{m.dev_report_flow_side_b()}</option>
          {pairs.map((pair) => (
            <option key={pair.key} value={pair.key}>
              {m.dev_report_flow_pair({ from: label(pair.from), to: label(pair.to) })}
            </option>
          ))}
        </select>
      </div>
      {flow ? <FlowChain flow={flow} locale={locale} /> : null}

      <h3 className="bl-subtitle">{m.dev_report_trace_title()}</h3>
      <p className="field-hint">{m.dev_report_trace_hint()}</p>
      {result.samples.length > 0 ? (
        <div className="rp-samples" role="group" aria-label={m.dev_report_samples()}>
          {result.samples.map((hit, index) => (
            <button
              key={index}
              type="button"
              className="button-small rp-sample"
              aria-pressed={sample === index}
              onClick={() => setSample(sample === index ? null : index)}
            >
              {m.dev_report_sample_button({
                attacker: label(hit.attacker),
                target: label(hit.target),
                time: (hit.ms / 1000).toFixed(1),
              })}
            </button>
          ))}
        </div>
      ) : null}
      {shownSample ? <HitTrace hit={shownSample} locale={locale} /> : null}
      {props.reportId !== "" ? (
        <div className="rp-trace-load">
          <NumberField
            label={m.dev_report_trace_run()}
            value={run}
            min={0}
            max={Math.max(0, Math.min(props.runs, REPORT_LIMITS.runsMax) - 1)}
            onChange={setRun}
          />
          <button
            type="button"
            className="button-small rp-trace-run"
            aria-disabled={busy}
            onClick={busy ? undefined : loadTrace}
          >
            {busy ? m.dev_lab_running() : m.dev_report_trace_load()}
          </button>
        </div>
      ) : null}
      {error ? <p className="field-error">{reasonText(error)}</p> : null}
      {trace ? (
        <div className="rp-trace-pick">
          {!trace.same ? <p className="field-hint bp-stale">{m.dev_report_trace_changed()}</p> : null}
          {trace.hits.length === 0 ? (
            <p className="field-hint">{m.dev_report_flow_empty()}</p>
          ) : (
            <>
              <NumberField
                label={m.dev_report_trace_nth({ count: trace.hits.length, run: trace.run })}
                value={pick + 1}
                min={1}
                max={trace.hits.length}
                onChange={(value) => setPick(value - 1)}
              />
              {picked ? <HitTrace hit={picked} locale={locale} /> : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
