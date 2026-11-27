// 운영자 콘솔 공용 조각 — 불러오기 훅, 문구 표(권한·유닛 종류·결과 코드), 숫자·시각 모양, 키-값 표.
// 키로 고르는 문구는 여기 표에 적는다(네임스페이스를 계산해서 읽지 않는다 — oxlint import(namespace)).
import type { OpsPermission, OpsTier, OpsUnitRow, OpsUnitState } from "@terra/shared/ops";
import { type ReactNode, useEffect, useState } from "react";
import { adminErrorInfo } from "../admin/adminErrors.ts";
import { refreshSession } from "../auth/session.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { text } from "../ui/text.ts";
import type { OpenDetail } from "./OpsConsole.tsx";

export const PERMISSION_LABELS: { readonly [P in OpsPermission]: () => string } = {
  view_players: m.ops_perm_view_players,
  view_npcs: m.ops_perm_view_npcs,
  view_economy: m.ops_perm_view_economy,
  view_audit: m.ops_perm_view_audit,
  view_server: m.ops_perm_view_server,
  account_kick: m.ops_perm_account_kick,
  account_ban: m.ops_perm_account_ban,
  unit_stop: m.ops_perm_unit_stop,
  unit_rescue: m.ops_perm_unit_rescue,
  unit_heal: m.ops_perm_unit_heal,
  unit_teleport: m.ops_perm_unit_teleport,
  ledger_grant: m.ops_perm_ledger_grant,
  manage_grants: m.ops_perm_manage_grants,
  log_switch: m.ops_perm_log_switch,
  faction_edit: m.ops_perm_faction_edit,
  emblem_moderate: m.ops_perm_emblem_moderate,
};

export const TIER_LABELS: { readonly [T in OpsTier]: () => string } = {
  monitor: m.ops_tier_monitor,
  light: m.ops_tier_light,
  strong: m.ops_tier_strong,
  manage: m.ops_tier_manage,
};

/** 세계 유닛 종류 코드(서버 world/unitKinds.ts) → 이름. 1(시험 일꾼)은 없앴다 — 남아 있으면 "종류 1"로 보인다 */
const UNIT_KIND_LABELS: ReadonlyMap<number, () => string> = new Map([
  [0, m.ops_unit_kind_0],
  [2, m.ops_unit_kind_2],
  [3, m.ops_unit_kind_3],
  [4, m.ops_unit_kind_4],
  [5, m.ops_unit_kind_5],
  [7, m.ops_unit_kind_7],
]);

/** 유닛 찾기 칸이 고르게 보여 주는 종류 코드 */
export const UNIT_KIND_CODES: readonly number[] = [...UNIT_KIND_LABELS.keys()];

export function unitKindLabel(kind: number): string {
  return UNIT_KIND_LABELS.get(kind)?.() ?? m.ops_unit_kind_other({ kind });
}

/** 서버 결과 코드 → 문구(모르는 코드는 공용 실패 문구) */
const RESULT_LABELS: { readonly [code: string]: () => string } = {
  not_found: m.ops_res_not_found,
  not_ready: m.ops_res_not_ready,
  not_standable: m.ops_res_not_standable,
  unsupported_kind: m.ops_res_unsupported_kind,
  failed: m.ops_res_failed,
  self: m.ops_res_self,
  protected_target: m.ops_res_protected_target,
  owner_not_found: m.ops_res_owner_not_found,
  bad_asset: m.ops_res_bad_asset,
  insufficient: m.ops_res_insufficient,
  invalid: m.ops_res_invalid,
  short_taken: m.ops_res_short_taken,
  ticker_taken: m.ops_res_ticker_taken,
  player_owned: m.ops_res_player_owned,
  no_house: m.ops_res_no_house,
};

export function resultText(code: string): string {
  return (Object.hasOwn(RESULT_LABELS, code) ? RESULT_LABELS[code] : undefined)?.() ?? m.ops_res_failed();
}

const numberFormat = new Intl.NumberFormat(getLocale());
const dateFormat = new Intl.DateTimeFormat(getLocale(), { dateStyle: "short", timeStyle: "medium" });

export function formatInt(value: number | null | undefined): string {
  return value === null || value === undefined ? m.ops_none() : numberFormat.format(value);
}

/** BigInt 문자열(최소 단위)을 자리 묶음으로 */
export function formatBig(value: string): string {
  try {
    return numberFormat.format(BigInt(value));
  } catch {
    return value;
  }
}

export function formatTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return m.ops_none();
  const time = typeof value === "number" ? value : Date.parse(value);
  return Number.isNaN(time) ? String(value) : dateFormat.format(time);
}

/** 직무 코드 → 이름(@terra/sim JOB_NONE 0·JOB_GATHER 1·JOB_HUNT 2) */
export function jobLabel(kind: number): string {
  if (kind === 0) return m.ops_job_none();
  if (kind === 1) return m.ops_job_gather();
  if (kind === 2) return m.ops_job_hunt();
  return m.ops_job_other({ kind });
}

