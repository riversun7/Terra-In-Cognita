// 전쟁 탭 — 전쟁·선포 목록(46 §4.2~4.4, 45 §10.2): 상대, 누가 선포했는지, 명분, 단계, 공성 대상·공성 선포 시각·공격 변(D-233),
// 공성 시각(또는 방어 시각을 고를 기한 = 공성 선포 + 24시간, D-200), 참전 동맹. 선전포고·강화·참전 요청·방어 시각 고르기는 명령이라
// 곧 열림.
import type { WarRow } from "@terra/shared/faction";
import { m } from "../paraglide/messages.js";
import { ActionRow, Fact, SoonButton, StateChip } from "../sections/screenParts.tsx";
import { dateText, relativeText } from "../sections/screenText.ts";
import { CASUS_NAMES, SIDE_NAMES, WAR_STAGE_NAMES } from "./factionText.ts";

/** 시각 칸: "20시간 뒤"(마우스를 올리면 날짜) */
function When({ at, now }: { at: number; now: number }) {
  return (
    <time dateTime={new Date(at).toISOString()} title={dateText(at)}>
      {relativeText(at, now)}
    </time>
  );
}

function WarCard({ war, now }: { war: WarRow; now: number }) {
  const titleId = `faction-war-${war.id}`;
  return (
    <li>
      <article
        className="faction-item"
        aria-labelledby={titleId}
        data-side={war.attacker ? "attacker" : "defender"}
      >
        <div className="faction-item-head">
          <h3 id={titleId} className="faction-item-title">
            {m.faction_war_vs({ name: war.opponent.name })}
            {war.opponent.tag === null ? null : (
              <span className="faction-tag" translate="no">
                {war.opponent.tag}
              </span>
            )}
          </h3>
          <StateChip tone="bad" label={WAR_STAGE_NAMES[war.stage]()} />
          <StateChip
            tone="plain"
            label={war.attacker ? m.faction_war_attacker() : m.faction_war_defender()}
          />
        </div>
        <dl className="facts">
          <Fact label={m.faction_war_cause()}>
            <span className={war.casusBelli === "none" ? "faction-warn-text" : undefined}>
              {CASUS_NAMES[war.casusBelli]()}
            </span>
          </Fact>
          <Fact label={m.faction_war_declared_at()}>
            <When at={war.declaredAt} now={now} />
          </Fact>
          {war.targetCity === null ? null : <Fact label={m.faction_war_target()}>{war.targetCity}</Fact>}
          {war.siegeDeclaredAt === null ? null : (
            <Fact label={m.faction_war_siege_declared()}>
              <When at={war.siegeDeclaredAt} now={now} />
            </Fact>
          )}
          {war.attackSide === null ? null : (
            <Fact label={m.faction_war_side()}>{SIDE_NAMES[war.attackSide]()}</Fact>
          )}
          {war.siegeAt === null ? null : (
            <Fact label={m.faction_war_siege_at()}>
              <When at={war.siegeAt} now={now} />
            </Fact>
          )}
          {war.deadlineAt === null ? null : (
            <Fact label={m.faction_war_deadline()}>
              <span className="faction-stack">
                <When at={war.deadlineAt} now={now} />
                <span className="faction-muted">{m.faction_war_deadline_rule()}</span>
              </span>
            </Fact>
          )}
          <Fact label={m.faction_war_allies()}>
            {war.allies.length === 0
              ? m.faction_none_value()
              : war.allies.map((ally) => ally.name).join(", ")}
          </Fact>
        </dl>
        <ActionRow>
          {war.stage === "defense_time_pending" ? (
            <SoonButton label={m.faction_war_defense()} primary />
          ) : null}
          <SoonButton label={m.faction_war_peace()} />
          <SoonButton label={m.faction_war_call()} />
        </ActionRow>
      </article>
    </li>
  );
}

export function FactionWars({ wars, now }: { wars: readonly WarRow[]; now: number }) {
  return (
    <>
      <p className="faction-muted">{m.faction_war_declare_hint()}</p>
      {wars.length === 0 ? (
        <p className="faction-muted">{m.faction_wars_empty()}</p>
      ) : (
        <ul className="faction-list">
          {wars.map((war) => (
            <WarCard key={war.id} war={war} now={now} />
          ))}
        </ul>
      )}
    </>
  );
}
