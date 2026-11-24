// 세력 화면 옆 판 — 내 세력·가문 요약(46 §1), 내 몫(실제 자료), 잠긴 메뉴(D-5055). 넓은 화면은 왼쪽 옆 판, 좁으면 맨 위.
// 내 세력 이름과 마크 칸은 identity/IdentityCard.tsx(factionIdentity.mine, docs/adr/2026-11-11-faction-identity.md).
// 고정 NPC 국가(D-324)는 표를 붙인다. 공물은 주마다 국고의 비율이다(D-443 설정값). 세력 순위 칸은 FactionRanking.tsx(ranking.mine).
// 나라 이름·지도자는 서버가 준 두 언어 이름(label·leaderName — 팩 국가 프리셋, NPC 국가 지도자 사이보그)이 있으면 그것을 보인다("WP-NPC").
import type {
  AssetBalance,
  FactionHouseSummary,
  FactionOverviewResponse,
  FactionRules,
  FactionSummary,
  LockedFeature,
  MySummary,
} from "@terra/shared/faction";
import { formatCount } from "../home/numbers.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { Fact, PreviewTag, StateChip } from "../sections/screenParts.tsx";
import { AppLink } from "../shell/AppLink.tsx";
import { amountText, dateText, durationText } from "../sections/screenText.ts";
import { localName } from "../roster/rosterText.ts";
import { NationEmblem } from "../ui/NationEmblem.tsx";
import { AssetGroups } from "../ui/AssetGroups.tsx";
import { currencyName, indexCatalog } from "../economy/economyText.ts";
import { NO_ARGS, useCatalog } from "../economy/queries.ts";
import { Icon } from "../ui/icons.tsx";
import { FactionRanking } from "./FactionRanking.tsx";
import { IdentityCard } from "./identity/IdentityCard.tsx";
import { KIND_NAMES, LOCK_NAMES, REGIME_NAMES, STAGE_NAMES, assetName } from "./factionText.ts";
import { formatPermille } from "./factionView.ts";

/** 세력 이름 + 태그(판 제목) */
/**
 * 잔고 목록(국고·내 잔고) — 사용자 지적 2026-11-15 "국고의 채권이나 주식도 제대로 보여라 누가 알아보냐": 원장 화폐 자산(cur:코드)은 팩 화폐 이름으로,
 * 금액은 돈 표시(동전 + 금색 숫자, ui/Money.tsx)로 보인다. 큰 금액부터
 */
function BalanceList({ balances }: { balances: readonly AssetBalance[] }) {
  const catalog = useCatalog(NO_ARGS);
  const index = indexCatalog(catalog.data);
  // 기준 통화(소속 국가 화폐) → 외환 보유고(국기) → 주식(사업장·도시)으로 나눠 보인다(ui/AssetGroups.tsx, 사용자 요청 2026-11-23)
  const rows = balances.map((balance) => {
    const code = balance.asset.startsWith("cur:") ? balance.asset.slice(4) : null;
    return {
      key: balance.asset,
      amount: amountText(balance.amount),
      name: balance.name ?? (code === null ? assetName(balance) : currencyName(index, code)),
      qty: BigInt(balance.amount),
      tag: balance.tag,
    };
  });
  return <AssetGroups rows={rows} />;
}

function NameLine({ faction }: { faction: FactionSummary }) {
  return (
    <h2 id="faction-card-title" className="faction-name">
      <span className="faction-name-text" translate="no">
        {faction.label ? localName(faction.label, faction.name) : faction.name}
      </span>
      {faction.tag === null ? null : (
        <span className="faction-tag" translate="no">
          {faction.tag}
        </span>
      )}
    </h2>
  );
}

/** 공물 글: 주기마다 국고의 비율(S33·주기 설정값) */
function tributeText(pm: number, rules: FactionRules): string {
  return m.faction_tribute({
    rate: formatPermille(pm, getLocale()),
    period: durationText(rules.tributeEveryMs),
  });
}