/** 지금 하는 일·부상·포로 → 이름(유닛 표의 작업 칸, 유닛 탭의 상태 거르기) */
export const UNIT_STATE_LABELS: { readonly [S in OpsUnitState]: () => string } = {
  working: m.ops_state_working,
  to_work: m.ops_do_to_work,
  hauling: m.ops_do_hauling,
  resting: m.ops_state_resting,
  to_rest: m.ops_do_to_rest,
  need: m.ops_do_need,
  patrol: m.ops_do_patrol,
  evade: m.ops_do_evade,
  moving: m.ops_status_moving,
  idle: m.ops_state_idle,
  injured: m.ops_state_injured,
  captive: m.ops_status_captive,
};

export function whereText(unit: Pick<OpsUnitRow, "planetId" | "mapKey" | "cellX" | "cellY">): string {
  return m.ops_where({ planet: unit.planetId, map: unit.mapKey, x: unit.cellX, y: unit.cellY });
}

/**
 * 표의 위치 칸: 짧게(2차맵 키 끝 네 자리 + 칸) 보이고, 누르면 그 아래에 전체(행성·2차맵 키·칸)와 [이 2차맵의 유닛]을 펼친다
 * (사용자 지시 2026-11-27 "위치 간단하게 쓰고 누르면 자세하게 보여라").
 */
export function WhereCell({
  where,
  open,
}: {
  where: Pick<OpsUnitRow, "planetId" | "mapKey" | "cellX" | "cellY">;
  open: OpenDetail;
}) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <button
        type="button"
        className="button-text dev-code"
        aria-expanded={shown}
        title={whereText(where)}
        onClick={() => setShown(!shown)}
      >
        {m.ops_where_short({ map: String(where.mapKey).slice(-4), x: where.cellX, y: where.cellY })}
      </button>
      {shown ? (
        <span className="ops-where-full">
          <span className="dev-code">{whereText(where)}</span>
          <button
            type="button"
            className="button-text"
            data-ops-link="map-units"
            onClick={() => open({ kind: "units", mapKey: where.mapKey })}
          >
            {m.ops_link_map_units()}
          </button>
        </span>
      ) : null}
    </>
  );
}

export function errorText(error: unknown): string {
  const info = adminErrorInfo(error);
  if (info.sessionEnded) void refreshSession();
  return text({ key: info.key });
}

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** 조회 하나를 부른다. load가 바뀌면(부르는 쪽 useCallback) 앞 요청을 버리고 다시 부른다 */
export function useOpsLoad<T>(load: (signal: AbortSignal) => Promise<T>): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [settled, setSettled] = useState(-1);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setData(value);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(errorText(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettled(version);
      });
    return () => controller.abort();
  }, [load, version]);
  return { data, error, loading: settled !== version, reload: () => setVersion((value) => value + 1) };
}

/** 키-값 표(상세 화면) */
export function KeyValues({ rows }: { rows: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className="ops-kv">
      {rows.map(([key, value]) => (
        <div key={key} className="ops-kv-row">
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LoadState({ loaded }: { loaded: Pick<Loaded<unknown>, "error" | "loading"> }) {
  if (loaded.error)
    return (
      <p className="message message-error" role="alert">
        {loaded.error}
      </p>
    );
  if (loaded.loading)
    return (
      <p className="status" role="status">
        {m.ops_loading()}
      </p>
    );
  return null;
}

/** 사유 입력 + 확인 뒤 부르는 통제 단추 */
export function ActionButton({
  label,
  target,
  run,
  danger,
  onDone,
}: {
  label: string;
  target: string;
  run: () => Promise<string | null>;
  danger?: boolean;
  onDone?: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  async function click(): Promise<void> {
    if (pending) return;
    if (!window.confirm(m.ops_act_confirm({ action: label, target }))) return;
    setPending(true);
    try {
      const failure = await run();
      setMessage(
        failure === null ? { tone: "success", text: m.ops_done() } : { tone: "error", text: failure },
      );
      if (failure === null) onDone?.();
    } catch (error) {
      setMessage({ tone: "error", text: errorText(error) });
    } finally {
      setPending(false);
    }
  }
  return (
    <span className="ops-action">
      <button
        type="button"
        className={danger ? "button-small ops-danger" : "button-small"}
        aria-disabled={pending}
        onClick={() => void click()}
      >
        {label}
      </button>
      {message ? (
        <span className={message.tone === "error" ? "ops-msg ops-msg-error" : "ops-msg"} role="status">
          {message.text}
        </span>
      ) : null}
    </span>
  );
}

/** 쪽 넘기기 */
export function Pager({
  offset,
  shown,
  total,
  size,
  onGo,
}: {
  offset: number;
  shown: number;
  total: number;
  size: number;
  onGo: (offset: number) => void;
}) {
  return (
    <div className="ops-pager">
      <span className="dev-muted">
        {shown === 0 ? m.ops_empty() : m.ops_range({ from: offset + 1, to: offset + shown, total })}
      </span>
      <button
        type="button"
        className="button-small"
        aria-disabled={offset === 0}
        onClick={() => (offset > 0 ? onGo(Math.max(0, offset - size)) : undefined)}
      >
        {m.ops_prev()}
      </button>
      <button
        type="button"
        className="button-small"
        aria-disabled={offset + shown >= total}
        onClick={() => (offset + shown < total ? onGo(offset + size) : undefined)}
      >
        {m.ops_next()}
      </button>
    </div>
  );
}
