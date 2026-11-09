// 효과 사전 한 효과의 칸 전부(/dev/effects, docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-09)") — 아이템 편집기 [효과 사전] 탭
// (WP-6)에서 옮겼다. 구역(FormSection): 이름·종류(이름·종류·바꾸는 수치·값 방식·켜기), 지속·중첩, 상태이상·저항(상태이상만), 배타 묶음·상한,
// 쓰는 곳(아이템·스킬, 누르면 그 편집기에서 연다 — D-425 도감). 칸마다 path로 팩 값·지금 값과 견주고 되돌린다(CompareProvider는 편집 판).
// 1차 스탯 버프·배타 묶음(D-472)은 전투 판정이 아직 읽지 않는다고 칸에 적는다. 토큰만 쓴다.
import {
  EFFECT_COMBAT_STAT_IDS,
  EFFECT_KIND_IDS,
  EFFECT_LIMITS,
  EFFECT_PRIMARY_STAT_IDS,
  EFFECT_STATUS_IDS,
  type EffectJson,
  type EffectStatId,
  type EffectUsage,
  ITEM_LIMITS,
  ITEM_PRIMARY_CODES,
} from "@terra/shared/itemEditor";
import { m } from "../../paraglide/messages.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { effectKindText } from "../content/contentEditorEffects.tsx";
import { CheckField, NumberField, SelectField, TextField } from "../content/contentEditorFields.tsx";
import { FormSection } from "../content/contentEditorLayout.tsx";
import { CONTENT_ID_PATTERN } from "../content/contentEditorModel.ts";
import {
  PRIMARY_STAT_TEXT,
  effectStatText,
  effectStatusText,
  isPrimaryEffectStat,
} from "./effectDictionaryText.ts";
import { withKind, withText } from "./effectDictionaryModel.ts";

/** 구역 이름(바로 가기·시험 data-section). 상태이상 구역은 상태이상 효과에만 있다 */
export const EFFECT_SECTIONS = [
  { name: "basic", label: m.dev_effects_section_basic },
  { name: "time", label: m.dev_effects_section_time },
  { name: "status", label: m.dev_effects_section_status },
  { name: "rules", label: m.dev_effects_section_rules },
  { name: "usage", label: m.dev_effects_section_usage },
] as const;

/** 코드 칸(배타 묶음·상한 코드)이 ID 형식이 아니면 문구 */
const badId = (value: string | undefined): string | undefined =>
  value !== undefined && !CONTENT_ID_PATTERN.test(value) ? m.dev_items_new_id_invalid() : undefined;

/** 저항 처음 켤 때 값(입력 시작값. 값은 효과마다 편집기에서 정한다) */
const DEFAULT_RESIST = { cap: 500, halfConstant: 100, weights: [0, 0, 0, 0, 0, 0] } as const;

function StatusSection({ draft, onPut }: { draft: EffectJson; onPut: (next: EffectJson) => void }) {
  const L = EFFECT_LIMITS;
  const resist = draft.resist;
  return (
    <FormSection
      name="status"
      className="fx-section"
      title={m.dev_effects_section_status()}
      desc={m.dev_effects_section_status_desc()}
      source="D-429"
      paths={["status", "resist"]}
    >
      <div className="fx-grid">
        <SelectField
          label={m.dev_effects_field_status()}
          path="status"
          value={draft.status ?? "stun"}
          options={EFFECT_STATUS_IDS.map((value) => ({ value, label: effectStatusText(value) }))}
          onChange={(status) => onPut({ ...draft, status })}
        />
      </div>
      <CheckField
        label={m.dev_effects_resist_on()}
        checked={resist !== undefined}
        onChange={(on) => {
          const { resist: _drop, ...rest } = draft;
          onPut(on ? { ...rest, resist: { ...DEFAULT_RESIST, weights: [...DEFAULT_RESIST.weights] } } : rest);
        }}
      />
      {resist ? (
        <div className="fx-grid fx-grid-tight" data-part="resist">
          <NumberField
            label={m.dev_effects_field_resist_cap()}
            path="resist.cap"
            value={resist.cap}
            min={L.resistCap.min}
            max={L.resistCap.max}
            onChange={(cap) => onPut({ ...draft, resist: { ...resist, cap: cap ?? 0 } })}
          />
          <NumberField
            label={m.dev_effects_field_resist_half()}
            path="resist.halfConstant"
            value={resist.halfConstant}
            min={L.halfConstant.min}
            max={L.halfConstant.max}
            onChange={(halfConstant) =>
              onPut({ ...draft, resist: { ...resist, halfConstant: halfConstant ?? 1 } })
            }
          />
          {ITEM_PRIMARY_CODES.map((code, index) => (
            <NumberField
              key={code}
              label={m.dev_effects_field_resist_weight({ stat: PRIMARY_STAT_TEXT[code]() })}
              path={`resist.weights[${index}]`}
              value={resist.weights[index] ?? 0}
              min={L.weight.min}
              max={L.weight.max}
              onChange={(value) => {
                const weights = ITEM_PRIMARY_CODES.map((_, at) =>
                  at === index ? (value ?? 0) : (resist.weights[at] ?? 0),
                );
                onPut({ ...draft, resist: { ...resist, weights } });
              }}
            />
          ))}
        </div>
      ) : null}
    </FormSection>
  );
}

