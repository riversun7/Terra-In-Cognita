// 2차맵 정부(행정 건물) 작은 판 — docs/adr/2026-11-07-play-flow.md "WP-NPC"(사용자 지적 2026-11-08 "정부 건물의 기본 기능도 없음").
// 2차맵에서 건물을 누르면(채집 판 gatherState의 건물 판) 그 건물의 정부 판을 묻고, 행정 건물이면 지도 아래에 한 장을 더 보인다:
// 도시·나라·지도자 한 줄 + [정부 열기]. 열면 대화상자(GovernmentDialog.tsx, 지연 조각 — 구인 카드·경제 화면 조각은 그때 내려온다).
// 행정 건물이 아니거나(not_government) 모르는 도시(unknown_building)면 아무것도 그리지 않는다.
// 바뀜(사용자 지적 2026-11-09 문제4 "하나의 건물 클릭시 여러개가 다 뜬다"): embedded면 따로 판을 띄우지 않고 건물 판(GatherPanel.tsx) 안의 몫으로 그린다.
import type { GovernmentResponse } from "@terra/shared/government";
import { Suspense, lazy, useEffect, useId, useState, useSyncExternalStore } from "react";
import type { GatherState } from "../map/gather/gatherState.ts";
import { m } from "../paraglide/messages.js";
import { ChunkErrorBoundary } from "../ui/ChunkErrorBoundary.tsx";
import { cityTitle, leaderTitle, loadGovernment, nationTitle } from "./governmentData.ts";
import "./government.css";

const GovernmentDialog = lazy(() => import("./GovernmentDialog.tsx"));

interface GovernmentSheetProps {
  /** 2차맵 채집·건물 판 상태(누른 건물) */
  readonly state: GatherState;
  /** 건물 판 안에 넣는다(판 테두리 없이 위 가는 선으로 나눈다) */
  readonly embedded?: boolean;
}

export function GovernmentSheet({ state, embedded = false }: GovernmentSheetProps) {
  useSyncExternalStore(
    (listener) => state.subscribe(listener),
    () => state.version,
  );
  const sheet = state.sheet;
  const buildingId = sheet?.kind === "building" ? sheet.id : null;
  const [answer, setAnswer] = useState<GovernmentResponse | null>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();

  // 누른 건물이 바뀌면 다시 묻는다
  useEffect(() => {
    if (buildingId === null) return () => undefined;
    const controller = new AbortController();
    loadGovernment(buildingId, controller.signal)
      .then((response) => setAnswer(response))
      .catch(() => setAnswer(null));
    return () => controller.abort();
  }, [buildingId]);

  /** 대화상자를 닫으면 한 번 더 묻는다(고용한 휴먼 수) */
  const refresh = (id: number): void => {
    loadGovernment(id)
      .then((response) => setAnswer(response))
      .catch(() => undefined);
  };

  if (buildingId === null || answer === null || answer.buildingId !== buildingId) return null;
  if (answer.status !== "ready" || !answer.city || !answer.nation) return null;
  const { city, nation, leader } = answer;
  // 건물 판 안이면 그 판 제목(h2) 아래 몫이라 h3
  const Heading = embedded ? "h3" : "h2";
  return (
    <section
      className={embedded ? "gov-sheet gov-sheet-embedded" : "map-panel gov-sheet"}
      aria-labelledby={titleId}
      data-part="government-sheet"
      data-building={buildingId}
      data-city={city.id}
    >
      <Heading id={titleId} className="gov-sheet-title">
        {m.government_sheet_title({ city: cityTitle(city) })}
      </Heading>
      <p className="gov-muted">
        {m.government_sheet_line({ nation: nationTitle(nation), leader: leaderTitle(leader) })}
      </p>
      <div className="gov-actions">
        <button
          type="button"
          className="button-small button-primary gov-open"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          {m.government_open()}
        </button>
      </div>
      {open ? (
        <ChunkErrorBoundary fallback={<p className="gov-muted">{m.government_load_failed()}</p>}>
          <Suspense fallback={null}>
            <GovernmentDialog
              government={answer}
              onClose={() => {
                setOpen(false);
                refresh(buildingId);
              }}
            />
          </Suspense>
        </ChunkErrorBoundary>
      ) : null}
    </section>
  );
}
