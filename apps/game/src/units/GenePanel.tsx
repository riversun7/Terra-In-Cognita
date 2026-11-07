// 유닛 화면 [융합] 칸의 유전자 판 — 기획 D-478(수명이 다한 휴먼·크리쳐의 스탯·스킬이 유전자로 남음, 스킬 유전자는 주입, 스탯 유전자는
// 인큐베이터), D-481(조합 속성 = 평균 + 오차), D-516(스탯 유전자 = 총합·분포·속성 인스턴스, 총합·주력 스탯 골라 적용, 합성은 확률로 오름·
// 내림·그대로), docs/adr/2026-11-07-cyborg-fusion-genes.md "바뀜 (D-516)". 기술 기본 화면이다(옛 유전자 화면이 없다):
// 규칙(합성 확률·인큐베이터) → 합성(스탯 유전자 둘 고르기 → [합성]) → 인큐베이터 연구소 고르기(기획 답 459 가: 생명과학 연구소에서 화폐로,
// 새 휴먼은 연구소 둘레·그 도시에 산다) → 유전자 목록(스탯: 총합·칸 값·주력·속성, [연구소 인큐베이터 총합·주력], dev·admin은 연구소 없는
// 개발 시험 [인큐베이터 총합·주력]도, 스킬: 스킬 이름, 주입할 휴먼 고르기 → [주입]). dev·admin은 시험 유전자를 받는다. 명령은 FusionPanel의
// 실행기(run)로 보낸다.
import { ELEMENT_CODES, type ElementCode } from "@terra/shared/roster";
import { FUSION_STAT_ORDER, type FusionGeneView, type FusionOverviewResponse } from "@terra/shared/fusion";
import { useState } from "react";
import { m } from "../paraglide/messages.js";
import { formatAmount, formatNumber } from "../roster/rosterText.ts";
import { type RunFusion, SPECIES_NAME, STAT_CODE, StatRow, getLang, percent } from "./fusionParts.tsx";

const ELEMENT_TEXT: Readonly<Record<ElementCode, () => string>> = {
  water: m.cyborg_element_water,
  frost: m.cyborg_element_frost,
  fire: m.cyborg_element_fire,
  blaze: m.cyborg_element_blaze,
  wind: m.cyborg_element_wind,
  lightning: m.cyborg_element_lightning,
  earth: m.cyborg_element_earth,
  crystal: m.cyborg_element_crystal,
  light: m.cyborg_element_light,
  holy: m.cyborg_element_holy,
  dark: m.cyborg_element_dark,
  necro: m.cyborg_element_necro,
};

/** 인큐베이터 적용 방식(D-516: 총합·주력 스탯) */
const GENE_APPLIES = ["total", "main"] as const;

const OUTCOME_TEXT = {
  up: m.fusion_outcome_up,
  down: m.fusion_outcome_down,
  keep: m.fusion_outcome_keep,
} as const;

