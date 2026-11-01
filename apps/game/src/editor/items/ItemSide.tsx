// 쓰이는 곳·검사 판(설계안 3.6·3.9) — 서버 검사의 저장을 막는 문제(빨강)와 권고(노랑, 막지 않음), 끄면 함께 멈추는 레시피·생필품,
// 이 아이템을 만드는·쓰는 레시피, 생필품, 신선도 0이면 이리로 바뀌는 아이템(누르면 그 아이템), 장비 스킬(스킬 편집기로), 입을 수 있는
// 유닛 종류, 전투 실험실 프리셋(밸런스 화면으로), 코드·시나리오가 ID로 쓰는 곳. 읽기와 연결만 한다.
import type { ContentIssueView } from "@terra/shared/contentEdit";
import type { ItemEditorListResponse, ItemUsage } from "@terra/shared/itemEditor";
import { m } from "../../paraglide/messages.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { codeRefText, issueText } from "./itemMessages.ts";

type Named = ItemUsage["madeBy"][number];

function NamedList({ rows, locale }: { rows: readonly Named[]; locale: "ko" | "en" }) {
  if (rows.length === 0) return <p className="field-hint">{m.dev_items_none()}</p>;
  return (
    <ul className="ie-chips ie-chip-list">
      {rows.map((row) => (
        <li key={row.id} className="ie-chip" data-off={row.enabled ? undefined : ""}>
          {row.name[locale]} <span className="ie-dim">{row.id}</span>
        </li>
      ))}
    </ul>
  );
}

const issueLine = (issue: ContentIssueView): string =>
  `${issue.path ? `${issue.path}: ` : ""}${issueText(issue)}`;

export function ItemSide({
  usage,
  errors,
  advice,
  cascade,
  checking,
  list,
  locale,
  onSelect,
}: {
  /** 쓰는 곳(새 항목이면 null) */
  usage: ItemUsage | null;
  /** 이 아이템의 저장을 막는 문제(서버 검사) */
  errors: readonly ContentIssueView[];
  advice: readonly ContentIssueView[];
  /** 이 아이템을 끄면 함께 멈추는 것(묶음이 끌 때만) */
  cascade: { readonly recipes: readonly string[]; readonly necessities: readonly string[] } | null;
  checking: boolean;
  list: ItemEditorListResponse;
  locale: "ko" | "en";
  onSelect: (id: string) => void;
}) {
  const kinds = new Map(list.unitKinds.map((kind) => [kind.id, kind.name[locale]]));
  const skills = new Map(list.skills.map((skill) => [skill.id, skill.name[locale]]));
  const items = new Map(list.items.map((row) => [row.id, row.name[locale]]));
  return (
    <aside className="ie-panel ie-side" aria-label={m.dev_items_side_label()}>
      <section aria-labelledby="ie-check-title" className="ie-side-part" data-part="check">
        <h2 id="ie-check-title" className="ie-heading">
          {m.dev_items_check_title()}{" "}
          {checking ? <span className="ie-chip">{m.dev_items_checking()}</span> : null}
        </h2>
        {errors.length === 0 && advice.length === 0 ? (
          <p className="field-hint">{m.dev_items_check_clean()}</p>
        ) : null}
        {errors.length > 0 ? (
          <ul className="ie-plain ie-errors" aria-label={m.dev_items_errors_label()}>
            {errors.map((issue, index) => (
              <li key={`e-${issue.path ?? ""}-${index}`}>{issueLine(issue)}</li>
            ))}
          </ul>
        ) : null}
        {advice.length > 0 ? (
          <ul className="ie-plain ie-advice" aria-label={m.dev_items_advice_label()}>
            {advice.map((issue, index) => (
              <li key={`a-${issue.code ?? ""}-${index}`}>{issueLine(issue)}</li>
            ))}
          </ul>
        ) : null}
        {cascade && (cascade.recipes.length > 0 || cascade.necessities.length > 0) ? (
          <p className="ie-warn">
            {m.dev_items_cascade({
              recipes: cascade.recipes.join(", ") || "-",
              necessities: cascade.necessities.join(", ") || "-",
            })}
          </p>
        ) : null}
      </section>
      {usage ? (
        <section aria-labelledby="ie-usage-title" className="ie-side-part" data-part="usage">
          <h2 id="ie-usage-title" className="ie-heading">
            {m.dev_items_usage_title()}
          </h2>
          <h3 className="ie-subheading">{m.dev_items_usage_made_by()}</h3>
          <NamedList rows={usage.madeBy} locale={locale} />
          <h3 className="ie-subheading">{m.dev_items_usage_used_in()}</h3>
          <NamedList rows={usage.usedIn} locale={locale} />
          <h3 className="ie-subheading">{m.dev_items_usage_necessities()}</h3>
          <NamedList rows={usage.necessities} locale={locale} />
          {usage.spoilsFrom.length > 0 ? (
            <>
              <h3 className="ie-subheading">{m.dev_items_usage_spoils_from()}</h3>
              <div className="ie-chips">
                {usage.spoilsFrom.map((id) => (
                  <button key={id} type="button" className="button-small" onClick={() => onSelect(id)}>
                    {items.get(id) ?? id}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <h3 className="ie-subheading">{m.dev_items_usage_skills()}</h3>
          {usage.skills.length === 0 ? (
            <p className="field-hint">{m.dev_items_none()}</p>
          ) : (
            <p>
              {usage.skills.map((id) => skills.get(id) ?? id).join(", ")}{" "}
              <AppLink className="ie-link" to={{ route: "dev_skills" }}>
                {m.dev_items_open_skill_editor()}
              </AppLink>
            </p>
          )}
          <h3 className="ie-subheading">{m.dev_items_usage_wearers()}</h3>
          <p>
            {usage.wearers.length === 0
              ? m.dev_items_none()
              : usage.wearers.map((id) => kinds.get(id) ?? id).join(", ")}
          </p>
          <h3 className="ie-subheading">{m.dev_items_usage_presets()}</h3>
          {usage.presets.length === 0 ? (
            <p className="field-hint">{m.dev_items_none()}</p>
          ) : (
            <p>
              {usage.presets.join(", ")}{" "}
              <AppLink className="ie-link" to={{ route: "dev_balance" }}>
                {m.dev_items_open_balance()}
              </AppLink>
            </p>
          )}
          <h3 className="ie-subheading">{m.dev_items_usage_drops()}</h3>
          <p className="field-hint">{m.dev_items_usage_drops_none()}</p>
          {usage.codeRefs.length > 0 ? (
            <>
              <h3 className="ie-subheading">{m.dev_items_usage_code()}</h3>
              <ul className="ie-plain" data-part="code-refs">
                {usage.codeRefs.map((ref) => (
                  <li key={`${ref.where}-${ref.use}`}>
                    {codeRefText(ref.use)} <span className="ie-dim">{ref.where}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}
    </aside>
  );
}
