// 유닛 상세 — 상태(직무·피로/배터리·부상·포로·이동·만족도), 사양(서버 계산), 장비 칸, 스킬, 화물, 동작(곧 열림).
// 사양은 사이보그 판과 같은 판을 쓴다(사용자 결정 2026-11-24 "모든 유닛은 사이보그 화면처럼 세부 정보가 뜨게 해야한다",
// docs/adr/2026-11-24-unit-cyborg-unify.md): 핵심 사양(CoreStats)·상세 전투 스펙(CombatSpecs)·스킬 칸·속성 — 자료는 유닛을 열 때 받는
// units.sheet. 받는 동안·실패하면 목록 자료의 스탯 표(StatBlock)를 보인다.
// 내 사이보그 본체(unit.self)도 이 목록의 유닛이다: 사양·칸 자리에 본체 판(cyborg/CyborgSheet.tsx — 큰 초상·외형 고르기·인공장기·일반장비·경험치·
// 신앙도·환생·랭킹, 자료 cyborg.get)을 그린다. 옛 사이보그 화면·메뉴는 없앴다(사용자 결정 2026-11-24 "사이보그 패널은 아예 없애라").
// 동그라미는 유닛 초상이다(사용자 지시 2026-11-24 "동그라미에 유닛의 초상화를 넣어라 D가 아니라"): 본체 = 만든 3D 외형, 그 밖의 사람형 = 유닛 ID로
// 정한 기본 외형(2차맵과 같은 모습, characterLookForUnit), 그릴 수 없으면(크리쳐·WebGL 없음·그리는 중) 이름 첫 글자.
// 부상(D-521): 상태 칸에 단계 색 표(InjuryBadge), 세계 유닛은 [부상·병원] 칸(HospitalCare.tsx — 견적·치료, docs/adr/2026-11-08-injury.md).
// 좁은 폭은 목록 대신 보이고 [목록으로]가 닫는다. 넓은 폭은 목록 옆 판이다(UnitList.tsx).
// AI 작전(D-5039·D-5040, TacticsPanel.tsx): 판단하는 세계 유닛만 — 조우 판단·조우 전투 퇴각 기준.
// 세계 유닛(w…)의 장비 칸은 보유 물건(holdings/UnitHoldings.tsx: 칸 고르기·장착·해제·사용, docs/adr/2026-11-03-item-holdings.md
// "바뀜 (화면)"), 시안 유닛은 시안 칸 목록.
import { type CharacterLook, characterLookForUnit } from "@terra/shared/characterLook";
import type { RosterNames, RosterUnit, UnitsListResponse } from "@terra/shared/roster";
import { useEffect, useId, useMemo, useRef } from "react";
import { CombatSpecs } from "../cyborg/CombatSpecs.tsx";
import { CoreStats } from "../cyborg/CoreStats.tsx";
import { Elements, SkillSlots } from "../cyborg/CyborgExtras.tsx";
import { CyborgPortrait } from "../cyborg/CyborgPortrait.tsx";
import { CyborgSheet } from "../cyborg/CyborgSheet.tsx";
import "../cyborg/cyborg.css";
import { usePreviewOn } from "../inbox/preview.ts";
import { m } from "../paraglide/messages.js";
import { UnitHoldings } from "../holdings/UnitHoldings.tsx";
import { Meter, PreviewTag, Section, SkillList, SlotList, SoonButton, StatBlock } from "../roster/parts.tsx";
import { UnitAdvice, guideStatsOf } from "../roster/UnitAdvice.tsx";
import { InjuryBadge } from "../roster/InjuryBadge.tsx";
import { ConditionFact } from "../roster/ConditionFact.tsx";
import { VitalsMeters } from "../roster/VitalsMeters.tsx";
import { unitSheetLoader, useRosterQuery } from "../roster/useRosterQuery.ts";
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
import { LifeRulesPanel } from "./LifeRulesPanel.tsx";
import { TacticsPanel } from "./TacticsPanel.tsx";
import { UnitGift } from "../map/business/UnitGift.tsx";
import { EntityRef, type UnitSymbolRole } from "../ui/EntityRef.tsx";

function detailUnitRole(unit: Pick<RosterUnit, "type" | "self">): UnitSymbolRole {
  if (unit.self === true || unit.type === "cyborg") return "cyborg";
  if (unit.type === "android") return "android";
  if (unit.type === "creature") return "creature";
  return "human";
}

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

/** 동그라미 초상을 그리는 크기(px): 목록 줄·상세 머리(roster.css --aide-size·--mark-lg보다 넉넉하게 — 칸이 줄여 보인다) */
const AVATAR_PX = 48;
const AVATAR_LG_PX = 96;

