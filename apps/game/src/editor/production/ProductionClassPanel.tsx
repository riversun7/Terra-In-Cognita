// 전투 클래스 탭 — 기획 D-529(옛 35 클래스 그대로: 2스탯 조합 15 + 3스탯 조합 20, 범용). 스탯 조합마다 이름(ko·en)·주요 역할·설명을 고친다.
// 조합 스탯과 분류 규칙(S3 ÷ S1 문턱)은 여기서 바꾸지 않는다: 문턱은 설정 칸(class_three_stat_pm·class_generalist_pm).
// 아래 "분류 미리 보기"는 유닛 정보의 추천과 같은 함수다(@terra/shared/unitGuide recommendCombatClass). 추천은 표시만 한다(규칙 효과 없음).
import {
  type BuildingEditorCombatClass,
  COMBAT_CLASS_LIMITS,
  type CombatClassJson,
} from "@terra/shared/buildingEditor";
import { PRIMARY_STATS, type PrimaryStat } from "@terra/shared/roster";
import { type CombatClassRule, type GuideStats, recommendCombatClass } from "@terra/shared/unitGuide";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { NumberField, TextField } from "../content/contentEditorFields.tsx";
import { Badge } from "../content/contentEditorLayout.tsx";
import { type ProductionStage, draftOf } from "./productionModel.ts";
import { CLASS_GROUP_TEXT, STAT_CODE } from "./productionText.ts";

const comboText = (stats: readonly PrimaryStat[]): string =>
  stats.length === 0 ? m.dev_prod_class_even() : stats.map((stat) => STAT_CODE[stat]()).join(" + ");

const KIND_OF = (entry: CombatClassJson): "two" | "three" | "generalist" =>
  entry.stats.length === 2 ? "two" : entry.stats.length === 3 ? "three" : "generalist";

const START_STATS: GuideStats = { str: 40, vit: 30, int: 5, wis: 5, dex: 10, agi: 5 };

