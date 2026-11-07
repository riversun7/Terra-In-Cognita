// 정찰 끝 화면 알림(지연 조각) — 기획 답 612 나("정찰이 목표를 보고 돌아설 때 알림 — [들어가기]"), docs/adr/2026-11-07-play-flow.md "WP13 이동 3".
// 화면 틀(shell/Shell.tsx)이 어느 주소에서나 그린다. 첫 화면 묶음에 넣지 않으려고 지연 조각이다(tRPC 클라이언트를 여기서 가져온다).
// - 묻는 때: 켤 때 한 번, 정찰이 목표에 닿기 전인 동안 POLL_MS마다, 이동 명령 결과(travel_result ok)를 받았을 때, 화면이 다시 보일 때.
//   가는 정찰이 없으면 묻지 않는다(주기 타이머를 늘 두지 않는다).
// - 돌아선 정찰 가운데 이 기기에서 아직 알리지 않은 길 하나를 띄운다: [들어가기](본 2차맵 지도 ?key=)·[닫기]. 알리면 처리할 일 목록도 다시 받는다
//   (종 배지 — 서버 처리할 일 scout_returned가 같은 길로 생긴다).
import { useEffect, useState } from "react";
import { refreshInbox } from "../inbox/store.ts";
import { serverLink } from "../net/serverLink.ts";
import { m } from "../paraglide/messages.js";
import { navigate } from "../shell/routerStore.ts";
import { type ScoutTurn, readSeenScouts, rememberScout, scoutPending, scoutTurns } from "./scoutNotice.ts";
import { loadTravels } from "./travelData.ts";
import "./scoutWatch.css";

/** 가는 정찰이 있는 동안 다시 묻는 간격(ms) */
const POLL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 10_000;

export default function ScoutWatch() {
  const [turn, setTurn] = useState<ScoutTurn | null>(null);
  useEffect(() => {
    let stopped = false;
    let seen = readSeenScouts();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false;
    const pull = (): void => {
      if (stopped || busy) return;
      busy = true;
      clearTimeout(timer);
      loadTravels(AbortSignal.timeout(REQUEST_TIMEOUT_MS))
        .then((answer) => {
          if (stopped || answer.status !== "ready") return;
          const fresh = scoutTurns(answer.travels).find((entry) => !seen.includes(entry.key));
          if (fresh) {
            seen = rememberScout(seen, fresh.key);
            setTurn(fresh);
            void refreshInbox();
          }
          if (scoutPending(answer.travels)) timer = setTimeout(pull, POLL_MS);
        })
        .catch(() => {
          // 받지 못했다: 다음 사건(명령 결과·화면 보임)에 다시 묻는다
        })
        .finally(() => {
          busy = false;
        });
    };
    pull();
    const stopListen = serverLink.listen((event) => {
      if (event.kind === "message" && event.message.t === "travel_result" && event.message.ok) pull();
    });
    const onVisible = (): void => {
      if (document.visibilityState === "visible") pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      stopListen();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  if (turn === null) return null;
  return (
    <aside
      className="scout-notice"
      role="status"
      aria-labelledby="scout-notice-title"
      data-map-key={turn.mapKey}
    >
      <div className="scout-notice-text">
        <h2 id="scout-notice-title" className="scout-notice-title">
          {m.scout_notice_title()}
        </h2>
        <p className="scout-notice-body">{m.scout_notice_body()}</p>
      </div>
      <div className="scout-notice-actions">
        <button
          type="button"
          className="button-small button-primary scout-notice-enter"
          onClick={() => {
            setTurn(null);
            navigate({ route: "map", search: { key: String(turn.mapKey) } });
          }}
        >
          {m.scout_notice_enter()}
        </button>
        <button type="button" className="button-small scout-notice-close" onClick={() => setTurn(null)}>
          {m.scout_notice_close()}
        </button>
      </div>
    </aside>
  );
}
