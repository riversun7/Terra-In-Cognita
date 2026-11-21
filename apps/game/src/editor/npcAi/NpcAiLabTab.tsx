// 탭 5: 서버 판정 실시간 판단 실험실(api.npcAi.previewDecision) — docs/adr/2026-11-20-npc-autonomous-ai.md
import type { TuningEntryView } from "@terra/shared/tuning";
import { DEFAULT_UNIT_TRAITS, type TraitAxis, type UnitTraits } from "@terra/shared/unitTraits";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { type NpcAiPending, TRAIT_AXIS_META, buildTuningValuesRecord } from "./npcAiModel.ts";

type PreviewResult = Awaited<ReturnType<typeof api.npcAi.previewDecision.query>>;

const ACTION_LABELS: Readonly<Record<string, { readonly ko: string; readonly en: string }>> = {
  idle: { ko: "쉬기 (idle)", en: "Idle" },
  attack: { ko: "공격 / 선전포고 (attack)", en: "Attack" },
  peace: { ko: "강화 제안 (peace)", en: "Propose peace" },
  found: { ko: "마을 개척 (found)", en: "Found village" },
  restore: { ko: "폐허 복구 (restore)", en: "Restore ruin" },
  research: { ko: "연구 시설 투자 (research)", en: "Research" },
  sell_shares: { ko: "지분 매각 (sell_shares)", en: "Sell shares" },
  break_free: { ko: "봉신 독립 선언 (break_free)", en: "Break free" },
};

