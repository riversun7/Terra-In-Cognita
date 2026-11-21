// 탭 4: 전투·조우 AI 설정 + 가상 유닛 충성도 연동 작전 미리보기 — docs/adr/2026-11-20-npc-autonomous-ai.md
import {
  AI_PRESETS,
  AI_PRESET_VALUES,
  AI_SLIDERS,
  type AiPreset,
  type AiSlider,
} from "@terra/shared/aiTactics";
import type { TuningEntryView } from "@terra/shared/tuning";
import {
  DEFAULT_UNIT_TRAITS,
  type LoyaltyUnitKind,
  type TraitAxis,
  type UnitTraits,
  blendTacticsByLoyalty,
  loyaltyOverridePm,
  tacticsFromUnitTraits,
} from "@terra/shared/unitTraits";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { NpcAiNumberField } from "./NpcAiField.tsx";
import {
  ENCOUNTER_TUNING_KEYS,
  type NpcAiPending,
  TRAIT_AXIS_META,
  buildLoyaltyRules,
  buildTuningValuesRecord,
} from "./npcAiModel.ts";

type CombatMovePreview = Awaited<ReturnType<typeof api.npcAi.previewCombatMove.query>>;

const LOYALTY_UNIT_KINDS: readonly LoyaltyUnitKind[] = ["human", "android", "creature", "cyborg_main"];
const isLoyaltyUnitKind = (value: string): value is LoyaltyUnitKind =>
  (LOYALTY_UNIT_KINDS as readonly string[]).includes(value);
const isAiPreset = (value: string): value is AiPreset => (AI_PRESETS as readonly string[]).includes(value);

const SLIDER_LABELS: Readonly<Record<AiSlider, { readonly ko: string; readonly en: string }>> = {
  engage: { ko: "① 교전", en: "1. Engage" },
  pursue: { ko: "② 추격", en: "2. Pursue" },
  cover: { ko: "③ 엄폐·은신", en: "3. Cover" },
  escort: { ko: "④ 호위", en: "4. Escort" },
  saveSkill: { ko: "⑤ 스킬 아끼기", en: "5. Save skill" },
  spread: { ko: "⑥ 대형 간격", en: "6. Spread" },
};

const PRESET_LABELS: Readonly<Record<AiPreset, { readonly ko: string; readonly en: string }>> = {
  aggressive: { ko: "공격적", en: "Aggressive" },
  balanced: { ko: "균형", en: "Balanced" },
  defensive: { ko: "방어적", en: "Defensive" },
  hold: { ko: "숨어 버티기", en: "Hold" },
};

