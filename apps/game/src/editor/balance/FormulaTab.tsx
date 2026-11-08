// 계산식 탭(밸런스 화면 /dev/balance 안) — docs/adr/2026-11-01-formula-editor.md "화면", 사용자 결정 D-488.
// 2차 스탯 행 식과 전투 식을 글로 고친다: 이름 자동 완성, 오류 위치, 모르는 이름은 저장 전에 알림(오타 막기), 표본 유닛의 결과·항마다
// 풀이·1차 스탯별 영향(비중·+10 차이), 무기마다 적정치·기본 공격 스태미나(D-511). [담기]한 식은 [적용]으로 설정 칸 묶음(tuning.save formulas)에 실어 보낸다
// (서버가 같은 해석기로 다시 검사하고 감사 기록·세계 설정 판을 남긴다). 판 충돌이면 목록을 다시 받고 담은 식은 남긴다.
// 이 탭은 혼자 서는 부품이다: 밸런스 화면 TABS의 [계산식] 줄이 <FormulaTab />로 그린다(진입 조각 BalancePanelScreen-* 안, 미리 캐시 밖).
// 시험용 data-*: data-status(loading·ready·failed), data-revision, 칸 단추 data-slot.
import {
  type FormulaListResponse,
  type FormulaSlotView,
  type FormulaWeaponView,
} from "@terra/shared/formula";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { api } from "../../net/api.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";
import { FormulaEditor } from "./FormulaEditor.tsx";
import { AppropriateTable, PreviewPanel } from "./FormulaPreview.tsx";
import { errorText } from "./balanceMessages.ts";
import { balanceErrorOf } from "./balanceModel.ts";
import {
  type FormulaDrafts,
  checkSource,
  defaultWeapon,
  formulaChangesOf,
  previewOf,
  pruneDrafts,
  sampleBareAppropriateOf,
  sampleStaminaOf,
  slotDefOf,
  sourceOf,
} from "./formulaModel.ts";
import { issueText, sampleText, unitText } from "./formulaMessages.ts";
import { StaminaTable } from "./StaminaTable.tsx";
import "./formulaTab.css";

type Load =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly list: FormulaListResponse }
  | { readonly status: "failed"; readonly message: string };

/** 칸 이름(지금 언어) */
const slotName = (slot: FormulaSlotView, locale: string): string =>
  locale === "en" ? slot.name.en : slot.name.ko;

