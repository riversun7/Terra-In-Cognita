// 사이보그 화면 아래 판들 — 스킬 칸, 속성, 인벤토리, 환생, 랭킹, 상태 줄. CyborgScreen.tsx가 놓는다.
// - 스킬 칸(D-427): 팩 unit_kinds skillSlots(처음 + 환생마다, 최대). 닫힌 칸이 몇 번째 환생에 열리는지는 서버가 센다(skillSlotUnlocks).
// - 속성(D-182, 50 §2.1): 6계열 × 기본·강화. 사이보그가 속성값을 얻는 길이 아직 없어 모두 0이다(질문 182 가: 판은 보인다).
import type { CyborgBody, CyborgGetResponse, CyborgRebirthRule, RosterNames } from "@terra/shared/roster";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { SoonButton } from "../roster/parts.tsx";
import { AppLink } from "../shell/AppLink.tsx";
import { assetLabel, formatAmount, formatNumber, localName } from "../roster/rosterText.ts";
import { ElementIcon } from "../ui/elementIcons.tsx";
import { elementFamilies, elementLabel } from "./cyborgText.ts";

/** 스킬 칸: 연 칸(쓰는 스킬·빈 칸) + 닫힌 칸(환생 n회에 열림) */
export function SkillSlots({ body, names }: { body: CyborgBody; names: RosterNames }) {
  const skills = body.skills;
  const empty = Math.max(0, skills.slots - skills.list.length);
  return (
    <div className="cyborg-skills">
      <p className="roster-meta">
        {[
          m.roster_skill_slots({ used: formatNumber(skills.list.length), slots: formatNumber(skills.slots) }),
          m.cyborg_skill_slots_max({ max: formatNumber(body.skillSlotsMax) }),
        ].join(" · ")}
      </p>
      <ol className="cyborg-skill-grid">
        {skills.list.map((skill) => (
          <li key={skill.id} className="cyborg-skill" data-state="used">
            <span className="cyborg-skill-name">{localName(names.skills[skill.id], skill.id)}</span>
            <span className="cyborg-skill-note">
              {skill.source === "innate" ? m.roster_skill_innate() : m.roster_skill_equipment()}
            </span>
          </li>
        ))}
        {Array.from({ length: empty }, (_, index) => (
          <li key={`empty-${String(index)}`} className="cyborg-skill" data-state="empty">
            <span className="cyborg-skill-note">{m.roster_skill_empty()}</span>
          </li>
        ))}
        {body.skillSlotUnlocks.map((rebirths, index) => (
          <li key={`locked-${String(index)}`} className="cyborg-skill" data-state="locked">
            <span className="cyborg-skill-lock" aria-hidden="true" />
            <span className="cyborg-skill-note">
              {m.cyborg_skill_locked({ count: formatNumber(rebirths) })}
            </span>
          </li>
        ))}
      </ol>
      <p className="roster-meta">{m.cyborg_skill_grade_cap({ grade: formatNumber(body.skillGradeCap) })}</p>
    </div>
  );
}

