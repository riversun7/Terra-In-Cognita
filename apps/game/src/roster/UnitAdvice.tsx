// 유닛 추천 칸 — 사용자 요청 2026-11-11 "유닛 정보창에는 스탯에 따라 적합한 1차 생산직군 추천도 보이게 한다. 또한 전투계 스탯조합배열로도
// 적합한 클래스 추천 및 설명 추가", 기획 D-529(옛 35 클래스), docs/adr/2026-11-11-production-six.md.
// - 추천 1차 생산: 여섯 가지를 유효 스탯(주 + 보조)으로 줄 세운 위 둘과 까닭("STR 주력 · VIT 보조 → 광산").
// - 추천 전투 유형: 스탯 조합의 클래스 이름·역할·설명.
// 셈은 @terra/shared/unitGuide(편집기 미리 보기와 같은 함수), 표는 서버가 실효 값으로 준다(useUnitGuide). 스탯으로 고른 제안일 뿐이다:
// 생산은 다른 일도 맡길 수 있고, 전투 유형은 이름표라 규칙 효과가 없다(아래 풀이 줄이 그대로 적는다).
// compact = 한 줄(구인 카드·2차맵 고른 유닛): 생산 위 둘 이름 + 전투 유형 이름.
import type { PrimaryStat, RosterStats } from "@terra/shared/roster";
import {
  type GuideStats,
  type UnitGuideResponse,
  recommendCombatClass,
  recommendProduction,
} from "@terra/shared/unitGuide";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { primaryCode } from "./rosterText.ts";
import { useUnitGuide } from "./useUnitGuide.ts";
import "./unitAdvice.css";

const comboText = (stats: readonly PrimaryStat[]): string =>
  stats.map((stat) => primaryCode(stat)).join(" + ");

/** 서버 스탯(성장값 base + 보너스) → 추천이 읽는 값(둘의 합: 직무 산출이 쓰는 값과 같다) */
export function guideStatsOf(primaries: RosterStats["primaries"]): GuideStats {
  const total = (stat: PrimaryStat): number => primaries[stat].base + primaries[stat].bonus;
  return {
    str: total("str"),
    vit: total("vit"),
    int: total("int"),
    wis: total("wis"),
    dex: total("dex"),
    agi: total("agi"),
  };
}

/** 추천을 셈한다(표가 비면 null — 칸을 보이지 않는다) */
function adviceOf(stats: GuideStats, guide: UnitGuideResponse) {
  const production = recommendProduction(stats, guide.production, 2);
  const combat = recommendCombatClass(stats, guide.classes, guide.classRule);
  return production.length === 0 && combat.entry === null ? null : { production, combat };
}

export function UnitAdvice({
  stats,
  compact = false,
}: {
  /** 1차 스탯 값(몸 값 + 보너스) */
  readonly stats: GuideStats;
  readonly compact?: boolean;
}) {
  const guide = useUnitGuide();
  const locale = getLocale() === "en" ? "en" : "ko";
  if (!guide) return null;
  const advice = adviceOf(stats, guide);
  if (!advice) return null;
  const { production, combat } = advice;
  const jobNames = production.map((pick) => pick.type.name[locale]).join(" · ");
  if (compact)
    return (
      <p
        className="unit-advice unit-advice-compact"
        data-jobs={production.map((pick) => pick.type.facility).join(",")}
        data-class={combat.entry?.id ?? ""}
      >
        {production.length > 0 ? (
          <span className="unit-advice-part">{m.unit_advice_compact_jobs({ names: jobNames })}</span>
        ) : null}
        {combat.entry ? (
          <span className="unit-advice-part">
            {m.unit_advice_compact_class({ name: combat.entry.name[locale] })}
          </span>
        ) : null}
      </p>
    );
  return (
    <div
      className="unit-advice"
      role="group"
      aria-label={m.unit_advice_label()}
      data-jobs={production.map((pick) => pick.type.facility).join(",")}
      data-class={combat.entry?.id ?? ""}
      data-class-kind={combat.shape.kind}
    >
      {production.length > 0 ? (
        <section className="unit-advice-block" aria-label={m.unit_advice_jobs_title()}>
          <h3 className="unit-advice-title">{m.unit_advice_jobs_title()}</h3>
          <ol className="unit-advice-jobs">
            {production.map((pick) => (
              <li key={pick.type.facility} className="unit-advice-job" data-facility={pick.type.facility}>
                <strong className="unit-advice-name">{pick.type.name[locale]}</strong>
                <span className="unit-advice-reason">
                  {m.unit_advice_job_reason({
                    primary: primaryCode(pick.type.primary),
                    primaryValue: pick.primaryValue,
                    secondary: primaryCode(pick.type.secondary),
                    secondaryValue: pick.secondaryValue,
                    score: pick.score,
                  })}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {combat.entry ? (
        <section className="unit-advice-block" aria-label={m.unit_advice_class_title()}>
          <h3 className="unit-advice-title">{m.unit_advice_class_title()}</h3>
          <p className="unit-advice-class">
            <strong className="unit-advice-name">{combat.entry.name[locale]}</strong>
            <span className="unit-advice-reason">
              {combat.shape.kind === "generalist"
                ? m.unit_advice_class_even()
                : m.unit_advice_class_combo({ combo: comboText(combat.entry.stats) })}
              {combat.entry.role ? ` · ${combat.entry.role[locale]}` : ""}
            </span>
          </p>
          <p className="unit-advice-desc">{combat.entry.desc[locale]}</p>
        </section>
      ) : null}
      <p className="unit-advice-note">{m.unit_advice_note()}</p>
    </div>
  );
}
