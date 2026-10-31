// 세력 화면 옆 판 — 내 세력·가문 요약(46 §1), 내 몫(실제 자료), 잠긴 메뉴(D-5055). 넓은 화면은 왼쪽 옆 판, 좁으면 맨 위.
// 고정 NPC 국가(D-324)는 표를 붙인다. 공물은 주마다 국고의 비율이다(D-443 설정값).
import type {
  FactionOverviewResponse,
  FactionSummary,
  LockedFeature,
  MySummary,
} from "@terra/shared/faction";
import { formatCount } from "../home/numbers.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { Fact, PreviewTag, SoonButton, StateChip } from "../sections/screenParts.tsx";
import { amountText, dateText } from "../sections/screenText.ts";
import { Icon } from "../ui/icons.tsx";
import { KIND_NAMES, LOCK_NAMES, REGIME_NAMES, STAGE_NAMES, assetName } from "./factionText.ts";
import { formatPermille } from "./factionView.ts";

/** 세력 이름 + 태그(판 제목) */
function NameLine({ faction }: { faction: FactionSummary }) {
  return (
    <h2 id="faction-card-title" className="faction-name">
      <span className="faction-name-text" translate="no">
        {faction.name}
      </span>
      {faction.tag === null ? null : (
        <span className="faction-tag" translate="no">
          {faction.tag}
        </span>
      )}
    </h2>
  );
}

