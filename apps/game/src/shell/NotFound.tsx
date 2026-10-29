// 없는 화면 — 주소 표에 맞는 경로가 없을 때(ADR 2026-10-29-app-shell 2절 "모르는 경로 → 없는 화면 + [홈]").
// 첫 화면 묶음에 둔다(작다). 주소는 고치지 않는다: 새 버전의 주소일 수 있다(새 버전이 받아지면 그 화면이 열린다).
import { m } from "../paraglide/messages.js";
import { HomeButton } from "./NoPermission.tsx";

export function NotFound() {
  return (
    <section className="screen shell-message" aria-labelledby="not-found-title">
      <div className="panel">
        <h1 id="not-found-title" className="screen-title" tabIndex={-1}>
          {m.shell_not_found_title()}
        </h1>
        <p className="lead">{m.shell_not_found_body()}</p>
        <div className="form-actions">
          <HomeButton />
        </div>
      </div>
    </section>
  );
}
