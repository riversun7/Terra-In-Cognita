// 사이보그 화면(내 본체) — 기획 60 §9 "사이보그: 스탯·장비·인공장기·인벤토리·환생·랭킹"(D-018·D-026·D-040, 🟡 세부 미정).
// ADR 37 "구현하며 정한 것 (유닛·사이보그 화면)". 위 띠의 사이보그 얼굴이 여는 화면이다(D-6010).
// - 실제: 계정 이름, 보유 유닛 수. 본체(레벨·스탯·장비·인공장기·스킬·인벤토리·환생·랭킹)는 세계에 아직 없어 dev·admin 시안 자료로만 보인다.
//   플레이어에게는 판마다 "생기면 보입니다" 안내다(가짜 숫자 없음, ADR 37 6절 원칙).
// - 바꾸는 동작(장착·인공장기 시술·환생)은 "곧 열림"이다. 환생 단추는 "가장 가까운 환생 시설로 가는 길"이다(D-441: 환생은
//   환생 시설(신전)에서 하고 모항의 몸 교체는 연출, 질문 135 기본안).
// - 좁은 폭은 판을 위에서 아래로, 넓은 폭(64em 이상)은 두 열(왼쪽 본체·스탯, 오른쪽 장비·인벤토리·환생·랭킹).
// 지연 로딩 조각(routeViews.tsx).
import type { CyborgBody, CyborgGetResponse, CyborgRebirthRule } from "@terra/shared/roster";
import { useId } from "react";
import { usePreviewOn } from "../inbox/preview.ts";
import { m } from "../paraglide/messages.js";
import { BackButton } from "../shell/BackButton.tsx";
import { AppLink } from "../shell/AppLink.tsx";
import {
  LoadState,
  Meter,
  PreviewTag,
  Section,
  SkillList,
  SlotList,
  SoonButton,
  StatBlock,
} from "../roster/parts.tsx";
import { PreviewSwitch } from "../roster/PreviewSwitch.tsx";
import { assetLabel, formatAmount, formatNumber, localName } from "../roster/rosterText.ts";
import { loadCyborg, useRosterQuery } from "../roster/useRosterQuery.ts";
import "./cyborg.css";

export default function CyborgScreen() {
  const id = useId();
  const preview = usePreviewOn();
  const query = useRosterQuery(loadCyborg, preview);
  const state = query.state;
  return (
    <section className="screen screen-wide cyborg" aria-labelledby={`${id}-title`}>
      <div className="screen-header">
        <h1 id={`${id}-title`} className="screen-title" tabIndex={-1}>
          {m.nav_cyborg()}
        </h1>
        <PreviewSwitch />
        <BackButton />
      </div>
      {state.status === "ready" ? (
        <CyborgBodyView data={state.data} />
      ) : (
        <LoadState state={state} onRetry={query.reload} />
      )}
    </section>
  );
}

