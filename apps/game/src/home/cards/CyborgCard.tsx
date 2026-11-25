// 홈 [내 사이보그] 바이오-텔레메트리 도시에 카드 — 이름·상태 칩, 클릭형 경험치 진행 줄 + 상세 팝오버,
// 2열 전투 자원 포드(왼: HP·아머·쉴드 / 오른: MP·스태미나, 클릭·호버 시 회복량 상세),
// 1차 스탯 6종(STR·VIT·INT·WIS·DEX·AGI, 클릭·호버 시 기본·장비·인공장기·버프 추가치 구분 표시).
import type { CyborgBody, PrimaryStat, RosterNames, RosterPrimarySource } from "@terra/shared/roster";
import { PRIMARY_STATS, isOrganSlot } from "@terra/shared/roster";
import { vitalsRegenNow } from "@terra/shared/vitals";
import { useEffect, useId, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { isBroken } from "../../holdings/holdingsModel.ts";
import { useHoldings } from "../../holdings/useHoldings.ts";
import { formatSigned, localName, primaryLabel, slotLabel } from "../../roster/rosterText.ts";
import { loadCyborg, useRosterQuery } from "../../roster/useRosterQuery.ts";
import { type VitalsShown, useVitals } from "../../roster/useVitals.ts";
import { VitalTicks } from "../../ui/VitalTicks.tsx";
import type { CardBodyProps } from "../homeTypes.ts";
import { usePreviewOn } from "../inboxParts.ts";
import { formatCount } from "../numbers.ts";
import { ServerCardBody } from "./ServerCard.tsx";

type VitalKey = "hp" | "armor" | "shield" | "mp" | "stamina" | "fatigue";

interface VitalEntry {
  readonly key: VitalKey;
  readonly label: string;
  readonly current: number;
  readonly max: number;
  readonly buff: number;
  readonly regen: number | null;
  readonly regenBuff: number;
  readonly showFraction?: boolean | undefined;
  readonly note?: string | undefined;
}

interface PrimaryBreakdown {
  readonly base: number;
  readonly gear: number;
  readonly organ: number;
  readonly buff: number;
  readonly total: number;
  readonly gearItems: readonly { readonly name: string; readonly value: number }[];
  readonly organItems: readonly { readonly name: string; readonly value: number }[];
}

/** 2차 스탯 실제 판정 값 = 기본 + 버프 몫 */
function secondaryStat(
  body: CyborgBody,
  id: string,
): { readonly value: number; readonly buff: number } | null {
  const row = body.stats.secondary.find((entry) => entry.id === id);
  if (row === undefined) return null;
  const buff = body.buffs?.rows[id] ?? 0;
  return { value: Math.max(0, row.value + buff), buff };
}

/** 0~100% 범위 백분율 */
function percentOf(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

/** 1차 스탯 출처(body.primarySources)를 기본·장비·인공장기·버프로 분해한다 */
function primaryBreakdown(body: CyborgBody, stat: PrimaryStat, names: RosterNames): PrimaryBreakdown {
  const sources: readonly RosterPrimarySource[] = body.primarySources[stat] ?? [];
  if (sources.length === 0) {
    const pair = body.stats.primaries[stat];
    return {
      base: pair.base,
      gear: pair.bonus,
      organ: 0,
      buff: 0,
      total: pair.base + pair.bonus,
      gearItems: [],
      organItems: [],
    };
  }
  let base = 0;
  let gear = 0;
  let organ = 0;
  let buff = 0;
  const gearItems: { name: string; value: number }[] = [];
  const organItems: { name: string; value: number }[] = [];
  for (const source of sources) {
    if (source.kind === "body" || source.kind === "initial" || source.kind === "growth") {
      base += source.value;
    } else if (source.kind === "item") {
      const label = m.cyborg_source_item({
        item: localName(names.items[source.item], source.item),
        slot: slotLabel(source.slot),
      });
      if (isOrganSlot(source.slot)) {
        organ += source.value;
        organItems.push({ name: label, value: source.value });
      } else {
        gear += source.value;
        gearItems.push({ name: label, value: source.value });
      }
    } else if (source.kind === "effect") {
      buff += source.value;
    }
  }
  return {
    base,
    gear,
    organ,
    buff,
    total: base + gear + organ + buff,
    gearItems,
    organItems,
  };
}

function VitalPod({
  entry,
  open,
  onToggle,
}: {
  readonly entry: VitalEntry;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const popId = useId();
  const hasCurrentDiff = entry.max > 0 && entry.current < entry.max;
  const fillPct = entry.max > 0 ? percentOf(entry.current, entry.max) : 0;
  const highFatigue = entry.key === "fatigue" && entry.max > 0 && entry.current * 5 >= entry.max * 4;
  return (
    <div
      className="dash-vital-wrap"
      data-vital={entry.key}
      data-open={open ? "true" : undefined}
      data-empty={entry.max <= 0 ? "true" : undefined}
    >
      <button
        type="button"
        className="dash-vital-pod"
        data-vital={entry.key}
        data-warn={highFatigue ? "true" : undefined}
        aria-expanded={open}
        aria-controls={popId}
        onClick={onToggle}
      >
        <span className="dash-vital-head">
          <span className="dash-vital-code">{entry.label}</span>
          <span className="dash-vital-num" translate="no">
            {entry.showFraction || hasCurrentDiff
              ? `${formatCount(entry.current)}/${formatCount(entry.max)}`
              : formatCount(entry.max)}
          </span>
        </span>
        <span className="dash-vital-track" aria-hidden="true">
          <span className="dash-vital-fill" style={{ width: `${fillPct.toFixed(1)}%` }} />
          <VitalTicks max={entry.max} />
        </span>
      </button>

      <div id={popId} className="dash-detail-pop" role="region" aria-label={entry.label} hidden={!open}>
        <div className="dash-detail-pop-head">
          <span>{entry.label}</span>
          <strong className="dash-detail-pop-val" translate="no">
            {formatCount(entry.current)} / {formatCount(entry.max)}
          </strong>
        </div>
        <dl className="dash-detail-pop-list">
          {entry.key === "fatigue" ? (
            <div className="dash-detail-pop-row">
              <dt>
                <span
                  className="dash-pop-sq"
                  data-tone={highFatigue ? "danger" : "amber"}
                  aria-hidden="true"
                />
                {m.home_cyborg_fatigue_ratio()}
              </dt>
              <dd data-tone={highFatigue ? "debuff" : undefined}>{fillPct.toFixed(1)}%</dd>
            </div>
          ) : (
            <div className="dash-detail-pop-row">
              <dt>
                <span className="dash-pop-sq" data-tone="emerald" aria-hidden="true" />
                {m.home_cyborg_regen_label()}
              </dt>
              <dd data-tone={entry.regen !== null && entry.regen > 0 ? "buff" : undefined}>
                {entry.regen !== null && entry.regen > 0
                  ? `+${m.roster_per_minute({ value: formatCount(entry.regen) })}`
                  : m.home_cyborg_regen_none()}
              </dd>
            </div>
          )}
          {entry.regenBuff !== 0 ? (
            <div className="dash-detail-pop-row">
              <dt>
                <span
                  className="dash-pop-sq"
                  data-tone={entry.regenBuff > 0 ? "cyan" : "danger"}
                  aria-hidden="true"
                />
                {m.home_cyborg_vital_buff()} ({m.home_cyborg_regen_label()})
              </dt>
              <dd data-tone={entry.regenBuff > 0 ? "buff" : "debuff"}>{formatSigned(entry.regenBuff)}</dd>
            </div>
          ) : null}
          {entry.buff !== 0 ? (
            <div className="dash-detail-pop-row">
              <dt>
                <span
                  className="dash-pop-sq"
                  data-tone={entry.buff > 0 ? "cyan" : "danger"}
                  aria-hidden="true"
                />
                {m.home_cyborg_vital_buff()}
              </dt>
              <dd data-tone={entry.buff > 0 ? "buff" : "debuff"}>{formatSigned(entry.buff)}</dd>
            </div>
          ) : null}
        </dl>
        {entry.note ? <p className="dash-detail-pop-note">{entry.note}</p> : null}
      </div>
    </div>
  );
}

function CyborgTelemetry({
  name,
  body,
  names,
  vitals,
  brokenEquipped,
}: {
  name: string;
  body: CyborgBody;
  names: RosterNames;
  vitals: VitalsShown | undefined;
  brokenEquipped: number;
}) {
  const [expOpen, setExpOpen] = useState(false);
  const [openVital, setOpenVital] = useState<VitalKey | null>(null);
  const [openStat, setOpenStat] = useState<PrimaryStat | null>(null);
  const popoverId = useId();
  const cardRef = useRef<HTMLDivElement>(null);

  const anyOpen = expOpen || openVital !== null || openStat !== null;
  useEffect(() => {
    if (!anyOpen) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setExpOpen(false);
        setOpenVital(null);
        setOpenStat(null);
      }
    };
    const onDown = (event: PointerEvent): void => {
      if (
        cardRef.current !== null &&
        event.target instanceof Node &&
        !cardRef.current.contains(event.target)
      ) {
        setExpOpen(false);
        setOpenVital(null);
        setOpenStat(null);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [anyOpen]);

  const maxReached = body.level >= body.maxLevel;
  const expSpan = Math.max(1, body.exp.span);
  const expInto = Math.max(0, body.exp.into);
  const expLeft = maxReached ? 0 : Math.max(0, expSpan - expInto);
  const expPct = maxReached ? 100 : percentOf(expInto, expSpan);

  // 생명 수치·전투 자원 5종(왼: HP·아머·쉴드 / 오른: MP·스태미나) + 분당 회복량
  const liveRegen = vitals ? vitalsRegenNow(vitals) : null;
  const hpStat = secondaryStat(body, "hp");
  const hpRegenStat = secondaryStat(body, "hp_regen");
  const armorStat = secondaryStat(body, "armor_hp");
  const shieldStat = secondaryStat(body, "shield_hp");
  const shieldRegenStat = secondaryStat(body, "shield_regen");
  const mpStat = secondaryStat(body, "mp");
  const mpRegenStat = secondaryStat(body, "mp_regen");
  const staminaStat = secondaryStat(body, "stamina");
  const staminaRegenStat = secondaryStat(body, "stamina_regen");

  const hpMax = vitals ? vitals.max.hp : (hpStat?.value ?? 0);
  const armorMax = vitals ? vitals.max.armor : (armorStat?.value ?? 0);
  const shieldMax = vitals ? vitals.max.shield : (shieldStat?.value ?? 0);
  const mpMax = mpStat?.value ?? 0;
  const staminaMax = staminaStat?.value ?? 0;

  const staminaRegenReal = body.combat
    ? Math.max(0, body.combat.staminaRegen.real + (body.buffs?.staminaRegen ?? 0))
    : (staminaRegenStat?.value ?? null);

  const defenseVitals: readonly VitalEntry[] = [
    {
      key: "hp",
      label: m.vitals_hp(),
      current: vitals ? vitals.values.hp : hpMax,
      max: hpMax,
      buff: hpStat?.buff ?? 0,
      regen: liveRegen ? liveRegen.hp : (hpRegenStat?.value ?? null),
      regenBuff: hpRegenStat?.buff ?? 0,
    },
    {
      key: "armor",
      label: m.vitals_armor(),
      current: vitals ? vitals.values.armor : armorMax,
      max: armorMax,
      buff: armorStat?.buff ?? 0,
      regen: liveRegen ? liveRegen.armor : 0,
      regenBuff: 0,
    },
    {
      key: "shield",
      label: m.vitals_shield(),
      current: vitals ? vitals.values.shield : shieldMax,
      max: shieldMax,
      buff: shieldStat?.buff ?? 0,
      regen: liveRegen ? liveRegen.shield : (shieldRegenStat?.value ?? null),
      regenBuff: shieldRegenStat?.buff ?? 0,
    },
  ];

  const resourceVitals: readonly VitalEntry[] = [
    {
      key: "mp",
      label: m.home_cyborg_vital_mp(),
      current: mpMax,
      max: mpMax,
      buff: mpStat?.buff ?? 0,
      regen: mpRegenStat?.value ?? null,
      regenBuff: mpRegenStat?.buff ?? 0,
    },
    {
      key: "stamina",
      label: m.home_cyborg_vital_stamina(),
      current: staminaMax,
      max: staminaMax,
      buff: staminaStat?.buff ?? 0,
      regen: staminaRegenReal,
      regenBuff: body.buffs?.staminaRegen ?? staminaRegenStat?.buff ?? 0,
    },
    {
      key: "fatigue",
      label: m.home_cyborg_vital_fatigue(),
      current: body.fatigue.value,
      max: body.fatigue.max,
      buff: 0,
      regen: null,
      regenBuff: 0,
      showFraction: true,
      note: m.home_cyborg_fatigue_hint(),
    },
  ];

  const breakdowns = PRIMARY_STATS.map((stat) => ({
    stat,
    info: primaryBreakdown(body, stat, names),
  }));
  const statScale = Math.max(
    40,
    Math.ceil(Math.max(...breakdowns.map((row) => Math.max(row.info.total, row.info.base)), 1) * 1.18),
  );

  const skills = body.skills.list.slice(0, 3);
  const organSlots = body.slots.filter((entry) => isOrganSlot(entry.slot));
  const gearSlots = body.slots.filter((entry) => !isOrganSlot(entry.slot));
  const equippedOrgans = organSlots.filter((entry) => entry.item !== null).length;
  const equippedGear = gearSlots.filter((entry) => entry.item !== null).length;

  return (
    <div className="dash-cyborg" ref={cardRef}>
      {/* 1) 식별 헤더: 이름 · 상태 뱃지 */}
      <div className="dash-cyborg-id">
        <div className="dash-cyborg-name-group">
          <span className="dash-cyborg-name" translate="no">
            {name}
          </span>
          {body.rebirths > 0 ? (
            <span className="dash-rebirth-chip">
              {m.home_cyborg_exp_rebirths()} {formatCount(body.rebirths)}
            </span>
          ) : null}
        </div>
        <div className="dash-cyborg-status-pills">
          {brokenEquipped > 0 ? (
            <span className="dash-tag-chip" data-kind="warn">
              {m.home_cyborg_broken_gear({ count: formatCount(brokenEquipped) })}
            </span>
          ) : null}
          <span className="dash-tag-chip" data-kind={body.living.unpaid ? "warn" : "ok"}>
            {body.living.unpaid ? m.home_cyborg_living_unpaid() : m.home_cyborg_living_ok()}
          </span>
        </div>
      </div>

      {/* 2) 클릭형 레벨·경험치 진행 줄 + 상세 팝오버 */}
      <div className="dash-exp-wrap">
        <button
          type="button"
          className="dash-exp-trigger"
          aria-expanded={expOpen}
          aria-controls={popoverId}
          onClick={() => {
            setExpOpen((open) => !open);
            setOpenVital(null);
            setOpenStat(null);
          }}
        >
          <span className="dash-lv-pill" translate="no">
            Lv.{formatCount(body.level)}
          </span>
          <span className="dash-exp-col">
            <span className="dash-exp-meta">
              <span className="dash-exp-nums" translate="no">
                {maxReached
                  ? m.home_cyborg_exp_max()
                  : `${formatCount(expInto)} / ${formatCount(expSpan)} EXP`}
              </span>
              <span className="dash-exp-pct" translate="no">
                {expPct.toFixed(1)}%
              </span>
            </span>
            <span className="dash-exp-track" aria-hidden="true">
              <span className="dash-exp-fill" style={{ width: `${expPct.toFixed(1)}%` }} />
            </span>
          </span>
        </button>

        {expOpen ? (
          <div
            id={popoverId}
            className="dash-exp-popover"
            role="region"
            aria-label={m.home_cyborg_exp_detail()}
          >
            <div className="dash-exp-pop-head">
              <span>{m.home_cyborg_exp_detail()}</span>
              <span className="dash-exp-pop-lv" translate="no">
                LV.{formatCount(body.level)} / {formatCount(body.maxLevel)}
              </span>
            </div>
            <dl className="dash-exp-pop-list">
              <div className="dash-exp-pop-row">
                <dt>
                  <span className="dash-pop-sq" data-tone="cyan" aria-hidden="true" />
                  {m.home_cyborg_exp_into()}
                </dt>
                <dd>{formatCount(expInto)}</dd>
              </div>
              <div className="dash-exp-pop-row">
                <dt>
                  <span className="dash-pop-sq" data-tone="cobalt" aria-hidden="true" />
                  {m.home_cyborg_exp_span()}
                </dt>
                <dd>{formatCount(expSpan)}</dd>
              </div>
              <div className="dash-exp-pop-row">
                <dt>
                  <span className="dash-pop-sq" data-tone="violet" aria-hidden="true" />
                  {m.home_cyborg_exp_rebirths()}
                </dt>
                <dd>{formatCount(body.rebirths)}</dd>
              </div>
            </dl>
            <div className="dash-exp-pop-foot">
              <span>{m.home_cyborg_exp_left()}</span>
              <strong className="dash-exp-pop-left">
                {maxReached ? m.home_cyborg_exp_max() : formatCount(expLeft)}
              </strong>
            </div>
          </div>
        ) : null}
      </div>

      {/* 3) 2열 전투 자원 포드: 왼쪽(HP·아머·쉴드) / 오른쪽(MP·스태미나) — 클릭·마우스오버 시 회복량 표시 */}
      <div className="dash-vital-grid">
        <div className="dash-vital-col">
          {defenseVitals.map((entry) => (
            <VitalPod
              key={entry.key}
              entry={entry}
              open={openVital === entry.key}
              onToggle={() => {
                setOpenVital((current) => (current === entry.key ? null : entry.key));
                setExpOpen(false);
                setOpenStat(null);
              }}
            />
          ))}
        </div>
        <div className="dash-vital-col">
          {resourceVitals.map((entry) => (
            <VitalPod
              key={entry.key}
              entry={entry}
              open={openVital === entry.key}
              onToggle={() => {
                setOpenVital((current) => (current === entry.key ? null : entry.key));
                setExpOpen(false);
                setOpenStat(null);
              }}
            />
          ))}
        </div>
      </div>

      {/* 4) 1차 스탯 6종 정밀 텔레메트리 — 클릭·마우스오버 시 기본·장비·인공장기·버프 구분 표시 */}
      <div className="dash-stat-bars">
        {breakdowns.map(({ stat, info }) => {
          const code = stat.toUpperCase();
          const isOpen = openStat === stat;
          const equipTotal = Math.max(0, info.gear + info.organ);
          const buffPos = Math.max(0, info.buff);
          const basePct = percentOf(info.base, statScale);
          const equipPct = Math.min(100 - basePct, percentOf(equipTotal, statScale));
          const buffPct = Math.min(100 - basePct - equipPct, percentOf(buffPos, statScale));
          const rowPopId = `${popoverId}-${stat}`;
          return (
            <div
              key={stat}
              className="dash-stat-wrap"
              data-stat={stat}
              data-open={isOpen ? "true" : undefined}
            >
              <button
                type="button"
                className="dash-bar-row"
                data-stat={stat}
                aria-expanded={isOpen}
                aria-controls={rowPopId}
                onClick={() => {
                  setOpenStat((current) => (current === stat ? null : stat));
                  setExpOpen(false);
                  setOpenVital(null);
                }}
              >
                <span className="dash-bar-label" translate="no">
                  <span className="dash-stat-pip" aria-hidden="true" />
                  <span className="dash-bar-code">{code}</span>
                </span>
                <span className="dash-bar-track" aria-hidden="true">
                  <span className="dash-bar-seg dash-bar-base" style={{ width: `${basePct.toFixed(1)}%` }} />
                  {equipTotal > 0 ? (
                    <span
                      className="dash-bar-seg dash-bar-gear"
                      style={{ width: `${equipPct.toFixed(1)}%` }}
                    />
                  ) : null}
                  {buffPos > 0 ? (
                    <span
                      className="dash-bar-seg dash-bar-buff"
                      style={{ width: `${buffPct.toFixed(1)}%` }}
                    />
                  ) : null}
                </span>
                <span className="dash-bar-val" translate="no">
                  {formatCount(info.total)}
                  {info.buff !== 0 ? (
                    <span className="dash-bar-buff-tag" data-tone={info.buff > 0 ? "buff" : "debuff"}>
                      {formatSigned(info.buff)}
                    </span>
                  ) : null}
                </span>
              </button>

              <div
                id={rowPopId}
                className="dash-detail-pop dash-stat-pop"
                role="region"
                aria-label={`${code} ${primaryLabel(stat)}`}
                hidden={!isOpen}
              >
                <div className="dash-detail-pop-head">
                  <span>
                    {code} · {primaryLabel(stat)}
                  </span>
                  <strong className="dash-detail-pop-val" translate="no">
                    {formatCount(info.total)}
                  </strong>
                </div>
                <dl className="dash-detail-pop-list">
                  <div className="dash-detail-pop-row">
                    <dt>
                      <span className="dash-pop-sq" data-tone="base" aria-hidden="true" />
                      {m.home_cyborg_stat_base()}
                    </dt>
                    <dd>{formatCount(info.base)}</dd>
                  </div>
                  <div className="dash-detail-pop-row">
                    <dt>
                      <span className="dash-pop-sq" data-tone="cobalt" aria-hidden="true" />
                      {m.home_cyborg_stat_gear()}
                    </dt>
                    <dd data-tone={info.gear > 0 ? "gear" : undefined}>
                      {info.gear === 0 ? "0" : formatSigned(info.gear)}
                    </dd>
                  </div>
                  {info.gearItems.map((item, idx) => (
                    <div key={`g-${String(idx)}`} className="dash-detail-pop-row dash-detail-pop-sub">
                      <dt>{item.name}</dt>
                      <dd>{formatSigned(item.value)}</dd>
                    </div>
                  ))}
                  {info.organ !== 0 || info.organItems.length > 0 ? (
                    <>
                      <div className="dash-detail-pop-row">
                        <dt>
                          <span className="dash-pop-sq" data-tone="violet" aria-hidden="true" />
                          {m.home_cyborg_stat_organ()}
                        </dt>
                        <dd data-tone={info.organ > 0 ? "organ" : undefined}>
                          {info.organ === 0 ? "0" : formatSigned(info.organ)}
                        </dd>
                      </div>
                      {info.organItems.map((item, idx) => (
                        <div key={`o-${String(idx)}`} className="dash-detail-pop-row dash-detail-pop-sub">
                          <dt>{item.name}</dt>
                          <dd>{formatSigned(item.value)}</dd>
                        </div>
                      ))}
                    </>
                  ) : null}
                  <div className="dash-detail-pop-row">
                    <dt>
                      <span
                        className="dash-pop-sq"
                        data-tone={info.buff < 0 ? "danger" : "emerald"}
                        aria-hidden="true"
                      />
                      {m.home_cyborg_stat_buff()}
                    </dt>
                    <dd data-tone={info.buff > 0 ? "buff" : info.buff < 0 ? "debuff" : undefined}>
                      {info.buff === 0 ? "0" : formatSigned(info.buff)}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          );
        })}
      </div>

      {/* 5) 장착 현황 요약(장비 · 인공장기 · 스킬) + 장착 스킬 칩 */}
      <div className="dash-loadout-foot">
        <div className="dash-loadout-grid">
          <div className="dash-loadout-cell">
            <span className="dash-loadout-label">{m.roster_gear_title()}</span>
            <span className="dash-loadout-val" translate="no">
              {formatCount(equippedGear)}/{formatCount(gearSlots.length)}
            </span>
          </div>
          <div className="dash-loadout-cell">
            <span className="dash-loadout-label">{m.cyborg_organs_title()}</span>
            <span className="dash-loadout-val" translate="no">
              {formatCount(equippedOrgans)}/{formatCount(organSlots.length)}
            </span>
          </div>
          <div className="dash-loadout-cell">
            <span className="dash-loadout-label">{m.roster_skills_title()}</span>
            <span className="dash-loadout-val" translate="no">
              {formatCount(body.skills.list.length)}/{formatCount(body.skills.slots)}
            </span>
          </div>
        </div>
        {skills.length > 0 ? (
          <div className="dash-chip-row">
            {skills.map((skill) => (
              <span key={`${skill.source}:${skill.id}`} className="dash-tag-chip" data-kind={skill.source}>
                {localName(names.skills[skill.id], skill.id)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CyborgCardBody({ data }: CardBodyProps) {
  const preview = usePreviewOn();
  const query = useRosterQuery(loadCyborg, preview);
  const vitals = useVitals();
  const holdings = useHoldings();
  const brokenEquipped =
    holdings.state.status === "ready" && holdings.state.data.cyborgUnit !== null
      ? holdings.state.data.holdings.filter(
          (item) => item.unit === holdings.state.data.cyborgUnit && item.slot !== null && isBroken(item),
        ).length
      : 0;
  if (query.state.status === "ready" && query.state.data.body !== null) {
    return (
      <CyborgTelemetry
        name={query.state.data.name}
        body={query.state.data.body}
        names={query.state.data.names}
        vitals={query.state.data.preview ? undefined : vitals.cyborg}
        brokenEquipped={query.state.data.preview ? 0 : brokenEquipped}
      />
    );
  }
  return <ServerCardBody id="cyborg" data={data} />;
}
