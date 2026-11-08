// 칸마다 팩 값·지금 값·담은 값 견주기(아이템·스킬·건물 편집기 공용) — docs/adr/2026-11-01-item-editor.md·2026-11-01-skill-editor.md·
// 2026-11-02-building-editor.md "바뀜 (2026-11-08 화면 개편)". 설정 칸 패널(/dev/tuning)의 지금·팩·담음 견주기와 같은 뜻이다.
// - 편집 판이 CompareProvider로 그 항목의 팩 항목(pack)·지금 실효 항목(current)·초안(draft)을 준다. 입력 칸(contentEditorFields)에
//   path를 주면 그 칸이 스스로 견준다: 담음(초안 ≠ 지금) · 팩과 다름(초안 ≠ 팩) 표지, 팩 값·지금 값 글, [되돌리기](지금 값)·[팩 값으로].
// - 칸 문제(서버 검사 문구)는 problemOf(path)로 받는다(칸이 problem을 따로 받으면 그것이 먼저).
// - 구역(FormSection)은 앞머리 경로로 담은 칸 수·팩과 다른 칸 수를 센다.
import { type ReactNode, createContext, useContext, useMemo } from "react";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { canSetAt, getAt, leafDiff, setAt, underPath } from "./contentEditorPaths.ts";

export interface CompareSource {
  /** 지금 고치는 초안 */
  readonly draft: unknown;
  /** 지금 그 세계의 실효 항목(새 항목이면 null) */
  readonly current: unknown;
  /** 팩 항목(편집기에서 만든 항목이면 null) */
  readonly pack: unknown;
  /** 칸 되돌리기로 만든 새 초안을 넣는다(편집기가 모양을 보고 담는다) */
  readonly apply: (next: unknown) => void;
  /** 칸 문제(서버 검사 문구) */
  readonly problemOf?: ((path: string) => string | undefined) | undefined;
  /** 되돌리기를 담았을 때처럼 고칠 수 없으면 참(칸 단추를 숨긴다) */
  readonly locked?: boolean | undefined;
}

interface CompareState extends CompareSource {
  /** 초안 ≠ 지금인 끝 칸(담음) */
  readonly staged: readonly string[];
  /** 초안 ≠ 팩인 끝 칸(팩과 다름) */
  readonly changed: readonly string[];
}

const CompareContext = createContext<CompareState | null>(null);

