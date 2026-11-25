// 2차맵 정부(행정 건물) 작은 판 — docs/adr/2026-11-07-play-flow.md "WP-NPC"(사용자 지적 2026-11-08 "정부 건물의 기본 기능도 없음").
// 2차맵에서 건물을 누르면(채집 판 gatherState의 건물 판) 그 건물의 정부 판을 묻고, 행정 건물이면 지도 아래에 한 장을 더 보인다:
// 도시·나라·지도자 한 줄 + [정부 열기]. 열면 대화상자(GovernmentDialog.tsx, 지연 조각 — 구인 카드·경제 화면 조각은 그때 내려온다).
// 행정 건물이 아니거나(not_government) 모르는 도시(unknown_building)면 아무것도 그리지 않는다.
// 바뀜(사용자 지적 2026-11-09 문제4 "하나의 건물 클릭시 여러개가 다 뜬다"): embedded면 따로 판을 띄우지 않고 건물 판(GatherPanel.tsx) 안의 몫으로 그린다.
import type { GovernmentResponse } from "@terra/shared/government";
import { Suspense, lazy, useContext, useEffect, useId, useState, useSyncExternalStore } from "react";
import { sendHouseMember } from "../faction/identity/houseCommands.ts";
import { HOUSE_ACTION_TEXT, HOUSE_MEMBER_ERROR_TEXT } from "../faction/identity/houseText.ts";
import { BuildingReloadContext } from "../map/building/buildingReloadContext.ts";
import type { GatherState } from "../map/gather/gatherState.ts";
import { m } from "../paraglide/messages.js";
import { AppLink } from "../shell/AppLink.tsx";
import { navigate } from "../shell/routerStore.ts";
import { EntityRef, EntitySymbol } from "../ui/EntityRef.tsx";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { ChunkErrorBoundary } from "../ui/ChunkErrorBoundary.tsx";
import { applyBlockText, approverLabel } from "./cityJoinText.ts";
import {
  cityTitle,
  leaderRuleText,
  leaderTitle,
  loadGovernment,
  nationTitle,
  taxText,
} from "./governmentData.ts";
import { mayorTitle } from "./mayorText.ts";
import "./government.css";

const GovernmentDialog = lazy(() => import("./GovernmentDialog.tsx"));

interface GovernmentSheetProps {
  /** 2차맵 채집·건물 판 상태(누른 건물) */
  readonly state: GatherState;
  /** 건물 판 안에 넣는다(판 테두리 없이 위 가는 선으로 나눈다) */
  readonly embedded?: boolean;
}

