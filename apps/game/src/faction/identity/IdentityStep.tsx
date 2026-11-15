// 세력 정체성 정하기 단계 — 세력을 만들 때 NPC 국가와 같은 과정으로 이름·약어·시그니처 컬러·마크를 정한다(사용자 결정 2026-11-11).
// 다시 쓸 수 있는 한 단계다: 조회 결과(mine)를 받아 초안을 고치고, [정하기]를 누르면 네 가지를 한 요청으로 보낸다(하나라도 틀리면 아무것도
// 바뀌지 않는다 — 건너뛰기·기본값으로 끝내기는 없다). 지금은 /faction/identity 화면이 쓰고, 세력 창설 흐름이 생기면 그 안에 넣는다.
// - 이름·약어: 기기가 같은 규칙 함수로 바로 안내하고(@terra/shared/factionIdentity), 겹치는지는 서버에 묻는다(잠깐 멈추면 확인).
// - [이름 만들기]: NPC 국가와 같은 이름 만들기의 후보. 고르면 약어 후보도 같이 바뀐다.
// - 색: 지도에서 읽기 쉬운 색 20개. 마크: IdentityEmblemField.
// - 맨 위 "게임에서 보이는 모습"이 고칠 때마다 바뀐다.
// - 가문 창설(질문 926 나): 아직 가문이 없으면 [가문 창설]이 정체성을 저장한 뒤(tRPC — 그림이 WebSocket 메시지 한도보다 크다) WebSocket
//   house_found로 창설한다. 저장은 됐는데 창설이 실패하면(연결 등) 화면에 남아 다시 누를 수 있다(저장한 초안은 그대로).
// - 기획 D-565: 창설은 무료이고, 가문 소속 도시를 고른다(기본 = 내 도시). 가문은 그 도시가 속한 나라의 가문이 된다(창설 명령 cityId).
import {
  FACTION_IDENTITY_COLORS,
  type FactionIdentityCheck,
  type FactionIdentityMine,
} from "@terra/shared/factionIdentity";
import { CYBORG_NAME_MAX_UNITS, cyborgNameUnits } from "@terra/shared/cyborg";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { refreshSession } from "../../auth/session.ts";
import { apiErrorInfo } from "../../net/apiErrors.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { dateText } from "../../sections/screenText.ts";
import { LiveMessage, useLiveLines } from "../../ui/LiveMessage.tsx";
import { StatusIcon } from "../../ui/StatusIcon.tsx";
import { text } from "../../ui/text.ts";
import { IdentityEmblemField } from "./IdentityEmblemField.tsx";
import { IdentityPreview } from "./IdentityPreview.tsx";
import { homeChoiceText } from "./homeText.ts";
import {
  type IdentityDraft,
  type IdentityField,
  draftOf,
  draftProblems,
  fieldOfReason,
  inputOf,
  isChanged,
  liveProblems,
  nameSuggestions,
  shortRuleOf,
  shortSuggestions,
} from "./identityModel.ts";
import { sendHouseFound } from "./houseCommands.ts";
import { checkIdentity, saveIdentity } from "./identityQueries.ts";
import {
  HOUSE_RESULT_TEXT,
  isNameProblem,
  isShortProblem,
  nameProblemText,
  reasonText,
  rejectionOf,
  shortProblemText,
} from "./identityText.ts";

/** 치기를 멈춘 뒤 서버에 겹침을 묻기까지 */
const CHECK_DELAY_MS = 450;

type Availability =
  | { readonly kind: "idle" }
  | { readonly kind: "checking" }
  | { readonly kind: "done"; readonly result: FactionIdentityCheck };

/** 이름·약어가 겹치는지 서버에 묻는다(치기를 멈추면). 글자 규칙에 걸린 칸은 묻지 않는다 */
function useAvailability(name: string, shortName: string, enabled: boolean): Availability {
  const [state, setState] = useState<{ key: string; value: Availability }>({
    key: "",
    value: { kind: "idle" },
  });
  const key = `${name}\n${shortName}`;
  useEffect(() => {
    if (!enabled || (name === "" && shortName === "")) return undefined;
    const control = new AbortController();
    const timer = setTimeout(() => {
      setState({ key, value: { kind: "checking" } });
      checkIdentity(name, shortName, control.signal).then(
        (result) => {
          if (!control.signal.aborted) setState({ key, value: { kind: "done", result } });
        },
        () => {
          if (!control.signal.aborted) setState({ key, value: { kind: "idle" } });
        },
      );
    }, CHECK_DELAY_MS);
    return () => {
      clearTimeout(timer);
      control.abort();
    };
  }, [name, shortName, key, enabled]);
  return state.key === key ? state.value : { kind: "idle" };
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  return (
    <p id={id} className="field-error fid-field-error" role="status">
      {message === null ? null : (
        <>
          <StatusIcon tone="error" />
          <span>{message}</span>
        </>
      )}
    </p>
  );
}