function CyborgBodyView({ data }: { data: CyborgGetResponse }) {
  const id = useId();
  const body = data.body;
  return (
    <>
      {data.preview ? <p className="roster-notice">{m.roster_preview_notice()}</p> : null}
      <div className="cyborg-columns">
        <div className="cyborg-column">
          <Profile data={data} />
          <Section id={`${id}-stats`} title={m.roster_stats_title()} end={body ? <PreviewTag /> : null}>
            {body ? (
              <StatBlock stats={body.stats} names={data.names} />
            ) : (
              <Later text={m.cyborg_stats_later()} />
            )}
          </Section>
          <Section id={`${id}-skills`} title={m.roster_skills_title()} end={body ? <PreviewTag /> : null}>
            {body ? (
              <>
                <SkillList skills={body.skills} names={data.names} />
                <p className="roster-meta">
                  {m.cyborg_skill_grade_cap({ grade: formatNumber(body.skillGradeCap) })}
                </p>
              </>
            ) : (
              <Later text={m.cyborg_skills_later()} />
            )}
          </Section>
        </div>
        <div className="cyborg-column">
          <Section
            id={`${id}-gear`}
            title={m.roster_gear_title()}
            end={body ? <SoonButton label={m.roster_action_equip()} /> : null}
          >
            {body ? (
              <SlotList slots={body.slots} names={data.names} except="organ" />
            ) : (
              <Later text={m.cyborg_gear_later()} />
            )}
          </Section>
          <Section
            id={`${id}-organs`}
            title={m.cyborg_organs_title()}
            end={body ? <SoonButton label={m.cyborg_action_implant()} /> : null}
          >
            <p className="roster-note">{m.cyborg_organs_note()}</p>
            {body ? <SlotList slots={body.slots} names={data.names} only="organ" /> : null}
          </Section>
          <Section
            id={`${id}-inventory`}
            title={m.cyborg_inventory_title()}
            end={body ? <PreviewTag /> : null}
          >
            {body ? <Inventory body={body} data={data} /> : <Later text={m.cyborg_inventory_later()} />}
          </Section>
          <Section id={`${id}-rebirth`} title={m.cyborg_rebirth_title()}>
            <Rebirth body={body} rule={data.rebirth} />
          </Section>
          <Section id={`${id}-ranking`} title={m.cyborg_ranking_title()} end={body ? <PreviewTag /> : null}>
            {body ? <Rankings body={body} /> : <Later text={m.cyborg_ranking_later()} />}
          </Section>
        </div>
      </div>
    </>
  );
}

function Later({ text }: { text: string }) {
  return <p className="roster-empty">{text}</p>;
}

function Profile({ data }: { data: CyborgGetResponse }) {
  const body = data.body;
  return (
    <div className="panel cyborg-profile">
      <div className="cyborg-who">
        <span className="roster-avatar roster-avatar-lg" data-type="cyborg" aria-hidden="true">
          {Array.from(data.name)[0] ?? "?"}
        </span>
        <div className="cyborg-names">
          <p className="cyborg-name">{data.name}</p>
          <p className="roster-meta">
            {body
              ? [
                  m.roster_level_of({ level: formatNumber(body.level), max: formatNumber(body.maxLevel) }),
                  body.rebirths > 0 ? m.roster_rebirths({ count: formatNumber(body.rebirths) }) : null,
                ]
                  .filter((part) => part !== null)
                  .join(" · ")
              : m.cyborg_body_later()}
          </p>
        </div>
        {body ? <PreviewTag /> : null}
      </div>
      {body ? (
        <dl className="roster-facts cyborg-faith">
          <div>
            <dt>{m.cyborg_faith()}</dt>
            <dd className="roster-num">{formatNumber(body.faith)}</dd>
          </div>
        </dl>
      ) : null}
      {body ? (
        <div className="cyborg-meters">
          <Meter
            label={m.cyborg_exp()}
            value={body.exp.into}
            max={body.exp.span}
            valueText={m.roster_value_of({
              value: formatNumber(body.exp.into),
              max: formatNumber(body.exp.span),
            })}
          />
          <Meter
            label={m.roster_fatigue()}
            value={body.fatigue.value}
            max={body.fatigue.max}
            valueText={m.roster_value_of({
              value: formatNumber(body.fatigue.value),
              max: formatNumber(body.fatigue.max),
            })}
          />
        </div>
      ) : null}
      <p className="cyborg-units">
        <AppLink to={{ route: "units" }} className="cyborg-units-link">
          {m.cyborg_units_link({ count: formatNumber(data.unitCount) })}
        </AppLink>
      </p>
    </div>
  );
}

