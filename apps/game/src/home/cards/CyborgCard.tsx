// 홈 [내 사이보그] 바이오-텔레메트리 도시에 카드 — 이름·상태 칩, 클릭형 경험치 진행 줄 + 상세 팝오버,
// 2열 전투 자원 포드(HP·MP), 1차 스탯 6종(STR 진홍·VIT 주황·INT 파랑·WIS 보라·DEX 순수 노랑·AGI 초록) 정밀 막대.
import type { CyborgBody, RosterNames } from "@terra/shared/roster";
import { PRIMARY_STATS } from "@terra/shared/roster";
import { useEffect, useId, useRef, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { localName } from "../../roster/rosterText.ts";
import { loadCyborg, useRosterQuery } from "../../roster/useRosterQuery.ts";
import type { CardBodyProps } from "../homeTypes.ts";
import { usePreviewOn } from "../inboxParts.ts";
import { formatCount } from "../numbers.ts";
import { ServerCardBody } from "./ServerCard.tsx";

/** 2차 스탯(hp·mp·stamina) 실제 판정 값 = 기본 + 버프 몫 */
function secondaryValue(body: CyborgBody, id: string): number | null {
  const row = body.stats.secondary.find((entry) => entry.id === id);
  if (row === undefined) return null;
  const buff = body.buffs?.rows[id] ?? 0;
  return Math.max(0, row.value + buff);
}

/** 0~100% 범위 백분율 */
function percentOf(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function CyborgTelemetry({ name, body, names }: { name: string; body: CyborgBody; names: RosterNames }) {
  const [expOpen, setExpOpen] = useState(false);
  const popoverId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expOpen) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setExpOpen(false);
    };
    const onDown = (event: PointerEvent): void => {
      if (
        wrapRef.current !== null &&
        event.target instanceof Node &&
        !wrapRef.current.contains(event.target)
      ) {
        setExpOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [expOpen]);

  const maxReached = body.level >= body.maxLevel;
  const expSpan = Math.max(1, body.exp.span);
  const expInto = Math.max(0, body.exp.into);
  const expLeft = maxReached ? 0 : Math.max(0, expSpan - expInto);
  const expPct = maxReached ? 100 : percentOf(expInto, expSpan);

  const hp = secondaryValue(body, "hp");
  const mp = secondaryValue(body, "mp") ?? secondaryValue(body, "stamina");
  const mpCode = secondaryValue(body, "mp") !== null ? "MP" : "STA";
  const vitalScale = Math.max(100, hp ?? 0, mp ?? 0);

  const statTotals = PRIMARY_STATS.map((stat) => {
    const pair = body.stats.primaries[stat];
    return pair.base + pair.bonus;
  });
  const statScale = Math.max(40, Math.ceil(Math.max(...statTotals, 1) * 1.18));

  const skills = body.skills.list.slice(0, 3);
  const organSlots = body.slots.filter((entry) => entry.slot === "organ");
  const gearSlots = body.slots.filter((entry) => entry.slot !== "organ");
  const equippedOrgans = organSlots.filter((entry) => entry.item !== null).length;
  const equippedGear = gearSlots.filter((entry) => entry.item !== null).length;

  return (
    <div className="dash-cyborg">
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
          <span className="dash-tag-chip" data-kind={body.living.unpaid ? "warn" : "ok"}>
            {body.living.unpaid ? m.home_cyborg_living_unpaid() : m.home_cyborg_living_ok()}
          </span>
          <span className="dash-tag-chip" data-kind="meta">
            {m.home_cyborg_fatigue({
              value: formatCount(body.fatigue.value),
              max: formatCount(body.fatigue.max),
            })}
          </span>
        </div>
      </div>

      {/* 2) 클릭형 레벨·경험치 진행 줄 + 상세 팝오버 */}
      <div className="dash-exp-wrap" ref={wrapRef}>
        <button
          type="button"
          className="dash-exp-trigger"
          aria-expanded={expOpen}
          aria-controls={popoverId}
          onClick={() => setExpOpen((open) => !open)}
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

      {/* 3) 2열 병렬 전투 자원 포드(HP · MP) */}
      {hp !== null || mp !== null ? (
        <div className="dash-vital-grid">
          {hp === null ? null : (
            <div className="dash-vital-pod" data-vital="hp">
              <div className="dash-vital-head">
                <span className="dash-vital-code" translate="no">
                  HP
                </span>
                <span className="dash-vital-num" translate="no">
                  {formatCount(hp)}
                </span>
              </div>
              <span className="dash-vital-track" aria-hidden="true">
                <span
                  className="dash-vital-fill"
                  style={{ width: `${percentOf(hp, vitalScale).toFixed(1)}%` }}
                />
              </span>
            </div>
          )}
          {mp === null ? null : (
            <div className="dash-vital-pod" data-vital="mp">
              <div className="dash-vital-head">
                <span className="dash-vital-code" translate="no">
                  {mpCode}
                </span>
                <span className="dash-vital-num" translate="no">
                  {formatCount(mp)}
                </span>
              </div>
              <span className="dash-vital-track" aria-hidden="true">
                <span
                  className="dash-vital-fill"
                  style={{ width: `${percentOf(mp, vitalScale).toFixed(1)}%` }}
                />
              </span>
            </div>
          )}
        </div>
      ) : null}

      {/* 4) 1차 스탯 6종 정밀 텔레메트리(VIT 주황 / DEX 순수 노랑 완전 분리) */}
      <div className="dash-stat-bars">
        {PRIMARY_STATS.map((stat) => {
          const pair = body.stats.primaries[stat];
          const total = pair.base + pair.bonus;
          const basePct = percentOf(pair.base, statScale);
          const bonusPct = percentOf(Math.max(0, pair.bonus), statScale);
          const code = stat.toUpperCase();
          return (
            <div
              key={stat}
              className="dash-bar-row"
              data-stat={stat}
              title={m.home_cyborg_stat_tooltip({
                stat: code,
                base: formatCount(pair.base),
                bonus: formatCount(pair.bonus),
              })}
            >
              <span className="dash-bar-label" translate="no">
                <span className="dash-stat-pip" aria-hidden="true" />
                <span className="dash-bar-code">{code}</span>
              </span>
              <span className="dash-bar-track" aria-hidden="true">
                <span className="dash-bar-seg dash-bar-base" style={{ width: `${basePct.toFixed(1)}%` }} />
                {pair.bonus > 0 ? (
                  <span
                    className="dash-bar-seg dash-bar-bonus"
                    style={{ width: `${Math.min(100 - basePct, bonusPct).toFixed(1)}%` }}
                  />
                ) : null}
              </span>
              <span className="dash-bar-val" translate="no">
                {formatCount(total)}
              </span>
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
  if (query.state.status === "ready" && query.state.data.body !== null) {
    return (
      <CyborgTelemetry
        name={query.state.data.name}
        body={query.state.data.body}
        names={query.state.data.names}
      />
    );
  }
  return <ServerCardBody id="cyborg" data={data} />;
}