export function NpcAiCombatTab({
  entries,
  byId,
  pending,
  ko,
  onStage,
}: {
  readonly entries: readonly TuningEntryView[];
  readonly byId: ReadonlyMap<string, TuningEntryView>;
  readonly pending: NpcAiPending;
  readonly ko: boolean;
  readonly onStage: (patch: Readonly<Record<string, number | null>>, editKey?: string) => void;
}) {
  const [unitKind, setUnitKind] = useState<LoyaltyUnitKind>("human");
  const [loyalty, setLoyalty] = useState(40);
  const [playerPreset, setPlayerPreset] = useState<AiPreset>("defensive");
  const [range, setRange] = useState(1);
  const [traits, setTraits] = useState<UnitTraits>({
    ...DEFAULT_UNIT_TRAITS,
    belligerence: 820,
    boldness: 760,
    autonomy: 780,
    discipline: 280,
    communalism: 350,
  });
  const [movePreview, setMovePreview] = useState<CombatMovePreview | null>(null);
  const tuningValues = useMemo(() => buildTuningValuesRecord(entries, pending), [entries, pending]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api.npcAi.previewCombatMove
        .query({ traits, unitKind, loyalty, playerPreset, range, hpPct: 65, staminaPct: 75, tuningValues })
        .then(
          (res) => {
            if (!cancelled) setMovePreview(res);
          },
          () => {},
        );
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [loyalty, playerPreset, range, traits, tuningValues, unitKind]);

  const loyaltyRules = useMemo(() => buildLoyaltyRules(byId, pending), [byId, pending]);
  const overridePm = useMemo(
    () =>
      loyaltyOverridePm({
        kind: unitKind,
        loyaltyMilli: loyalty * 1000,
        traits,
        rules: loyaltyRules,
      }),
    [loyalty, loyaltyRules, traits, unitKind],
  );
  const playerTactics = AI_PRESET_VALUES[playerPreset];
  const instinctTactics = useMemo(() => tacticsFromUnitTraits(traits), [traits]);
  const effectiveTactics = useMemo(
    () => blendTacticsByLoyalty(playerTactics, instinctTactics, overridePm),
    [instinctTactics, overridePm, playerTactics],
  );

  const setAxis = (axis: TraitAxis, value: number): void => {
    setTraits((prev) => ({ ...prev, [axis]: value }));
  };

  return (
    <div className="na-tab-body">
      {/* 가상 유닛 충성도 연동 AI 작전 미리보기 */}
      <section className="panel na-card">
        <div className="na-card-head">
          <h2>{m.dev_npc_ai_combat_preview_title()}</h2>
          <p className="na-hint">{m.dev_npc_ai_combat_preview_desc()}</p>
        </div>
        <div className="na-grid-2">
          <div className="na-stack">
            <div className="na-inline-controls">
              <label className="na-inline-select">
                <span>{ko ? "유닛 종류" : "Unit kind"}</span>
                <select
                  className="input"
                  value={unitKind}
                  onChange={(e) => {
                    if (isLoyaltyUnitKind(e.target.value)) setUnitKind(e.target.value);
                  }}
                >
                  <option value="human">{ko ? "휴먼 (충성도 연동)" : "Human (loyalty curve)"}</option>
                  <option value="android">{ko ? "안드로이드 (0% 순종)" : "Android (0% override)"}</option>
                  <option value="creature">{ko ? "크리쳐 (고정 본능)" : "Creature (wild instinct)"}</option>
                  <option value="cyborg_main">{ko ? "사이보그 본체 (0%)" : "Main Cyborg (0%)"}</option>
                </select>
              </label>
              <label className="na-inline-select">
                <span>{ko ? "플레이어 작전" : "Player preset"}</span>
                <select
                  className="input"
                  value={playerPreset}
                  onChange={(e) => {
                    if (isAiPreset(e.target.value)) setPlayerPreset(e.target.value);
                  }}
                >
                  {AI_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {ko ? PRESET_LABELS[p].ko : PRESET_LABELS[p].en}
                    </option>
                  ))}
                </select>
              </label>
              <label className="na-inline-select">
                <span>{ko ? "무기 사거리 (칸)" : "Range (cells)"}</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={8}
                  value={range}
                  onChange={(e) => setRange(Math.min(8, Math.max(1, Number(e.target.value) || 1)))}
                />
              </label>
            </div>

            <label className="na-axis-row">
              <span className="na-axis-name">
                {ko ? `충성도(=만족도): ${loyalty}` : `Loyalty (=satisfaction): ${loyalty}`}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={loyalty}
                disabled={unitKind !== "human"}
                onChange={(e) => setLoyalty(Number(e.target.value))}
              />
              <span className="na-axis-val">{loyalty}</span>
            </label>

            {TRAIT_AXIS_META.map((meta) => (
              <label key={meta.axis} className="na-axis-row">
                <span className="na-axis-name">
                  {ko ? `${meta.ko} (${meta.lowKo}↔${meta.highKo})` : meta.en}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1000}
                  step={10}
                  value={traits[meta.axis]}
                  onChange={(e) => setAxis(meta.axis, Number(e.target.value))}
                />
                <span className="na-axis-val">{traits[meta.axis]}</span>
              </label>
            ))}
          </div>

          <div className="na-preview-box">
            <div className="na-override-kpi">
              <span>{ko ? "개성 개입률" : "Trait override"}</span>
              <strong>{(overridePm / 10).toFixed(1)}%</strong>
              <span className="na-hint">({overridePm}‰)</span>
            </div>

            <table className="na-table">
              <thead>
                <tr>
                  <th>{ko ? "작전 항목" : "Tactic"}</th>
                  <th>{ko ? "플레이어" : "Player"}</th>
                  <th>{ko ? "유닛 본능" : "Instinct"}</th>
                  <th>{ko ? "최종 실효" : "Effective"}</th>
                </tr>
              </thead>
              <tbody>
                {AI_SLIDERS.map((slider) => (
                  <tr key={slider}>
                    <td>{ko ? SLIDER_LABELS[slider].ko : SLIDER_LABELS[slider].en}</td>
                    <td className="na-num">{playerTactics[slider]}</td>
                    <td className="na-num">{instinctTactics[slider]}</td>
                    <td className="na-num na-num-strong">{effectiveTactics[slider]}</td>
                  </tr>
                ))}
                <tr>
                  <td>{ko ? "⑦ 퇴각 기준 (HP %)" : "7. Retreat (HP %)"}</td>
                  <td className="na-num">{playerTactics.retreatPct}%</td>
                  <td className="na-num">{instinctTactics.retreatPct}%</td>
                  <td className="na-num na-num-strong">{effectiveTactics.retreatPct}%</td>
                </tr>
                <tr>
                  <td>{ko ? "목표 우선순위" : "Target priority"}</td>
                  <td>{playerTactics.target}</td>
                  <td>{instinctTactics.target}</td>
                  <td className="na-num-strong">{effectiveTactics.target}</td>
                </tr>
              </tbody>
            </table>

            {movePreview ? (
              <div className="na-factor-chips na-mt">
                <span className="na-chip">
                  {ko ? `D-558 전개: ${movePreview.deployment}` : `Tactic: ${movePreview.deployment}`}
                </span>
                <span className="na-chip" data-neg={!movePreview.runsNormally ? "" : undefined}>
                  {ko
                    ? `달리기: ${movePreview.runsNormally ? "켬" : "끔"}`
                    : `Run: ${movePreview.runsNormally ? "ON" : "OFF"}`}
                </span>
                <span className="na-chip" data-neg={!movePreview.moves.dash ? "" : undefined}>
                  {ko
                    ? `돌진: ${movePreview.moves.dash ? "허용" : "보류"}`
                    : `Dash: ${movePreview.moves.dash ? "OK" : "Hold"}`}
                </span>
                <span className="na-chip" data-neg={!movePreview.moves.backstep ? "" : undefined}>
                  {ko
                    ? `뒷걸음: ${movePreview.moves.backstep ? "허용" : "보류"}`
                    : `Backstep: ${movePreview.moves.backstep ? "OK" : "Hold"}`}
                </span>
                <span className="na-chip" data-neg={!movePreview.moves.stealth ? "" : undefined}>
                  {ko
                    ? `은신: ${movePreview.moves.stealth ? "허용" : "보류"}`
                    : `Stealth: ${movePreview.moves.stealth ? "OK" : "Hold"}`}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* 전투·조우 튜닝 키 */}
      <section className="panel na-card">
        <div className="na-card-head">
          <h2>{m.dev_npc_ai_encounter_title()}</h2>
          <p className="na-hint">{m.dev_npc_ai_encounter_desc()}</p>
        </div>
        <div className="na-grid-2">
          {ENCOUNTER_TUNING_KEYS.map((id) => (
            <NpcAiNumberField key={id} id={id} byId={byId} pending={pending} ko={ko} onStage={onStage} />
          ))}
        </div>
      </section>
    </div>
  );
}
