// 관리자 화면 — 지연 로딩되는 별도 조각(App.tsx의 React.lazy). admin에게만 버튼이 보이고, 서버가 매 요청 권한을 본다.
// 사용자 찾기(아이디 일부), 쪽 나누기 목록(admin.users.list), 사용자마다 역할 바꾸기(admin.users.setRoles).
// 계정·운영 기능만 둔다. 셰이더 측정 같은 개발자 도구는 개발자 영역(/dev, editor/)에 있다(ADR 2026-10-29-planet-editor-stage1 1절).
// 오류는 tRPC error.data.code → 메시지 키(adminErrors.ts). 로그인이 끝났으면(UNAUTHORIZED) 세션을 다시 확인한다.
// 빽빽한 화면이라 촘촘 변형(data-density="compact": 버튼 턱 0, 모서리 작게, 조작부 44px)을 쓴다(ADR 2026-10-28-design-system).
import type { AccountView } from "@terra/shared";
import { type FormEvent, useEffect, useId, useState } from "react";
import { refreshSession } from "../auth/session.ts";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { text } from "../ui/text.ts";
import { useMountFocus } from "../ui/useMountFocus.ts";
import { adminErrorInfo } from "./adminErrors.ts";
import { AdminOpsPanel } from "./AdminSwitches.tsx";
import { type AdminUserRow, UserCard } from "./UserCard.tsx";
import "./admin.css";

/** 한 쪽에 보이는 사용자 수(서버 상한 100) */
const PAGE_SIZE = 20;
/** 검색어 길이 상한(서버와 같다). 넘으면 서버가 BAD_REQUEST를 준다 */
const SEARCH_MAX_LENGTH = 40;

interface AdminPageProps {
  viewer: AccountView;
  onClose: () => void;
}

interface ListQuery {
  search: string;
  offset: number;
  /** 같은 조건으로 다시 불러올 때도 바뀐다 */
  version: number;
}

interface ListState {
  users: AdminUserRow[];
  total: number;
  /** 이 목록을 불러온 조건(쪽 번호 표시용) */
  offset: number;
  version: number;
}

export default function AdminPage({ viewer, onClose }: AdminPageProps) {
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  const searchId = useId();
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState<ListQuery>({ search: "", offset: 0, version: 0 });
  const [list, setList] = useState<ListState | null>(null);
  /** 마지막으로 끝난(성공·실패) 요청의 조건 번호. 지금 조건과 다르면 불러오는 중이다 */
  const [settledVersion, setSettledVersion] = useState(-1);
  const loading = settledVersion !== query.version;
  const {
    lines: failureLines,
    version: failureVersion,
    show: showFailure,
    clear: clearFailure,
  } = useLiveLines();

  useEffect(() => {
    // 조건이 바뀌면 앞 요청은 버린다(늦게 온 응답이 새 목록을 덮지 않게)
    const controller = new AbortController();
    api.admin.users.list
      .query({ search: query.search, limit: PAGE_SIZE, offset: query.offset }, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setList({ users: result.users, total: result.total, offset: query.offset, version: query.version });
        clearFailure();
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const info = adminErrorInfo(error);
        showFailure([text({ key: info.key })]);
        if (info.sessionEnded) void refreshSession();
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettledVersion(query.version);
      });
    return () => controller.abort();
  }, [query, showFailure, clearFailure]);

  function search(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setQuery((previous) => ({ search: searchInput.trim(), offset: 0, version: previous.version + 1 }));
  }

  const goTo = (offset: number): void => {
    if (loading) return;
    setQuery((previous) => ({ ...previous, offset, version: previous.version + 1 }));
  };

  const replaceRow = (updated: AdminUserRow): void => {
    setList((previous) =>
      previous
        ? { ...previous, users: previous.users.map((row) => (row.id === updated.id ? updated : row)) }
        : previous,
    );
  };

  const hasPrev = list !== null && list.offset > 0;
  const hasNext = list !== null && list.offset + list.users.length < list.total;

  return (
    <section className="screen admin" data-density="compact" aria-labelledby="admin-title">
      <div className="screen-header">
        <h1 id="admin-title" className="screen-title" ref={headingRef} tabIndex={-1}>
          {m.admin_title()}
        </h1>
        <button type="button" className="button-small" onClick={onClose}>
          {m.admin_back()}
        </button>
      </div>
      <AdminOpsPanel totalUsers={list?.total ?? null} />
      <div className="admin-users-panel">
        <h2 className="admin-subtitle">{m.admin_users_title()}</h2>
        <form role="search" className="field" onSubmit={search}>
          <label className="field-label" htmlFor={searchId}>
            {m.admin_search_label()}
          </label>
          <div className="admin-search-row">
            <input
              id={searchId}
              className="input"
              type="search"
              name="search"
              maxLength={SEARCH_MAX_LENGTH}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <button type="submit">{m.admin_search()}</button>
          </div>
        </form>
        <LiveMessage tone="error" lines={failureLines} version={failureVersion} />
        <p className="status" role="status">
          {loading
            ? m.admin_loading()
            : list === null
              ? ""
              : list.users.length === 0
                ? m.admin_empty()
                : m.admin_range({
                    from: list.offset + 1,
                    to: list.offset + list.users.length,
                    total: list.total,
                  })}
        </p>
        {list !== null && list.users.length > 0 ? (
          <ul className="user-list" aria-busy={loading}>
            {list.users.map((row) => (
              <UserCard
                // 목록을 새로 불러오면 고르던 역할도 서버 값으로 다시 시작한다
                key={`${list.version}:${row.id}`}
                row={row}
                isSelf={row.id === viewer.id}
                onSaved={replaceRow}
              />
            ))}
          </ul>
        ) : null}
        <div className="form-actions">
          <button
            type="button"
            aria-disabled={!hasPrev || loading}
            onClick={() => (hasPrev && list ? goTo(Math.max(0, list.offset - PAGE_SIZE)) : undefined)}
          >
            {m.admin_prev()}
          </button>
          <button
            type="button"
            aria-disabled={!hasNext || loading}
            onClick={() => (hasNext && list ? goTo(list.offset + PAGE_SIZE) : undefined)}
          >
            {m.admin_next()}
          </button>
        </div>
      </div>
    </section>
  );
}
