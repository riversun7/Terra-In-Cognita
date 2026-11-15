// 실험 유닛 지휘 계급 칸 — 기획 D-558(사용자 1543·1544 "전투계열 랭킹이나 해당국가 작위로 지휘가능한 분대수가 정해짐(군대 계급처럼)",
// 1545 승계 = 작위 → 전투 랭킹 순). 작위(민간인 ~ 대공)·전투 랭킹 등급(등급 밖·1~4)을 고른다. 둘 다 없으면 칸을 지운다(계급 없음).
// 정원 = 설정 칸 표에서 큰 쪽 + 환생 덤(서버 판정). 시험용: select.bl-rank-title·.bl-rank-tier.
import { LAB_TIER_MAX, LAB_TITLE_MAX, type LabUnit } from "@terra/shared/battleLab";
import { useId } from "react";
import { m } from "../../../paraglide/messages.js";

const TITLE_TEXT: readonly (() => string)[] = [
  m.dev_lab_title_0,
  m.dev_lab_title_1,
  m.dev_lab_title_2,
  m.dev_lab_title_3,
  m.dev_lab_title_4,
  m.dev_lab_title_5,
];

/** 계급 칸 값 → 유닛(작위 0·등급 밖이면 칸 없음) */
function withRank(unit: LabUnit, title: number, combatTier: number | null): LabUnit {
  const { rank: _old, ...rest } = unit;
  return title === 0 && combatTier === null ? rest : { ...rest, rank: { title, combatTier } };
}

export function RankFields(props: {
  readonly unit: LabUnit;
  readonly onChange: (change: (current: LabUnit) => LabUnit) => void;
}) {
  const id = useId();
  const title = props.unit.rank?.title ?? 0;
  const tier = props.unit.rank?.combatTier ?? null;
  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor={`${id}-title`}>
          {m.dev_lab_title()}
        </label>
        <select
          id={`${id}-title`}
          className="bl-rank-title"
          value={title}
          onChange={(event) => {
            const next = Number(event.target.value);
            props.onChange((current) => withRank(current, next, current.rank?.combatTier ?? null));
          }}
        >
          {Array.from({ length: LAB_TITLE_MAX + 1 }, (_, value) => (
            <option key={value} value={value}>
              {TITLE_TEXT[value]?.() ?? String(value)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor={`${id}-tier`}>
          {m.dev_lab_tier()}
        </label>
        <select
          id={`${id}-tier`}
          className="bl-rank-tier"
          value={tier === null ? "" : tier}
          aria-describedby={`${id}-rank-hint`}
          onChange={(event) => {
            const raw = event.target.value;
            const next = raw === "" ? null : Number(raw);
            props.onChange((current) => withRank(current, current.rank?.title ?? 0, next));
          }}
        >
          <option value="">{m.dev_lab_tier_none()}</option>
          {Array.from({ length: LAB_TIER_MAX + 1 }, (_, value) => (
            <option key={value} value={value}>
              {m.dev_lab_tier_n({ n: value + 1 })}
            </option>
          ))}
        </select>
        <p className="field-hint" id={`${id}-rank-hint`}>
          {m.dev_lab_rank_hint()}
        </p>
      </div>
    </>
  );
}
