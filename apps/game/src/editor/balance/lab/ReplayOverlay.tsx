// 3D 관람 창 — 전투장 한 판의 리플레이(battleLab.replay, 같은 시드면 [한 판]과 같은 전투)를 전투 다시보기 화면(BattleReplayView,
// docs/adr/2026-11-01-battle-replay.md 7절)으로 화면 전체에 띄운다. <dialog>.showModal()(초점 가둠, Esc = 닫기, 닫으면 연 자리로 초점).
// 보기 화면은 엔진(three)을 들어 무거워서 열 때만 받는다(지연 조각). 화면 하나가 엔진 하나를 든다: 닫으면 보기 화면을 버린다.
import type { BattleReplay } from "@terra/protocol/battleReplay";
import { Suspense, lazy, useEffect, useRef } from "react";
import type { ReplayGround } from "../../../battle/replayTerrain.ts";
import { m } from "../../../paraglide/messages.js";

const BattleReplayView = lazy(() => import("../../../battle/BattleReplayView.tsx"));

export interface WatchedBattle {
  readonly replay: BattleReplay;
  readonly ground: ReplayGround;
}

export function ReplayOverlay({ watched, onClose }: { watched: WatchedBattle | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (watched && !dialog.open) dialog.showModal();
    if (!watched && dialog.open) dialog.close();
  }, [watched]);
  return (
    <dialog ref={ref} className="bl-watch-dialog" aria-labelledby="bl-watch-title" onClose={onClose}>
      {watched ? (
        <div className="bl-watch-body">
          <header className="bl-watch-head">
            <h2 id="bl-watch-title" className="bl-watch-title">
              {m.dev_lab_watch_title()}
            </h2>
            <button type="button" className="button-small bl-watch-close" onClick={onClose}>
              {m.dev_lab_watch_close()}
            </button>
          </header>
          <Suspense fallback={<p className="field-hint bl-watch-loading">{m.dev_lab_watch_loading()}</p>}>
            <BattleReplayView replay={watched.replay} ground={watched.ground} />
          </Suspense>
        </div>
      ) : null}
    </dialog>
  );
}