/** 쓰는 곳: 아이템·스킬마다 그 편집기에서 바로 여는 고리 */
function UsageSection({
  usage,
  itemNames,
  skillNames,
}: {
  usage: EffectUsage;
  itemNames: ReadonlyMap<string, string>;
  skillNames: ReadonlyMap<string, string>;
}) {
  const none = usage.items.length + usage.skills.length === 0;
  return (
    <FormSection
      name="usage"
      className="fx-section"
      title={m.dev_effects_section_usage()}
      desc={m.dev_effects_section_usage_desc()}
      source="D-425"
    >
      {none ? (
        <p className="field-hint">{m.dev_effects_usage_none()}</p>
      ) : (
        <dl className="fx-usage" data-part="effect-usage">
          <dt>{m.dev_effects_usage_items()}</dt>
          <dd>
            {usage.items.length === 0 ? "-" : null}
            {usage.items.map((item) => {
              const name = itemNames.get(item) ?? item;
              return (
                <AppLink
                  key={item}
                  className="fx-usage-link"
                  data-item={item}
                  aria-label={m.dev_effects_open_item({ name })}
                  to={{ route: "dev_items", search: { item } }}
                >
                  {name}
                </AppLink>
              );
            })}
          </dd>
          <dt>{m.dev_effects_usage_skills()}</dt>
          <dd>
            {usage.skills.length === 0 ? "-" : null}
            {usage.skills.map((skill) => {
              const name = skillNames.get(skill) ?? skill;
              return (
                <AppLink
                  key={skill}
                  className="fx-usage-link"
                  data-skill={skill}
                  aria-label={m.dev_effects_open_skill({ name })}
                  to={{ route: "dev_skills", search: { skill } }}
                >
                  {name}
                </AppLink>
              );
            })}
          </dd>
        </dl>
      )}
    </FormSection>
  );
}