export function NpcAiLabTab({
  entries,
  pending,
  ko,
}: {
  readonly entries: readonly TuningEntryView[];
  readonly pending: NpcAiPending;
  readonly ko: boolean;
}) {
  const [traits, setTraits] = useState<UnitTraits>({ ...DEFAULT_UNIT_TRAITS });
  const [cities, setCities] = useState(3);
  const [strength, setStrength] = useState(1400);
  const [rivalStrength, setRivalStrength] = useState(1000);
  const [rivalAtWar, setRivalAtWar] = useState(false);
  const [rivalRebel, setRivalRebel] = useState(false);
  const [treasury, setTreasury] = useState(50_000);
  const [satisfaction, setSatisfaction] = useState(65);
  const [foodPm, setFoodPm] = useState(1000);
  const [crowded, setCrowded] = useState(true);
  const [researchBlocked, setResearchBlocked] = useState(false);
  const [poor, setPoor] = useState(false);
  const [hasOverlord, setHasOverlord] = useState(false);
  const [overlordStrength, setOverlordStrength] = useState(1500);
  const [vassals, setVassals] = useState(0);
  const [hasRuin, setHasRuin] = useState(true);
  const [roll, setRoll] = useState(0);

  const [result, setResult] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tuningValues = useMemo(() => buildTuningValuesRecord(entries, pending), [entries, pending]);

  const runPreview = useCallback(() => {
    setLoading(true);
    setError(null);
    api.npcAi.previewDecision
      .query({
        traits,
        cities,
        strength,
        rivalStrength,
        rivalAtWar,
        rivalRebel,
        treasury,
        satisfaction,
        foodPm,
        crowded,
        researchBlocked,
        poor,
        hasOverlord,
        overlordStrength,
        vassals,
        hasRuin,
        roll,
        tuningValues,
      })
      .then(
        (res) => {
          setResult(res);
          setLoading(false);
        },
        () => {
          setError(m.dev_npc_ai_lab_error());
          setLoading(false);
        },
      );
  }, [
    cities,
    crowded,
    foodPm,
    hasOverlord,
    hasRuin,
    overlordStrength,
    poor,
    researchBlocked,
    rivalAtWar,
    rivalRebel,
    rivalStrength,
    roll,
    satisfaction,
    strength,
    traits,
    treasury,
    tuningValues,
    vassals,
  ]);

  // 슬라이더·담은 변경이 바뀔 때 180ms 디바운스로 서버 판정 호출
  useEffect(() => {
    const timer = window.setTimeout(runPreview, 180);
    return () => window.clearTimeout(timer);
  }, [runPreview]);

  const setAxis = (axis: TraitAxis, value: number): void => {
    setTraits((prev) => ({ ...prev, [axis]: value }));
  };

  const maxScore = useMemo(() => {
    if (!result) return 1000;
    return Math.max(500, ...result.actions.map((a) => Math.abs(a.score)));
  }, [result]);

  return (
    <div className="na-tab-body">
      <section className="panel na-card">
        <div className="na-card-head na-row-between">
          <div>
            <h2>{m.dev_npc_ai_lab_title()}</h2>
            <p className="na-hint">{m.dev_npc_ai_lab_desc()}</p>
          </div>
          <button type="button" className="button-small" onClick={runPreview} disabled={loading}>
            {loading ? m.dev_npc_ai_lab_running() : m.dev_npc_ai_lab_run()}
          </button>
        </div>

        <div className="na-grid-2">
          {/* 왼쪽: 7축 성향 + 가상 세력 상황 */}
          <div className="na-stack">
            <h3 className="na-subcard-title">{ko ? "7축 실효 성향" : "Effective 7-axis traits"}</h3>
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

            <h3 className="na-subcard-title na-mt">{ko ? "세력 상황 입력" : "Faction situation"}</h3>
            <div className="na-grid-2">
              <label className="na-mini-input">
                <span>{ko ? "도시 수" : "Cities"}</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={64}
                  value={cities}
                  onChange={(e) => setCities(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              <label className="na-mini-input">
                <span>{ko ? "국고" : "Treasury"}</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step={1000}
                  value={treasury}
                  onChange={(e) => setTreasury(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
              <label className="na-mini-input">
                <span>{ko ? "아군 전력" : "Strength"}</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  step={100}
                  value={strength}
                  onChange={(e) => setStrength(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              <label className="na-mini-input">
                <span>{ko ? "상대 전력" : "Rival strength"}</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  step={100}
                  value={rivalStrength}
                  onChange={(e) => setRivalStrength(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              <label className="na-mini-input">
                <span>{ko ? "만족도 (0~100)" : "Satisfaction (0-100)"}</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  value={satisfaction}
                  onChange={(e) => setSatisfaction(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                />
              </label>
              <label className="na-mini-input">
                <span>{ko ? "생필품 충족 (‰)" : "Food supply (‰)"}</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={1000}
                  step={50}
                  value={foodPm}
                  onChange={(e) => setFoodPm(Math.min(1000, Math.max(0, Number(e.target.value) || 0)))}
                />
              </label>
              <label className="na-mini-input">
                <span>{ko ? "봉신 수" : "Vassals"}</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={32}
                  value={vassals}
                  onChange={(e) => setVassals(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
              <label className="na-mini-input">
                <span>{ko ? "시드 굴림 (0~10000)" : "Seed roll (0-10000)"}</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={10000}
                  value={roll}
                  onChange={(e) => setRoll(Math.min(10000, Math.max(0, Number(e.target.value) || 0)))}
                />
              </label>
            </div>

            <div className="na-check-grid">
              <label className="na-check">
                <input
                  type="checkbox"
                  checked={rivalAtWar}
                  onChange={(e) => setRivalAtWar(e.target.checked)}
                />
                <span>{ko ? "이미 전쟁 중" : "At war"}</span>
              </label>
              <label className="na-check">
                <input
                  type="checkbox"
                  checked={rivalRebel}
                  onChange={(e) => setRivalRebel(e.target.checked)}
                />
                <span>{ko ? "상대가 반란 세력" : "Rival is rebel"}</span>
              </label>
              <label className="na-check">
                <input type="checkbox" checked={crowded} onChange={(e) => setCrowded(e.target.checked)} />
                <span>{ko ? "도시 인구 포화" : "Crowded city"}</span>
              </label>
              <label className="na-check">
                <input type="checkbox" checked={hasRuin} onChange={(e) => setHasRuin(e.target.checked)} />
                <span>{ko ? "복구 가능 폐허 있음" : "Restorable ruin"}</span>
              </label>
              <label className="na-check">
                <input
                  type="checkbox"
                  checked={researchBlocked}
                  onChange={(e) => setResearchBlocked(e.target.checked)}
                />
                <span>{ko ? "연구 시설 부족" : "Research blocked"}</span>
              </label>
              <label className="na-check">
                <input type="checkbox" checked={poor} onChange={(e) => setPoor(e.target.checked)} />
                <span>{ko ? "국고 부족" : "Poor treasury"}</span>
              </label>
              <label className="na-check">
                <input
                  type="checkbox"
                  checked={hasOverlord}
                  onChange={(e) => setHasOverlord(e.target.checked)}
                />
                <span>{ko ? "종주국 있음" : "Has overlord"}</span>
              </label>
            </div>
            {hasOverlord ? (
              <label className="na-mini-input">
                <span>{ko ? "종주국 전력" : "Overlord strength"}</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  step={100}
                  value={overlordStrength}
                  onChange={(e) => setOverlordStrength(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
            ) : null}
          </div>

          {/* 오른쪽: 서버 판정 결과 + 점수 분해 + 정책 규칙식 */}
          <div className="na-preview-box">
            {error ? <p className="na-error">{error}</p> : null}
            {result ? (
              <>
                <div className="na-override-kpi">
                  <span>{ko ? "최종 선택 행동" : "Chosen action"}</span>
                  <strong>
                    {ko
                      ? (ACTION_LABELS[result.chosen.kind]?.ko ?? result.chosen.kind)
                      : (ACTION_LABELS[result.chosen.kind]?.en ?? result.chosen.kind)}
                  </strong>
                  <span className="na-hint">
                    {ko ? `탐색 온도 ${result.decisionTempPm}‰` : `Temp ${result.decisionTempPm}‰`}
                  </span>
                </div>

                <ul className="na-score-list">
                  {result.actions.map((item, idx) => {
                    const pct = Math.min(100, Math.round((Math.max(0, item.score) / maxScore) * 100));
                    const isChosen = item.action.kind === result.chosen.kind;
                    const label = ko
                      ? (ACTION_LABELS[item.action.kind]?.ko ?? item.action.kind)
                      : (ACTION_LABELS[item.action.kind]?.en ?? item.action.kind);
                    return (
                      <li
                        key={`${item.action.kind}-${idx}`}
                        className="na-score-item"
                        data-chosen={isChosen ? "" : undefined}
                      >
                        <div className="na-score-head">
                          <span>{label}</span>
                          <strong>{item.score}</strong>
                        </div>
                        <div className="na-score-track">
                          <span className="na-score-fill" style={{ inlineSize: `${pct}%` }} />
                        </div>
                        <div className="na-factor-chips">
                          {item.factors.map((f, fIdx) => (
                            <span
                              key={`${f.key}-${fIdx}`}
                              className="na-chip"
                              data-neg={f.delta < 0 ? "" : undefined}
                            >
                              {f.key} {f.delta >= 0 ? `+${f.delta}` : f.delta}
                            </span>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <h3 className="na-subcard-title na-mt">
                  {ko ? "파생 정책 규칙식 결과" : "Derived policy outputs"}
                </h3>
                <table className="na-table">
                  <tbody>
                    <tr>
                      <td>{ko ? "매도 / 매수 마진" : "Sell / Bid %"}</td>
                      <td className="na-num">
                        {result.policies.sellPct}% / {result.policies.bidPct}%
                      </td>
                    </tr>
                    <tr>
                      <td>{ko ? "국고 지출 분모" : "Spend divisor"}</td>
                      <td className="na-num">1 / {result.policies.spendDivisor}</td>
                    </tr>
                    <tr>
                      <td>{ko ? "실효 예비금 배수 (과감성 반영)" : "Effective reserve (boldness)"}</td>
                      <td className="na-num">{result.policies.effectiveReservePm}‰</td>
                    </tr>
                    <tr>
                      <td>{ko ? "실효 공격 전력 비 (과감성 반영)" : "Effective attack ratio (boldness)"}</td>
                      <td className="na-num">{result.policies.effectiveAttackRatioPm}‰</td>
                    </tr>
                    <tr>
                      <td>{ko ? "개척 체제 선택" : "Founding regime"}</td>
                      <td className="na-num">
                        {result.policies.founding.vassal
                          ? ko
                            ? "봉신 (vassal)"
                            : "vassal"
                          : result.policies.founding.regime}
                      </td>
                    </tr>
                    <tr>
                      <td>{ko ? "NPC 가문 입단비 / 지원금" : "NPC house fee / grant"}</td>
                      <td className="na-num">
                        {result.policies.houseEntryFee > 0
                          ? `+${result.policies.houseEntryFee}`
                          : `${result.policies.houseEntryFee}`}
                      </td>
                    </tr>
                    <tr>
                      <td>{ko ? "독재 금고 배당 환원율" : "Dictatorship vault return"}</td>
                      <td className="na-num">{result.policies.vaultReturnPm}‰</td>
                    </tr>
                  </tbody>
                </table>
              </>
            ) : (
              <p className="na-hint">{m.dev_npc_ai_lab_running()}</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