/**
 * 유닛의 초상 외형. 본체 = 만든 3D 외형(없으면 null — 시안 본체), 사람형(휴먼·사이보그 유닛·안드로이드·시험 유닛) = 유닛 번호로 정한 기본 외형
 * (2차맵이 그리는 것과 같다), 크리쳐는 사람형 외형이 없어 null
 */
export function unitLookOf(unit: Pick<RosterUnit, "id" | "type" | "self" | "look">): CharacterLook | null {
  if (unit.look) return unit.look;
  if (unit.self === true || unit.type === "creature") return null;
  const number = Number(/\d+$/.exec(unit.id)?.[0]);
  if (!Number.isSafeInteger(number)) return null;
  return characterLookForUnit(number, unit.type === "android" ? "android" : "commoner");
}

/** 유닛 초상 동그라미(종류마다 테두리 색). 초상을 그릴 수 없으면 이름 첫 글자 */
export function UnitAvatar({
  unit,
  large = false,
}: {
  unit: Pick<RosterUnit, "id" | "name" | "type" | "self" | "look">;
  large?: boolean;
}) {
  const label = unitLabel(unit);
  const look = unitLookOf(unit);
  const letter = Array.from(label)[0] ?? "?";
  return (
    <span
      className={large ? "roster-avatar roster-avatar-lg" : "roster-avatar"}
      data-type={unit.type}
      data-portrait={look ? "true" : undefined}
      aria-hidden="true"
    >
      {look ? (
        <CyborgPortrait
          look={look}
          framing="face"
          sizePx={large ? AVATAR_LG_PX : AVATAR_PX}
          className="roster-avatar-portrait"
          fallback={letter}
          persist={unit.self === true}
        />
      ) : (
        letter
      )}
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
  const self = unit.self === true;
  const previewOn = usePreviewOn();
  // 세계 유닛 번호("w42" → 42). 시안 유닛이면 null
  const worldUnit = !unit.preview && /^w\d+$/.test(unit.id) ? Number(unit.id.slice(1)) : null;

  // 연 유닛의 이름으로 초점을 옮긴다(좁은 폭에서 목록이 사라지므로). 다른 유닛을 열면 key가 바뀌어 다시 돈다
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  /** 상태·부상·AI 작전·용돈 칸(본체는 머리 판 아래, 다른 유닛은 사양 위) */
  const status = (
    <>
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
          {unit.condition && !self ? <ConditionFact condition={unit.condition} /> : null}
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
        {vitals && !self ? <VitalsMeters vitals={vitals} /> : null}
        {self ? null : unit.energy.kind === "battery" ? (
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
      {/* 생활 규칙(쉬러 가는 피로·다시 일하는 피로 — 사용자 결정 2026-11-26, 판단하는 띄운 2차맵 위 내 유닛만 칸이 온다) */}
      {worldUnit !== null && unit.life !== undefined ? (
        <LifeRulesPanel key={`life-${unit.id}`} id={`${id}-life`} unit={worldUnit} saved={unit.life} />
      ) : null}
      {/* 용돈 주기(유닛 사유재산 — D-555 1508, docs/adr/2026-11-15-business-ledger.md) */}
      {worldUnit !== null && !self ? <UnitGift key={`gift-${unit.id}`} unitId={worldUnit} /> : null}
    </>
  );

  return (
    <article className="units-detail" aria-labelledby={`${id}-name`}>
      <div className="panel units-detail-head">
        <button type="button" className="button-small units-detail-back" onClick={onClose}>
          {m.units_detail_back()}
        </button>
        <div className="units-detail-who">
          {/* 본체는 아래 본체 판에 큰 초상이 있다 */}
          {self ? null : <UnitAvatar unit={unit} large />}
          <div className="units-detail-names">
            <h2
              id={`${id}-name`}
              ref={titleRef}
              tabIndex={-1}
              className={self ? "units-detail-name cyborg-name" : "units-detail-name"}
            >
              <EntityRef kind="unit" role={detailUnitRole(unit)} name={unitLabel(unit)} mine={self} />
            </h2>
            <p className="roster-meta">
              {[
                typeLabel(unit.type),
                // 본체의 레벨·환생은 본체 판 머리가 보인다(최고 레벨과 함께)
                unit.level === null || self ? null : m.roster_level({ level: formatNumber(unit.level) }),
                // 유닛 성장(휴먼·사이보그 유닛): 이번 레벨 안 경험치 / 다음 레벨까지(만렙이면 구간 0 — 보이지 않는다)
                unit.exp && unit.exp.span > 0 && !self
                  ? m.roster_exp({ into: formatNumber(unit.exp.into), span: formatNumber(unit.exp.span) })
                  : null,
                unit.rebirths > 0 && !self ? m.roster_rebirths({ count: formatNumber(unit.rebirths) }) : null,
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
          {self ? <span className="roster-tag units-self-tag">{m.units_self_tag()}</span> : null}
          {unit.preview ? <PreviewTag /> : null}
        </div>
      </div>

      {self ? (
        // 본체 판(옛 사이보그 화면의 내용): 머리 판(초상·칸) → 상태·부상·AI 작전 → 사양. 시안 자료를 켜면 시안 본체(옛 화면과 같다)
        <CyborgSheet preview={previewOn} onChanged={onVitalsStale} between={status} />
      ) : (
        <>
          {status}
          <UnitSheetSections
            id={id}
            unit={unit}
            names={names}
            now={now}
            worldUnit={worldUnit}
            onVitalsStale={onVitalsStale}
          />
        </>
      )}

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

/** 본체가 아닌 유닛의 사양·장비·스킬·속성(사이보그 판과 같은 판 — 자료 units.sheet, 받는 동안·실패하면 목록 자료의 스탯 표) */
function UnitSheetSections({
  id,
  unit,
  names,
  now,
  worldUnit,
  onVitalsStale,
}: {
  id: string;
  unit: RosterUnit;
  names: RosterNames;
  /** 목록을 받은 시각 — 바뀌면(장착·해제·버프 뒤 목록이 다시 옴) 사양을 다시 받는다 */
  now: number;
  worldUnit: number | null;
  onVitalsStale: (() => void) | undefined;
}) {
  // 상세 사양(units.sheet): 유닛을 열 때 받고, 목록이 다시 오면(장착·해제·버프 뒤 generatedAt이 바뀐다) 다시 받는다. 다시 받는 동안 앞 자료를 그린다
  const preview = usePreviewOn();
  const unitId = unit.id;
  const loadSheet = useMemo(() => unitSheetLoader(unitId), [unitId]);
  const sheetQuery = useRosterQuery(loadSheet, preview);
  const reloadSheet = sheetQuery.reload;
  const listedAt = useRef(now);
  useEffect(() => {
    if (listedAt.current === now) return;
    listedAt.current = now;
    reloadSheet();
  }, [now, reloadSheet]);
  const sheetData =
    sheetQuery.state.status === "ready" && sheetQuery.state.data.unit === unitId
      ? sheetQuery.state.data
      : null;
  const sheet = sheetData?.sheet ?? null;
  // 이름 표: 사양이 쓰는 이름(2차 스탯·아이템·스킬)을 목록 이름 표에 더한다
  const sheetNames = useMemo(
    (): RosterNames =>
      sheetData
        ? {
            stats: { ...names.stats, ...sheetData.names.stats },
            items: { ...names.items, ...sheetData.names.items },
            skills: { ...names.skills, ...sheetData.names.skills },
            facilities: { ...names.facilities, ...sheetData.names.facilities },
            planets: { ...names.planets, ...sheetData.names.planets },
          }
        : names,
    [names, sheetData],
  );

  return (
    <>
      {sheet ? (
        <>
          <CoreStats body={sheet} names={sheetNames} />
          <Section id={`${id}-advice`} title={m.unit_advice_label()}>
            <UnitAdvice stats={guideStatsOf(sheet.stats.primaries)} />
          </Section>
          <CombatSpecs body={sheet} names={sheetNames} />
        </>
      ) : (
        <Section id={`${id}-stats`} title={m.roster_stats_title()}>
          <StatBlock stats={unit.stats} names={names} />
          <UnitAdvice stats={guideStatsOf(unit.stats.primaries)} />
          {sheetQuery.state.status === "error" ? (
            <p className="roster-note" role="status">
              {m.units_sheet_failed()}{" "}
              <button type="button" className="button-small" onClick={sheetQuery.reload}>
                {m.retry()}
              </button>
            </p>
          ) : null}
        </Section>
      )}

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
        {sheet ? (
          <SkillSlots body={sheet} names={sheetNames} />
        ) : (
          <SkillList skills={unit.skills} names={names} />
        )}
      </Section>
      {sheet ? (
        <Section id={`${id}-elements`} title={m.cyborg_elements_title()}>
          <Elements values={sheet.elements} />
        </Section>
      ) : null}
    </>
  );
}
