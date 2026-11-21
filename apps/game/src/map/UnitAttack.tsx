// 남의 유닛 작은 창(PeekCard)의 [공격] — 유닛 공격(WebSocket unit_attack, 프로토콜 64 — 묶음 1117d, 줄기 fixes-1117c 판 123 — 사용자 결정 D-588 2496 가 "같은 나라 유저의 건물이나
// 유닛을 공격하면(약탈 행위) 신용이 내린다", 기획 대조 2543 "같은 나라 유저끼리도 싸우고 약탈할 수 있어야"). 고른 내 유닛(명령 유닛)으로 이 유닛을 일부러 친다.
// 거리·소유·시가지·신용 판정은 서버가 한다(apps/server/src/travel/encounterWorld.ts strike). 결과 문구는 travel_result 코드로(travelData.ts) [임시 2581].
import { useState } from "react";
import { m } from "../paraglide/messages.js";
import { sendTravelCommand } from "./travelCommands.ts";
import { travelProblemText } from "./travelData.ts";

type Status = { readonly tone: "ok" | "error"; readonly text: string } | null;

export function UnitAttack({ actor, target }: { readonly actor: number; readonly target: number }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const attack = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const outcome = await sendTravelCommand({ t: "unit_attack", unitIds: [actor], targetUnitId: target });
      setStatus(
        outcome.ok
          ? { tone: "ok", text: m.unit_attack_started() }
          : { tone: "error", text: travelProblemText(outcome.code) },
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="map-peek-menu" data-part="unit-attack">
      <p className="map-peek-hint">{m.unit_attack_hint()}</p>
      <button type="button" className="button-small" aria-disabled={busy} onClick={() => void attack()}>
        {m.unit_attack_button()}
      </button>
      {status ? (
        <p className="map-peek-hint" role="status" data-tone={status.tone}>
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
