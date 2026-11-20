// 홈 [내 사이보그] 프로 텔레메트리 카드 — 레벨·경험치 진행 바 + 클릭/호버 경험치 상세 팝오버,
// 장착 스킬·상태 칩, HP·MP 풀폭 게이지, 1차 스탯 6종(STR·VIT·INT·WIS·DEX·AGI) 기본+보너스 2단 수평 막대.
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

/** 0~100% 범위 백분율(정수 한 자리 소수) */
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

  return (
    <div className="dash-cyborg">
      {/* 이름 + 레벨 + 경험치 진행 바(눌러서 상세 팝오버 열기) */}
      <div className="dash-cyborg-id">
        <span className="dash-cyborg-name" translate="no">
          {name}
        </span>
        {body.rebirths > 0 ? (
          <span className="dash-rebirth-chip">
            {m.home_cyborg_exp_rebirths()} {formatCount(body.rebirths)}
          </span>
        ) : null}
      </div>

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
          <span className="dash-exp-nums" translate="no">
            {maxReached ? m.home_cyborg_exp_max() : `${formatCount(expInto)} / ${formatCount(expSpan)} EXP`}
          </span>
          <span className="dash-exp-track" aria-hidden="true">
            <span className="dash-exp-fill" style={{ width: `${expPct.toFixed(1)}%` }} />
          </span>
          <span className="dash-exp-pct" translate="no">
            {expPct.toFixed(1)}%
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

      {/* 장착 스킬 · 생활/피로 상태 태그 */}
      <div className="dash-chip-row">
        {skills.map((skill) => (
          <span key={`${skill.source}:${skill.id}`} className="dash-tag-chip" data-kind={skill.source}>
            {localName(names.skills[skill.id], skill.id)}
          </span>
        ))}
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

      {/* HP · MP 전투 자원 게이지 */}
      {hp !== null || mp !== null ? (
        <div className="dash-vitals">
          {hp === null ? null : (
            <div className="dash-bar-row" data-vital="hp">
              <span className="dash-bar-code" translate="no">
                HP
              </span>
              <span className="dash-bar-track" aria-hidden="true">
                <span
                  className="dash-bar-fill"
                  style={{ width: `${percentOf(hp, vitalScale).toFixed(1)}%` }}
                />
              </span>
              <span className="dash-bar-val">{formatCount(hp)}</span>
            </div>
          )}
          {mp === null ? null : (
            <div className="dash-bar-row" data-vital="mp">
              <span className="dash-bar-code" translate="no">
                {mpCode}
              </span>
              <span className="dash-bar-track" aria-hidden="true">
                <span
                  className="dash-bar-fill"
                  style={{ width: `${percentOf(mp, vitalScale).toFixed(1)}%` }}
                />
              </span>
              <span className="dash-bar-val">{formatCount(mp)}</span>
            </div>
          )}
        </div>
      ) : null}

      {/* 1차 스탯 6종(기본 + 보너스 2단 수평 바) */}
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
              <span className="dash-bar-code" translate="no">
                {code}
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
              <span className="dash-bar-val">{formatCount(total)}</span>
            </div>
          );
        })}
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