/** 속성 12칸(0~10): 계열마다 기본·강화 두 칸, 칸마다 눈금 10 */
export function Elements({ values }: { values: readonly number[] }) {
  return (
    <div className="cyborg-elements-box">
      <p className="roster-note">{m.cyborg_elements_note()}</p>
      <ul className="cyborg-elements">
        {elementFamilies(values).map((family) => (
          <li key={family.basic.code} className="cyborg-element-family" data-family={family.basic.code}>
            {[family.basic, family.enhanced].map((cell) => (
              <span
                key={cell.code}
                className="cyborg-element"
                data-element={cell.code}
                data-empty={cell.value === 0 ? "true" : undefined}
              >
                <ElementIcon code={cell.code} className="cyborg-element-icon" />
                <span className="cyborg-element-name">{elementLabel(cell.code)}</span>
                <span className="cyborg-element-pips" aria-hidden="true">
                  {Array.from({ length: 10 }, (_, pip) => (
                    <span
                      key={pip}
                      className="cyborg-element-pip"
                      data-on={pip < cell.value ? "true" : undefined}
                    />
                  ))}
                </span>
                <span className="cyborg-element-value">
                  <span aria-hidden="true">{formatNumber(cell.value)}</span>
                  <span className="visually-hidden">
                    {m.cyborg_element_value({
                      name: elementLabel(cell.code),
                      value: formatNumber(cell.value),
                    })}
                  </span>
                </span>
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Inventory({ body, data }: { body: CyborgBody; data: CyborgGetResponse }) {
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
 * 환생(D-026·D-031·D-352·D-427·D-440·D-441·D-444·D-446·D-447·D-449·D-451): 바뀌는 것(레벨 1·경험치 0, 가속 없음, 분포는 그대로 두거나
 * 성향을 골라 다시 굴림, K는 늘 다시 굴림, 신앙도는 0으로)·남는 것·얻는 것, 조건·비용. 성향 고르기·다시 굴리기 화면은 환생 시설에서 연다
 * (아직 곧 열림, 거기서는 K가 보인다 D-449). 조건 = 최고 레벨 + 신앙도 문턱(쓰지 않고 넘으면 된다, D-451), 비용 = 화폐(그 신전 도시의 화폐).
 * 양은 서버가 보내는 팩 설정값(N7·N34, rule)이라 플레이어에게도 보인다. 진로별 종교 아이템은 빛·어둠 갈래나 종교 특수 스킬 같은
 * 추가 선택에만 쓴다(D-452). 지금 레벨·신앙도는 본체가 있을 때만 덧붙인다
 */
export function Rebirth({ body, rule }: { body: CyborgBody | null; rule: CyborgRebirthRule }) {
  const max = formatNumber(rule.maxLevel);
  const need = formatNumber(rule.faith);
  return (
    <div className="cyborg-rebirth">
      <dl className="roster-facts">
        <div>
          <dt>{m.cyborg_rebirth_changes()}</dt>
          <dd>{m.cyborg_rebirth_changes_body({ rerolls: formatNumber(rule.rerolls) })}</dd>
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
      <p className="roster-note">{m.cyborg_rebirth_k()}</p>
      <SoonButton label={m.cyborg_action_rebirth_route()} small={false} />
    </div>
  );
}

/** 랭킹 칸(질문 134 가: 점수 있는 경로만, 점수 높은 순). 경로 줄을 누르면 그 경로 순위표, 끝에 모든 경로 순위(docs/adr/2026-11-07-ranking.md) */
export function Rankings({ body }: { body: CyborgBody }) {
  const all = (
    <p className="cyborg-rank-all">
      <AppLink className="cyborg-rank-link" to={{ route: "cyborg_ranking" }}>
        {m.cyborg_ranking_open_all()}
      </AppLink>
    </p>
  );
  if (body.rankings.length === 0)
    return (
      <>
        <p className="roster-empty">{m.cyborg_ranking_empty()}</p>
        {all}
      </>
    );
  return (
    <>
      <p className="roster-note">{m.cyborg_ranking_note()}</p>
      <ul className="roster-list">
        {body.rankings.map((row) => (
          <li key={row.path} className="roster-list-row">
            <span className="roster-list-main">
              <AppLink
                className="roster-list-title cyborg-rank-link"
                to={{ route: "cyborg_ranking", search: { path: row.path } }}
              >
                {localName(row.name, row.path)}
              </AppLink>
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
      {all}
    </>
  );
}

/** 상태 줄: 이름·레벨·환생·1차 합, 서버가 계산한 시각 */
export function StatusFooter({ data, body }: { data: CyborgGetResponse; body: CyborgBody }) {
  const sum = Object.values(body.stats.primaries).reduce(
    (total, value) => total + value.base + value.bonus,
    0,
  );
  const time = new Intl.DateTimeFormat(getLocale(), { hour: "2-digit", minute: "2-digit" }).format(
    data.generatedAt,
  );
  return (
    <footer className="cyborg-footer">
      <p>
        {m.cyborg_footer({
          name: data.name,
          level: formatNumber(body.level),
          max: formatNumber(body.maxLevel),
          rebirths: formatNumber(body.rebirths),
          sum: formatNumber(sum),
        })}
      </p>
      <p className="cyborg-footer-time">{m.cyborg_footer_time({ time })}</p>
    </footer>
  );
}
