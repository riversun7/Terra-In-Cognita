// 시안 자료 스위치(dev·admin만) — 홈 [편집]의 스위치와 같은 하나다(inbox/preview.ts, ADR 37 W3). 유닛·사이보그 화면 머리에 둔다.
// 플레이어에게는 그리지 않는다. 켜면 처리할 일·복귀 요약·홈도 시안 자료로 묻는다(같은 스위치라서).
import { useSession } from "../auth/session.ts";
import { setPreviewOn, usePreviewOn } from "../inbox/preview.ts";
import { m } from "../paraglide/messages.js";

export function PreviewSwitch() {
  const session = useSession();
  const on = usePreviewOn();
  const allowed =
    session.kind === "signed_in" && session.user.roles.some((role) => role === "dev" || role === "admin");
  if (!allowed) return null;
  return (
    <button
      type="button"
      className="button-small roster-preview-switch"
      aria-pressed={on}
      onClick={() => setPreviewOn(!on)}
    >
      {m.home_edit_preview()}
    </button>
  );
}
