// 유닛 화면 [융합] 칸 — 사이보그 유닛 융합(D-470: 휴먼 + 기계 부품 → 사이보그 유닛, 수명 없음·유지비 비쌈)과 유전자
// (D-478·D-481·D-516: 수명이 다한 휴먼에서 남는 인스턴스 — 합성·주입·인큐베이터, GenePanel.tsx). 49 N46·N47,
// docs/adr/2026-11-07-cyborg-fusion-genes.md. 기술 기본 화면이다(옛 융합 화면이 없다): 비용·비율 → 내 휴먼(지금 스탯 → 융합 뒤 범위,
// 배운 스킬, 수명, [융합]) → 내 사이보그 유닛 → 유전자 판. dev·admin은 시험 재료·유전자를 받고 휴먼의 수명을 끝낸다.
// 자료는 tRPC fusion.overview, 바꾸는 명령은 WebSocket(프로토콜 9·11). 명령 뒤에는 목록을 다시 받는다(onChanged = 유닛 목록도 다시).
import type { FusionOverviewResponse } from "@terra/shared/fusion";
import { useEffect, useRef, useState } from "react";
import { refreshSession } from "../auth/session.ts";
import { api } from "../net/api.ts";
import { field } from "../net/json.ts";
import { m } from "../paraglide/messages.js";
import { formatAmount, formatNumber } from "../roster/rosterText.ts";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { GenePanel } from "./GenePanel.tsx";
import { type FusionSuccess, sendFusionCommand } from "./fusionCommands.ts";
import { RESULT_TEXT, type RunFusion, StatRow, getLang, percent, times } from "./fusionParts.tsx";
import "./fusion.css";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: FusionOverviewResponse }
  | { readonly status: "failed"; readonly message: string };

const DAY_MS = 86_400_000;

/** 조회 실패 문구: 세계 준비 전(PRECONDITION_FAILED)은 따로 알린다 */
function loadError(error: unknown): string {
  const code = field(field(error, "data"), "code");
  if (code === "UNAUTHORIZED") {
    void refreshSession();
    return m.auth_notice_session_ended();
  }
  if (code === "PRECONDITION_FAILED") return m.fusion_not_ready();
  return m.fusion_load_failed();
}