export default function FormulaTab() {
  const locale = getLocale();
  const sampleId = useId();
  const weaponId = useId();
  const slotId = useId();
  const noteId = useId();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [slotKey, setSlotKey] = useState<string>("");
  const [sample, setSample] = useState("new_lv1");
  const [weapon, setWeapon] = useState("");
  const [drafts, setDrafts] = useState<FormulaDrafts>(new Map());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const notice = useLiveLines();
  const problem = useLiveLines();

  const reload = useCallback((): Promise<FormulaListResponse | null> => {
    return api.formulas.list.query().then(
      (list) => {
        setLoad({ status: "ready", list });
        return list;
      },
      (error: unknown) => {
        const info = balanceErrorOf(error);
        if (info.sessionEnded) void refreshSession();
        setLoad({ status: "failed", message: errorText(info.key) });
        return null;
      },
    );
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const list = load.status === "ready" ? load.list : null;
  const slot = list ? (list.slots.find((item) => item.key === slotKey) ?? list.slots[0]) : undefined;
  const weaponView = list
    ? (list.weapons.find((item) => item.id === weapon) ?? defaultWeapon(list))
    : undefined;
  const sampleView = list ? (list.samples.find((item) => item.id === sample) ?? list.samples[0]) : undefined;

  const weaponName = (item: FormulaWeaponView): string =>
    item.natural === null
      ? locale === "en"
        ? item.name.en
        : item.name.ko
      : item.unarmed
        ? m.dev_formula_weapon_bare({ kind: item.natural })
        : m.dev_formula_weapon_natural({ kind: item.natural });

  const stage = (key: string, source: string | null): void => {
    setDrafts((previous) => new Map(previous).set(key, source));
    problem.clear();
  };
  const unstage = (key: string): void => {
    setDrafts((previous) => {
      const next = new Map(previous);
      next.delete(key);
      return next;
    });
  };

  /** 담은 식을 한 묶음(tuning.save)으로 보낸다 */
  const apply = async (): Promise<void> => {
    if (!list || busy || drafts.size === 0) return;
    setBusy(true);
    problem.clear();
    try {
      const saved = await api.tuning.save.mutate({
        expectedRevision: list.revision,
        changes: [],
        formulas: formulaChangesOf(drafts),
        note: note.trim() === "" ? null : note,
      });
      notice.show([m.dev_formula_applied({ count: drafts.size, revision: saved.revision })]);
      setDrafts(new Map());
      setNote("");
      await reload();
    } catch (error: unknown) {
      const info = balanceErrorOf(error);
      if (info.sessionEnded) void refreshSession();
      problem.show([errorText(info.key)]);
      if (info.key === "revision_conflict") {
        const fresh = await reload();
        if (fresh) setDrafts((previous) => pruneDrafts(previous, fresh));
        problem.show([m.dev_formula_reloaded()]);
      }
    } finally {
      setBusy(false);
    }
  };

  const overrides = list ? list.slots.filter((item) => item.override !== null).length : 0;
  const statSlots = list ? list.slots.filter((item) => item.group === "stat") : [];
  const combatSlots = list ? list.slots.filter((item) => item.group === "combat") : [];

  return (
    <section
      className="fx-tab"
      aria-labelledby={`${slotId}-title`}
      data-density="compact"
      data-status={load.status}
      data-revision={list?.revision}
    >
      {/* 탭 단추가 같은 이름을 보이므로 제목은 읽는 이름으로만 둔다(다른 탭처럼 안내 글부터 보인다) */}
      <h2 id={`${slotId}-title`} className="visually-hidden">
        {m.dev_formula_tab()}
      </h2>
      <p className="lead fx-lead">{m.dev_formula_lead()}</p>
      {load.status === "loading" ? <p className="field-hint">{m.dev_formula_loading()}</p> : null}
      {load.status === "failed" ? (
        <div className="fx-failed">
          <p role="alert" className="field-error">
            {load.message}
          </p>
          <button type="button" className="button-small" onClick={() => void reload()}>
            {m.dev_formula_retry()}
          </button>
        </div>
      ) : null}
      {list && slot && weaponView && sampleView ? (
        <>
          <ul className="fx-summary">
            <li className="fx-revision">{m.dev_formula_revision({ revision: list.revision })}</li>
            <li className="fx-overrides" data-count={overrides}>
              {m.dev_formula_overrides({ count: overrides })}
            </li>
            <li className="fx-staged" data-count={drafts.size}>
              {m.dev_formula_staged({ count: drafts.size })}
            </li>
          </ul>
          <LiveMessage tone="success" lines={notice.lines} version={notice.version} />

          <div className="fx-controls">
            <div className="field">
              <label className="field-label" htmlFor={slotId}>
                {m.dev_formula_pick()}
              </label>
              <select
                id={slotId}
                className="fx-slot-select"
                value={slot.key}
                onChange={(event) => setSlotKey(event.target.value)}
              >
                <optgroup label={m.dev_formula_group_stat()}>
                  {statSlots.map((item) => (
                    <option key={item.key} value={item.key} data-slot={item.key}>
                      {slotName(item, locale)}
                      {drafts.has(item.key) ? ` · ${m.dev_formula_badge_staged()}` : ""}
                      {item.override ? ` · ${m.dev_formula_badge_world()}` : ""}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={m.dev_formula_group_combat()}>
                  {combatSlots.map((item) => (
                    <option key={item.key} value={item.key} data-slot={item.key}>
                      {slotName(item, locale)}
                      {drafts.has(item.key) ? ` · ${m.dev_formula_badge_staged()}` : ""}
                      {item.override ? ` · ${m.dev_formula_badge_world()}` : ""}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor={sampleId}>
                {m.dev_formula_sample()}
              </label>
              <select id={sampleId} value={sampleView.id} onChange={(event) => setSample(event.target.value)}>
                {list.samples.map((item) => (
                  <option key={item.id} value={item.id}>
                    {sampleText(item.id)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor={weaponId}>
                {m.dev_formula_weapon()}
              </label>
              <select id={weaponId} value={weaponView.id} onChange={(event) => setWeapon(event.target.value)}>
                {list.weapons.map((item) => (
                  <option key={item.id} value={item.id}>
                    {weaponName(item)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <SlotEditor
            key={`${slot.key}|${list.revision}`}
            list={list}
            slot={slot}
            drafts={drafts}
            locale={locale}
            primaries={sampleView.primaries}
            level={sampleView.level}
            weapon={weaponView}
            onStage={stage}
            onUnstage={unstage}
          />

          <section className="fx-panel" aria-labelledby={`${slotId}-items`}>
            <h3 id={`${slotId}-items`} className="fx-panel-title">
              {m.dev_formula_items_title()}
            </h3>
            <p className="field-hint">{m.dev_formula_items_hint({ cap: list.coefficients.capPm / 1000 })}</p>
            <AppropriateTable
              list={list}
              primaries={sampleView.primaries}
              bareAppropriate={sampleBareAppropriateOf(list, drafts, sampleView.level)}
              weaponName={weaponName}
            />
          </section>

          <section className="fx-panel" aria-labelledby={`${slotId}-stamina`} data-testid="formula-stamina">
            <h3 id={`${slotId}-stamina`} className="fx-panel-title">
              {m.dev_formula_stamina_title()}
            </h3>
            <p className="field-hint">{m.dev_formula_stamina_hint()}</p>
            <StaminaTable
              rows={sampleStaminaOf(list, drafts, sampleView.primaries, sampleView.level)}
              weaponName={weaponName}
            />
          </section>

          <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
          {drafts.size > 0 ? (
            <div
              className="fx-pending"
              role="region"
              aria-label={m.dev_formula_pending_count({ count: drafts.size })}
            >
              <p className="fx-pending-count">{m.dev_formula_pending_count({ count: drafts.size })}</p>
              <label className="visually-hidden" htmlFor={noteId}>
                {m.dev_formula_pending_note()}
              </label>
              <input
                id={noteId}
                className="input fx-note-input"
                maxLength={200}
                placeholder={m.dev_formula_pending_note()}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <div className="fx-pending-actions">
                <button type="button" className="button-small" onClick={() => setDrafts(new Map())}>
                  {m.dev_formula_clear()}
                </button>
                <button
                  type="button"
                  className="button-primary button-small fx-apply"
                  aria-disabled={busy}
                  onClick={busy ? undefined : () => void apply()}
                >
                  {m.dev_formula_apply()}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/** 칸 하나: 식 입력·담기·되돌리기와 미리 보기. 칸·판이 바뀌면 새로 만든다(key) */
function SlotEditor(props: {
  list: FormulaListResponse;
  slot: FormulaSlotView;
  drafts: FormulaDrafts;
  locale: string;
  primaries: readonly number[];
  level: number;
  weapon: FormulaWeaponView;
  onStage: (key: string, source: string | null) => void;
  onUnstage: (key: string) => void;
}) {
  const { list, slot, drafts, locale, primaries, level, weapon } = props;
  const inputId = useId();
  const [text, setText] = useState(() => sourceOf(slot, drafts));
  const def = slotDefOf(slot);
  const checked = useMemo(() => checkSource(slot, text), [slot, text]);
  const preview = useMemo(
    () => (checked.ok ? previewOf({ list, drafts, slot, source: text, primaries, level, weapon }) : null),
    [checked, list, drafts, slot, text, primaries, level, weapon],
  );
  const staged = drafts.get(slot.key);
  const issues = checked.ok ? checked.warnings : [...checked.errors, ...checked.warnings];
  const changed = text.trim() !== sourceOf(slot, drafts).trim();

  return (
    <section className="fx-panel fx-slot" aria-labelledby={`${inputId}-title`} data-slot={slot.key}>
      <div className="fx-panel-head">
        <h3 id={`${inputId}-title`} className="fx-panel-title">
          {slotName(slot, locale)}{" "}
          <span className="fx-key" translate="no">
            {slot.key} · {unitText(def.unit)}
          </span>
        </h3>
        <ul className="fx-flags">
          {staged !== undefined ? <li data-state="staged">{m.dev_formula_badge_staged()}</li> : null}
          {slot.override ? <li data-state="override">{m.dev_formula_badge_world()}</li> : null}
          {!checked.ok ? <li data-state="error">{m.dev_formula_badge_error()}</li> : null}
        </ul>
      </div>
      {slot.generated && staged === undefined ? (
        <p className="field-hint">{m.dev_formula_generated()}</p>
      ) : null}
      {slot.override ? (
        <p className="field-hint">
          {m.dev_formula_world_override({
            who: slot.override.updatedBy ?? "—",
            when: new Date(slot.override.updatedAt).toLocaleString(locale),
          })}
        </p>
      ) : null}
      <label className="field-label" htmlFor={inputId}>
        {m.dev_formula_input_label()}
      </label>
      <FormulaEditor id={inputId} slot={slot} value={text} issues={issues} onChange={setText} />
      {checked.ok && issues.length === 0 ? <p className="fx-ok">{m.dev_formula_ok()}</p> : null}
      {checked.ok && issues.length > 0 ? (
        <ul className="fx-warnings">
          {issues.map((issue) => (
            <li key={`${issue.code}-${issue.s}`}>{issueText(issue)}</li>
          ))}
        </ul>
      ) : null}
      <div className="fx-actions">
        <button
          type="button"
          className="button-primary button-small fx-stage"
          aria-disabled={!checked.ok || !changed}
          onClick={checked.ok && changed ? () => props.onStage(slot.key, text) : undefined}
        >
          {m.dev_formula_stage()}
        </button>
        {slot.override !== null || (staged !== undefined && staged !== null) ? (
          <button
            type="button"
            className="button-small fx-revert"
            onClick={() => props.onStage(slot.key, null)}
          >
            {m.dev_formula_revert()}
          </button>
        ) : null}
        {changed ? (
          <button type="button" className="button-small" onClick={() => setText(sourceOf(slot, drafts))}>
            {m.dev_formula_discard()}
          </button>
        ) : null}
        {staged !== undefined ? (
          <button type="button" className="button-small" onClick={() => props.onUnstage(slot.key)}>
            {m.dev_formula_unstage()}
          </button>
        ) : null}
      </div>
      <details className="fx-names">
        <summary>{m.dev_formula_pack_label()}</summary>
        <pre className="fx-pack" translate="no">
          {slot.packSource}
        </pre>
      </details>
      <h4 className="fx-subtitle">{m.dev_formula_preview_title()}</h4>
      {preview ? <PreviewPanel preview={preview} slot={def} /> : null}
    </section>
  );
}
