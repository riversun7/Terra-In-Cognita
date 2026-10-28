// 새 버전 안내 배너 — 화면 아래에 뜬다(엄지가 닿는 곳). 쓰는 중에 새 버전이 준비되면 보인다.
// 알림 문장은 늘 붙어 있는 role="status" 영역에 넣는다(읽기 프로그램은 처음부터 있던 영역의 변화만 잘 읽는다).
// 배너가 떠 있는 동안 <html data-update-banner>를 붙여 화면 아래를 비운다(가려진 칸·버튼까지 내려 볼 수 있게, styles.css).
import { useEffect, useSyncExternalStore } from "react";
import { m } from "../paraglide/messages.js";
import { StatusIcon } from "../ui/StatusIcon.tsx";
import { applyUpdate, dismissUpdate, getUpdateState, subscribe } from "./updates.ts";

export function UpdateBanner() {
  const state = useSyncExternalStore(subscribe, getUpdateState);
  const open = state !== "idle";

  useEffect(() => {
    document.documentElement.toggleAttribute("data-update-banner", open);
  }, [open]);

  return (
    <div className="update-banner" data-open={open}>
      <p className="update-banner-text" role="status">
        {open ? <StatusIcon tone="info" /> : null}
        {state === "available" ? m.update_available() : state === "applying" ? m.update_applying() : ""}
      </p>
      {state === "available" ? (
        <div className="update-banner-actions">
          <button type="button" className="button-primary button-small" onClick={applyUpdate}>
            {m.update_now()}
          </button>
          <button type="button" className="button-small" onClick={dismissUpdate}>
            {m.update_later()}
          </button>
        </div>
      ) : null}
    </div>
  );
}
