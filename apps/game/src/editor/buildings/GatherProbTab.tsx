// 1차 생산 · 티어 확률 분포 편집 탭(/dev/buildings, 기획 49 N43·M14, D-513)
// 이전 프로젝트(AntiGravt01 /admin/editor/production skill-prob 탭)의 스탯 구간별(0~19 … 220+) T0~T9 가중치 분포 시각화·직접 입력·
// 전체/구간 프리셋·시설별 주/보조 스탯 안내를 그대로 옮기고, 이 저장소의 실시간 덮어쓰기 층(gather_tiers, 합 1000‰)에 연결한다.
import {
  type BuildingEditorGatherBand,
  type BuildingEditorListResponse,
  GATHER_BAND_WEIGHT_TOTAL,
  GATHER_TIER_SLOTS,
  type GatherTierJson,
} from "@terra/shared/buildingEditor";
import { AppLink } from "../../shell/AppLink.tsx";
import { type BuildingStage, normalizeWeightsPm } from "./buildingModel.ts";

const TIER_META: readonly { readonly ko: string; readonly en: string; readonly tone: string }[] = [
  { ko: "T0 기초", en: "T0 Basic", tone: "t0" },
  { ko: "T1 일반", en: "T1 Common", tone: "t1" },
  { ko: "T2 고급", en: "T2 Uncommon", tone: "t2" },
  { ko: "T3 희귀", en: "T3 Rare", tone: "t3" },
  { ko: "T4 전설", en: "T4 Epic", tone: "t4" },
  { ko: "T5 신화", en: "T5 Mythic", tone: "t5" },
  { ko: "T6 신화+", en: "T6 Mythic+", tone: "t6" },
  { ko: "T7 전역", en: "T7 Relic", tone: "t7" },
  { ko: "T8 폐허", en: "T8 Ruin", tone: "t8" },
  { ko: "T9 신성", en: "T9 Divine", tone: "t9" },
];

/** 단조감소형 프리셋(12구간 × T0~T9 ‰, 합 1000‰ — AntiGravt01 기본 행렬) */
const MONOTONIC_MATRIX: readonly (readonly number[])[] = [
  [950, 50, 0, 0, 0, 0, 0, 0, 0, 0],
  [800, 150, 50, 0, 0, 0, 0, 0, 0, 0],
  [650, 220, 100, 30, 0, 0, 0, 0, 0, 0],
  [530, 260, 140, 60, 10, 0, 0, 0, 0, 0],
  [430, 290, 170, 80, 25, 5, 0, 0, 0, 0],
  [350, 280, 200, 110, 40, 15, 5, 0, 0, 0],
  [290, 260, 210, 140, 60, 25, 10, 5, 0, 0],
  [250, 230, 200, 160, 90, 40, 17, 9, 4, 0],
  [223, 210, 200, 170, 110, 50, 23, 10, 4, 0],
  [204, 200, 190, 170, 120, 60, 35, 15, 6, 0],
  [190, 190, 180, 160, 130, 80, 45, 20, 5, 0],
  [195, 180, 170, 160, 130, 80, 40, 25, 15, 5],
];

/** T3 피크 극저高 프리셋(12구간 × T0~T9 ‰, 합 1000‰ — AntiGravt01 T3 피크 행렬) */
const T3_PEAK_MATRIX: readonly (readonly number[])[] = [
  [650, 280, 60, 10, 0, 0, 0, 0, 0, 0],
  [450, 380, 140, 30, 0, 0, 0, 0, 0, 0],
  [280, 400, 240, 70, 10, 0, 0, 0, 0, 0],
  [150, 350, 320, 140, 40, 0, 0, 0, 0, 0],
  [80, 260, 360, 220, 70, 10, 0, 0, 0, 0],
  [50, 150, 300, 320, 140, 30, 10, 0, 0, 0],
  [30, 110, 220, 360, 200, 60, 20, 0, 0, 0],
  [20, 70, 170, 360, 260, 80, 30, 10, 0, 0],
  [20, 50, 140, 360, 300, 80, 30, 15, 5, 0],
  [20, 50, 130, 350, 300, 90, 40, 20, 0, 0],
  [20, 50, 130, 330, 300, 100, 40, 25, 5, 0],
  [30, 70, 150, 320, 270, 90, 40, 20, 9, 1],
];

