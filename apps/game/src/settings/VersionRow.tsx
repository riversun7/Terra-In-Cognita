// 버전 줄 — 설정 → 앱 정보와 개발자 홈(/dev) 아래에 보인다(ADR docs/adr/2026-10-29-app-shell.md "바뀜 (2026-11-14, 빌드 도장)").
// "버전  앱 2026-11-15 08:12 (abc1234) · 서버 2026-11-15 08:20 (def5678) · 팩 core@92". 서버 도장·팩 판은 열 때 한 번
// tRPC system.info로 묻는다. 앱과 서버 커밋이 다르면 앱을 다시 켜라는 짧은 안내를 붙인다. 새 버전 적용 규칙(pwa/updates.ts)은 그대로다.
import { useEffect, useState } from "react";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { APP_BUILD_STAMP, type ServerVersion, versionLine } from "./versionInfo.ts";
import "./versionRow.css";

/** 서버 빌드 도장·팩 판을 한 번 묻는다(실패하면 error — 화면은 "서버 알 수 없음") */
function useServerVersion(): ServerVersion {
  const [state, setState] = useState<ServerVersion>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    api.system.info.query().then(
      (info) => {
        if (alive) setState({ kind: "ok", build: info.build, contentVersion: info.contentVersion });
      },
      () => {
        if (alive) setState({ kind: "error" });
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export function VersionRow() {
  const server = useServerVersion();
  const line = versionLine(APP_BUILD_STAMP, server);
  return (
    <div
      className="version-row"
      data-part="version"
      data-state={server.kind}
      data-app-time={APP_BUILD_STAMP.time ?? undefined}
      data-app-commit={APP_BUILD_STAMP.commit ?? undefined}
      data-server-time={server.kind === "ok" ? (server.build.time ?? undefined) : undefined}
      data-server-commit={server.kind === "ok" ? (server.build.commit ?? undefined) : undefined}
    >
      <span className="version-label">{m.settings_version_label()}</span>
      <span className="version-text">{line.parts.join(" · ")}</span>
      {line.mismatch ? (
        <p className="version-mismatch" role="status">
          {m.settings_version_mismatch()}
        </p>
      ) : null}
    </div>
  );
}
