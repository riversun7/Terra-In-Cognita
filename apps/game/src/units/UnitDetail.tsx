// 유닛 상세 — 상태(직무·피로/배터리·부상·포로·이동·만족도), 스탯(서버 계산), 장비 칸, 스킬, 화물, 동작(곧 열림).
// 부상(D-521): 상태 칸에 단계 색 표(InjuryBadge), 세계 유닛은 [부상·병원] 칸(HospitalCare.tsx — 견적·치료, docs/adr/2026-11-08-injury.md).
// 좁은 폭은 목록 대신 보이고 [목록으로]가 닫는다. 넓은 폭은 목록 옆 판이다(UnitList.tsx).
// AI 작전(D-5039·D-5040, TacticsPanel.tsx): 판단하는 세계 유닛만 — 조우 판단·조우 전투 퇴각 기준.
// 세계 유닛(w…)의 장비 칸은 보유 물건(holdings/UnitHoldings.tsx: 칸 고르기·장착·해제·사용, docs/adr/2026-11-03-item-holdings.md
// "바뀜 (화면)"), 시안 유닛은 시안 칸 목록.
import type { RosterUnit, UnitsListResponse } from "@terra/shared/roster";
import { useEffect, useId, useRef } from "react";
import { m } from "../paraglide/messages.js";
import { UnitHoldings } from "../holdings/UnitHoldings.tsx";
import { Meter, PreviewTag, Section, SkillList, SlotList, SoonButton, StatBlock } from "../roster/parts.tsx";
import { UnitAdvice, guideStatsOf } from "../roster/UnitAdvice.tsx";
import { InjuryBadge } from "../roster/InjuryBadge.tsx";
import { ConditionFact } from "../roster/ConditionFact.tsx";
import { VitalsMeters } from "../roster/VitalsMeters.tsx";
import type { VitalsShown } from "../roster/useVitals.ts";
import {
  assetLabel,
  formatAmount,
  formatNumber,
  jobLabel,
  localName,
  typeLabel,
  unitLabel,
} from "../roster/rosterText.ts";
import { HospitalCare } from "./HospitalCare.tsx";
import { TacticsPanel } from "./TacticsPanel.tsx";
import { UnitGift } from "../map/business/UnitGift.tsx";

/** [임시] 피로 경고 몫(한도 120의 80%), 배터리 경고 몫(20%). 기획 피로 구간(D-430)이 정해지면 그 값 */
const FATIGUE_WARN = 0.8;
const BATTERY_WARN = 0.2;
/** 만족도가 이보다 낮으면 회유 위험 표시(D-253·D-257: 낮을수록 회유가 싸다). [임시] 문턱 */
const SATISFACTION_WARN = 30;

const DOMAIN_LABELS = {
  space: m.roster_domain_space,
  sky: m.roster_domain_sky,
  land: m.roster_domain_land,
  sea: m.roster_domain_sea,
} as const;

/** 이름 첫 글자 동그라미(종류마다 색) */
export function UnitAvatar({
  unit,
  large = false,
}: {
  unit: Pick<RosterUnit, "id" | "name" | "type">;
  large?: boolean;
}) {
  const label = unitLabel(unit);
  return (
    <span
      className={large ? "roster-avatar roster-avatar-lg" : "roster-avatar"}
      data-type={unit.type}
      aria-hidden="true"
    >
      {Array.from(label)[0] ?? "?"}
    </span>
  );
}

