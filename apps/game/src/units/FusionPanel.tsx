// 유닛 화면 [융합] 칸 — 사이보그 유닛 융합(D-470: 휴먼 + 기계 부품 → 사이보그 유닛, 수명 없음·유지비 비쌈)과 유전자 조각
// (D-478·D-481: 유닛이 죽으면 그 종의 조각, 한 번 쓰면 사라짐, 수명이 다한 휴먼의 유전자 환생). 49 N46·N47,
// docs/adr/2026-11-07-cyborg-fusion-genes.md. 기술 기본 화면이다(옛 융합 화면이 없다): 비용·비율 → 내 휴먼(지금 스탯 → 융합 뒤 범위,
// [융합]·[유전자 환생]) → 내 사이보그 유닛 → 가진 유전자 조각. dev·admin은 시험 재료·조각을 받는다.
// 자료는 tRPC fusion.overview, 바꾸는 명령은 WebSocket(프로토콜 9). 명령 뒤에는 목록을 다시 받는다(onChanged = 유닛 목록도 다시).
import type { FusionResultCode } from "@terra/protocol";
import { FUSION_STAT_ORDER, type FusionOverviewResponse } from "@terra/shared/fusion";
import { useEffect, useRef, useState } from "react";
import { refreshSession } from "../auth/session.ts";
import { api } from "../net/api.ts";
import { field } from "../net/json.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { formatAmount, formatNumber } from "../roster/rosterText.ts";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { type FusionCommand, sendFusionCommand } from "./fusionCommands.ts";
import "./fusion.css";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: FusionOverviewResponse }
  | { readonly status: "failed"; readonly message: string };

const DAY_MS = 86_400_000;

/** 화면 언어(팩 이름 ko·en 고르기) */
const getLang = (): "ko" | "en" => (getLocale() === "en" ? "en" : "ko");

const STAT_CODE = {
  str: m.roster_stat_str_code,
  dex: m.roster_stat_dex_code,
  agi: m.roster_stat_agi_code,
  vit: m.roster_stat_vit_code,
  int: m.roster_stat_int_code,
  wis: m.roster_stat_wis_code,
} as const;

const RESULT_TEXT: Readonly<Record<FusionResultCode | "offline" | "timeout", () => string>> = {
  sign_in_required: m.fusion_err_sign_in,
  busy: m.fusion_err_busy,
  rate_limited: m.fusion_err_rate_limited,
  internal_error: m.fusion_err_internal,
  forbidden: m.fusion_err_forbidden,
  no_cyborg: m.fusion_err_no_cyborg,
  unknown_unit: m.fusion_err_unknown_unit,
  wrong_kind: m.fusion_err_wrong_kind,
  captive: m.fusion_err_captive,
  cost_changed: m.fusion_err_cost_changed,
  insufficient_funds: m.fusion_err_funds,
  insufficient_materials: m.fusion_err_materials,
  insufficient_genes: m.fusion_err_genes,
  no_gene: m.fusion_err_no_gene,
  alive: m.fusion_err_alive,
  unknown_item: m.fusion_err_unknown_item,
  offline: m.fusion_err_offline,
  timeout: m.fusion_err_timeout,
};

const SPECIES_NAME: Readonly<Record<string, () => string>> = {
  human: m.roster_type_human,
  creature: m.roster_type_creature,
  android: m.roster_type_android,
  cyborg: m.roster_type_cyborg,
};

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

/** ‰ → 배율 글자(1150 → "1.15") */
const times = (pm: number): string =>
  new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 3 }).format(pm / 1000);
const percent = (pm: number): string => formatNumber(Math.round(pm / 10));

/** 1차 스탯 여섯 칸(값 또는 범위) */
function StatRow({
  values,
  high,
  label,
}: {
  values: readonly number[];
  high?: readonly number[] | undefined;
  label: string;
}) {
  return (
    <div className="fusion-stat-row">
      <span className="fusion-stat-label">{label}</span>
      <dl className="fusion-stats">
        {FUSION_STAT_ORDER.map((stat, index) => {
          const low = values[index] ?? 0;
          const top = high?.[index];
          return (
            <div key={stat} className="fusion-stat" data-stat={stat}>
              <dt>{STAT_CODE[stat]()}</dt>
              <dd className="fusion-num">
                {top === undefined || top === low
                  ? formatNumber(low)
                  : `${formatNumber(low)}–${formatNumber(top)}`}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
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
  const run = async (
    busyKey: string,
    commands: readonly FusionCommand[],
    success: (outcome: {
      unitId?: number | undefined;
      bonusPm?: number | undefined;
      shards?: number | undefined;
    }) => string,
  ): Promise<void> => {
    if (busy !== null) return;
    setBusy(busyKey);
    notice.clear();
    problem.clear();
    try {
      let last: Parameters<typeof success>[0] = {};
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
                      <button
                        type="button"
                        className="button-small fusion-rebirth"
                        disabled={busy !== null || human.captive || !over}
                        aria-busy={busy === `rebirth-${human.unitId}`}
                        onClick={() =>
                          void run(
                            `rebirth-${human.unitId}`,
                            [{ t: "unit_rebirth", unit: human.unitId, shards: human.rebirthShards }],
                            (outcome) =>
                              m.fusion_reborn({
                                id: human.unitId,
                                count: formatNumber(outcome.shards ?? human.rebirthShards),
                              }),
                          )
                        }
                      >
                        {m.fusion_rebirth({ count: formatNumber(human.rebirthShards) })}
                      </button>
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
          <section className="panel fusion-panel" aria-labelledby="fusion-genes">
            <h3 id="fusion-genes" className="fusion-heading">
              {m.fusion_genes_title()}
            </h3>
            <p className="field-hint">{m.fusion_genes_lead()}</p>
            <p className="field-hint">
              {m.fusion_gene_rule({
                min: formatNumber(data.rules.geneMin),
                div: formatNumber(data.rules.geneLevelDivisor),
                points: formatNumber(data.rules.genePoints),
              })}
            </p>
            <ul className="fusion-genes">
              {data.genes.map((gene) => (
                <li key={gene.item} className="fusion-gene" data-item={gene.item}>
                  <span className="fusion-gene-name">{gene.name[getLang()]}</span>
                  <span className="field-hint">
                    {m.fusion_gene_meta({
                      kind: gene.kind === "stat" ? m.fusion_gene_kind_stat() : m.fusion_gene_kind_skill(),
                      species: SPECIES_NAME[gene.species]?.() ?? gene.species,
                      drops: gene.drops.includes("death")
                        ? m.fusion_gene_drops_death()
                        : m.fusion_gene_drops_none(),
                    })}
                  </span>
                  <span className="fusion-num fusion-gene-qty">{formatAmount(gene.qty)}</span>
                </li>
              ))}
            </ul>
            {data.devGrant ? (
              <div className="units-panel-actions">
                <button
                  type="button"
                  className="button-small"
                  disabled={busy !== null}
                  aria-busy={busy === "dev-genes"}
                  onClick={() =>
                    void run(
                      "dev-genes",
                      data.genes
                        .filter((gene) => gene.kind === "stat")
                        .map((gene) => ({ t: "dev_grant_goods", item: gene.item, quantity: 5 }) as const),
                      () => m.fusion_dev_granted(),
                    )
                  }
                >
                  {m.fusion_dev_genes()}
                </button>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </section>
  );
}
