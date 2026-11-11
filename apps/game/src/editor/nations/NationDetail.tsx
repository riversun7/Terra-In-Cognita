// 시작 국가 설정 편집 판 — 국가 하나: 미리 보기 · 정체성(이름·약어·색·지도자·국가 마크) · 화폐 · 시작 조건 · 인구·유닛 · 성격.
// 칸은 공용 입력 칸(contentEditorFields)에 path를 줘 팩 값·지금 값과 견준다. 고친 값은 바로 담긴다(실효 값과 같아지면 빠진다).
// docs/adr/2026-11-10-nation-editor.md
import type { ContentIssueView } from "@terra/shared/contentEdit";
import { NAME_STYLE_IDS, type NameStyleId, tickerCandidates } from "@terra/shared/nameGen";
import { isPowerTier } from "@terra/shared/nationTier";
import {
  NATION_LIST_LIMITS,
  NATION_SEED_LIMITS,
  type NationEditorListResponse,
  type NationEditorRow,
  type NationPresetJson,
} from "@terra/shared/nationEditor";
import { m } from "../../paraglide/messages.js";
import { CompareProvider } from "../content/contentEditorCompare.tsx";
import { NumberField, SelectField, TextField } from "../content/contentEditorFields.tsx";
import { Badge, EntryHead, FormSection, SectionJump } from "../content/contentEditorLayout.tsx";
import { NationEmblemPanel } from "./NationEmblemPanel.tsx";
import { NameGenerator } from "./NationNameGen.tsx";
import { NameListField } from "./NationNameList.tsx";
import { NationPreview } from "./NationPreview.tsx";
import { NationPeopleSection, NationStartSection, NationTraitsSection } from "./NationStartSections.tsx";
import { READABLE_COLORS, colorOf, colorReadability, isNationJson } from "./nationModel.ts";
import { ORIGIN_TEXT, STYLE_TEXT, nationIssueText, nationIssueWhere } from "./nationText.ts";

const SECTIONS = ["identity", "currency", "start", "people", "traits"] as const;

