// 유닛·사이보그 화면이 같이 쓰는 부품 — 시험 자료 표, 곧 열림 버튼, 막대(피로·배터리·경험치), 스탯·장비 칸·스킬 묶음, 받는 중·실패.
// 두 화면 조각이 같이 가져온다(Vite가 공용 조각으로 나눈다). 스타일은 roster.css(토큰만).
import {
  PRIMARY_STATS,
  type PrimaryStat,
  type RosterNames,
  type RosterSkills,
  type RosterSlot,
  type RosterStats,
  sortSlotsForDisplay,
} from "@terra/shared/roster";
import type { ReactNode } from "react";
import { m } from "../paraglide/messages.js";
import { LiveMessage } from "../ui/LiveMessage.tsx";
import type { PlainMessageKey } from "../ui/messageRef.ts";
import { text } from "../ui/text.ts";
import { StatPairs, pairValuesOf, statScale } from "./StatPairs.tsx";
import { formatNumber, formatStat, localName, primaryLabel, slotCellLabel } from "./rosterText.ts";
import { groupStats, statGroupLabel } from "./statGroups.ts";
import "./roster.css";

/** "시험 자료" 표 — 시안 자료 항목마다 붙인다(ADR 37 6절) */
export function PreviewTag() {
  return <span className="roster-tag roster-tag-preview">{m.inbox_preview_tag()}</span>;
}

/** 명령이 아직 없는 동작. 누를 수 없고 "곧 열림"을 함께 보인다(바꾸는 명령은 WebSocket으로 만들 때 켠다) */
export function SoonButton({ label, small = true }: { label: string; small?: boolean }) {
  return (
    <button type="button" className={small ? "button-small roster-soon" : "roster-soon"} aria-disabled="true">
      <span>{label}</span>
      <span className="roster-soon-note">{m.roster_soon_open()}</span>
    </button>
  );
}