function Inventory({ body, data }: { body: CyborgBody; data: CyborgGetResponse }) {
  if (body.inventory.length === 0) return <p className="roster-empty">{m.cyborg_inventory_empty()}</p>;
  return (
    <ul className="roster-list">
      {body.inventory.map((item) => (
        <li key={item.id} className="roster-list-row">
          <span>{assetLabel(item.id, data.names)}</span>
          <span className="roster-num">{formatAmount(item.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * 환생(D-026·D-031·D-352·D-427·D-440·D-441): 바뀌는 것(레벨 1·경험치 0, 가속 없음)·남는 것·얻는 것, 비용.
 * 비용 = 최고 레벨 + 신앙도 + 화폐(그 신전 도시의 화폐). 양은 서버가 보내는 팩 설정값(N7·N34, rule)이라 플레이어에게도 보인다.
 * 진로별 종교 아이템은 특수 스킬 같은 추가 조건에만 쓴다. 지금 레벨·신앙도는 본체가 있을 때(시안 자료)만 덧붙인다
 */
function Rebirth({ body, rule }: { body: CyborgBody | null; rule: CyborgRebirthRule }) {
  const max = formatNumber(rule.maxLevel);
  const need = formatNumber(rule.faith);
  return (
    <div className="cyborg-rebirth">
      <dl className="roster-facts">
        <div>
          <dt>{m.cyborg_rebirth_changes()}</dt>
          <dd>{m.cyborg_rebirth_changes_body()}</dd>
        </div>
        <div>
          <dt>{m.cyborg_rebirth_keeps()}</dt>
          <dd>{m.cyborg_rebirth_keeps_body()}</dd>
        </div>
        <div>
          <dt>{m.cyborg_rebirth_gains()}</dt>
          <dd>{m.cyborg_rebirth_gains_body()}</dd>
        </div>
      </dl>
      <h3 className="cyborg-rebirth-cost">{m.cyborg_rebirth_cost()}</h3>
      <dl className="roster-facts">
        <div>
          <dt>{m.cyborg_rebirth_cost_level()}</dt>
          <dd>
            {body
              ? m.cyborg_rebirth_level_value({ level: formatNumber(body.level), max })
              : m.cyborg_rebirth_level_need({ max })}
          </dd>
        </div>
        <div>
          <dt>{m.cyborg_rebirth_cost_faith()}</dt>
          <dd>
            {body
              ? m.cyborg_rebirth_faith_value({ need, value: formatNumber(body.faith) })
              : m.cyborg_rebirth_faith_need({ need })}
          </dd>
        </div>
        <div>
          <dt>{m.cyborg_rebirth_cost_currency()}</dt>
          <dd>{m.cyborg_rebirth_currency_value({ amount: formatAmount(rule.currency) })}</dd>
        </div>
        <div>
          <dt>{m.cyborg_rebirth_cost_items()}</dt>
          <dd>{m.cyborg_rebirth_items_value()}</dd>
        </div>
      </dl>
      <p className="roster-note">{m.cyborg_rebirth_place()}</p>
      <SoonButton label={m.cyborg_action_rebirth_route()} small={false} />
    </div>
  );
}

function Rankings({ body }: { body: CyborgBody }) {
  if (body.rankings.length === 0) return <p className="roster-empty">{m.cyborg_ranking_empty()}</p>;
  return (
    <>
      <p className="roster-note">{m.cyborg_ranking_note()}</p>
      <ul className="roster-list">
        {body.rankings.map((row) => (
          <li key={row.path} className="roster-list-row">
            <span className="roster-list-main">
              <span className="roster-list-title">{localName(row.name, row.path)}</span>
              <span className="roster-meta">
                {m.cyborg_ranking_score({ score: formatNumber(row.score) })}
              </span>
            </span>
            <span className="cyborg-rank">
              <span className="roster-num">{m.cyborg_ranking_rank({ rank: formatNumber(row.rank) })}</span>
              <span className="roster-tag" data-tone={row.tierPercent <= 5 ? "top" : undefined}>
                {row.tierPercent < 100
                  ? m.cyborg_ranking_tier({ percent: formatNumber(row.tierPercent) })
                  : m.cyborg_ranking_no_tier()}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
