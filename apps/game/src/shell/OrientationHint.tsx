// 화면 방향 안내(D-6002, ADR 2026-10-29-app-shell 3절) — 휴대폰 세로로 지도에 들어가면 "가로로 돌리면 더 넓게…"를 4초 띄운다.
// 누르면 닫힌다. 앱을 켤 때마다 한 번만 띄운다(sessionStorage: 탭·앱을 닫으면 지워진다). 강제가 아니다(manifest orientation any).
// 태블릿·데스크톱에는 띄우지 않는다(useLayout().phonePortrait). 틀이 그리므로 지도 화면 파일은 고치지 않는다.
// 알림 영역(role=status)은 지도 화면 동안 늘 두고, 안내는 빈 영역이 한 번 그려진 다음 프레임부터 넣는다(ui/LiveMessage.tsx와
// 같은 까닭: 읽기 프로그램은 처음부터 있던 영역의 변화만 잘 읽는다).
import { useEffect, useState } from "react";
import { m } from "../paraglide/messages.js";
import { Icon } from "../ui/icons.tsx";
import { useLayout } from "./useLayout.ts";

/** 이번 실행에 이미 띄웠는지(sessionStorage 열쇠) */
const SHOWN_KEY = "terra.orientationHint";
/** 떠 있는 시간 */
export const ORIENTATION_HINT_MS = 4_000;
/** 흐려지는 시간(overlays.css의 --duration-base와 같다. 동작 줄이기면 CSS는 0이고 이 시간 뒤에 지운다) */
const LEAVE_MS = 200;

function alreadyShown(): boolean {
  try {
    return sessionStorage.getItem(SHOWN_KEY) === "1";
  } catch {
    return false;
  }
}

function markShown(): void {
  try {
    sessionStorage.setItem(SHOWN_KEY, "1");
  } catch {
    // 저장소를 못 쓰면 이번 화면 동안만 기억한다(다음 지도 진입 때 또 뜰 수 있다)
  }
}

/** 지도 화면 위에 그린다(틀을 숨긴 지도 주소에서만). 띄울 조건이 아니면 빈 알림 영역만 둔다 */
export function OrientationHint() {
  const { phonePortrait } = useLayout();
  // 처음 그릴 때 한 번 정한다: 휴대폰 세로로 들어왔고 이번 실행에 아직 띄우지 않았으면 띄운다
  const [phase, setPhase] = useState<"open" | "leaving" | "closed">(() =>
    phonePortrait && !alreadyShown() ? "open" : "closed",
  );
  // 빈 알림 영역이 한 번 그려졌는지(다음 프레임부터 안내를 넣는다)
  const [regionReady, setRegionReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setRegionReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (phase === "closed") return undefined;
    if (phase === "leaving") {
      const timer = setTimeout(() => setPhase("closed"), LEAVE_MS);
      return () => clearTimeout(timer);
    }
    markShown();
    const timer = setTimeout(() => setPhase("leaving"), ORIENTATION_HINT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // 가로로 돌렸으면 바로 닫는다
  const shown = regionReady && phase !== "closed" && phonePortrait;
  return (
    <div role="status">
      {shown ? (
        <div className="orientation-hint" data-leaving={phase === "leaving"}>
          <button type="button" className="orientation-hint-button" onClick={() => setPhase("leaving")}>
            <Icon name="rotate" />
            <span>{m.shell_orientation_hint()}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