/** 막대(값/최대). tone: 높을수록 나쁜 값(피로)이면 warn 문턱을 넘을 때 경고색 */
export function Meter({
  label,
  value,
  max,
  valueText,
  warnAt,
  lowIsBad = false,
  kind,
}: {
  label: string;
  value: number;
  max: number;
  valueText: string;
  /** 경고로 칠하는 몫(0~1). 없으면 칠하지 않는다 */
  warnAt?: number;
  /** 낮을수록 나쁜 값(배터리) */
  lowIsBad?: boolean;
  /** 막대 색 종류(생명 수치 hp·armor·shield = 그 2차 스탯 색, 없으면 기본 색) */
  kind?: "hp" | "armor" | "shield" | undefined;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const warn = warnAt !== undefined && (lowIsBad ? ratio <= warnAt : ratio >= warnAt);
  return (
    <div className="roster-meter" data-kind={kind}>
      <div className="roster-meter-head">
        <span>{label}</span>
        <span className="roster-meter-value">{valueText}</span>
      </div>
      <div
        className="roster-meter-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        data-warn={warn ? "true" : undefined}
      >
        <span className="roster-meter-fill" style={{ inlineSize: `${Math.round(ratio * 100)}%` }} />
      </div>
    </div>
  );
}

/** 판 하나(제목 + 내용). 제목 옆 끝에 덧붙일 것(시험 자료 표 등) */
export function Section({
  id,
  title,
  end,
  children,
}: {
  id: string;
  title: string;
  end?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel roster-section" aria-labelledby={id}>
      <div className="roster-section-head">
        <h2 id={id} className="roster-section-title">
          {title}
        </h2>
        {end}
      </div>
      {children}
    </section>
  );
}

/** 1차 스탯(두 칸씩 묶음, 스탯 색) + 2차 스탯(48 §3.2 묶음별 목록). 값은 서버 계산 값 */
export function StatBlock({ stats, names }: { stats: RosterStats; names: RosterNames }) {
  const values = pairValuesOf(stats.primaries);
  return (
    <div className="roster-stats">
      {stats.source === "baseline" ? <p className="roster-note">{m.roster_stats_baseline()}</p> : null}
      <StatPairs values={values} max={statScale(values, 20)} label={m.roster_primary_title()} />
      <div className="roster-secondary-groups" role="group" aria-label={m.roster_secondary_title()}>
        {groupStats(stats.secondary).map(({ group, rows }) => (
          <section key={group} className="roster-secondary-group" aria-label={statGroupLabel(group)}>
            <h3 className="roster-secondary-group-title">{statGroupLabel(group)}</h3>
            <dl className="roster-secondary">
              {rows.map((stat) => (
                <div key={stat.id} className="roster-secondary-row" data-stat={stat.id}>
                  <dt>{localName(names.stats[stat.id], stat.id)}</dt>
                  <dd>{formatStat(stat)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}

const isPrimaryStat = (stat: string): stat is PrimaryStat =>
  (PRIMARY_STATS as readonly string[]).includes(stat);

/** 칸 값 글("치명타 확률 +14") — 1차 스탯이면 스탯 이름, 아니면 팩 이름 */
export function slotValueText(stat: string, value: number, names: RosterNames): string {
  const label = isPrimaryStat(stat) ? primaryLabel(stat) : localName(names.stats[stat], stat);
  return `${label} ${value >= 0 ? "+" : ""}${formatNumber(value)}`;
}

/** 장비 칸 목록(시안 유닛) — 화면 차례(@terra/shared/roster sortSlotsForDisplay), 같은 종류는 번호를 붙인다 */
export function SlotList({ slots, names }: { slots: readonly RosterSlot[]; names: RosterNames }) {
  const shown = sortSlotsForDisplay(slots.map((slot) => slot.slot)).flatMap((cell) => {
    const slot = slots[cell.index];
    return slot ? [{ ...slot, ordinal: cell.ordinal }] : [];
  });
  if (shown.length === 0) return <p className="roster-empty">{m.roster_slots_none()}</p>;
  return (
    <ul className="roster-slots">
      {shown.map((slot, index) => (
        // 같은 종류 칸이 여럿이다(반지 2·임플란트 5): 차례로 열쇠를 만든다
        <li
          key={`${slot.slot}-${String(index)}`}
          className="roster-slot"
          data-empty={slot.item ? undefined : "true"}
        >
          <span className="roster-slot-kind">{slotCellLabel(slot.slot, slot.ordinal)}</span>
          {slot.item ? (
            <span className="roster-slot-item">
              <span className="roster-slot-name">{localName(names.items[slot.item.id], slot.item.id)}</span>
              {slot.item.values.length > 0 ? (
                <span className="roster-slot-values">
                  {slot.item.values.map((value) => slotValueText(value.stat, value.value, names)).join(" · ")}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="roster-slot-item roster-muted">{m.roster_slot_empty()}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** 스킬 칸(D-427)과 쓰는 스킬(고유·장비) */
export function SkillList({ skills, names }: { skills: RosterSkills; names: RosterNames }) {
  const empty = Math.max(0, skills.slots - skills.list.length);
  return (
    <div className="roster-skills">
      <p className="roster-meta">
        {m.roster_skill_slots({ used: formatNumber(skills.list.length), slots: formatNumber(skills.slots) })}
      </p>
      <ul className="roster-chips">
        {skills.list.map((skill) => (
          <li key={skill.id} className="roster-chip">
            <span>{localName(names.skills[skill.id], skill.id)}</span>
            <span className="roster-chip-note">
              {skill.source === "innate" ? m.roster_skill_innate() : m.roster_skill_equipment()}
            </span>
          </li>
        ))}
        {Array.from({ length: empty }, (_, index) => (
          <li key={`empty-${String(index)}`} className="roster-chip roster-chip-empty">
            {m.roster_skill_empty()}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 받는 중·실패 줄. 실패면 [다시 시도] */
export function LoadState({
  state,
  onRetry,
}: {
  state: { status: "loading" } | { status: "error"; error: PlainMessageKey };
  onRetry: () => void;
}) {
  if (state.status === "loading")
    return (
      <p className="status" role="status">
        {m.shell_loading()}
      </p>
    );
  return (
    <div className="roster-failed">
      <LiveMessage tone="error" lines={[text({ key: state.error })]} />
      <button type="button" className="button-small" onClick={onRetry}>
        {m.retry()}
      </button>
    </div>
  );
}