export function NationDetail({
  list,
  row,
  draft,
  locale,
  staged,
  reverting,
  issues,
  busy,
  onEdit,
  onRevert,
  onUnstage,
  onBack,
  onPrev,
  onNext,
  onUpload,
  onRemoveUpload,
}: {
  list: NationEditorListResponse;
  row: NationEditorRow;
  draft: NationPresetJson;
  locale: "ko" | "en";
  staged: boolean;
  reverting: boolean;
  issues: readonly ContentIssueView[];
  busy: boolean;
  onEdit: (next: NationPresetJson) => void;
  onRevert: () => void;
  onUnstage: () => void;
  onBack: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onUpload: (pngBase64: string) => Promise<boolean>;
  onRemoveUpload: () => void;
}) {
  const style: NameStyleId = draft.nameStyle ?? "prairie";
  const others = list.nations.filter((item) => item.entry.id !== draft.id);
  const takenTickers = new Set(others.flatMap((item) => item.entry.currency.ticker ?? []));
  const takenShorts = new Set(others.flatMap((item) => item.entry.shortName?.toUpperCase() ?? []));
  const tickers = tickerCandidates(draft.currency.name.en, takenTickers, 4);
  const shorts = tickerCandidates(draft.name.en, takenShorts, 4);
  const readable = colorReadability(colorOf(draft));
  const problemOf = (path: string): string | undefined => {
    const found = issues.find(
      (issue) => issue.level === "error" && issue.id === draft.id && issue.path?.startsWith(path),
    );
    return found ? nationIssueText(found) : undefined;
  };
  const sectionTitles: Record<(typeof SECTIONS)[number], string> = {
    identity: m.dev_nations_section_identity(),
    currency: m.dev_nations_section_currency(),
    start: m.dev_nations_section_start(),
    people: m.dev_nations_section_people(),
    traits: m.dev_nations_section_traits(),
  };
  const seed = (field: string): string => `${draft.id}:${field}`;

  return (
    <CompareProvider
      source={{
        draft,
        current: row.entry,
        pack: row.pack,
        apply: (next) => {
          if (isNationJson(next)) onEdit(next);
        },
        problemOf,
        locked: reverting,
      }}
    >
      <article className="ne-detail" aria-labelledby="ne-detail-title" data-nation={draft.id}>
        <EntryHead
          name={draft.name[locale]}
          id={draft.id}
          headingId="ne-detail-title"
          backClass="ne-back"
          onBack={onBack}
          onPrev={onPrev}
          onNext={onNext}
          badges={
            <>
              <Badge tone={row.origin === "pack" ? "plain" : "changed"}>{ORIGIN_TEXT[row.origin]()}</Badge>
              {staged ? <Badge tone="staged">{m.dev_nations_badge_staged()}</Badge> : null}
              {row.slot === null ? (
                <Badge tone="off">{m.dev_nations_slot_none()}</Badge>
              ) : (
                <Badge tone="plain">{m.dev_nations_slot({ slot: row.slot })}</Badge>
              )}
            </>
          }
          info={
            row.override ? (
              <span>
                {m.dev_nations_override_by({
                  who: row.override.updatedBy ?? "?",
                  when: new Date(row.override.updatedAt).toLocaleString(locale),
                })}
              </span>
            ) : null
          }
          actions={
            <>
              {row.origin !== "pack" && !reverting ? (
                <button type="button" className="button-small ne-revert" onClick={onRevert}>
                  {m.dev_buildings_revert()}
                </button>
              ) : null}
              {staged ? (
                <button type="button" className="button-small ne-unstage" onClick={onUnstage}>
                  {m.dev_buildings_unstage()}
                </button>
              ) : null}
            </>
          }
          nav={<SectionJump sections={SECTIONS.map((name) => ({ name, label: sectionTitles[name] }))} />}
        />
        {reverting ? <p className="field-hint ne-reverting">{m.dev_nations_reverting()}</p> : null}
        {issues.length > 0 ? (
          <ul className="ne-issues" aria-label={m.dev_nations_issues_label()}>
            {issues.map((issue) => (
              <li
                key={`${issue.id}:${issue.path}:${issue.code}`}
                className={issue.level === "error" ? "field-error" : "field-hint"}
              >
                <code className="dev-code">{nationIssueWhere(issue)}</code> {nationIssueText(issue)}
              </li>
            ))}
          </ul>
        ) : null}
        <NationPreview
          entry={draft}
          uploaded={row.uploaded?.hash ?? null}
          defaults={list.defaults}
          tiers={list.tiers.map((item) => item.entry)}
          locale={locale}
        />

        <FormSection
          name="identity"
          title={sectionTitles.identity}
          desc={m.dev_nations_section_identity_desc()}
          source="D-076 · D-5046"
          paths={["name", "shortName", "color", "leaderName", "intro", "emblem", "nameStyle", "powerTier"]}
        >
          <div className="ne-grid">
            <TextField
              label={m.dev_nations_field_name_ko()}
              value={draft.name.ko}
              maxLength={NATION_LIST_LIMITS.nameLength}
              onChange={(ko) => onEdit({ ...draft, name: { ...draft.name, ko } })}
              path="name.ko"
            />
            <TextField
              label={m.dev_nations_field_name_en()}
              value={draft.name.en}
              maxLength={NATION_LIST_LIMITS.nameLength}
              onChange={(en) => onEdit({ ...draft, name: { ...draft.name, en } })}
              path="name.en"
            />
            <SelectField
              label={m.dev_nations_field_style()}
              value={style}
              options={NAME_STYLE_IDS.map((value) => ({ value, label: STYLE_TEXT[value]() }))}
              onChange={(nameStyle) => onEdit({ ...draft, nameStyle })}
              desc={m.dev_nations_field_style_desc()}
              path="nameStyle"
            />
            <SelectField
              label={m.dev_nations_field_tier()}
              value={draft.powerTier ?? ""}
              options={[
                { value: "", label: m.dev_nations_tier_none() },
                ...list.tiers.map((item) => ({ value: item.entry.id, label: item.entry.name[locale] })),
              ]}
              onChange={(value) => {
                const { powerTier: _old, ...rest } = draft;
                onEdit(isPowerTier(value) ? { ...rest, powerTier: value } : rest);
              }}
              desc={m.dev_nations_field_tier_desc()}
              path="powerTier"
            />
          </div>
          <NameGenerator
            style={style}
            kind="nation"
            seedKey={seed("nation")}
            label={m.dev_nations_namegen_nation()}
            onPick={([name]) => {
              if (name) onEdit({ ...draft, name: { ko: name.ko, en: name.en } });
            }}
          />
          <div className="ne-grid">
            <TextField
              label={m.dev_nations_field_short()}
              value={draft.shortName ?? ""}
              maxLength={5}
              onChange={(shortName) => onEdit({ ...draft, shortName })}
              desc={m.dev_nations_field_short_desc()}
              hint={shorts.length > 0 ? m.dev_nations_suggest({ list: shorts.join(" · ") }) : undefined}
              path="shortName"
            />
            <TextField
              label={m.dev_nations_field_leader_ko()}
              value={draft.leaderName?.ko ?? ""}
              maxLength={NATION_LIST_LIMITS.nameLength}
              onChange={(ko) => onEdit({ ...draft, leaderName: { ko, en: draft.leaderName?.en ?? "" } })}
              path="leaderName.ko"
            />
            <TextField
              label={m.dev_nations_field_leader_en()}
              value={draft.leaderName?.en ?? ""}
              maxLength={NATION_LIST_LIMITS.nameLength}
              onChange={(en) => onEdit({ ...draft, leaderName: { ko: draft.leaderName?.ko ?? "", en } })}
              path="leaderName.en"
            />
          </div>
          <NameGenerator
            style={style}
            kind="leader"
            seedKey={seed("leader")}
            label={m.dev_nations_namegen_leader()}
            onPick={([name]) => {
              if (name) onEdit({ ...draft, leaderName: { ko: name.ko, en: name.en } });
            }}
          />
          {/* 한 줄 소개(첫 접속 나라 고르기 카드, 2026-11-11 — [임시] 글, 실제 나라·인물 금지) */}
          <div className="ne-grid">
            <TextField
              label={m.dev_nations_field_intro_ko()}
              value={draft.intro?.ko ?? ""}
              maxLength={NATION_LIST_LIMITS.introLength}
              onChange={(ko) => onEdit({ ...draft, intro: { ko, en: draft.intro?.en ?? "" } })}
              desc={m.dev_nations_field_intro_desc()}
              path="intro.ko"
            />
            <TextField
              label={m.dev_nations_field_intro_en()}
              value={draft.intro?.en ?? ""}
              maxLength={NATION_LIST_LIMITS.introLength}
              onChange={(en) => onEdit({ ...draft, intro: { ko: draft.intro?.ko ?? "", en } })}
              path="intro.en"
            />
          </div>
          <fieldset className="ne-color" data-readable={readable.ok ? "yes" : "no"}>
            <legend className="field-label">{m.dev_nations_field_color()}</legend>
            <div className="ne-swatches" role="group" aria-label={m.dev_nations_color_palette()}>
              {READABLE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="ne-swatch"
                  style={{ background: color }}
                  aria-label={color}
                  aria-pressed={draft.color === color}
                  title={color}
                  onClick={() => onEdit({ ...draft, color })}
                />
              ))}
            </div>
            <TextField
              label={m.dev_nations_field_color_hex()}
              value={draft.color ?? ""}
              maxLength={7}
              onChange={(color) => onEdit({ ...draft, color: color.toLowerCase() })}
              hint={m.dev_nations_color_contrast({
                light: readable.onLight.toFixed(1),
                dark: readable.onDark.toFixed(1),
              })}
              problem={readable.ok ? undefined : m.dev_nations_color_warn()}
              path="color"
            />
          </fieldset>
          <h4 className="ne-subtitle">{m.dev_nations_emblem_title()}</h4>
          <NationEmblemPanel
            entry={draft}
            row={row}
            locked={reverting}
            canUpload={list.worldTools}
            busy={busy}
            onEdit={onEdit}
            onUpload={onUpload}
            onRemoveUpload={onRemoveUpload}
          />
        </FormSection>

        <FormSection
          name="currency"
          title={sectionTitles.currency}
          desc={m.dev_nations_section_currency_desc()}
          source="D-124 · D-131"
          paths={["currency"]}
        >
          <div className="ne-grid">
            <div className="ne-locked">
              <span className="field-label">{m.dev_nations_field_currency_code()}</span>
              <code className="dev-code" translate="no">
                {draft.currency.code}
              </code>
              <p className="field-hint">{m.dev_nations_field_currency_code_hint()}</p>
            </div>
            <TextField
              label={m.dev_nations_field_currency_ko()}
              value={draft.currency.name.ko}
              maxLength={NATION_LIST_LIMITS.nameLength}
              onChange={(ko) =>
                onEdit({ ...draft, currency: { ...draft.currency, name: { ...draft.currency.name, ko } } })
              }
              path="currency.name.ko"
            />
            <TextField
              label={m.dev_nations_field_currency_en()}
              value={draft.currency.name.en}
              maxLength={NATION_LIST_LIMITS.nameLength}
              onChange={(en) =>
                onEdit({ ...draft, currency: { ...draft.currency, name: { ...draft.currency.name, en } } })
              }
              path="currency.name.en"
            />
            <TextField
              label={m.dev_nations_field_symbol()}
              value={draft.currency.symbol ?? ""}
              maxLength={3}
              onChange={(symbol) => onEdit({ ...draft, currency: { ...draft.currency, symbol } })}
              desc={m.dev_nations_field_symbol_desc()}
              path="currency.symbol"
            />
            <TextField
              label={m.dev_nations_field_ticker()}
              value={draft.currency.ticker ?? ""}
              maxLength={3}
              onChange={(ticker) =>
                onEdit({ ...draft, currency: { ...draft.currency, ticker: ticker.toUpperCase() } })
              }
              desc={m.dev_nations_field_ticker_desc()}
              hint={tickers.length > 0 ? m.dev_nations_suggest({ list: tickers.join(" · ") }) : undefined}
              path="currency.ticker"
            />
            <NumberField
              label={m.dev_nations_field_trade_tax()}
              value={draft.tradeTaxBp}
              min={NATION_SEED_LIMITS.tradeTaxBp.min}
              max={NATION_SEED_LIMITS.tradeTaxBp.max}
              unit="bp"
              onChange={(value) => {
                if (value !== undefined) onEdit({ ...draft, tradeTaxBp: value });
              }}
              desc={m.dev_nations_field_trade_tax_desc()}
              path="tradeTaxBp"
            />
          </div>
          <NameGenerator
            style={style}
            kind="currency"
            seedKey={seed("currency")}
            label={m.dev_nations_namegen_currency()}
            onPick={([name]) => {
              if (name)
                onEdit({ ...draft, currency: { ...draft.currency, name: { ko: name.ko, en: name.en } } });
            }}
          />
        </FormSection>

        <NationStartSection
          title={sectionTitles.start}
          draft={draft}
          list={list}
          locale={locale}
          onEdit={onEdit}
          names={
            <NameListField
              title={m.dev_nations_field_city_names()}
              names={draft.cityNames ?? []}
              max={NATION_LIST_LIMITS.cityNames}
              maxLength={NATION_LIST_LIMITS.cityNameLength}
              style={style}
              kind="city"
              seedKey={seed("city")}
              hint={m.dev_nations_field_city_names_hint()}
              problem={problemOf("cityNames")}
              dataKey="cityNames"
              onChange={(cityNames) => onEdit({ ...draft, cityNames })}
            />
          }
        />
        <NationPeopleSection
          title={sectionTitles.people}
          draft={draft}
          list={list}
          onEdit={onEdit}
          names={
            <>
              <NameListField
                title={m.dev_nations_field_given()}
                names={draft.humanNames?.given ?? []}
                max={NATION_LIST_LIMITS.humanNames}
                maxLength={NATION_LIST_LIMITS.humanNameLength}
                style={style}
                kind="given"
                seedKey={seed("given")}
                hint={m.dev_nations_field_human_names_hint()}
                problem={problemOf("humanNames.given")}
                dataKey="given"
                onChange={(given) =>
                  onEdit({ ...draft, humanNames: { given, family: draft.humanNames?.family ?? [] } })
                }
              />
              <NameListField
                title={m.dev_nations_field_family()}
                names={draft.humanNames?.family ?? []}
                max={NATION_LIST_LIMITS.humanNames}
                maxLength={NATION_LIST_LIMITS.humanNameLength}
                style={style}
                kind="family"
                seedKey={seed("family")}
                problem={problemOf("humanNames.family")}
                dataKey="family"
                onChange={(family) =>
                  onEdit({ ...draft, humanNames: { given: draft.humanNames?.given ?? [], family } })
                }
              />
            </>
          }
        />
        <NationTraitsSection
          title={sectionTitles.traits}
          draft={draft}
          list={list}
          locale={locale}
          onEdit={onEdit}
        />
      </article>
    </CompareProvider>
  );
}
