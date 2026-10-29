// 권한 없음 — 여는 역할이 아닌 화면(주소 표 "누가": /admin은 admin, /dev·/dev/…는 dev·admin)을 열었을 때
// (ADR 2026-10-29-app-shell 2절, canOpenRoute). 화면에서 가리는 것은 편의일 뿐이고 서버가 요청마다 권한을 본다.
import { m } from "../paraglide/messages.js";
import { Icon } from "../ui/icons.tsx";
import { navigate } from "./routerStore.ts";

/** [홈으로] — 홈으로 옮긴다(앞 칸이 앱 홈이면 그 칸으로 돌아가고, 아니면 이 칸을 홈으로 바꾼다) */
export function HomeButton() {
  return (
    <button type="button" className="button-primary" onClick={() => navigate({ route: "home" })}>
      <Icon name="home" />
      {m.shell_go_home()}
    </button>
  );
}

export function NoPermission() {
  return (
    <section className="screen shell-message" aria-labelledby="no-permission-title">
      <div className="panel">
        <h1 id="no-permission-title" className="screen-title" tabIndex={-1}>
          {m.shell_no_permission_title()}
        </h1>
        <p className="lead">{m.shell_no_permission_body()}</p>
        <div className="form-actions">
          <HomeButton />
        </div>
      </div>
    </section>
  );
}
