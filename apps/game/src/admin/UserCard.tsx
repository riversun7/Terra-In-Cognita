// 관리자 화면의 사용자 한 명 — 아이디, 정지 여부, 가입 시각, 역할 고르기와 [저장].
// 역할은 배열로 보낸다(admin.users.setRoles). 이메일은 서버가 보내지 않으므로 여기에도 없다.
import { ROLES, type Role } from "@terra/shared";
import { useId, useState } from "react";
import { refreshSession } from "../auth/session.ts";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { text } from "../ui/text.ts";
import { adminErrorInfo } from "./adminErrors.ts";

export type AdminUserRow = Awaited<ReturnType<typeof api.admin.users.list.query>>["users"][number];

/** 역할 이름(메시지 키). 역할이 늘면 여기서 타입 오류가 난다 */
const ROLE_LABELS = {
  player: m.role_player,
  gm: m.role_gm,
  dev: m.role_dev,
  admin: m.role_admin,
} satisfies Record<Role, () => string>;

const dateFormat = new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeStyle: "short" });

function formatDate(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? iso : dateFormat.format(time);
}

const sameRoles = (draft: ReadonlySet<Role>, roles: readonly Role[]): boolean =>
  draft.size === roles.length && roles.every((role) => draft.has(role));

interface UserCardProps {
  row: AdminUserRow;
  /** 로그인한 관리자 본인인지 */
  isSelf: boolean;
  onSaved: (row: AdminUserRow) => void;
}

export function UserCard({ row, isSelf, onSaved }: UserCardProps) {
  const [draft, setDraft] = useState<ReadonlySet<Role>>(() => new Set(row.roles));
  const [pending, setPending] = useState(false);
  // 오류(role=alert)와 저장함(role=status)은 영역을 따로 둔다. 한 영역의 역할을 바꾸면 읽히지 않을 수 있다
  const failure = useLiveLines();
  const saved = useLiveLines();
  const idElement = useId();
  const changed = !sameRoles(draft, row.roles);

  const toggle = (role: Role, checked: boolean): void => {
    setDraft((previous) => {
      const next = new Set(previous);
      if (checked) next.add(role);
      else next.delete(role);
      return next;
    });
  };

  async function save(): Promise<void> {
    if (pending || !changed) return;
    const roles = ROLES.filter((role) => draft.has(role));
    saved.clear();
    if (roles.length === 0) {
      failure.show([m.admin_roles_empty()]);
      return;
    }
    failure.clear();
    setPending(true);
    try {
      const updated = await api.admin.users.setRoles.mutate({ userId: row.id, roles });
      setDraft(new Set(updated.roles));
      onSaved(updated);
      saved.show([m.admin_saved()]);
      // 내 역할을 바꿨으면 계정 줄(관리자 버튼)도 맞춘다
      if (isSelf) void refreshSession();
    } catch (error) {
      const info = adminErrorInfo(error);
      failure.show([text({ key: info.key })]);
      if (info.sessionEnded) void refreshSession();
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="user-card">
      <p className="user-id" id={idElement}>
        <span className="user-login-id">{row.loginId}</span>
        {isSelf ? <span className="badge">{m.admin_you()}</span> : null}
        {row.banned ? <span className="badge badge-warn">{m.admin_banned()}</span> : null}
      </p>
      <p className="user-meta">{m.admin_created({ date: formatDate(row.createdAt) })}</p>
      <fieldset className="role-set">
        <legend className="visually-hidden">{m.admin_roles_legend({ id: row.loginId })}</legend>
        {ROLES.map((role) => (
          <label key={role} className="role-option">
            <input
              type="checkbox"
              checked={draft.has(role)}
              onChange={(event) => toggle(role, event.target.checked)}
            />
            {ROLE_LABELS[role]()}
          </label>
        ))}
      </fieldset>
      <div className="user-actions">
        <button
          type="button"
          className="button-primary"
          aria-disabled={pending || !changed}
          aria-describedby={idElement}
          onClick={() => void save()}
        >
          {m.admin_save()}
        </button>
        <div className="user-message">
          <LiveMessage tone="error" lines={failure.lines} version={failure.version} />
          <LiveMessage tone="success" lines={saved.lines} version={saved.version} />
        </div>
      </div>
    </li>
  );
}
