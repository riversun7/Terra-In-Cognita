// 탭 1: 7축 성향 생성 범위 · 체제별 조직 합성 · 충성도 개입 곡선 — docs/adr/2026-11-20-npc-autonomous-ai.md
import type { TuningEntryView } from "@terra/shared/tuning";
import { TRAIT_ROLES, type TraitAxis, type TraitRole, UNIT_TRAIT_AXES } from "@terra/shared/unitTraits";

const isTraitRole = (value: string): value is TraitRole => (TRAIT_ROLES as readonly string[]).includes(value);
const isTraitAxis = (value: string): value is TraitAxis =>
  (UNIT_TRAIT_AXES as readonly string[]).includes(value);
import { useMemo, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { DistributionControl, type DistributionPart } from "../content/contentEditorDistribution.tsx";
import { NpcAiNumberField, NpcAiRangeField } from "./NpcAiField.tsx";
import {
  BLEND_PRESETS,
  type BlendPresetId,
  type NpcAiPending,
  TRAIT_AXIS_META,
  buildLoyaltyRules,
  buildRoleRanges,
  effectiveValue,
  packValueOf,
  sampleLoyaltyCurve,
  sampleTraitHistogram,
} from "./npcAiModel.ts";

interface BlendGroupSpec {
  readonly id: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly keys: readonly string[];
  readonly parts: readonly DistributionPart[];
}

const REGIME_BLEND_GROUPS: readonly BlendGroupSpec[] = [
  {
    id: "dict_dec",
    titleKo: "독재 — 결단 축 (호전·과감·자치)",
    titleEn: "Dictatorship — Decision Axes",
    keys: ["npc_ai_dict_dec_leader_pm", "npc_ai_dict_dec_members_pm", "npc_ai_dict_dec_base_pm"],
    parts: [
      { key: "leader", label: "대장", tone: 6 },
      { key: "members", label: "가문장", tone: 2 },
      { key: "base", label: "바탕", tone: 0 },
    ],
  },
  {
    id: "dict_cul",
    titleKo: "독재 — 문화 축 (이윤·공동체·개방·규율)",
    titleEn: "Dictatorship — Culture Axes",
    keys: ["npc_ai_dict_cul_leader_pm", "npc_ai_dict_cul_members_pm", "npc_ai_dict_cul_base_pm"],
    parts: [
      { key: "leader", label: "대장", tone: 6 },
      { key: "members", label: "가문장", tone: 2 },
      { key: "base", label: "바탕", tone: 0 },
    ],
  },
  {
    id: "demo_dec",
    titleKo: "민주 — 결단 축",
    titleEn: "Democracy — Decision Axes",
    keys: ["npc_ai_demo_dec_leader_pm", "npc_ai_demo_dec_members_pm", "npc_ai_demo_dec_base_pm"],
    parts: [
      { key: "leader", label: "지도자", tone: 6 },
      { key: "members", label: "가문장", tone: 1 },
      { key: "base", label: "바탕", tone: 0 },
    ],
  },
  {
    id: "demo_cul",
    titleKo: "민주 — 문화 축",
    titleEn: "Democracy — Culture Axes",
    keys: ["npc_ai_demo_cul_leader_pm", "npc_ai_demo_cul_members_pm", "npc_ai_demo_cul_base_pm"],
    parts: [
      { key: "leader", label: "지도자", tone: 6 },
      { key: "members", label: "가문장", tone: 1 },
      { key: "base", label: "바탕", tone: 0 },
    ],
  },
  {
    id: "cap_dec",
    titleKo: "자본 — 결단 축 (지분 가중)",
    titleEn: "Capitalism — Decision Axes (Share-Weighted)",
    keys: ["npc_ai_cap_dec_leader_pm", "npc_ai_cap_dec_members_pm", "npc_ai_cap_dec_base_pm"],
    parts: [
      { key: "leader", label: "지도자", tone: 6 },
      { key: "members", label: "지분 가문", tone: 4 },
      { key: "base", label: "바탕", tone: 0 },
    ],
  },
  {
    id: "cap_cul",
    titleKo: "자본 — 문화 축 (지분 가중)",
    titleEn: "Capitalism — Culture Axes (Share-Weighted)",
    keys: ["npc_ai_cap_cul_leader_pm", "npc_ai_cap_cul_members_pm", "npc_ai_cap_cul_base_pm"],
    parts: [
      { key: "leader", label: "지도자", tone: 6 },
      { key: "members", label: "지분 가문", tone: 4 },
      { key: "base", label: "바탕", tone: 0 },
    ],
  },
  {
    id: "house_dec",
    titleKo: "가문 — 결단 축",
    titleEn: "House — Decision Axes",
    keys: ["npc_ai_house_dec_leader_pm", "npc_ai_house_dec_members_pm"],
    parts: [
      { key: "leader", label: "가문장", tone: 6 },
      { key: "members", label: "가문원", tone: 3 },
    ],
  },
  {
    id: "house_cul",
    titleKo: "가문 — 문화 축",
    titleEn: "House — Culture Axes",
    keys: ["npc_ai_house_cul_leader_pm", "npc_ai_house_cul_members_pm"],
    parts: [
      { key: "leader", label: "가문장", tone: 6 },
      { key: "members", label: "가문원", tone: 3 },
    ],
  },
  {
    id: "city_dec",
    titleKo: "도시 — 결단 축",
    titleEn: "City — Decision Axes",
    keys: ["npc_ai_city_dec_mayor_pm", "npc_ai_city_dec_nation_pm"],
    parts: [
      { key: "mayor", label: "시장", tone: 5 },
      { key: "nation", label: "국가", tone: 2 },
    ],
  },
  {
    id: "city_cul",
    titleKo: "도시 — 문화 축",
    titleEn: "City — Culture Axes",
    keys: ["npc_ai_city_cul_mayor_pm", "npc_ai_city_cul_citizens_pm", "npc_ai_city_cul_nation_pm"],
    parts: [
      { key: "mayor", label: "시장", tone: 5 },
      { key: "citizens", label: "시민", tone: 1 },
      { key: "nation", label: "국가", tone: 2 },
    ],
  },
];

export function NpcAiBlendTab({
  byId,
  pending,
  ko,
  onStage,
}: {
  readonly byId: ReadonlyMap<string, TuningEntryView>;
  readonly pending: NpcAiPending;
  readonly ko: boolean;
  readonly onStage: (patch: Readonly<Record<string, number | null>>, editKey?: string) => void;
}) {
  const [sampleRole, setSampleRole] = useState<TraitRole>("guard");
  const [sampleAxis, setSampleAxis] = useState<TraitAxis>("belligerence");
  const [useAnchor, setUseAnchor] = useState(true);

  const roleRanges = useMemo(() => buildRoleRanges(byId, pending), [byId, pending]);
  const spread = effectiveValue(byId, pending, "npc_ai_unit_trait_spread", 220);

  const histogram = useMemo(
    () =>
      sampleTraitHistogram({
        role: sampleRole,
        axis: sampleAxis,
        ranges: roleRanges[sampleRole],
        spread,
        useAnchor,
      }),
    [roleRanges, sampleAxis, sampleRole, spread, useAnchor],
  );

  const loyaltyRules = useMemo(() => buildLoyaltyRules(byId, pending), [byId, pending]);
  const curve = useMemo(() => sampleLoyaltyCurve(loyaltyRules), [loyaltyRules]);

  const applyPreset = (presetId: BlendPresetId): void => {
    onStage(BLEND_PRESETS[presetId]);
  };

  // SVG 곡선 경로(x: 충성도 100→0 = 20..300, y: 개입률 0..1000‰ = 140..15)
  const curvePath = (pick: (pt: (typeof curve)[number]) => number): string =>
    curve
      .map((pt, idx) => {
        const x = 28 + ((100 - pt.loyalty) / 100) * 284;
        const y = 140 - (pick(pt) / 1000) * 124;
        return `${idx === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <div className="na-tab-body">
      {/* 1. 7축 성향 생성 범위 + 200명 분포 히스토그램 */}
      <section className="panel na-card">
        <div className="na-card-head">
          <h2>{m.dev_npc_ai_gen_title()}</h2>
          <p className="na-hint">{m.dev_npc_ai_gen_desc()}</p>
        </div>
        <div className="na-grid-2">
          <div className="na-stack">
            <NpcAiRangeField
              minId="npc_ai_unit_trait_min"
              maxId="npc_ai_unit_trait_max"
              label={ko ? "전역 7축 생성 범위" : "Global 7-axis generation range"}
              byId={byId}
              pending={pending}
              step={10}
              onStage={onStage}
            />
            <NpcAiNumberField
              id="npc_ai_unit_trait_spread"
              byId={byId}
              pending={pending}
              ko={ko}
              step={10}
              onStage={onStage}
            />
            <NpcAiRangeField
              minId="npc_ai_guard_belligerence_min"
              maxId="npc_ai_guard_belligerence_max"
              label={ko ? "경비대 — 호전성" : "Guard — Belligerence"}
              byId={byId}
              pending={pending}
              step={10}
              onStage={onStage}
            />
            <NpcAiRangeField
              minId="npc_ai_guard_boldness_min"
              maxId="npc_ai_guard_boldness_max"
              label={ko ? "경비대 — 과감성" : "Guard — Boldness"}
              byId={byId}
              pending={pending}
              step={10}
              onStage={onStage}
            />
            <NpcAiRangeField
              minId="npc_ai_guard_discipline_min"
              maxId="npc_ai_guard_discipline_max"
              label={ko ? "경비대 — 규율성" : "Guard — Discipline"}
              byId={byId}
              pending={pending}
              step={10}
              onStage={onStage}
            />
            <NpcAiRangeField
              minId="npc_ai_leader_boldness_min"
              maxId="npc_ai_leader_boldness_max"
              label={ko ? "지도자 — 과감성" : "Leader — Boldness"}
              byId={byId}
              pending={pending}
              step={10}
              onStage={onStage}
            />
            <NpcAiRangeField
              minId="npc_ai_leader_autonomy_min"
              maxId="npc_ai_leader_autonomy_max"
              label={ko ? "지도자 — 자치성" : "Leader — Autonomy"}
              byId={byId}
              pending={pending}
              step={10}
              onStage={onStage}
            />
          </div>

          <div className="na-chart-box">
            <div className="na-chart-controls">
              <label className="na-inline-select">
                <span>{ko ? "직군" : "Role"}</span>
                <select
                  className="input"
                  value={sampleRole}
                  onChange={(e) => {
                    if (isTraitRole(e.target.value)) setSampleRole(e.target.value);
                  }}
                >
                  <option value="citizen">{ko ? "일반 시민" : "Citizen"}</option>
                  <option value="guard">{ko ? "경비대" : "Guard"}</option>
                  <option value="leader">{ko ? "지도자" : "Leader"}</option>
                  <option value="creature">{ko ? "크리쳐" : "Creature"}</option>
                  <option value="android">{ko ? "안드로이드" : "Android"}</option>
                </select>
              </label>
              <label className="na-inline-select">
                <span>{ko ? "축" : "Axis"}</span>
                <select
                  className="input"
                  value={sampleAxis}
                  onChange={(e) => {
                    if (isTraitAxis(e.target.value)) setSampleAxis(e.target.value);
                  }}
                >
                  {TRAIT_AXIS_META.map((meta) => (
                    <option key={meta.axis} value={meta.axis}>
                      {ko ? `${meta.ko} (${meta.lowKo}↔${meta.highKo})` : meta.en}
                    </option>
                  ))}
                </select>
              </label>
              <label className="na-check">
                <input type="checkbox" checked={useAnchor} onChange={(e) => setUseAnchor(e.target.checked)} />
                <span>{ko ? "국가 바탕(500) ± 편차 적용" : "Apply anchor (500) ± spread"}</span>
              </label>
            </div>
            <p className="na-chart-stats">
              {ko
                ? `가상 200명 분포 · 평균 ${histogram.mean} · 최소 ${histogram.min} · 최대 ${histogram.max}`
                : `200-unit sample · mean ${histogram.mean} · min ${histogram.min} · max ${histogram.max}`}
            </p>
            <svg className="na-svg" viewBox="0 0 320 156" role="img" aria-label={m.dev_npc_ai_hist_aria()}>
              <line x1="20" y1="132" x2="310" y2="132" className="na-svg-axis" />
              {histogram.bins.map((count, idx) => {
                const barW = 24;
                const x = 24 + idx * 28.5;
                const h = Math.round((count / histogram.maxBin) * 108);
                const y = 132 - h;
                return (
                  <g key={idx}>
                    <rect x={x} y={y} width={barW} height={h} rx="3" className="na-svg-bar" />
                    <text x={x + barW / 2} y="147" textAnchor="middle" className="na-svg-tick">
                      {idx * 100}
                    </text>
                    {count > 0 ? (
                      <text
                        x={x + barW / 2}
                        y={Math.max(12, y - 4)}
                        textAnchor="middle"
                        className="na-svg-val"
                      >
                        {count}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </section>

      {/* 2. 체제별·축 성격별(결단 vs 문화) 조직 합성 비율 */}
      <section className="panel na-card">
        <div className="na-card-head na-row-between">
          <div>
            <h2>{m.dev_npc_ai_blend_title()}</h2>
            <p className="na-hint">{m.dev_npc_ai_blend_desc()}</p>
          </div>
          <div className="na-preset-bar">
            <button type="button" className="button-small" onClick={() => applyPreset("leader_only")}>
              {m.dev_npc_ai_preset_leader()}
            </button>
            <button type="button" className="button-small" onClick={() => applyPreset("balanced")}>
              {m.dev_npc_ai_preset_balanced()}
            </button>
            <button type="button" className="button-small" onClick={() => applyPreset("tradition_stable")}>
              {m.dev_npc_ai_preset_tradition()}
            </button>
          </div>
        </div>

        <div className="na-grid-2">
          {REGIME_BLEND_GROUPS.map((group) => {
            const values = group.keys.map((k) => effectiveValue(byId, pending, k, 0));
            const pack = group.keys.map((k) => packValueOf(byId, k, 0));
            return (
              <div key={group.id} className="na-subcard">
                <h3 className="na-subcard-title">{ko ? group.titleKo : group.titleEn}</h3>
                <DistributionControl
                  label={ko ? group.titleKo : group.titleEn}
                  parts={group.parts}
                  values={values}
                  total={1000}
                  pack={pack}
                  unit="‰"
                  onChange={(next, source) => {
                    const patch: Record<string, number> = {};
                    group.keys.forEach((k, idx) => {
                      patch[k] = next[idx] ?? 0;
                    });
                    onStage(patch, source ? `${group.id}:${source}` : undefined);
                  }}
                />
              </div>
            );
          })}
        </div>

        <div className="na-grid-2 na-mt">
          <NpcAiNumberField
            id="npc_ai_org_loyalty_floor"
            byId={byId}
            pending={pending}
            ko={ko}
            onStage={onStage}
          />
          <NpcAiNumberField
            id="npc_ai_org_loyalty_min_share_pm"
            byId={byId}
            pending={pending}
            ko={ko}
            step={10}
            onStage={onStage}
          />
        </div>
      </section>

      {/* 3. 충성도(=만족도) 연동 개성 개입 곡선 */}
      <section className="panel na-card">
        <div className="na-card-head">
          <h2>{m.dev_npc_ai_loyalty_title()}</h2>
          <p className="na-hint">{m.dev_npc_ai_loyalty_desc()}</p>
        </div>
        <div className="na-grid-2">
          <div className="na-chart-box">
            <svg className="na-svg" viewBox="0 0 330 170" role="img" aria-label={m.dev_npc_ai_curve_aria()}>
              <line x1="28" y1="140" x2="312" y2="140" className="na-svg-axis" />
              <line x1="28" y1="16" x2="28" y2="140" className="na-svg-axis" />
              {[0, 250, 500, 750, 1000].map((v) => {
                const y = 140 - (v / 1000) * 124;
                return (
                  <g key={v}>
                    <line x1="28" y1={y} x2="312" y2={y} className="na-svg-grid" />
                    <text x="24" y={y + 3} textAnchor="end" className="na-svg-tick">
                      {v / 10}%
                    </text>
                  </g>
                );
              })}
              {[100, 80, 50, 20, 0].map((loy) => {
                const x = 28 + ((100 - loy) / 100) * 284;
                return (
                  <text key={loy} x={x} y="156" textAnchor="middle" className="na-svg-tick">
                    {loy}
                  </text>
                );
              })}
              <path d={curvePath((p) => p.rebelliousPm)} className="na-curve-rebel" fill="none" />
              <path d={curvePath((p) => p.neutralPm)} className="na-curve-neutral" fill="none" />
              <path d={curvePath((p) => p.loyalistPm)} className="na-curve-loyal" fill="none" />
            </svg>
            <div className="na-legend">
              <span className="na-legend-item" data-series="rebel">
                {ko ? "자치 높음 · 규율 낮음" : "High autonomy / low discipline"}
              </span>
              <span className="na-legend-item" data-series="neutral">
                {ko ? "중립(500)" : "Neutral (500)"}
              </span>
              <span className="na-legend-item" data-series="loyal">
                {ko ? "규율 · 공동체 높음" : "High discipline / communalism"}
              </span>
            </div>
          </div>

          <div className="na-stack">
            <NpcAiRangeField
              minId="npc_ai_loyalty_ov_min_pm"
              maxId="npc_ai_loyalty_ov_max_pm"
              label={ko ? "개입률 하한 ~ 상한 (‰)" : "Override min ~ max cap (‰)"}
              byId={byId}
              pending={pending}
              step={10}
              onStage={onStage}
            />
            <div className="na-grid-2">
              <NpcAiNumberField
                id="npc_ai_loyalty_ov_100_pm"
                byId={byId}
                pending={pending}
                ko={ko}
                step={10}
                onStage={onStage}
              />
              <NpcAiNumberField
                id="npc_ai_loyalty_ov_80_pm"
                byId={byId}
                pending={pending}
                ko={ko}
                step={10}
                onStage={onStage}
              />
              <NpcAiNumberField
                id="npc_ai_loyalty_ov_50_pm"
                byId={byId}
                pending={pending}
                ko={ko}
                step={10}
                onStage={onStage}
              />
              <NpcAiNumberField
                id="npc_ai_loyalty_ov_20_pm"
                byId={byId}
                pending={pending}
                ko={ko}
                step={10}
                onStage={onStage}
              />
              <NpcAiNumberField
                id="npc_ai_loyalty_ov_0_pm"
                byId={byId}
                pending={pending}
                ko={ko}
                step={10}
                onStage={onStage}
              />
              <NpcAiNumberField
                id="npc_ai_creature_instinct_pm"
                byId={byId}
                pending={pending}
                ko={ko}
                step={10}
                onStage={onStage}
              />
            </div>
            <div className="na-grid-3">
              <NpcAiNumberField
                id="npc_ai_loyalty_autonomy_pm"
                byId={byId}
                pending={pending}
                ko={ko}
                step={10}
                onStage={onStage}
              />
              <NpcAiNumberField
                id="npc_ai_loyalty_discipline_pm"
                byId={byId}
                pending={pending}
                ko={ko}
                step={10}
                onStage={onStage}
              />
              <NpcAiNumberField
                id="npc_ai_loyalty_communalism_pm"
                byId={byId}
                pending={pending}
                ko={ko}
                step={10}
                onStage={onStage}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