/** 0이 아닌 속성 칸(이름 값) */
function ElementChips({ values }: { values: readonly number[] }) {
  const shown = ELEMENT_CODES.flatMap((code, index) => {
    const value = values[index] ?? 0;
    return value > 0 ? [{ code, value }] : [];
  });
  if (shown.length === 0) return <p className="field-hint">{m.fusion_gene_elements_none()}</p>;
  return (
    <ul className="fusion-elements" aria-label={m.fusion_gene_elements()}>
      {shown.map((entry) => (
        <li key={entry.code} className="fusion-element" data-element={entry.code}>
          {ELEMENT_TEXT[entry.code]()} <span className="fusion-num">{formatNumber(entry.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** 유전자 하나의 머리(이름·종·세대·남긴 유닛) */
function GeneHead({ gene }: { gene: FusionGeneView }) {
  return (
    <>
      <p className="fusion-card-title">{m.fusion_gene_title({ name: gene.name[getLang()], id: gene.id })}</p>
      <p className="field-hint">
        {m.fusion_gene_meta({
          species: SPECIES_NAME[gene.species]?.() ?? gene.species,
          from:
            gene.fromUnit === null
              ? m.fusion_gene_from_none()
              : m.fusion_gene_from({ id: gene.fromUnit, level: formatNumber(gene.level ?? 1) }),
          generation: formatNumber(gene.generation),
        })}
      </p>
    </>
  );
}

export function GenePanel({
  data,
  busy,
  run,
}: {
  data: FusionOverviewResponse;
  busy: string | null;
  run: RunFusion;
}) {
  const [picked, setPicked] = useState<readonly number[]>([]);
  const [targets, setTargets] = useState<Readonly<Record<number, number>>>({});
  const [labChoice, setLabChoice] = useState<number | null>(null);
  const rules = data.rules.genes;
  // 고른 연구소가 사라졌으면 일하는 첫 연구소(없으면 첫 연구소)
  const lab =
    data.labs.find((entry) => entry.buildingId === labChoice) ??
    data.labs.find((entry) => entry.works) ??
    data.labs[0];
  const incubateCost = rules.incubateCurrency;
  const canIncubate = lab !== undefined && lab.works && BigInt(data.balance) >= BigInt(incubateCost);
  const statGenes = data.genes.filter((gene) => gene.kind === "stat");
  const live = picked.filter((id) => statGenes.some((gene) => gene.id === id));
  const humans = data.humans.filter((human) => !human.captive);

  const toggle = (id: number): void =>
    setPicked((before) => {
      const kept = before.filter((entry) => statGenes.some((gene) => gene.id === entry));
      if (kept.includes(id)) return kept.filter((entry) => entry !== id);
      return [...kept, id].slice(-2);
    });

  const synthesize = (): void => {
    const [a, b] = live;
    if (a === undefined || b === undefined) return;
    void run("synth", [{ t: "gene_synthesize", a, b }], (outcome) =>
      m.fusion_synth_done({
        id: outcome.gene ?? 0,
        total: formatNumber(outcome.total ?? 0),
        outcome: OUTCOME_TEXT[outcome.outcome ?? "keep"](),
      }),
    ).then(() => setPicked([]));
  };

  return (
    <section className="panel fusion-panel" aria-labelledby="fusion-genes">
      <h3 id="fusion-genes" className="fusion-heading">
        {m.fusion_genes_title({ count: formatNumber(data.genes.length) })}
      </h3>
      <p className="field-hint">{m.fusion_genes_lead()}</p>
      <ul className="fusion-rules">
        <li>
          {m.fusion_synth_rule({
            up: percent(rules.upPm),
            down: percent(rules.downPm),
            keep: percent(rules.keepPm),
            step: percent(rules.stepPm),
            max: formatNumber(rules.totalMax),
            variance: formatNumber(rules.elementVariance),
          })}
        </li>
        <li>{m.fusion_incubate_rule({ base: formatNumber(rules.incubateBase) })}</li>
        <li className="field-hint">{m.fusion_gene_facility_note()}</li>
        {data.devGrant ? <li className="field-hint">{m.fusion_incubate_dev_note()}</li> : null}
      </ul>
      {lab === undefined ? (
        <p className="field-hint" data-part="incubate-no-lab">
          {m.fusion_incubate_no_lab()}
        </p>
      ) : (
        <div className="units-panel-actions fusion-incubate-lab" data-part="incubate-lab">
          <label className="fusion-target">
            <span className="field-hint">{m.fusion_incubate_lab()}</span>
            <select
              value={lab.buildingId}
              disabled={busy !== null}
              onChange={(event) => setLabChoice(Number(event.target.value))}
            >
              {data.labs.map((entry) => (
                <option key={entry.buildingId} value={entry.buildingId}>
                  {m.fusion_incubate_lab_option({
                    name: entry.name[getLang()],
                    id: entry.buildingId,
                    city: entry.cityId === null ? "—" : `#${entry.cityId}`,
                  })}
                  {entry.works ? "" : ` ${m.fusion_incubate_lab_closed()}`}
                </option>
              ))}
            </select>
          </label>
          <span className="field-hint">
            {m.fusion_incubate_lab_cost({ cost: formatAmount(incubateCost) })}
          </span>
        </div>
      )}
      <div className="units-panel-actions fusion-synth">
        <span className="field-hint" aria-live="polite">
          {m.fusion_synth_pick({ count: formatNumber(live.length) })}
        </span>
        <button
          type="button"
          className="button-small fusion-synth-go"
          disabled={busy !== null || live.length < 2}
          aria-busy={busy === "synth"}
          onClick={synthesize}
        >
          {m.fusion_synth()}
        </button>
      </div>
      {data.genes.length === 0 ? <p className="field-hint">{m.fusion_genes_empty()}</p> : null}
      <ul className="fusion-list">
        {data.genes.map((gene) => {
          // 고른 휴먼이 떠났으면(수명·융합) 첫 휴먼으로
          const chosen = targets[gene.id];
          const target = humans.some((human) => human.unitId === chosen) ? chosen : humans[0]?.unitId;
          return (
            <li key={gene.id} className="fusion-card fusion-gene" data-gene={gene.id} data-kind={gene.kind}>
              <GeneHead gene={gene} />
              {gene.kind === "stat" && gene.stats ? (
                <>
                  <p className="fusion-gene-total">
                    {m.fusion_gene_total({ total: formatNumber(gene.total ?? 0) })}
                    {gene.main === null ? null : (
                      <span className="field-hint">
                        {" "}
                        {m.fusion_gene_main({ stat: STAT_CODE[FUSION_STAT_ORDER[gene.main] ?? "str"]() })}
                      </span>
                    )}
                  </p>
                  <StatRow label={m.fusion_gene_values()} values={gene.stats} main={gene.main} />
                  <ElementChips values={gene.elements ?? []} />
                  <div className="units-panel-actions">
                    <label className="fusion-pick">
                      <input
                        type="checkbox"
                        checked={live.includes(gene.id)}
                        disabled={busy !== null}
                        onChange={() => toggle(gene.id)}
                      />
                      {m.fusion_synth_select()}
                    </label>
                    {lab
                      ? GENE_APPLIES.map((apply) => (
                          <button
                            key={`lab-${apply}`}
                            type="button"
                            className={`button-small fusion-incubate-lab-${apply}`}
                            disabled={busy !== null || !canIncubate}
                            aria-busy={busy === `incubate-lab-${apply}-${gene.id}`}
                            onClick={() =>
                              void run(
                                `incubate-lab-${apply}-${gene.id}`,
                                [
                                  {
                                    t: "gene_incubate",
                                    gene: gene.id,
                                    apply,
                                    buildingId: lab.buildingId,
                                    cost: incubateCost,
                                  },
                                ],
                                (outcome) => m.fusion_incubated({ id: outcome.unitId ?? 0 }),
                              )
                            }
                          >
                            {apply === "total" ? m.fusion_incubate_lab_total() : m.fusion_incubate_lab_main()}
                          </button>
                        ))
                      : null}
                    {data.devGrant
                      ? GENE_APPLIES.map((apply) => (
                          <button
                            key={apply}
                            type="button"
                            className={`button-small fusion-incubate-${apply}`}
                            disabled={busy !== null}
                            aria-busy={busy === `incubate-${apply}-${gene.id}`}
                            onClick={() =>
                              void run(
                                `incubate-${apply}-${gene.id}`,
                                [{ t: "gene_incubate", gene: gene.id, apply }],
                                (outcome) => m.fusion_incubated({ id: outcome.unitId ?? 0 }),
                              )
                            }
                          >
                            {apply === "total" ? m.fusion_incubate_total() : m.fusion_incubate_main()}
                          </button>
                        ))
                      : null}
                  </div>
                </>
              ) : (
                <>
                  <p className="fusion-gene-total">
                    {m.fusion_gene_skill({ skill: gene.skillName?.[getLang()] ?? gene.skill ?? "" })}
                  </p>
                  {humans.length === 0 ? (
                    <p className="field-hint">{m.fusion_inject_none()}</p>
                  ) : (
                    <div className="units-panel-actions">
                      <label className="fusion-target">
                        <span className="field-hint">{m.fusion_inject_target()}</span>
                        <select
                          value={target}
                          disabled={busy !== null}
                          onChange={(event) =>
                            setTargets((before) => ({ ...before, [gene.id]: Number(event.target.value) }))
                          }
                        >
                          {humans.map((human) => (
                            <option key={human.unitId} value={human.unitId}>
                              {m.fusion_human_name({ id: human.unitId, level: formatNumber(human.level) })}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="button-small fusion-inject"
                        disabled={busy !== null || target === undefined}
                        aria-busy={busy === `inject-${gene.id}`}
                        onClick={() => {
                          if (target === undefined) return;
                          void run(
                            `inject-${gene.id}`,
                            [{ t: "gene_inject", gene: gene.id, unit: target }],
                            () =>
                              m.fusion_injected({
                                id: target,
                                skill: gene.skillName?.[getLang()] ?? gene.skill ?? "",
                              }),
                          );
                        }}
                      >
                        {m.fusion_inject()}
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {data.devGrant ? (
        <div className="units-panel-actions">
          <button
            type="button"
            className="button-small fusion-dev-stat"
            disabled={busy !== null}
            aria-busy={busy === "dev-stat-gene"}
            onClick={() =>
              void run("dev-stat-gene", [{ t: "dev_grant_gene", kind: "stat" }], (outcome) =>
                m.fusion_dev_gene_granted({ id: outcome.gene ?? 0 }),
              )
            }
          >
            {m.fusion_dev_stat_gene()}
          </button>
          <button
            type="button"
            className="button-small fusion-dev-skill"
            disabled={busy !== null}
            aria-busy={busy === "dev-skill-gene"}
            onClick={() =>
              void run("dev-skill-gene", [{ t: "dev_grant_gene", kind: "skill" }], (outcome) =>
                m.fusion_dev_gene_granted({ id: outcome.gene ?? 0 }),
              )
            }
          >
            {m.fusion_dev_skill_gene()}
          </button>
        </div>
      ) : null}
    </section>
  );
}