export function IdentityStep({
  mine,
  onSaved,
  onDraftSaved,
  onCancel,
}: {
  mine: FactionIdentityMine;
  /** 저장(과 창설)이 끝났다(새 조회 결과) */
  onSaved: (next: FactionIdentityMine) => void;
  /** 저장은 됐지만 창설은 아직(실패) — 화면이 새 조회 결과로 다시 그린다 */
  onDraftSaved?: (next: FactionIdentityMine) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const creating = mine.identity === null;
  // 가문을 아직 창설하지 않았다(정체성이 없거나 초안만 저장) — 마지막 단추가 [가문 창설]
  const founding = mine.house === null;
  const rule = shortRuleOf(mine);
  const [draft, setDraft] = useState<IdentityDraft>(() => draftOf(mine));
  /** 이름 만들기 차례(null = 닫힘)와 고른 후보의 로마자 이름(약어 후보용) */
  const [nameRound, setNameRound] = useState<number | null>(null);
  const [pickedEnglish, setPickedEnglish] = useState<string | undefined>(undefined);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<{ field: IdentityField; message: string } | null>(null);
  const failure = useLiveLines();
  // 가문 소속 도시(D-565): 기본 = 내 도시(후보에 없으면 첫 후보). 옛 서버는 후보를 보내지 않는다(그러면 고르지 않고 서버 기본값)
  const homeChoices = mine.homeChoices ?? [];
  const [homeCity, setHomeCity] = useState<string>(() => {
    const mineCity = homeChoices.find((city) => city.id === mine.homeCityId);
    return String(mineCity?.id ?? homeChoices[0]?.id ?? "");
  });
  const nameRef = useRef<HTMLInputElement>(null);
  const shortRef = useRef<HTMLInputElement>(null);

  // 이름 막힘(질문 1006 나): 운영자가 이름을 여러 번 되돌렸다 — 지금 이름("가문 #ID"일 수 있다) 그대로 두고 색·마크만 저장한다
  const renameBlocked = mine.renameBlocked === true;
  const renameLocked = mine.renameAt !== null || renameBlocked;
  const checked = (problems: ReturnType<typeof draftProblems>) =>
    renameBlocked ? { ...problems, name: null, shortName: null } : problems;
  const typed = checked(submitted ? draftProblems(draft, rule) : liveProblems(draft, rule));
  const nameTrim = draft.name.trim();
  const shortTrim = draft.shortName.trim();
  const local = draftProblems(draft, rule);
  const availability = useAvailability(
    local.name === null ? nameTrim : "",
    local.shortName === null ? shortTrim : "",
    !renameLocked,
  );
  const taken = availability.kind === "done" ? availability.result : null;
  const nameProblem = typed.name ?? (taken?.name === "taken" ? "taken" : null);
  const shortProblem = typed.shortName ?? (taken?.shortName === "taken" ? "taken" : null);
  const serverFor = (field: IdentityField): string | null =>
    serverError?.field === field ? serverError.message : null;
  const nameMessage = serverFor("name") ?? (nameProblem === null ? null : nameProblemText(nameProblem));
  const shortMessage =
    serverFor("shortName") ?? (shortProblem === null ? null : shortProblemText(shortProblem, rule.range));
  const units = Math.min(cyborgNameUnits(nameTrim), 99);
  const names = nameRound === null ? [] : nameSuggestions(mine.seed, nameRound, getLocale());
  const shorts = renameLocked ? [] : shortSuggestions(nameTrim, pickedEnglish);
  const changed = isChanged(draft, mine);

  const edit = (next: IdentityDraft): void => {
    setDraft(next);
    if (serverError) setServerError(null);
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (saving) return;
    setSubmitted(true);
    failure.clear();
    const problems = checked(draftProblems(draft, rule));
    if (problems.name !== null) {
      nameRef.current?.focus();
      return;
    }
    if (problems.shortName !== null) {
      shortRef.current?.focus();
      return;
    }
    if (!changed && !founding) {
      failure.show([m.fid_unchanged()]);
      return;
    }
    setSaving(true);
    try {
      const saved = changed ? await saveIdentity(inputOf(draft)) : mine;
      if (saved.house !== null) {
        onSaved(saved);
        return;
      }
      // 가문 창설(WebSocket). 실패해도 저장한 초안은 그대로다
      const pickedCity = Number(homeCity);
      const outcome = await sendHouseFound(
        homeChoices.length > 0 && Number.isSafeInteger(pickedCity) && pickedCity > 0 ? pickedCity : null,
      );
      if (outcome.ok) {
        onSaved({
          ...saved,
          // 창설 시각·나라는 다음 조회가 채운다(화면은 곧 세력 화면으로 돌아간다)
          house: { factionId: outcome.factionId, foundedAt: saved.identity?.updatedAt ?? 0, nationId: null },
        });
        return;
      }
      if (outcome.code === "short_taken") {
        setServerError({ field: "shortName", message: HOUSE_RESULT_TEXT.short_taken() });
        shortRef.current?.focus();
      } else failure.show([HOUSE_RESULT_TEXT[outcome.code]()]);
      onDraftSaved?.(saved);
    } catch (error) {
      const { reason, details } = rejectionOf(error);
      if (reason === null) {
        const info = apiErrorInfo(error);
        if (info.sessionEnded) void refreshSession();
        failure.show([m.fid_error_failed(), text({ key: info.key })]);
      } else {
        const field = fieldOfReason(reason);
        const detail = details[0];
        let message = reasonText(reason);
        if (reason === "name_invalid" && detail !== undefined && isNameProblem(detail))
          message = nameProblemText(detail);
        if (reason === "short_invalid" && detail !== undefined && isShortProblem(detail))
          message = shortProblemText(detail, rule.range);
        setServerError({ field, message });
        if (field === "name") nameRef.current?.focus();
        else if (field === "shortName") shortRef.current?.focus();
        else if (field === "form" || field === "color") failure.show([message]);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="fid-step"
      onSubmit={(event) => void submit(event)}
      noValidate
      data-mode={creating ? "create" : "edit"}
    >
      <p className="fid-lead">{m.fid_lead()}</p>
      <IdentityPreview draft={draft} />

      <div className="fid-group">
        <div className="field">
          <label className="field-label" htmlFor={`${id}-name`}>
            {m.fid_name_label()}
          </label>
          <p id={`${id}-name-hint`} className="field-hint">
            {m.fid_name_hint()}{" "}
            <span className="fid-count">
              {m.start_name_count({ used: String(units), max: String(CYBORG_NAME_MAX_UNITS) })}
            </span>
          </p>
          <input
            ref={nameRef}
            id={`${id}-name`}
            className="input fid-name-input"
            value={draft.name}
            onChange={(event) => {
              setPickedEnglish(undefined);
              edit({ ...draft, name: event.target.value });
            }}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={32}
            readOnly={renameLocked}
            aria-invalid={nameMessage !== null}
            aria-describedby={`${id}-name-hint ${id}-name-error`}
          />
          <FieldError id={`${id}-name-error`} message={nameMessage} />
          {renameLocked ? null : (
            <div className="fid-namegen">
              <button
                type="button"
                className="button-small fid-namegen-open"
                aria-expanded={nameRound !== null}
                onClick={() => setNameRound(nameRound === null ? 0 : null)}
              >
                {m.fid_namegen_open()}
              </button>
              {nameRound === null ? null : (
                <div className="fid-namegen-panel" role="group" aria-label={m.fid_namegen_open()}>
                  <ul className="fid-chips">
                    {names.map((name) => (
                      <li key={name.en}>
                        <button
                          type="button"
                          className="fid-chip fid-namegen-pick"
                          translate="no"
                          onClick={() => {
                            setPickedEnglish(name.en);
                            edit({ ...draft, name: name.text });
                          }}
                        >
                          {name.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="button-small fid-namegen-more"
                    onClick={() => setNameRound(nameRound + 1)}
                  >
                    {m.fid_namegen_more()}
                  </button>
                  <p className="field-hint">{m.fid_namegen_note()}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${id}-short`}>
            {m.fid_short_label()}
          </label>
          <p id={`${id}-short-hint`} className="field-hint">
            {m.fid_short_hint({ min: rule.range.min, max: rule.range.max })}
          </p>
          <input
            ref={shortRef}
            id={`${id}-short`}
            className="input fid-short-input"
            value={draft.shortName}
            onChange={(event) => edit({ ...draft, shortName: event.target.value })}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={8}
            readOnly={renameLocked}
            aria-invalid={shortMessage !== null}
            aria-describedby={`${id}-short-hint ${id}-short-error`}
          />
          <FieldError id={`${id}-short-error`} message={shortMessage} />
          {shorts.length === 0 ? null : (
            <div className="fid-short-suggest" role="group" aria-label={m.fid_short_suggest()}>
              <span className="fid-suggest-label">{m.fid_short_suggest()}</span>
              <ul className="fid-chips">
                {shorts.map((short) => (
                  <li key={short}>
                    <button
                      type="button"
                      className="fid-chip fid-short-pick"
                      translate="no"
                      onClick={() => edit({ ...draft, shortName: short })}
                    >
                      {short}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <p className="fid-availability" role="status" data-state={availability.kind}>
          {renameBlocked
            ? m.fid_rename_blocked()
            : renameLocked
              ? m.fid_rename_wait({ date: dateText(mine.renameAt ?? 0) })
              : availability.kind === "checking"
                ? m.fid_checking()
                : taken !== null &&
                    taken.name === null &&
                    taken.shortName === null &&
                    nameTrim !== "" &&
                    shortTrim !== ""
                  ? m.fid_available()
                  : ""}
        </p>
      </div>

      <fieldset className="fid-group fid-colors">
        <legend className="fid-section-title">{m.fid_color_label()}</legend>
        <p className="field-hint">{m.fid_color_hint()}</p>
        <div className="fid-swatches" role="radiogroup" aria-label={m.fid_color_label()}>
          {FACTION_IDENTITY_COLORS.map((color, index) => (
            <label key={color} className="fid-swatch" data-checked={draft.color === color ? "" : undefined}>
              <input
                type="radio"
                className="fid-swatch-input"
                name={`${id}-color`}
                value={color}
                checked={draft.color === color}
                onChange={() => edit({ ...draft, color })}
                aria-label={m.fid_color_n({ n: index + 1 })}
              />
              <span className="fid-swatch-dot" style={{ backgroundColor: color }} aria-hidden="true" />
            </label>
          ))}
        </div>
      </fieldset>

      <IdentityEmblemField
        draft={draft}
        seed={mine.seed}
        uploadBlock={mine.uploadBlock}
        error={serverFor("upload") ?? serverFor("emblem")}
        onChange={edit}
      />

      {founding && homeChoices.length > 0 ? (
        <div className="field fid-group">
          <label className="field-label" htmlFor={`${id}-home`}>
            {m.fid_home_found_label()}
          </label>
          <select
            id={`${id}-home`}
            className="input"
            data-testid="fid-found-home"
            value={homeCity}
            onChange={(event) => setHomeCity(event.target.value)}
          >
            {homeChoices.map((city) => (
              <option key={city.id} value={String(city.id)}>
                {homeChoiceText(city)}
              </option>
            ))}
          </select>
          <p className="field-hint">{m.fid_home_found_hint()}</p>
        </div>
      ) : null}
      {founding ? (
        <p className="field-hint fid-found-cost" data-testid="fid-found-cost">
          {m.fid_found_cost_free()} {m.fid_found_citizen()}
        </p>
      ) : null}
      <LiveMessage tone="error" lines={failure.lines} version={failure.version} />
      <div className="fid-actions fid-submit-row">
        <button type="submit" className="button-primary fid-submit" aria-disabled={saving}>
          {saving ? m.fid_submitting() : founding ? m.fid_submit_found() : m.fid_submit_edit()}
        </button>
        <button type="button" className="button-small fid-cancel" onClick={onCancel}>
          {m.cancel()}
        </button>
      </div>
    </form>
  );
}