export function ProductionClassPanel({
  classes,
  rule,
  stage,
  locale,
  onEdit,
  onRevert,
  onUnstage,
}: {
  classes: readonly BuildingEditorCombatClass[];
  rule: CombatClassRule;
  stage: ProductionStage;
  locale: "ko" | "en";
  onEdit: (row: BuildingEditorCombatClass, entry: CombatClassJson) => void;
  onRevert: (row: BuildingEditorCombatClass) => void;
  onUnstage: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [stats, setStats] = useState<GuideStats>(START_STATS);
  const drafts = classes.map((row) => ({ row, draft: draftOf(row, stage.classes.get(row.entry.id)) }));
  const current = drafts.find((item) => item.row.entry.id === selected) ?? drafts[0];
  const pick = recommendCombatClass(
    stats,
    drafts.map((item) => item.draft),
    rule,
  );
  const sections = [
    {
      kind: "two",
      title: m.dev_prod_class_two({ count: drafts.filter((d) => KIND_OF(d.draft) === "two").length }),
    },
    {
      kind: "three",
      title: m.dev_prod_class_three({ count: drafts.filter((d) => KIND_OF(d.draft) === "three").length }),
    },
    { kind: "generalist", title: m.dev_prod_class_generalist() },
  ] as const;
  const text = (
    row: BuildingEditorCombatClass,
    draft: CombatClassJson,
    key: "name" | "role" | "desc",
    lang: "ko" | "en",
    value: string,
  ): void => {
    const before = draft[key] ?? { ko: "", en: "" };
    const next = { ...before, [lang]: value };
    if (key === "role" && next.ko === "" && next.en === "") {
      const { role: _old, ...rest } = draft;
      onEdit(row, rest);
      return;
    }
    onEdit(row, { ...draft, [key]: next });
  };
  return (
    <div className="pd-classes">
      <section className="ce-panel pd-section" aria-labelledby="pd-class-rule-title">
        <h2 id="pd-class-rule-title" className="ce-panel-title">
          {m.dev_prod_class_rule_title()}
        </h2>
        <p className="field-hint">
          {m.dev_prod_class_rule({ three: rule.threeStatPm, generalist: rule.generalistPm })}{" "}
          <AppLink to={{ route: "dev_tuning" }} className="pd-link">
            {m.dev_prod_class_open_tuning()}
          </AppLink>
        </p>
        <div className="pd-fields pd-class-try" role="group" aria-label={m.dev_prod_class_try_label()}>
          {PRIMARY_STATS.map((stat) => (
            <NumberField
              key={stat}
              label={STAT_CODE[stat]()}
              className={`pd-try-${stat}`}
              value={stats[stat]}
              min={0}
              max={300}
              slider={false}
              onChange={(value) => setStats({ ...stats, [stat]: value ?? 0 })}
            />
          ))}
        </div>
        <p
          className="pd-class-result"
          role="status"
          data-kind={pick.shape.kind}
          data-class={pick.entry?.id ?? ""}
        >
          {pick.entry
            ? m.dev_prod_class_try_result({
                name: pick.entry.name[locale],
                combo: comboText(pick.entry.stats),
              })
            : m.dev_prod_class_try_none()}
        </p>
      </section>
      <div className="pd-class-split">
        <div className="pd-class-lists">
          {sections.map((section) => (
            <section key={section.kind} className="ce-panel pd-section" aria-label={section.title}>
              <h2 className="ce-panel-title">{section.title}</h2>
              <ul className="pd-class-list" data-kind={section.kind}>
                {drafts
                  .filter((item) => KIND_OF(item.draft) === section.kind)
                  .map(({ row, draft }) => (
                    <li key={draft.id}>
                      <button
                        type="button"
                        className="pd-class-item"
                        aria-pressed={current?.row.entry.id === draft.id}
                        data-class={draft.id}
                        data-staged={stage.classes.has(draft.id) ? "" : undefined}
                        onClick={() => setSelected(draft.id)}
                      >
                        <code className="dev-code" translate="no">
                          {comboText(draft.stats)}
                        </code>
                        <span className="pd-class-name">{draft.name[locale]}</span>
                        {draft.group ? (
                          <span className="pd-muted">{CLASS_GROUP_TEXT[draft.group]()}</span>
                        ) : null}
                        {stage.classes.has(draft.id) ? (
                          <Badge tone="staged">{m.dev_buildings_state_staged()}</Badge>
                        ) : row.origin === "edited" ? (
                          <Badge tone="changed">{m.dev_prod_origin_edited()}</Badge>
                        ) : null}
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
        {current ? (
          <section
            className="ce-panel pd-section pd-class-form"
            aria-labelledby="pd-class-form-title"
            data-class={current.draft.id}
          >
            <div className="pd-head">
              <h2 id="pd-class-form-title" className="pd-head-title">
                {current.draft.name[locale]}
              </h2>
              <code className="dev-code" translate="no">
                {current.draft.id} · {comboText(current.draft.stats)}
              </code>
              <span className="ce-inline-actions pd-head-actions">
                {stage.classes.has(current.draft.id) ? (
                  <button
                    type="button"
                    className="button-small pd-unstage"
                    onClick={() => onUnstage(current.draft.id)}
                  >
                    {m.dev_prod_unstage()}
                  </button>
                ) : null}
                {current.row.origin === "edited" ? (
                  <button
                    type="button"
                    className="button-small pd-revert"
                    onClick={() => onRevert(current.row)}
                  >
                    {m.dev_prod_revert()}
                  </button>
                ) : null}
              </span>
            </div>
            <div className="pd-fields">
              <TextField
                label={m.dev_prod_class_name_ko()}
                className="pd-class-name-ko"
                value={current.draft.name.ko}
                maxLength={COMBAT_CLASS_LIMITS.nameMax}
                onChange={(value) => text(current.row, current.draft, "name", "ko", value)}
              />
              <TextField
                label={m.dev_prod_class_name_en()}
                className="pd-class-name-en"
                value={current.draft.name.en}
                maxLength={COMBAT_CLASS_LIMITS.nameMax}
                onChange={(value) => text(current.row, current.draft, "name", "en", value)}
              />
              <TextField
                label={m.dev_prod_class_role_ko()}
                className="pd-class-role-ko"
                value={current.draft.role?.ko ?? ""}
                maxLength={COMBAT_CLASS_LIMITS.textMax}
                onChange={(value) => text(current.row, current.draft, "role", "ko", value)}
              />
              <TextField
                label={m.dev_prod_class_role_en()}
                className="pd-class-role-en"
                value={current.draft.role?.en ?? ""}
                maxLength={COMBAT_CLASS_LIMITS.textMax}
                onChange={(value) => text(current.row, current.draft, "role", "en", value)}
              />
            </div>
            <TextField
              label={m.dev_prod_class_desc_ko()}
              className="pd-class-desc-ko"
              value={current.draft.desc.ko}
              maxLength={COMBAT_CLASS_LIMITS.textMax}
              onChange={(value) => text(current.row, current.draft, "desc", "ko", value)}
            />
            <TextField
              label={m.dev_prod_class_desc_en()}
              className="pd-class-desc-en"
              value={current.draft.desc.en}
              maxLength={COMBAT_CLASS_LIMITS.textMax}
              onChange={(value) => text(current.row, current.draft, "desc", "en", value)}
            />
            <p className="field-hint">{m.dev_prod_class_form_note()}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
