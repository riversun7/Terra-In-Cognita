// 운영자 콘솔 · 권한 부여 탭(manage_grants) — 계정 하나를 골라 운영 권한을 체크박스로 더 준다.
// 역할 기본 권한은 체크된 채 잠긴다(뺄 수 없다). 콘솔 역할이 없는 계정에는 체크박스가 효과가 없다(서버 판정, @terra/shared/ops).
// 대상 찾기는 유저 목록(view_players)을 쓴다. 그 권한이 없으면 아이디 대신 계정 ID(UUID)를 넣는다.
import type { Role } from "@terra/shared";
import {
  OPS_CONSOLE_ROLES,
  OPS_PERMISSIONS,
  OPS_PERMISSION_TIER,
  OPS_ROLE_DEFAULTS,
  type OpsPermission,
  type OpsTier,
} from "@terra/shared/ops";
import { type FormEvent, useId, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { PERMISSION_LABELS, TIER_LABELS, errorText, resultText } from "./opsUi.tsx";

const TIERS: readonly OpsTier[] = ["monitor", "light", "strong", "manage"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Target {
  userId: string;
  loginId: string;
  roles: Role[];
  granted: Set<OpsPermission>;
}

export function GrantsTab({ viewerId, canSearch }: { viewerId: string; canSearch: boolean }) {
  const pickId = useId();
  const [input, setInput] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function pick(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null);
    const value = input.trim();
    try {
      let userId = UUID_PATTERN.test(value) ? value : null;
      if (userId === null && canSearch) {
        const found = await api.ops.players.list.query({ search: value, limit: 20, offset: 0 });
        userId = found.rows.find((row) => row.loginId.toLowerCase() === value.toLowerCase())?.id ?? null;
      }
      if (userId === null) {
        setMessage({ tone: "error", text: m.ops_res_not_found() });
        return;
      }
      const result = await api.ops.grants.get.query({ userId });
      setTarget({
        userId,
        loginId: result.loginId,
        roles: result.roles,
        granted: new Set(result.access.granted),
      });
    } catch (error) {
      setMessage({ tone: "error", text: errorText(error) });
    }
  }

  async function save(): Promise<void> {
    if (!target || pending) return;
    setPending(true);
    try {
      const result = await api.ops.grants.set.mutate({
        userId: target.userId,
        permissions: OPS_PERMISSIONS.filter((permission) => target.granted.has(permission)),
      });
      setMessage(
        result.ok
          ? { tone: "success", text: m.ops_done() }
          : { tone: "error", text: resultText(result.code) },
      );
    } catch (error) {
      setMessage({ tone: "error", text: errorText(error) });
    } finally {
      setPending(false);
    }
  }

  const roleDefaults = new Set<OpsPermission>(
    target ? target.roles.flatMap((role) => OPS_ROLE_DEFAULTS[role]) : [],
  );
  const hasConsole = target ? target.roles.some((role) => OPS_CONSOLE_ROLES.includes(role)) : false;
  return (
    <div className="ops-stack">
      <form className="ops-toolbar" onSubmit={(event) => void pick(event)}>
        <label htmlFor={pickId}>{m.ops_grants_pick()}</label>
        <input
          id={pickId}
          className="input"
          maxLength={40}
          autoComplete="off"
          spellCheck={false}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <button type="submit" className="button-small">
          {m.ops_open()}
        </button>
      </form>
      <p className="dev-muted">{m.ops_grants_note()}</p>
      {message ? (
        <p className={message.tone === "error" ? "message message-error" : "message"} role="status">
          {message.text}
        </p>
      ) : null}
      {target ? (
        <fieldset className="ops-grants">
          <legend>{m.ops_grants_for({ id: target.loginId })}</legend>
          <p className="dev-code">{target.roles.join(", ")}</p>
          {hasConsole ? null : <p className="message">{m.ops_grants_no_console()}</p>}
          {TIERS.map((tier) => (
            <div key={tier} className="ops-grant-tier">
              <h3 className="ops-h3">{TIER_LABELS[tier]()}</h3>
              {OPS_PERMISSIONS.filter((permission) => OPS_PERMISSION_TIER[permission] === tier).map(
                (permission) => {
                  const locked = roleDefaults.has(permission);
                  return (
                    <label key={permission} className="ops-inline">
                      <input
                        type="checkbox"
                        checked={locked || target.granted.has(permission)}
                        disabled={locked || target.userId === viewerId}
                        onChange={(event) => {
                          const next = new Set(target.granted);
                          if (event.target.checked) next.add(permission);
                          else next.delete(permission);
                          setTarget({ ...target, granted: next });
                        }}
                      />
                      {PERMISSION_LABELS[permission]()}
                      {locked ? <span className="dev-badge">{m.ops_grants_role_default()}</span> : null}
                    </label>
                  );
                },
              )}
            </div>
          ))}
          <button
            type="button"
            className="button-primary"
            aria-disabled={pending || target.userId === viewerId}
            onClick={() => void save()}
          >
            {m.ops_save()}
          </button>
        </fieldset>
      ) : null}
    </div>
  );
}