export function FusionPanel({ onChanged }: { onChanged: () => void }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const notice = useLiveLines();
  const problem = useLiveLines();

  const fetchOverview = (): Promise<void> =>
    api.fusion.overview.query().then(
      (data) => setLoad({ status: "ready", data }),
      (error: unknown) => setLoad({ status: "failed", message: loadError(error) }),
    );

  // 처음 한 번 받는다(받은 뒤 setLoad는 비동기 콜백 안이다)
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) return;
    first.current = false;
    void api.fusion.overview.query().then(
      (data) => setLoad({ status: "ready", data }),
      (error: unknown) => setLoad({ status: "failed", message: loadError(error) }),
    );
  }, []);

  /** 명령 하나(busyKey = 누른 단추). 성공 문구를 만들고 목록·유닛 목록을 다시 받는다 */
  const run: RunFusion = async (busyKey, commands, success) => {
    if (busy !== null) return;
    setBusy(busyKey);
    notice.clear();
    problem.clear();
    try {
      let last: FusionSuccess = {};
      for (const command of commands) {
        const outcome = await sendFusionCommand(command);
        if (!outcome.ok) {
          problem.show([RESULT_TEXT[outcome.code]()]);
          return;
        }
        last = outcome;
      }
      notice.show([success(last)]);
    } finally {
      await fetchOverview();
      onChanged();
      setBusy(null);
    }
  };

  const data = load.status === "ready" ? load.data : null;

  return (
    <section className="fusion" aria-labelledby="fusion-title" data-status={load.status}>
      <div className="panel fusion-panel">
        <h2 id="fusion-title" className="fusion-heading">
          {m.fusion_title()}
        </h2>
        <p className="lead">{m.fusion_lead()}</p>
        {load.status === "loading" ? <p className="field-hint">{m.fusion_loading()}</p> : null}
        {load.status === "failed" ? (
          <div className="units-panel-actions">
            <p role="alert" className="field-error">
              {load.message}
            </p>
            <button type="button" className="button-small" onClick={() => void fetchOverview()}>
              {m.fusion_retry()}
            </button>
          </div>
        ) : null}
        {data ? (
          <>
            <dl className="fusion-costs">
              <div className="fusion-cost">
                <dt>{m.fusion_cost_currency()}</dt>
                <dd>
                  <span className="fusion-num">{formatAmount(data.rules.currency)}</span>
                  <span className="field-hint">{m.fusion_have({ have: formatAmount(data.balance) })}</span>
                </dd>
              </div>
              {data.rules.materials.map((material) => (
                <div key={material.item} className="fusion-cost" data-item={material.item}>
                  <dt>{material.name[getLang()]}</dt>
                  <dd>
                    <span className="fusion-num">{formatNumber(material.qty)}</span>
                    <span className="field-hint">{m.fusion_have({ have: formatAmount(material.have) })}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <ul className="fusion-rules">
              <li>
                {m.fusion_mix({
                  donor: percent(data.rules.physicalDonorPm),
                  human: percent(data.rules.mentalHumanPm),
                  min: times(data.rules.bonusMinPm),
                  max: times(data.rules.bonusMaxPm),
                })}
              </li>
              <li>{m.fusion_parts({ value: formatNumber(data.rules.donorStats[0] ?? 0) })}</li>
              <li>{m.fusion_upkeep({ times: times(data.rules.upkeepPm) })}</li>
              <li className="field-hint">{m.fusion_facility_note()}</li>
            </ul>
            {data.devGrant ? (
              <div className="units-panel-actions">
                <button
                  type="button"
                  className="button-small"
                  disabled={busy !== null}
                  aria-busy={busy === "dev-materials"}
                  onClick={() =>
                    void run(
                      "dev-materials",
                      [
                        {
                          t: "dev_grant_goods",
                          item: "currency",
                          quantity: Number(data.rules.currency) || 1,
                        },
                        ...data.rules.materials.map(
                          (material) =>
                            ({ t: "dev_grant_goods", item: material.item, quantity: material.qty }) as const,
                        ),
                      ],
                      () => m.fusion_dev_granted(),
                    )
                  }
                >
                  {m.fusion_dev_materials()}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
      <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
      {data ? (
        <>
          <section className="panel fusion-panel" aria-labelledby="fusion-humans">
            <h3 id="fusion-humans" className="fusion-heading">
              {m.fusion_humans_title({ count: formatNumber(data.humans.length) })}
            </h3>
            <p className="field-hint">{m.fusion_lifespan_note()}</p>
            {data.humans.length === 0 ? <p className="field-hint">{m.fusion_humans_empty()}</p> : null}
            <ul className="fusion-list">
              {data.humans.map((human) => {
                const left = human.lifespanEndsAtMs - data.generatedAt;
                const over = left <= 0;
                return (
                  <li key={human.unitId} className="fusion-card" data-unit={human.unitId}>
                    <p className="fusion-card-title">
                      {m.fusion_human_name({ id: human.unitId, level: formatNumber(human.level) })}
                    </p>
                    <StatRow label={m.fusion_now()} values={human.stats} />
                    <StatRow label={m.fusion_after()} values={human.fused.min} high={human.fused.max} />
                    <p className="field-hint fusion-skills">
                      {human.skills.length === 0
                        ? m.fusion_human_skills_none({ slots: formatNumber(human.skillSlots) })
                        : m.fusion_human_skills({
                            count: formatNumber(human.skills.length),
                            slots: formatNumber(human.skillSlots),
                            list: human.skills.map((skill) => skill.name?.[getLang()] ?? skill.id).join(", "),
                          })}
                    </p>
                    <p className="field-hint">
                      {over
                        ? m.fusion_lifespan_over()
                        : m.fusion_lifespan_left({ days: formatNumber(Math.ceil(left / DAY_MS)) })}
                    </p>
                    {human.captive ? <p className="field-error">{m.fusion_err_captive()}</p> : null}
                    <div className="units-panel-actions">
                      <button
                        type="button"
                        className="button-small fusion-fuse"
                        disabled={busy !== null || human.captive}
                        aria-busy={busy === `fuse-${human.unitId}`}
                        onClick={() =>
                          void run(
                            `fuse-${human.unitId}`,
                            [{ t: "cyborg_fuse", human: human.unitId, cost: data.rules.currency }],
                            (outcome) =>
                              m.fusion_fused({ id: human.unitId, bonus: times(outcome.bonusPm ?? 1000) }),
                          )
                        }
                      >
                        {m.fusion_fuse()}
                      </button>
                      {data.devGrant ? (
                        <button
                          type="button"
                          className="button-small fusion-expire"
                          disabled={busy !== null}
                          aria-busy={busy === `expire-${human.unitId}`}
                          onClick={() =>
                            void run(
                              `expire-${human.unitId}`,
                              [{ t: "dev_expire_unit", unit: human.unitId }],
                              (outcome) =>
                                m.fusion_expired({
                                  id: human.unitId,
                                  count: formatNumber(outcome.genes?.length ?? 0),
                                }),
                            )
                          }
                        >
                          {m.fusion_dev_expire()}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="panel fusion-panel" aria-labelledby="fusion-cyborgs">
            <h3 id="fusion-cyborgs" className="fusion-heading">
              {m.fusion_cyborgs_title({ count: formatNumber(data.cyborgUnits.length) })}
            </h3>
            {data.cyborgUnits.length === 0 ? <p className="field-hint">{m.fusion_cyborgs_empty()}</p> : null}
            <ul className="fusion-list">
              {data.cyborgUnits.map((unit) => (
                <li key={unit.unitId} className="fusion-card" data-cyborg={unit.unitId}>
                  <p className="fusion-card-title">
                    {m.fusion_cyborg_name({ id: unit.unitId, level: formatNumber(unit.level) })}
                  </p>
                  <StatRow label={m.fusion_now()} values={unit.stats} />
                  <StatRow label={m.fusion_human_before()} values={unit.humanStats} />
                  <p className="field-hint">{m.fusion_bonus({ bonus: times(unit.bonusPm) })}</p>
                </li>
              ))}
            </ul>
          </section>
          <GenePanel data={data} busy={busy} run={run} />
        </>
      ) : null}
    </section>
  );
}