function FactionCard({ faction }: { faction: FactionSummary }) {
  const locale = getLocale();
  return (
    <section className="panel faction-card" aria-labelledby="faction-card-title">
      <div className="screen-section-head">
        <span className="faction-mark" aria-hidden="true">
          <Icon name="faction" />
        </span>
        <NameLine faction={faction} />
        {faction.preview === true ? <PreviewTag /> : null}
      </div>
      <p className="faction-chips">
        <StateChip tone="good" label={STAGE_NAMES[faction.stage]()} />
        <StateChip tone="plain" label={KIND_NAMES[faction.kind]()} />
        {faction.fixed ? <StateChip tone="plain" label={m.faction_fixed()} /> : null}
      </p>
      <dl className="facts">
        <Fact label={m.faction_field_regime()}>
          {faction.regime === null ? m.faction_regime_unset() : REGIME_NAMES[faction.regime]()}
        </Fact>
        <Fact label={m.faction_field_leader()}>{faction.leader ?? m.faction_unknown()}</Fact>
        <Fact label={m.faction_field_members()}>{formatCount(faction.memberCount)}</Fact>
        <Fact label={m.faction_field_cities()}>{formatCount(faction.cityCount)}</Fact>
        <Fact label={m.faction_field_joined()}>
          <time dateTime={new Date(faction.joinedAt).toISOString()}>{dateText(faction.joinedAt)}</time>
        </Fact>
        {faction.family === null ? null : (
          <Fact label={m.faction_field_family()}>
            <span className="faction-inline">
              {m.faction_family_value({
                name: faction.family.name,
                count: formatCount(faction.family.memberCount),
              })}
              {faction.family.head ? <StateChip tone="plain" label={m.faction_family_head()} /> : null}
            </span>
          </Fact>
        )}
        <Fact label={m.faction_field_overlord()}>
          {faction.overlord === null ? (
            m.faction_none_value()
          ) : (
            <span className="faction-stack">
              <span>{faction.overlord.faction.name}</span>
              <span className="faction-muted">
                {faction.overlord.tributePm === null
                  ? m.faction_tribute_unset()
                  : m.faction_tribute({ rate: formatPermille(faction.overlord.tributePm, locale) })}
              </span>
            </span>
          )}
        </Fact>
        <Fact label={m.faction_field_vassals()}>
          {faction.vassals.length === 0 ? (
            m.faction_none_value()
          ) : (
            <ul className="faction-plain-list">
              {faction.vassals.map((vassal) => (
                <li key={vassal.faction.id}>
                  {vassal.faction.name}{" "}
                  <span className="faction-muted">
                    {m.faction_tribute({ rate: formatPermille(vassal.tributePm, locale) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Fact>
        <Fact label={m.faction_field_currency()}>{currencyText(faction)}</Fact>
        <Fact label={m.faction_field_treasury()}>
          {faction.treasury.length === 0 ? (
            m.faction_none_value()
          ) : (
            <ul className="faction-plain-list">
              {faction.treasury.map((balance) => (
                <li key={balance.asset}>
                  <span className="faction-amount">{amountText(balance.amount)}</span> {assetName(balance)}
                </li>
              ))}
            </ul>
          )}
        </Fact>
      </dl>
    </section>
  );
}

/** 세력 화폐 칸: 발행했으면 이름·발행량, 아니면 도시가 없을 때만 "도시가 있어야 발행"(도시가 있으면 아직 자료 없음) */
function currencyText(faction: FactionSummary): string {
  if (faction.currency !== null)
    return m.faction_currency_value({
      name: faction.currency.name,
      amount: amountText(faction.currency.issued),
    });
  return faction.cityCount > 0 ? m.faction_currency_unknown() : m.faction_currency_none();
}

/** 세력이 없을 때(개인) */
function NoFaction() {
  return (
    <section className="panel faction-card" aria-labelledby="faction-none-title">
      <div className="screen-section-head">
        <span className="faction-mark" aria-hidden="true">
          <Icon name="faction" />
        </span>
        <h2 id="faction-none-title" className="screen-section-title">
          {m.faction_none_title()}
        </h2>
      </div>
      <p className="faction-chips">
        <StateChip tone="plain" label={STAGE_NAMES.individual()} />
      </p>
      <p className="lead">{m.faction_none_body()}</p>
      <div className="screen-actions">
        <SoonButton label={m.faction_found_family()} />
      </div>
    </section>
  );
}

function MyHoldings({ me }: { me: MySummary }) {
  return (
    <section className="panel faction-me" aria-labelledby="faction-me-title">
      <h2 id="faction-me-title" className="screen-section-title">
        {m.faction_me_title()}
      </h2>
      {me.hasOwner ? (
        <dl className="facts">
          <Fact label={m.faction_me_units()}>{formatCount(me.units)}</Fact>
          <Fact label={m.faction_me_buildings()}>{formatCount(me.buildings)}</Fact>
          <Fact label={m.faction_me_balances()}>
            {me.balances.length === 0 ? (
              m.faction_none_value()
            ) : (
              <ul className="faction-plain-list">
                {me.balances.map((balance) => (
                  <li key={balance.asset}>
                    <span className="faction-amount">{amountText(balance.amount)}</span> {assetName(balance)}
                  </li>
                ))}
              </ul>
            )}
          </Fact>
        </dl>
      ) : (
        <p className="faction-muted">{m.faction_me_no_owner()}</p>
      )}
    </section>
  );
}

function Locks({ locks }: { locks: readonly LockedFeature[] }) {
  if (locks.length === 0) return null;
  return (
    <section className="panel faction-locks" aria-labelledby="faction-locks-title">
      <div>
        <h2 id="faction-locks-title" className="screen-section-title">
          {m.faction_locks_title()}
        </h2>
        <p className="faction-muted">{m.faction_locks_hint()}</p>
      </div>
      <ul className="faction-lock-list">
        {locks.map((lock) => (
          <li key={lock.feature} className="faction-lock" data-open={lock.open}>
            <span className="faction-lock-name">{LOCK_NAMES[lock.feature]()}</span>
            <StateChip
              tone={lock.open ? "good" : "plain"}
              label={lock.open ? m.faction_lock_open() : m.faction_lock_locked()}
            />
            {lock.requirements.map((need) => (
              <span key={need.kind} className="faction-lock-need" data-met={need.met}>
                {m.faction_lock_need_cities({
                  need: formatCount(need.need),
                  current: formatCount(need.current),
                })}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FactionSide({ view }: { view: FactionOverviewResponse }) {
  return (
    <aside className="faction-side" aria-label={m.faction_side_label()}>
      {view.faction === null ? <NoFaction /> : <FactionCard faction={view.faction} />}
      <MyHoldings me={view.me} />
      <Locks locks={view.locks} />
    </aside>
  );
}