function FactionCard({ faction, rules }: { faction: FactionSummary; rules: FactionRules }) {
  return (
    <section className="panel faction-card" aria-labelledby="faction-card-title">
      <div className="screen-section-head">
        {faction.emblem ? (
          <NationEmblem
            spec={faction.emblem.spec}
            color={faction.emblem.color}
            uploaded={faction.emblem.uploaded}
            size={40}
            className="faction-emblem"
          />
        ) : (
          <span className="faction-mark" aria-hidden="true">
            <Icon name="faction" />
          </span>
        )}
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
        <Fact label={m.faction_field_leader()}>
          {faction.leaderName
            ? localName(faction.leaderName, faction.leader ?? "")
            : (faction.leader ?? m.faction_unknown())}
        </Fact>
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
                  : tributeText(faction.overlord.tributePm, rules)}
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
                  <span className="faction-muted">{tributeText(vassal.tributePm, rules)}</span>
                </li>
              ))}
            </ul>
          )}
        </Fact>
        <Fact label={m.faction_field_currency()}>{currencyText(faction)}</Fact>
        <Fact label={m.faction_field_treasury()} wide>
          {faction.treasury.length === 0 ? (
            m.faction_none_value()
          ) : (
            <BalanceList balances={faction.treasury} />
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

/** 가문은 창설했지만 아직 도시·국가에 가입하지 않은 상태 */
function HouseOnlyCard({ house }: { house: FactionHouseSummary }) {
  return (
    <section
      className="panel faction-card"
      aria-labelledby="faction-house-only-title"
      data-part="faction-house-only"
    >
      <div className="screen-section-head">
        <span className="faction-mark" aria-hidden="true">
          <Icon name="faction" />
        </span>
        <h2 id="faction-house-only-title" className="faction-name">
          <span className="faction-name-text" translate="no">
            {house.name}
          </span>
          {house.shortName ? (
            <span className="faction-tag" translate="no">
              {house.shortName}
            </span>
          ) : null}
        </h2>
      </div>
      <p className="faction-chips">
        <StateChip tone="good" label={STAGE_NAMES.faction()} />
        <StateChip tone="plain" label={m.faction_house_only_chip()} />
      </p>
      <p className="lead">{m.faction_house_only_body()}</p>
      <dl className="facts">
        <Fact label={m.faction_field_nation()}>{m.faction_house_only_nation()}</Fact>
        <Fact label={m.faction_field_members()}>
          <span className="faction-inline">
            {formatCount(house.memberCount)}
            {house.head ? <StateChip tone="plain" label={m.faction_family_head()} /> : null}
          </span>
        </Fact>
      </dl>
    </section>
  );
}

/** 세력이 없을 때(개인 — 가문도 소속 국가도 없음) */
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
        {/* 가문 창설 = 정체성 단계(질문 926 나) */}
        <AppLink className="button-small" to={{ route: "faction_identity" }}>
          {m.faction_found_family()}
        </AppLink>
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
          <Fact label={m.faction_me_balances()} wide>
            {me.balances.length === 0 ? m.faction_none_value() : <BalanceList balances={me.balances} />}
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

export function FactionSide({
  view,
  onHouseChanged,
}: {
  view: FactionOverviewResponse;
  onHouseChanged?: (() => void) | undefined;
}) {
  return (
    <aside className="faction-side" aria-label={m.faction_side_label()}>
      {view.faction !== null ? (
        <FactionCard faction={view.faction} rules={view.rules} />
      ) : view.house != null ? (
        <HouseOnlyCard house={view.house} />
      ) : (
        <NoFaction />
      )}
      <MyHoldings me={view.me} />
      <IdentityCard onHouseChanged={onHouseChanged} />
      <FactionRanking />
      <Locks locks={view.locks} />
    </aside>
  );
}
