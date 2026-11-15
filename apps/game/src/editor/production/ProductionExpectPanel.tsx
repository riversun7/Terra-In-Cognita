// 예상 확률 탭 — 기획 D-534(사용자 원문 "각 대략적인 스탯별(총합30,40,50 등), 레벨별(1,20,40,50,60) 등 예상되는 채집확률구간도 에디터에서
// 볼수있게"), 48 §8. docs/adr/2026-11-12-unit-condition.md.
// 줄 = 두 스탯(주 + 보조) 초기 합, 칸 = 레벨. 칸마다 K 범위(N6)의 유효 스탯 범위와 T0~T9 확률. 컨디션(관리 보너스)·시설 레벨 손잡이를 옮기면 바로
// 다시 센다. 칸 아래에 선택 방식(농장·목장) 해금 티어 범위도 보인다(D-535 1154 나 — 컨디션을 반씩 두 스탯에). 셈은 판정과 같은 @terra/shared/gatherExpect(성장 primaryAtLevel·유효 스탯 gatherStat·구간 gatherBandIndex)이고, 확률표는 담은
// 변경을 얹은 지금 표(draftBands)라 확률 분포 탭에서 고친 값이 바로 보인다. 계산만 한다(서버에 보내지 않는다).
// 바뀜 (2026-11-14, 기획 D-542 질문 1365 나): 고른 사다리에 낚시터가 있으면 물 종류를 골라 확률을 그 티어 범위로 접어 본다.
// 바뀜 (2026-11-15, 기획 D-562 1562): 범위는 설정 칸이 아니라 팩 오브젝트(물터·어군)에서 끌어낸 값이다(서버 buildingEdit fishTiers).
import type { BuildingEditorGatherRules } from "@terra/shared/buildingEditor";
import {
  GATHER_EXPECT_LEVELS,
  GATHER_EXPECT_SUMS,
  type GatherExpectCell,
  expectedGatherTable,
} from "@terra/shared/gatherExpect";
import type { GatherBand } from "@terra/shared/gatherMath";
import { FISH_WATERS, type FishTierRanges, type FishWater, fishTierRangeOf } from "@terra/shared/fishWater";
import { fishWaterName } from "../../ui/fishWaterText.ts";
import { type ReactNode, useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import "../gatherTiers/gatherTier.css";

/** 옛 서버(손잡이 칸 없음)일 때의 값 = 팩 출발값(N5 100‰·N6 800~1200‰·N43 5·컨디션 ±40) */
const FALLBACK = { growthPm: 100, kMinPm: 800, kMaxPm: 1200, levelBonus: 5, conditionCap: 40 } as const;
/** 시설 레벨 범위(D-5001 Lv1~5) */
const FACILITY_LEVEL_MAX = 5;
/** T9 = 최고 티어(D-534 "티어 10") */
const TOP_TIER = 9;

/** ‰ → "1.5%"(0이면 "0") */
function percentText(pm: number): string {
  if (pm <= 0) return "0";
  return `${(pm / 10).toFixed(pm % 10 === 0 ? 0 : 1)}%`;
}

/** 부호 붙은 수 */
function signed(value: number): string {
  return value > 0 ? `+${String(value)}` : value < 0 ? `−${String(-value)}` : "0";
}

function ExpectCell({ cell }: { cell: GatherExpectCell }) {
  const top = cell.tierPm[TOP_TIER] ?? 0;
  return (
    <td
      className="pd-expect-cell"
      data-top={top > 0 || undefined}
      data-testid={`expect-${cell.sum}-${cell.level}`}
    >
      <span className="pd-expect-stat dev-num">
        {cell.statMin === cell.statMax
          ? String(cell.statMin)
          : m.dev_prod_expect_range({ min: cell.statMin, max: cell.statMax })}
      </span>
      <span className="gt-stack pd-expect-stack" aria-hidden="true">
        {cell.tierPm.map((pm, tier) =>
          pm > 0 ? (
            <span
              // oxlint-disable-next-line react/no-array-index-key -- 티어 차례가 곧 열쇠다(T0~T9 고정)
              key={tier}
              className="gt-seg"
              data-tier={`t${tier}`}
              style={{ flexGrow: pm }}
            />
          ) : null,
        )}
      </span>
      <ol className="pd-expect-tiers" aria-label={m.dev_prod_expect_tiers_label()}>
        {cell.tierPm.map((pm, tier) => (
          // oxlint-disable-next-line react/no-array-index-key -- 티어 차례가 곧 열쇠다(T0~T9 고정)
          <li key={tier} data-zero={pm === 0 || undefined} data-tier={`t${tier}`}>
            <span className="gt-tier-head" data-tier={`t${tier}`}>
              T{tier}
            </span>{" "}
            <span className="dev-num">{percentText(pm)}</span>
          </li>
        ))}
      </ol>
      <span className="pd-expect-avg">
        {m.dev_prod_expect_avg({ tier: (cell.averageTierMilli / 1000).toFixed(2) })}
      </span>
      <span className="pd-expect-avg" data-testid={`expect-select-${cell.sum}-${cell.level}`}>
        {cell.selectEffMinPm === cell.selectEffMaxPm
          ? m.dev_prod_expect_select_one({ tier: cell.selectTier, pct: percentText(cell.selectEffMinPm) })
          : m.dev_prod_expect_select({
              tier: cell.selectTier,
              min: percentText(cell.selectEffMinPm),
              max: percentText(cell.selectEffMaxPm),
            })}
      </span>
    </td>
  );
}

export function ProductionExpectPanel({
  picker,
  bands,
  rules,
  fishTiers,
}: {
  /** 띠 표 고르기(기획 D-540 1217 나 — 사다리마다 띠 표) */
  picker?: ReactNode;
  /** 담은 변경을 얹은 지금 확률표(고른 사다리 표만) */
  bands: readonly GatherBand[];
  rules: BuildingEditorGatherRules;
  /** 고른 사다리에 낚시터가 있을 때만: 물 종류마다 티어 범위(서버 rules.fishTiers). 없으면 물 종류 고르기를 보이지 않는다 */
  fishTiers?: FishTierRanges | undefined;
}) {
  const id = useId();
  const cap = Math.max(0, rules.conditionCap ?? FALLBACK.conditionCap);
  const [condition, setCondition] = useState(0);
  const [facilityLevel, setFacilityLevel] = useState(1);
  const [water, setWater] = useState<FishWater | "">("");
  const tierRange = fishTiers && water !== "" ? fishTierRangeOf(fishTiers, water) : undefined;
  const shown = Math.max(-cap, Math.min(cap, condition));
  const growthPm = rules.growthPm ?? FALLBACK.growthPm;
  const kMinPm = rules.kMinPm ?? FALLBACK.kMinPm;
  const kMaxPm = rules.kMaxPm ?? FALLBACK.kMaxPm;
  const levelBonus = rules.levelBonus ?? FALLBACK.levelBonus;
  const table = expectedGatherTable({
    bands,
    growthPm,
    kMinPm,
    kMaxPm,
    levelBonus,
    facilityLevel,
    condition: shown,
    tierRange,
    building: rules.building,
  });
  return (
    <div className="pd-expect">
      <h2 id={`${id}-title`} className="ce-panel-title" tabIndex={-1}>
        {m.dev_prod_expect_title()}
      </h2>
      <p className="field-hint">
        {m.dev_prod_expect_lead({
          growth: (growthPm / 1000).toFixed(2),
          kMin: (kMinPm / 1000).toFixed(2),
          kMax: (kMaxPm / 1000).toFixed(2),
          bonus: levelBonus,
        })}
      </p>
      {picker}
      <div className="pd-expect-controls">
        <label className="pd-expect-slider">
          <span>
            {m.dev_prod_expect_condition()}{" "}
            <output className="dev-num" data-testid="expect-condition-value">
              {signed(shown)}
            </output>{" "}
            <span className="pd-expect-cap">{m.dev_prod_expect_cap({ cap })}</span>
          </span>
          <input
            type="range"
            min={-cap}
            max={cap}
            step={1}
            value={shown}
            data-testid="expect-condition"
            onChange={(event) => setCondition(Number(event.currentTarget.value))}
          />
        </label>
        <label className="pd-expect-slider">
          <span>
            {m.dev_prod_expect_facility()}{" "}
            <output className="dev-num" data-testid="expect-facility-value">
              {m.dev_prod_expect_level({ level: facilityLevel })}
            </output>
          </span>
          <input
            type="range"
            min={1}
            max={FACILITY_LEVEL_MAX}
            step={1}
            value={facilityLevel}
            data-testid="expect-facility"
            onChange={(event) => setFacilityLevel(Number(event.currentTarget.value))}
          />
        </label>
        {fishTiers ? (
          <label className="pd-expect-slider">
            <span>{m.dev_prod_expect_water()}</span>
            <select
              value={water}
              data-testid="expect-water"
              onChange={(event) => {
                const next = event.currentTarget.value;
                setWater(FISH_WATERS.find((item) => item === next) ?? "");
              }}
            >
              <option value="">{m.dev_prod_expect_water_none()}</option>
              {FISH_WATERS.map((item) => {
                const range = fishTierRangeOf(fishTiers, item);
                return (
                  <option key={item} value={item}>
                    {m.dev_prod_expect_water_option({
                      water: fishWaterName(item),
                      min: range?.min ?? 0,
                      max: range?.max ?? 0,
                    })}
                  </option>
                );
              })}
            </select>
          </label>
        ) : null}
      </div>
      {fishTiers ? <p className="field-hint">{m.dev_prod_expect_water_hint()}</p> : null}
      <div className="dev-table-wrap">
        <table className="dev-table pd-expect-table" aria-labelledby={`${id}-title`}>
          <thead>
            <tr>
              <th scope="col">{m.dev_prod_expect_sum_head()}</th>
              {GATHER_EXPECT_LEVELS.map((level) => (
                <th key={level} scope="col">
                  {m.dev_prod_expect_level({ level })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.map((row, index) => {
              const sum = GATHER_EXPECT_SUMS[index] ?? 0;
              const [primary, secondary] = row[0]?.stats ?? [0, 0];
              return (
                <tr key={sum}>
                  <th scope="row" className="pd-expect-row">
                    <span className="dev-num">{sum}</span>
                    <span className="pd-expect-split">{m.dev_prod_expect_split({ primary, secondary })}</span>
                  </th>
                  {row.map((cell) => (
                    <ExpectCell key={cell.level} cell={cell} />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="field-hint">{m.dev_prod_expect_note()}</p>
    </div>
  );
}