export function EffectForm({
  draft,
  peers,
  usage,
  itemNames,
  skillNames,
  onPut,
}: {
  draft: EffectJson;
  /** 같은 배타 묶음의 다른 효과 이름 */
  peers: readonly string[];
  usage: EffectUsage;
  itemNames: ReadonlyMap<string, string>;
  skillNames: ReadonlyMap<string, string>;
  onPut: (next: EffectJson) => void;
}) {
  const L = EFFECT_LIMITS;
  const buff = draft.kind === "buff" || draft.kind === "debuff";
  return (
    <div className="fx-form" data-effect={draft.id}>
      <FormSection
        name="basic"
        className="fx-section"
        title={m.dev_effects_section_basic()}
        desc={m.dev_effects_section_basic_desc()}
        source="D-425"
        paths={["name", "kind", "stat", "valueMode", "enabled"]}
      >
        <div className="fx-grid">
          <TextField
            label={m.dev_items_field_name_ko()}
            path="name.ko"
            value={draft.name.ko}
            maxLength={ITEM_LIMITS.nameMax}
            onChange={(ko) => onPut({ ...draft, name: { ...draft.name, ko } })}
          />
          <TextField
            label={m.dev_items_field_name_en()}
            path="name.en"
            value={draft.name.en}
            maxLength={ITEM_LIMITS.nameMax}
            onChange={(en) => onPut({ ...draft, name: { ...draft.name, en } })}
          />
          <SelectField
            label={m.dev_effects_field_kind()}
            path="kind"
            value={draft.kind}
            options={EFFECT_KIND_IDS.map((value) => ({ value, label: effectKindText(value) }))}
            onChange={(kind) => onPut(withKind(draft, kind))}
          />
          {buff ? (
            <SelectField
              label={m.dev_effects_field_stat()}
              path="stat"
              value={draft.stat ?? "attack"}
              options={[
                ...EFFECT_COMBAT_STAT_IDS.map((value) => ({ value, label: effectStatText(value) })),
                ...EFFECT_PRIMARY_STAT_IDS.map((value) => ({
                  value,
                  label: m.dev_effects_primary_suffix({ stat: effectStatText(value) }),
                })),
              ]}
              onChange={(stat: EffectStatId) => onPut({ ...draft, stat })}
            />
          ) : null}
          <SelectField
            label={m.dev_effects_field_value_mode()}
            path="valueMode"
            value={draft.valueMode}
            options={[
              { value: "flat", label: m.dev_effects_value_flat() },
              { value: "permille", label: m.dev_effects_value_permille() },
            ]}
            onChange={(valueMode) => onPut({ ...draft, valueMode })}
          />
        </div>
        {buff && draft.stat && isPrimaryEffectStat(draft.stat) ? (
          <p className="field-hint fx-warn">{m.dev_effects_primary_hint()}</p>
        ) : null}
        <CheckField
          label={m.dev_items_field_enabled()}
          path="enabled"
          checked={draft.enabled}
          onChange={(enabled) => onPut({ ...draft, enabled })}
        />
      </FormSection>
      <FormSection
        name="time"
        className="fx-section"
        title={m.dev_effects_section_time()}
        desc={m.dev_effects_section_time_desc()}
        paths={["durationMs", "tickMs", "stacking", "maxStacks"]}
      >
        <div className="fx-grid">
          <NumberField
            label={m.dev_effects_field_duration()}
            path="durationMs"
            value={draft.durationMs}
            min={L.durationMs.min}
            max={L.durationMs.max}
            onChange={(durationMs) => onPut({ ...draft, durationMs: durationMs ?? 0 })}
          />
          <NumberField
            label={m.dev_effects_field_tick()}
            path="tickMs"
            value={draft.tickMs}
            min={L.tickMs.min}
            max={L.tickMs.max}
            onChange={(tickMs) => onPut({ ...draft, tickMs: tickMs ?? 0 })}
          />
          <SelectField
            label={m.dev_effects_field_stacking()}
            path="stacking"
            value={draft.stacking}
            options={[
              { value: "refresh", label: m.dev_items_stacking_refresh() },
              { value: "stack", label: m.dev_items_stacking_stack() },
              { value: "ignore", label: m.dev_items_stacking_ignore() },
            ]}
            onChange={(stacking) => onPut({ ...draft, stacking })}
          />
          <NumberField
            label={m.dev_effects_field_max_stacks()}
            path="maxStacks"
            value={draft.maxStacks}
            min={L.maxStacks.min}
            max={L.maxStacks.max}
            onChange={(maxStacks) => onPut({ ...draft, maxStacks: maxStacks ?? 1 })}
          />
        </div>
      </FormSection>
      {draft.kind === "status" ? <StatusSection draft={draft} onPut={onPut} /> : null}
      <FormSection
        name="rules"
        className="fx-section"
        title={m.dev_effects_section_rules()}
        desc={m.dev_effects_exclusive_hint()}
        source="D-472"
        paths={["exclusive", "capCode"]}
      >
        <div className="fx-grid">
          <TextField
            label={m.dev_effects_field_exclusive()}
            path="exclusive"
            value={draft.exclusive ?? ""}
            maxLength={48}
            problem={badId(draft.exclusive)}
            onChange={(value) => onPut(withText(draft, "exclusive", value))}
          />
          <TextField
            label={m.dev_effects_field_cap_code()}
            path="capCode"
            value={draft.capCode ?? ""}
            maxLength={48}
            problem={badId(draft.capCode)}
            onChange={(value) => onPut(withText(draft, "capCode", value))}
          />
        </div>
        {peers.length > 0 ? (
          <p className="field-hint">{m.dev_effects_exclusive_peers({ list: peers.join(", ") })}</p>
        ) : null}
      </FormSection>
      <UsageSection usage={usage} itemNames={itemNames} skillNames={skillNames} />
    </div>
  );
}