export function GovernmentSheet({ state, embedded = false }: GovernmentSheetProps) {
  const onJoined = useContext(BuildingReloadContext);
  useSyncExternalStore(
    (listener) => state.subscribe(listener),
    () => state.version,
  );
  const sheet = state.sheet;
  const buildingId = sheet?.kind === "building" ? sheet.id : null;
  const [answer, setAnswer] = useState<GovernmentResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const notice = useLiveLines();
  const problem = useLiveLines();
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

  /** 대화상자를 닫거나 가입 명령 뒤 한 번 더 묻는다 */
  const refresh = (id: number): void => {
    loadGovernment(id)
      .then((response) => setAnswer(response))
      .catch(() => undefined);
  };

  if (buildingId === null || answer === null || answer.buildingId !== buildingId) return null;
  if (answer.status !== "ready" || !answer.city || !answer.nation) return null;
  const { city, nation, leader, mayor, cityMembership } = answer;
  const cityName = cityTitle(city);
  const nationName = nationTitle(nation);
  const leaderName = leaderTitle(leader);
  const ruleText = leaderRuleText(leader);
  // 건물 판 안이면 그 판 제목(h2) 아래 몫이라 h3
  const Heading = embedded ? "h3" : "h2";

  const joinCity = async (): Promise<void> => {
    if (joining) return;
    setJoining(true);
    notice.clear();
    problem.clear();
    try {
      const outcome = await sendHouseMember({ t: "house_city_apply", buildingId });
      if (outcome.ok) {
        notice.show([HOUSE_ACTION_TEXT[outcome.action]()]);
        refresh(buildingId);
        onJoined?.();
      } else {
        problem.show([HOUSE_MEMBER_ERROR_TEXT[outcome.code]()]);
      }
    } finally {
      setJoining(false);
    }
  };

  return (
    <section
      className={embedded ? "gov-sheet gov-sheet-embedded" : "map-panel gov-sheet"}
      aria-labelledby={titleId}
      data-part="government-sheet"
      data-building={buildingId}
      data-city={city.id}
    >
      <Heading id={titleId} className="gov-sheet-title">
        <EntitySymbol kind="city" />
        <span>{m.government_sheet_title({ city: cityName })}</span>
      </Heading>
      <div className="gov-sheet-lines">
        {mayor ? (
          <div className="gov-sheet-line">
            <span className="gov-sheet-role" data-role="mayor">
              {m.government_field_mayor()}
            </span>
            <EntityRef
              kind="unit"
              role="mayor"
              name={mayorTitle(mayor)}
              popup={{
                kind: "unit",
                role: "mayor",
                title: mayorTitle(mayor),
                kindLabel: m.entity_kind_mayor(),
                subtitle: cityName,
                facts: [
                  {
                    label: m.government_field_mayor(),
                    value: m.government_mayor_satisfaction({ value: mayor.satisfaction }),
                  },
                  { label: m.entity_unit_field_id(), value: `#${mayor.unitId}` },
                ],
              }}
            />
          </div>
        ) : null}
        <div className="gov-sheet-line">
          <EntityRef
            kind="nation"
            emblem={nation.emblem}
            name={nationName}
            popup={{
              kind: "nation",
              title: nationName,
              kindLabel: m.entity_kind_nation(),
              emblem: nation.emblem,
              subtitle: cityName,
              facts: [
                { label: m.government_field_leader(), value: leaderName },
                ...(leader?.house
                  ? [{ label: m.government_ruling_house_label(), value: leader.house.name }]
                  : []),
                ...(ruleText ? [{ label: m.government_regime_label(), value: ruleText }] : []),
                { label: m.government_field_tax(), value: taxText(nation.taxBp) },
              ],
              action: { label: m.entity_open_faction(), onClick: () => navigate({ route: "faction" }) },
            }}
          />
          <span aria-hidden="true">·</span>
          <span className="gov-sheet-role">{m.government_field_leader()}</span>
          {leader ? (
            <EntityRef
              kind="unit"
              role="leader"
              name={leaderName}
              popup={{
                kind: "unit",
                role: "leader",
                title: leaderName,
                kindLabel: m.entity_kind_leader(),
                subtitle: nationName,
                facts: [
                  { label: m.government_field_nation(), value: nationName },
                  ...(leader.house
                    ? [{ label: m.government_ruling_house_label(), value: leader.house.name }]
                    : []),
                  ...(ruleText ? [{ label: m.government_regime_label(), value: ruleText }] : []),
                ],
                action: { label: m.entity_open_faction(), onClick: () => navigate({ route: "faction" }) },
              }}
            />
          ) : (
            <span>{leaderName}</span>
          )}
        </div>
      </div>
      {cityMembership ? (
        <p className="gov-muted" data-part="gov-sheet-join-policy">
          {m.gov_sheet_join_policy({ approver: approverLabel(cityMembership.approver) })}
          {cityMembership.approver === "auto"
            ? ` · ${m.gov_city_join_min_standing({ min: cityMembership.minStanding })}`
            : ""}
        </p>
      ) : null}
      {cityMembership &&
      cityMembership.hostileResidentUnits > 0 &&
      cityMembership.applyBlock !== "same_city" ? (
        <p className="field-error" role="alert" data-part="gov-sheet-hostile-warning">
          {m.fid_home_hostile_warning({ count: String(cityMembership.hostileResidentUnits) })}
        </p>
      ) : null}
      {cityMembership && !cityMembership.canApply && cityMembership.applyBlock ? (
        <p className="gov-muted" data-part="gov-sheet-join-block">
          {applyBlockText(cityMembership.applyBlock)}
        </p>
      ) : null}
      <div className="gov-actions">
        {cityMembership?.canApply ? (
          <button
            type="button"
            className="button-small button-primary"
            disabled={joining}
            data-part="gov-sheet-join-apply"
            onClick={() => void joinCity()}
          >
            {cityMembership.approver === "auto" ? m.gov_sheet_join_btn() : m.gov_city_join_apply_btn()}
          </button>
        ) : cityMembership?.applyBlock === "no_house" ? (
          <AppLink className="button-small" to={{ route: "faction_identity" }}>
            {m.faction_found_family()}
          </AppLink>
        ) : null}
        <button
          type="button"
          className={
            cityMembership?.canApply ? "button-small gov-open" : "button-small button-primary gov-open"
          }
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          {m.government_open()}
        </button>
      </div>
      <LiveMessage tone="success" lines={notice.lines} version={notice.version} />
      <LiveMessage tone="error" lines={problem.lines} version={problem.version} />
      {open ? (
        <ChunkErrorBoundary fallback={<p className="gov-muted">{m.government_load_failed()}</p>}>
          <Suspense fallback={null}>
            <GovernmentDialog
              government={answer}
              onClose={() => {
                setOpen(false);
                refresh(buildingId);
                onJoined?.();
              }}
            />
          </Suspense>
        </ChunkErrorBoundary>
      ) : null}
    </section>
  );
}