export function UnitDetail({
  unit,
  data,
  vitals,
  onVitalsStale,
  onClose,
}: {
  unit: RosterUnit;
  data: UnitsListResponse;
  /** 지금 생명 수치(실제 세계 유닛만, D-512). 없으면 막대를 그리지 않는다 */
  vitals?: VitalsShown | undefined;
  /** 보유 물건이 바뀐 뒤(회복 물약 등) 생명 수치를 다시 받는다 */
  onVitalsStale?: (() => void) | undefined;
  onClose: () => void;
}) {
  const id = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const names = data.names;
  const now = data.generatedAt;
  const place = unit.place;
  // 세계 유닛 번호("w42" → 42). 시안 유닛이면 null
  const worldUnit = !unit.preview && /^w\d+$/.test(unit.id) ? Number(unit.id.slice(1)) : null;

  // 연 유닛의 이름으로 초점을 옮긴다(좁은 폭에서 목록이 사라지므로). 다른 유닛을 열면 key가 바뀌어 다시 돈다
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <article className="units-detail" aria-labelledby={`${id}-name`}>
      <div className="panel units-detail-head">
        <button type="button" className="button-small units-detail-back" onClick={onClose}>
          {m.units_detail_back()}
        </button>
        <div className="units-detail-who">
          <UnitAvatar unit={unit} large />
          <div className="units-detail-names">
            <h2 id={`${id}-name`} ref={titleRef} tabIndex={-1} className="units-detail-name">
              {unitLabel(unit)}
            </h2>
            <p className="roster-meta">
              {[
                typeLabel(unit.type),
                unit.level === null ? null : m.roster_level({ level: formatNumber(unit.level) }),
                unit.rebirths > 0 ? m.roster_rebirths({ count: formatNumber(unit.rebirths) }) : null,
              ]
                .filter((part) => part !== null)
                .join(" · ")}
            </p>
            {place ? (
              <p className="roster-meta">
                {m.roster_place({
                  place: place.base ?? localName(names.planets[place.planetId], place.planetId),
                  domain: DOMAIN_LABELS[place.domain](),
                })}
              </p>
            ) : null}
          </div>
          {unit.preview ? <PreviewTag /> : null}
        </div>
      </div>

      <Section id={`${id}-state`} title={m.units_section_state()}>
        <dl className="roster-facts">
          <div>
            <dt>{m.units_fact_job()}</dt>
            <dd>
              {unit.job
                ? m.units_job_phase({
                    job: jobLabel(unit.job, names),
                    phase: unit.job.phase === "rest" ? m.units_status_resting() : m.units_status_working(),
                  })
                : m.units_status_idle()}
            </dd>
          </div>
          <div>
            <dt>{m.units_fact_injury()}</dt>
            <dd data-tone={unit.injury.stage > 0 ? "injured" : undefined}>
              <InjuryBadge injury={unit.injury} now={now} showHealthy />
            </dd>
          </div>
          {unit.condition ? <ConditionFact condition={unit.condition} /> : null}
          {unit.captive ? (
            <div>
              <dt>{m.units_fact_captive()}</dt>
              <dd data-tone="captive">{m.units_captive_body()}</dd>
            </div>
          ) : null}
          {unit.moving ? (
            <div>
              <dt>{m.units_fact_moving()}</dt>
              <dd>{m.roster_moving()}</dd>
            </div>
          ) : null}
        </dl>
        {vitals ? <VitalsMeters vitals={vitals} /> : null}
        {unit.energy.kind === "battery" ? (
          <Meter
            label={m.roster_battery()}
            value={unit.energy.value}
            max={unit.energy.max}
            valueText={m.roster_value_of({
              value: formatNumber(unit.energy.value),
              max: formatNumber(unit.energy.max),
            })}
            warnAt={BATTERY_WARN}
            lowIsBad
          />
        ) : (
          <Meter
            label={m.roster_fatigue()}
            value={unit.energy.value}
            max={unit.energy.max}
            valueText={m.roster_value_of({
              value: formatNumber(unit.energy.value),
              max: formatNumber(unit.energy.max),
            })}
            warnAt={FATIGUE_WARN}
          />
        )}
        {unit.satisfaction !== null ? (
          <>
            <Meter
              label={m.roster_satisfaction()}
              value={unit.satisfaction}
              max={100}
              valueText={m.roster_value_of({
                value: formatNumber(unit.satisfaction),
                max: formatNumber(100),
              })}
              warnAt={SATISFACTION_WARN / 100}
              lowIsBad
            />
            {unit.satisfaction < SATISFACTION_WARN ? (
              <p className="roster-note">{m.units_satisfaction_low()}</p>
            ) : null}
          </>
        ) : null}
      </Section>

      {worldUnit !== null ? (
        <HospitalCare
          key={unit.id}
          id={`${id}-hospital`}
          unit={worldUnit}
          injury={unit.injury}
          now={now}
          onChanged={onVitalsStale}
        />
      ) : null}
      {/* AI 작전(D-5039·D-5040 — 조우 판단·조우 전투 퇴각 기준, 판단하는 세계 유닛만 칸이 온다) */}
      {worldUnit !== null && unit.tactics !== undefined ? (
        <TacticsPanel key={`tactics-${unit.id}`} id={`${id}-tactics`} unit={worldUnit} saved={unit.tactics} />
      ) : null}
      {/* 용돈 주기(유닛 사유재산 — D-555 1508, docs/adr/2026-11-15-business-ledger.md) */}
      {worldUnit !== null ? <UnitGift key={`gift-${unit.id}`} unitId={worldUnit} /> : null}

      <Section id={`${id}-stats`} title={m.roster_stats_title()}>
        <StatBlock stats={unit.stats} names={names} />
        <UnitAdvice stats={guideStatsOf(unit.stats.primaries)} />
      </Section>

      {worldUnit === null ? (
        <Section
          id={`${id}-gear`}
          title={m.roster_gear_title()}
          end={<SoonButton label={m.roster_action_equip()} />}
        >
          <SlotList slots={unit.slots} names={names} />
        </Section>
      ) : (
        <Section id={`${id}-gear`} title={m.holdings_unit_title()}>
          <UnitHoldings
            unit={worldUnit}
            fallbackLayout={unit.slots.map((slot) => slot.slot)}
            names={names}
            onChanged={onVitalsStale}
          />
        </Section>
      )}

      <Section id={`${id}-skills`} title={m.roster_skills_title()}>
        <SkillList skills={unit.skills} names={names} />
      </Section>

      <Section id={`${id}-cargo`} title={m.roster_cargo_title()}>
        {unit.cargo.length === 0 ? (
          <p className="roster-empty">{m.roster_cargo_empty()}</p>
        ) : (
          <ul className="roster-list">
            {unit.cargo.map((line) => (
              <li key={line.asset} className="roster-list-row">
                <span>{assetLabel(line.asset, names)}</span>
                <span className="roster-num">{formatAmount(line.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="units-detail-actions">
        <SoonButton label={m.units_action_assign_job()} small={false} />
        <SoonButton label={m.units_action_add_party()} small={false} />
        {unit.injury.stage > 0 && worldUnit === null ? (
          <SoonButton label={m.units_action_treat()} small={false} />
        ) : null}
      </div>
    </article>
  );
}