const LOW_FOCUS_BASE = [1000, 700, 400, 200, 80, 30, 10, 5, 2, 1];

function maxAccessTierOf(from: number, nextFrom: number | undefined): number {
  const maxStat = nextFrom !== undefined ? nextFrom - 1 : Math.max(from + 20, 240);
  return Math.min(9, Math.floor(maxStat / 20) + 1);
}

function rowPresetWeights(kind: "low" | "even" | "mid" | "high", maxTier: number): number[] {
  if (kind === "low") {
    return normalizeWeightsPm(
      Array.from({ length: GATHER_TIER_SLOTS }, (_, t) => (t <= maxTier ? (LOW_FOCUS_BASE[t] ?? 0) : 0)),
    );
  }
  if (kind === "even") {
    return normalizeWeightsPm(Array.from({ length: GATHER_TIER_SLOTS }, (_, t) => (t <= maxTier ? 100 : 0)));
  }
  if (kind === "mid") {
    const mid = Math.floor((maxTier + 1) * 0.6);
    return normalizeWeightsPm(
      Array.from({ length: GATHER_TIER_SLOTS }, (_, t) =>
        t > maxTier ? 0 : Math.max(5, 100 - Math.abs(t - mid) * 25),
      ),
    );
  }
  return normalizeWeightsPm(
    Array.from({ length: GATHER_TIER_SLOTS }, (_, t) =>
      t > maxTier ? 0 : t === maxTier ? 100 : t === maxTier - 1 ? 50 : 10,
    ),
  );
}

function draftBandOf(row: BuildingEditorGatherBand, stage: BuildingStage): GatherTierJson {
  const staged = stage.gatherBands.get(row.entry.id);
  if (!staged) return row.entry;
  if (staged.op === "put_gather_band") return staged.entry;
  return row.pack ?? row.entry;
}