export function CompareProvider({ source, children }: { source: CompareSource; children: ReactNode }) {
  const { draft, current, pack } = source;
  const staged = useMemo(() => (current === null ? [] : leafDiff(current, draft)), [current, draft]);
  const changed = useMemo(() => (pack === null ? [] : leafDiff(pack, draft)), [pack, draft]);
  const value = useMemo(() => ({ ...source, staged, changed }), [source, staged, changed]);
  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

/** 칸 하나의 견주기(경로가 없거나 판 밖이면 null) */
export interface FieldCompare {
  /** 초안 ≠ 지금 */
  readonly staged: boolean;
  /** 초안 ≠ 팩(팩 항목이 있을 때만) */
  readonly changed: boolean;
  readonly packValue: unknown;
  readonly currentValue: unknown;
  /** 팩 항목이 있다 */
  readonly hasPack: boolean;
  readonly toPack: (() => void) | null;
  readonly toCurrent: (() => void) | null;
  readonly problem: string | undefined;
}

const anyUnder = (paths: readonly string[], prefix: string): boolean =>
  paths.some((path) => underPath(path, prefix));

export function useFieldCompare(path: string | undefined): FieldCompare | null {
  const state = useContext(CompareContext);
  if (!state || path === undefined) return null;
  const { draft, current, pack, apply, locked } = state;
  const staged = current !== null && anyUnder(state.staged, path);
  const changed = pack !== null && anyUnder(state.changed, path);
  const packValue = pack === null ? undefined : getAt(pack, path);
  const currentValue = current === null ? undefined : getAt(current, path);
  // 값을 넣을 수 있을 때만 단추: 초안의 부모 칸이 있어야 하고, 배열 칸은 값이 없으면 넣지 않는다
  const settable = (value: unknown): boolean =>
    canSetAt(draft, path) && !(value === undefined && path.endsWith("]"));
  return {
    staged,
    changed,
    packValue,
    currentValue,
    hasPack: pack !== null,
    toPack: !locked && changed && settable(packValue) ? () => apply(setAt(draft, path, packValue)) : null,
    toCurrent:
      !locked && staged && settable(currentValue) ? () => apply(setAt(draft, path, currentValue)) : null,
    problem: state.problemOf?.(path),
  };
}

/** 구역 하나의 담은 칸 수·팩과 다른 칸 수(앞머리 경로들 안) */
export function useSectionCounts(prefixes: readonly string[] | undefined): {
  staged: number;
  changed: number;
} {
  const state = useContext(CompareContext);
  if (!state || !prefixes || prefixes.length === 0) return { staged: 0, changed: 0 };
  const count = (paths: readonly string[]) =>
    paths.filter((path) => prefixes.some((prefix) => underPath(path, prefix))).length;
  return { staged: count(state.staged), changed: count(state.changed) };
}

/** 판 전체의 담은 칸 수·팩과 다른 칸 수 */
export function useCompareTotals(): { staged: number; changed: number } {
  const state = useContext(CompareContext);
  return { staged: state?.staged.length ?? 0, changed: state?.changed.length ?? 0 };
}

/** 칸 값 글(짧게): 수는 자리 나눔, 참·거짓은 켬·끔, 없으면 "없음", 고르기 칸은 이름표 */
export function compareText(value: unknown, labelOf?: (value: string) => string | undefined): string {
  if (value === undefined || value === null || value === "") return m.dev_content_value_none();
  if (typeof value === "number") return new Intl.NumberFormat(getLocale()).format(value);
  if (typeof value === "boolean") return value ? m.dev_content_value_on() : m.dev_content_value_off();
  if (typeof value === "string") return labelOf?.(value) ?? value;
  const text = JSON.stringify(value);
  return text.length > 40 ? `${text.slice(0, 37)}…` : text;
}

/** 칸 머리 표지(담음·팩과 다름) */
export function CompareBadges({ compare }: { compare: FieldCompare | null }) {
  if (!compare || (!compare.staged && !compare.changed)) return null;
  return (
    <span className="ce-field-badges">
      {compare.staged ? (
        <span className="ce-badge ce-badge-staged">{m.dev_content_badge_staged()}</span>
      ) : null}
      {compare.changed ? (
        <span className="ce-badge ce-badge-changed">{m.dev_content_badge_changed()}</span>
      ) : null}
    </span>
  );
}

/** 칸 아래 견주기 줄: 팩 값·지금 값과 [되돌리기]·[팩 값으로]. 다를 때만 그린다 */
export function CompareLine({
  compare,
  name,
  labelOf,
}: {
  compare: FieldCompare | null;
  /** 칸 이름(단추 이름표) */
  name: string;
  labelOf?: ((value: string) => string | undefined) | undefined;
}) {
  if (!compare || (!compare.staged && !compare.changed)) return null;
  const showCurrent =
    compare.staged && JSON.stringify(compare.currentValue) !== JSON.stringify(compare.packValue);
  return (
    <p className="ce-compare">
      {compare.hasPack ? (
        <span className="ce-compare-value" data-part="pack">
          <span className="ce-compare-label">{m.dev_content_compare_pack()}</span>{" "}
          <span className="ce-compare-number">{compareText(compare.packValue, labelOf)}</span>
        </span>
      ) : null}
      {showCurrent || !compare.hasPack ? (
        <span className="ce-compare-value" data-part="current">
          <span className="ce-compare-label">{m.dev_content_compare_current()}</span>{" "}
          <span className="ce-compare-number">{compareText(compare.currentValue, labelOf)}</span>
        </span>
      ) : null}
      {compare.toCurrent ? (
        <button
          type="button"
          className="ce-link-button ce-undo-field"
          aria-label={m.dev_content_field_undo_named({ name })}
          onClick={compare.toCurrent}
        >
          {m.dev_content_field_undo()}
        </button>
      ) : null}
      {compare.toPack ? (
        <button
          type="button"
          className="ce-link-button ce-pack-field"
          aria-label={m.dev_content_field_to_pack_named({ name })}
          onClick={compare.toPack}
        >
          {m.dev_content_field_to_pack()}
        </button>
      ) : null}
    </p>
  );
}

/** 칸 묶음 겉 표지(data-*): 담음·팩과 다름·문제 */
export function compareData(
  compare: FieldCompare | null,
  invalid: boolean,
): Record<string, string | undefined> {
  return {
    "data-staged": compare?.staged ? "" : undefined,
    "data-changed": compare?.changed ? "" : undefined,
    "data-invalid": invalid ? "" : undefined,
  };
}
