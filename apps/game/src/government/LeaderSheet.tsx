// 2차맵 지도자 작은 판 — 기획 정리 742 나(지도자 = 정부 창구), docs/adr/2026-11-07-play-flow.md "WP-NPC3".
// 2차맵에서 NPC 국가 지도자(유닛 또는 머리 위 이름표 — map/leaderTags.ts)를 누르면 그 지도자를 고른 것이 되고, 이 판이 그 나라 수도 정부 판을
// 묻는다(tRPC world.leaderGovernment — 서버가 지금 내 시야 안의 지도자인지 본다). 지도자 이름·나라·수도 한 줄 + [지도자와 이야기] → 정부 대화상자
// (GovernmentDialog.tsx via "leader" — 머리가 지도자, 지연 조각). 고른 유닛이 지도자가 아니거나 답이 ready가 아니면 그리지 않는다.
// 바뀜(docs/adr/2026-11-07-unit-control.md "바뀜 (2026-11-09)"): 플레이어가 지도자를 누르면 고르지 않고 남의 유닛 정보 판을 연다 — 이 판은
// 그 정보 판 안의 몫(embedded)으로 그린다(판 하나). 운영자가 작은 창의 [이 유닛 조종]으로 지도자를 명령 유닛으로 삼으면 따로 판으로 그린다
// ("바뀜 (2026-11-10)" — 운영자 모드도 누르기만으로는 고르지 않는다).
import type { GovernmentResponse } from "@terra/shared/government";
import { Suspense, lazy, useEffect, useId, useState, useSyncExternalStore } from "react";
import type { LeaderTagState } from "../map/leaderTags.ts";
import { m } from "../paraglide/messages.js";
import { ChunkErrorBoundary } from "../ui/ChunkErrorBoundary.tsx";
import { LeaderMark } from "./LeaderHead.tsx";
import { cityTitle, leaderTitle, loadLeaderGovernment, nationTitle } from "./governmentData.ts";
import "./government.css";
import "../map/leaderTags.css";

const GovernmentDialog = lazy(() => import("./GovernmentDialog.tsx"));

interface LeaderSheetProps {
  /** 이 2차맵에 보이는 지도자(이름표 덧그림이 채운다) */
  readonly tags: LeaderTagState;
  /** 지금 고른 유닛 */
  readonly selected: number | null;
  readonly mapKey: number;
  /** 정보 판 안에 넣는다(판 테두리 없이 위 가는 선으로 나눈다, 제목 h3) */
  readonly embedded?: boolean;
}

export function LeaderSheet({ tags, selected, mapKey, embedded = false }: LeaderSheetProps) {
  useSyncExternalStore(
    (listener) => tags.subscribe(listener),
    () => tags.version,
  );
  const leaderId = selected !== null && tags.isLeader(selected) ? selected : null;
  const [answer, setAnswer] = useState<GovernmentResponse | null>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();

  // 고른 지도자가 바뀌면 다시 묻는다
  useEffect(() => {
    if (leaderId === null) return () => undefined;
    const controller = new AbortController();
    loadLeaderGovernment(mapKey, leaderId, controller.signal)
      .then((response) => setAnswer(response))
      .catch(() => setAnswer(null));
    return () => controller.abort();
  }, [mapKey, leaderId]);

  if (leaderId === null || answer === null || answer.leader?.unitId !== leaderId) return null;
  if (answer.status !== "ready" || !answer.city || !answer.nation) return null;
  const { city, nation, leader } = answer;
  const Heading = embedded ? "h3" : "h2";
  return (
    <section
      className={embedded ? "gov-sheet gov-sheet-embedded" : "map-panel gov-sheet"}
      aria-labelledby={titleId}
      data-part="leader-sheet"
      data-unit={leaderId}
      data-city={city.id}
    >
      <p className="gov-kicker">
        <LeaderMark className="gov-leader-mark" />
        {m.government_leader_kicker()}
      </p>
      <Heading id={titleId} className="gov-sheet-title">
        {leaderTitle(leader)}
      </Heading>
      <p className="gov-muted">
        {m.government_leader_sheet_line({ nation: nationTitle(nation), city: cityTitle(city) })}
      </p>
      <div className="gov-actions">
        <button
          type="button"
          className="button-small button-primary gov-open"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          {m.government_leader_open()}
        </button>
      </div>
      {open ? (
        <ChunkErrorBoundary fallback={<p className="gov-muted">{m.government_load_failed()}</p>}>
          <Suspense fallback={null}>
            <GovernmentDialog government={answer} via="leader" onClose={() => setOpen(false)} />
          </Suspense>
        </ChunkErrorBoundary>
      ) : null}
    </section>
  );
}