export function GatherProbTab({
  list,
  stage,
  locale,
  onEditBand,
  onEditAllBands,
  onRevertBand,
  onUnstageBand,
}: {
  readonly list: BuildingEditorListResponse;
  readonly stage: BuildingStage;
  readonly locale: "ko" | "en";
  readonly onEditBand: (id: string, weightsPm: readonly number[]) => void;
  readonly onEditAllBands: (nextById: ReadonlyMap<string, readonly number[]>) => void;
  readonly onRevertBand: (id: string) => void;
  readonly onUnstageBand: (id: string) => void;
}) {
  const ko = locale === "ko";
  const bands = list.gatherBands;
  const gatherFacilities = list.facilities.filter((f) => f.entry.gather !== undefined);

  const applyBulkPreset = (kind: "monotonic" | "t3peak" | "low" | "even" | "high" | "pack"): void => {
    const map = new Map<string, readonly number[]>();
    bands.forEach((band, index) => {
      const nextFrom = bands[index + 1]?.entry.from;
      const maxTier = maxAccessTierOf(band.entry.from, nextFrom);
      if (kind === "pack") {
        map.set(band.entry.id, band.pack?.weightsPm ?? band.entry.weightsPm);
      } else if (kind === "monotonic") {
        map.set(band.entry.id, MONOTONIC_MATRIX[index] ?? MONOTONIC_MATRIX.at(-1) ?? band.entry.weightsPm);
      } else if (kind === "t3peak") {
        map.set(band.entry.id, T3_PEAK_MATRIX[index] ?? T3_PEAK_MATRIX.at(-1) ?? band.entry.weightsPm);
      } else {
        map.set(band.entry.id, rowPresetWeights(kind, maxTier));
      }
    });
    onEditAllBands(map);
  };

  return (
    <div className="be-prob-tab" data-prob-tab="ready">
      {/* 상단 규칙·연동 배너 (49 N43·M14, D-513) */}
      <div className="be-panel be-prob-banner">
        <div className="be-prob-banner-top">
          <div>
            <h2 className="be-heading">
              {ko
                ? "1차 생산 스탯 구간별 티어 확률 분포 (49 N43 · D-513)"
                : "Primary Production Stat-Band Tier Probability Distribution (49 N43 · D-513)"}
            </h2>
            <p className="field-hint">
              {ko
                ? `유효 스탯 = 주 스탯 + 시설 레벨 보너스(${list.gatherLevelBonus} × (Lv − 1)) · 각 구간 가중치 합 = 1000‰ (100.0%). 건설 시간(M14) = 재료 1kg당 ${(list.rules.msPerKg / 1000).toFixed(1)}초 × 레벨 계수(${list.rules.timeFactorPm.map((v) => `${(v / 1000).toFixed(1)}×`).join(" / ")})`
                : `Effective stat = primary stat + facility level bonus (${list.gatherLevelBonus} × (Lv − 1)) · Row weight sum = 1000‰ (100.0%). Build time (M14) = ${(list.rules.msPerKg / 1000).toFixed(1)}s/kg × level factors`}
            </p>
          </div>
          <AppLink to={{ route: "dev_tuning" }} className="button-small">
            {ko ? "설정 칸 패널 (N43·M14) →" : "Settings Panel (N43·M14) →"}
          </AppLink>
        </div>

        {/* 전체 구간 일괄 프리셋 막대 */}
        <div className="be-prob-presets">
          <span className="be-subheading">{ko ? "전체 구간 일괄 프리셋:" : "All-Band Bulk Presets:"}</span>
          <button type="button" className="button-small" onClick={() => applyBulkPreset("monotonic")}>
            {ko ? "단조감소형 (T9=0.5%)" : "Monotonic (T9=0.5%)"}
          </button>
          <button type="button" className="button-small" onClick={() => applyBulkPreset("t3peak")}>
            {ko ? "T3 피크 극저高 (T9=0.1%)" : "T3 Peak Ultra-Rare (T9=0.1%)"}
          </button>
          <button type="button" className="button-small" onClick={() => applyBulkPreset("low")}>
            {ko ? "저티어 집중" : "Low-Tier Focus"}
          </button>
          <button type="button" className="button-small" onClick={() => applyBulkPreset("even")}>
            {ko ? "전체 균등" : "Uniform"}
          </button>
          <button type="button" className="button-small" onClick={() => applyBulkPreset("high")}>
            {ko ? "고티어 집중" : "High-Tier Focus"}
          </button>
          <button type="button" className="button-small" onClick={() => applyBulkPreset("pack")}>
            {ko ? "팩 원본 복원" : "Restore Pack Defaults"}
          </button>
        </div>
      </div>

      {/* 구간별 카드 목록 (12개 스탯 구간) */}
      <div className="be-prob-cards">
        {bands.map((row, index) => {
          const id = row.entry.id;
          const draft = draftBandOf(row, stage);
          const staged = stage.gatherBands.get(id);
          const nextFrom = bands[index + 1]?.entry.from;
          const rangeLabel =
            nextFrom !== undefined ? `Stat ${draft.from} ~ ${nextFrom - 1}` : `Stat ${draft.from}+`;
          const maxAccessTier = maxAccessTierOf(draft.from, nextFrom);
          const progressBonus = Math.max(1, Math.floor(draft.from / 20));
          const sum = draft.weightsPm.reduce((acc, val) => acc + val, 0);
          const sumValid = sum === GATHER_BAND_WEIGHT_TOTAL;

          return (
            <article
              key={id}
              className="be-panel be-prob-card"
              data-band-id={id}
              data-staged={staged ? "true" : undefined}
            >
              <header className="be-prob-card-head">
                <div className="be-actions">
                  <strong className="be-prob-stat-range">{rangeLabel}</strong>
                  <code className="dev-code">{id}</code>
                  <span className="dev-muted">
                    {ko
                      ? `(권장 T0~T${maxAccessTier} · 진행 보너스 ×${progressBonus})`
                      : `(T0~T${maxAccessTier} · Progress ×${progressBonus})`}
                  </span>
                  {row.origin === "edited" ? (
                    <span className="dev-badge" data-origin="edited">
                      {ko ? "덮어씀" : "Edited"}
                    </span>
                  ) : null}
                  {staged ? (
                    <span className="dev-badge be-badge-staged">{ko ? "담음" : "Staged"}</span>
                  ) : null}
                </div>
                <div className="be-actions">
                  <span className="dev-badge" data-invalid={!sumValid ? "true" : undefined}>
                    {ko
                      ? `합계: ${sum}‰ (${(sum / 10).toFixed(1)}%)`
                      : `Sum: ${sum}‰ (${(sum / 10).toFixed(1)}%)`}
                  </span>
                  {!sumValid ? (
                    <button
                      type="button"
                      className="button-small"
                      onClick={() => onEditBand(id, normalizeWeightsPm(draft.weightsPm))}
                    >
                      {ko ? "1000‰ 맞춤" : "Normalize 1000‰"}
                    </button>
                  ) : null}
                </div>
              </header>

              {/* 누적 스택 바 */}
              <div className="be-prob-stack" aria-hidden="true">
                {draft.weightsPm.map((w, t) => {
                  const pct = sum > 0 ? (w / sum) * 100 : 0;
                  if (pct <= 0) return null;
                  const meta = TIER_META[t] ?? TIER_META[0]!;
                  return (
                    <div
                      key={t}
                      className="be-prob-stack-seg"
                      data-tier={meta.tone}
                      style={{ width: `${pct}%` }}
                      title={`${ko ? meta.ko : meta.en}: ${w}‰ (${pct.toFixed(1)}%)`}
                    />
                  );
                })}
              </div>

              <div className="be-prob-body">
                {/* 좌측: 확률 분포 바 차트 */}
                <div className="be-prob-chart">
                  <p className="be-subheading">{ko ? "확률 분포 시각화" : "Probability Distribution"}</p>
                  <div className="be-prob-bars">
                    {TIER_META.map((meta, t) => {
                      const w = draft.weightsPm[t] ?? 0;
                      const pct = sum > 0 ? (w / sum) * 100 : 0;
                      return (
                        <div
                          key={t}
                          className="be-prob-bar-row"
                          data-dim={t > maxAccessTier && w === 0 ? "true" : undefined}
                        >
                          <span className="be-prob-tier-label" data-tier={meta.tone}>
                            {ko ? meta.ko : meta.en}
                          </span>
                          <div className="be-prob-bar-track">
                            <div
                              className="be-prob-bar-fill"
                              data-tier={meta.tone}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          <span className="be-prob-bar-pct">
                            {pct.toFixed(1)}% ({w}‰)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 우측: 가중치 직접 입력 (‰) 및 구간 프리셋 */}
                <div className="be-prob-inputs">
                  <p className="be-subheading">
                    {ko ? "티어별 가중치 입력 (‰, 합 1000)" : "Tier Weights (‰, sum 1000)"}
                  </p>
                  <div className="be-prob-input-grid">
                    {TIER_META.map((meta, t) => {
                      const w = draft.weightsPm[t] ?? 0;
                      return (
                        <label key={t} className="be-prob-input-cell">
                          <span className="be-prob-tier-label" data-tier={meta.tone}>
                            T{t}
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={GATHER_BAND_WEIGHT_TOTAL}
                            step={1}
                            value={w}
                            aria-label={`${id} T${t}`}
                            onChange={(event) => {
                              const rawVal = Number.parseInt(event.target.value || "0", 10);
                              const clamped = Number.isNaN(rawVal)
                                ? 0
                                : Math.max(0, Math.min(GATHER_BAND_WEIGHT_TOTAL, rawVal));
                              const next = draft.weightsPm.map((cur, idx) => (idx === t ? clamped : cur));
                              onEditBand(id, next);
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>

                  {/* 구간 빠른 프리셋 */}
                  <div className="be-actions be-prob-row-presets">
                    <span className="dev-muted">{ko ? "구간 프리셋:" : "Row preset:"}</span>
                    <button
                      type="button"
                      className="button-small"
                      onClick={() => onEditBand(id, rowPresetWeights("low", maxAccessTier))}
                    >
                      {ko ? "저티어" : "Low"}
                    </button>
                    <button
                      type="button"
                      className="button-small"
                      onClick={() => onEditBand(id, rowPresetWeights("even", maxAccessTier))}
                    >
                      {ko ? "균등" : "Uniform"}
                    </button>
                    <button
                      type="button"
                      className="button-small"
                      onClick={() => onEditBand(id, rowPresetWeights("mid", maxAccessTier))}
                    >
                      {ko ? "중간" : "Mid"}
                    </button>
                    <button
                      type="button"
                      className="button-small"
                      onClick={() => onEditBand(id, rowPresetWeights("high", maxAccessTier))}
                    >
                      {ko ? "고티어" : "High"}
                    </button>
                    <button
                      type="button"
                      className="button-small"
                      onClick={() => onEditBand(id, normalizeWeightsPm(draft.weightsPm))}
                    >
                      {ko ? "1000‰ 정규화" : "Normalize 1000‰"}
                    </button>
                    {row.origin === "edited" ? (
                      <button type="button" className="button-small" onClick={() => onRevertBand(id)}>
                        {ko ? "팩 값으로 되돌리기" : "Revert to Pack"}
                      </button>
                    ) : null}
                    {staged ? (
                      <button type="button" className="button-small" onClick={() => onUnstageBand(id)}>
                        {ko ? "담기 취소" : "Unstage"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* 하단 시설별 주·보조 스탯 매핑 및 가중치 설계 지침 */}
      <div className="be-panel be-prob-guide">
        <h3 className="be-heading">
          {ko ? "시설별 채집 방식 · 주/보조 스탯 매핑" : "Facility Gather Modes & Stat Mapping"}
        </h3>
        <div className="be-prob-facility-grid">
          {gatherFacilities.map((f) => {
            const g = f.entry.gather;
            if (!g) return null;
            const isSelect = g.mode === "select";
            return (
              <div key={f.entry.id} className="be-prob-facility-chip">
                <strong>{f.entry.name[locale]}</strong>
                <code className="dev-code">
                  {g.primary.toUpperCase()} / {g.secondary.toUpperCase()}
                </code>
                <span className="dev-badge">
                  {isSelect
                    ? ko
                      ? "선택+효율"
                      : "Select+Yield"
                    : ko
                      ? "확률 추첨 (N43)"
                      : "Prob Roll (N43)"}
                </span>
              </div>
            );
          })}
        </div>
        <ul className="be-plain-list dev-muted">
          <li>
            {ko
              ? "확률 추첨(roll) 시설은 위 스탯 구간표에서 유효 스탯(주 스탯 + 레벨 보너스)에 해당하는 구간의 가중치(1000‰)로 T0~T9 산출을 추첨합니다."
              : "Probability-roll facilities draw T0–T9 outputs using the 1000‰ weights of the matching effective-stat band."}
          </li>
          <li>
            {ko
              ? "선택+효율(select, 농장·목장) 시설은 확률 추첨 없이 선택한 티어를 생산하며, 스탯은 진행 속도와 추가 수확량에만 영향을 줍니다."
              : "Select+efficiency facilities (Farm, Ranch) produce the chosen tier deterministically; stats govern progress speed and extra yield."}
          </li>
        </ul>
      </div>
    </div>
  );
}
