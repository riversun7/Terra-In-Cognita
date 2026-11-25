// 홈 [도시 활동] 카드 — 사용자 요청 2026-11-25 "대시보드의 2차맵 없이 빠른 도시활동 메뉴": 2차맵에 들어가 건물을 누르는 대신, 고른 내 유닛이
// 있는 2차맵의 건물 목록을 카드로 보이고 건물을 누르면 2차맵과 같은 건물 판을 대화상자로 연다(빠른 작업·경제 화면으로 가기).
// - 기준 유닛: 고르기 상자(기본 = 사이보그 본체, 내 보유 유닛 전체). 고른 유닛이 있는 2차맵을 보이고, 건물 판의 명령(들어가기 등)은 그 유닛이 한다.
//   규칙은 2차맵과 같다(사용자 답 "2차맵과 같은 규칙") — 화면만 열지 않을 뿐 유닛이 실제로 걸어가고, 판정은 서버가 한다.
// - 탭: 건물(기본)·유닛·자원·정보. 유닛·자원 탭은 눌러야 받는다(부하 줄이기).
//   유닛 탭 = 내 유닛 + 시야 안 남의 유닛(NPC 휴먼·지도자·남의 사이보그 — world.nearbyUnits, 누르면 2차맵과 같은 한눈 판·지도자 몫·[공격]).
//   자원 탭 = 종류별 줄, 기준 유닛에서 가까운 차례. [채집]은 그 종류의 가장 가까운 캘 수 있는 곳으로 보낸다(유닛이 걸어간다).
//   정보 탭 = 2차맵 미니맵(지형 + 건물·내 유닛·주변 유닛) + 도시·땅 정보. 주기 타이머는 없다 — [새로고침]·건물 판을 닫을 때 다시 받는다.
//   예외: 건물 판에서 보낸 명령(들어가기)의 진행 줄이 보이는 동안만 그 줄을 LOOP_POLL_MS마다 다시 묻는다(끝나면 멈춘다).
// - 도시가 아닌 2차맵: 같은 목록(채집소·창고 등 보이는 건물) + 정부 건물을 지으면 새 도시가 되는 곳이면 작은 표시(2차맵으로 가는 링크).
// - 건물 목록은 서버 시야 규칙 그대로다(내 건물·아는 칸의 건물만 — facilities.mapLooks). 서버가 띄우지 않은 2차맵(유닛이 건너가는 중)은 목록이 없다.
// 건물 판 대화상자(city/CityBuildingDialog.tsx)는 지연 조각이다 — 2차맵 건물 판·정부 판·경제 조각은 건물을 누를 때 내려온다.
import type { RouteTarget } from "@terra/shared";
import type { WorldMyUnit } from "@terra/shared/worldMap";
import { type KeyboardEvent, Suspense, lazy, useEffect, useId, useState } from "react";
import type { GatherLoopView } from "@terra/shared/gather";
import type { NearbyUnit } from "@terra/shared/mapUnits";
import { sendGatherCommand } from "../../map/gather/gatherCommands.ts";
import { enterText, gatherErrorText, loopPhaseText, stopText } from "../../map/gather/gatherData.ts";
import { cityLabel, factionName } from "../../map/worldMapData.ts";
import { m } from "../../paraglide/messages.js";
import { getLocale } from "../../paraglide/runtime.js";
import { ChunkErrorBoundary } from "../../ui/ChunkErrorBoundary.tsx";
import { CityBuildingList, CityInfo, CityResourceList, CityUnitList, unitText } from "../city/CityPanels.tsx";
import {
  CITY_TABS,
  type CityResourceRow,
  type CityTab,
  buildingRows,
  canClaimCity,
  hasGovernment,
  loopOf,
  pickUnit,
  sortMyUnits,
} from "../city/cityCardData.ts";
import {
  loadBuildings,
  loadCities,
  loadLandRule,
  loadLoops,
  loadMyUnits,
  loadNearbyUnits,
  loadResources,
  loadTerrain,
  loadUnitsHere,
  useCityQuery,
} from "../city/useCityQuery.ts";
import { HomeLoading } from "../InboxBody.tsx";
import { HomeLink } from "../shellParts.tsx";
import { ExternalArrowIcon } from "./icons.tsx";
import "../city/cityCard.css";

const CityBuildingDialog = lazy(() => import("../city/CityBuildingDialog.tsx"));
const CityUnitDialog = lazy(() => import("../city/CityUnitDialog.tsx"));

/** 진행 줄(들어가기·채집)이 보이는 동안 다시 묻는 간격(ms) */
const LOOP_POLL_MS = 5_000;

const TAB_TEXT = {
  buildings: m.home_city_tab_buildings,
  units: m.home_city_tab_units,
  resources: m.home_city_tab_resources,
  info: m.home_city_tab_info,
} satisfies Record<CityTab, () => string>;

const mapTarget = (mapKey: number): RouteTarget => ({ route: "map", search: { key: String(mapKey) } });

/** 고르기 상자의 한 줄: 이름(+ 이동 중) */
function optionText(unit: WorldMyUnit): string {
  const name = unitText(unit);
  return unit.moving ? m.home_city_unit_moving({ unit: name }) : name;
}

/** 진행 줄의 글: 끝났으면 결과(들어감·넣음·멈춘 까닭), 아니면 단계(건물로 가는 중이면 건물 이름) */
function loopText(loop: GatherLoopView, buildingName: (buildingId: number) => string | null): string {
  if (loop.phase !== "done") return loopPhaseText(loop, buildingName);
  if (loop.enterResult) return enterText(loop.enterResult, loop.depositedUnits);
  return loop.stop ? stopText(loop.stop) : loopPhaseText(loop, buildingName);
}

export function CityCardBody() {
  const baseId = useId();
  const [chosen, setChosen] = useState<number | null>(null);
  const [tab, setTab] = useState<CityTab>("buildings");
  const [openId, setOpenId] = useState<number | null>(null);
  // 누른 남의 유닛(유닛 대화상자)
  const [openUnit, setOpenUnit] = useState<NearbyUnit | null>(null);
  // 카드에서 바로 보낸 명령(채집·멈추기): 보내는 중, 실패 까닭
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const mine = useCityQuery("me", loadMyUnits);
  const units = mine.state.data?.units ?? [];
  const unit = pickUnit(units, chosen);
  // 서버가 띄운 2차맵에 있을 때만 그 2차맵을 묻는다
  const mapKey = unit !== null && unit.loaded ? String(unit.mapKey) : null;

  const buildings = useCityQuery(mapKey, loadBuildings);
  const cities = useCityQuery(unit === null ? null : "all", loadCities);
  const unitsHere = useCityQuery(tab === "units" ? mapKey : null, loadUnitsHere);
  const resources = useCityQuery(tab === "resources" ? mapKey : null, loadResources);
  // 시야 안 남의 유닛: 유닛 탭(목록)과 정보 탭(미니맵 점)에서만 받는다. 거리는 기준 유닛에서 잰다
  const nearby = useCityQuery(
    mapKey !== null && unit !== null && (tab === "units" || tab === "info")
      ? `${mapKey}:${unit.unitId}`
      : null,
    loadNearbyUnits,
  );
  // 지형(미니맵): 정보 탭에서만 받는다
  const terrain = useCityQuery(tab === "info" ? mapKey : null, loadTerrain);
  // 내 채집·들어가기 줄: 홈을 열 때 한 번(앞서 보낸 채집이 돌고 있으면 보인다), 그 뒤는 명령을 보낸 뒤·진행 중일 때만 다시 묻는다
  const loops = useCityQuery(unit === null ? null : "me", loadLoops);

  const locale = getLocale() === "en" ? "en" : "ko";
  const looks = buildings.state.data?.status === "ok" ? buildings.state.data.buildings : null;
  const rows = looks === null ? [] : buildingRows(looks, locale);
  const world = cities.state.data?.status === "ready" ? cities.state.data : null;
  const here =
    world !== null && unit !== null ? world.cities.filter((city) => city.mapKey === unit.mapKey) : [];
  // 도시가 아닌 2차맵(도시 목록을 받았고 이 2차맵의 도시가 없다)에서만 땅 규칙을 묻는다
  const wild = world !== null && here.length === 0;
  const rule = useCityQuery(wild && looks !== null && !hasGovernment(rows) ? mapKey : null, loadLandRule);
  const claimable = wild && canClaimCity(rule.state.data);

  const loopsData = loops.state.data?.status === "ok" ? loops.state.data : null;
  const loop =
    unit === null || loopsData === null ? null : loopOf(loopsData.loops, unit.unitId, loopsData.generatedAt);
  const reloadLoops = loops.reload;
  // 진행 중인 줄이 보이는 동안만 다시 묻는다. 끝난 줄은 다시 묻지 않는다
  const loopOn = loop !== null && loop.phase !== "done";
  useEffect(() => {
    if (!loopOn) return undefined;
    const timer = setInterval(reloadLoops, LOOP_POLL_MS);
    return () => clearInterval(timer);
  }, [loopOn, reloadLoops]);

  const refresh = (): void => {
    mine.reload();
    buildings.reload();
    if (tab === "units") unitsHere.reload();
    if (tab === "units" || tab === "info") nearby.reload();
    if (tab === "resources") resources.reload();
    loops.reload();
  };

  const closeDialog = (): void => {
    setOpenId(null);
    // 판에서 보낸 명령(들어가기·관리)의 결과를 다시 읽는다
    loops.reload();
    buildings.reload();
    mine.reload();
  };

  /** 카드에서 바로 보낸 명령(채집·멈추기): 실패 까닭만 알리고, 보낸 것은 진행 줄이 알린다(2차맵 채집 판과 같다) */
  const send = async (run: () => ReturnType<typeof sendGatherCommand>): Promise<void> => {
    setSending(true);
    setProblem(null);
    const outcome = await run();
    setSending(false);
    setProblem(outcome.ok ? null : gatherErrorText(outcome.code));
    loops.reload();
    mine.reload();
    if (tab === "resources") resources.reload();
  };

  /** [채집]: 그 종류의 가장 가까운 캘 수 있는 오브젝트로 기준 유닛을 보낸다(유닛이 걸어간다 — 규칙은 2차맵과 같다) */
  const gather = (row: CityResourceRow): void => {
    const target = row.nearest;
    if (unit === null || target === null) return;
    void send(() =>
      sendGatherCommand({
        t: "gather_start",
        unitId: unit.unitId,
        mapKey: unit.mapKey,
        objectId: target.objectId,
      }),
    );
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = CITY_TABS[(index + step + CITY_TABS.length) % CITY_TABS.length] ?? "buildings";
    setTab(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  };

  if (unit === null) {
    if (mine.state.status === "loading") return <HomeLoading />;
    return (
      <div className="city-card" data-state={mine.state.status === "error" ? "error" : "empty"}>
        <p className="home-card-hint">
          {mine.state.status === "error"
            ? m.home_city_load_failed()
            : mine.state.data?.status === "not_ready"
              ? m.home_city_not_ready()
              : m.home_city_no_units()}
        </p>
        <button type="button" className="button-small city-card-refresh" onClick={mine.reload}>
          {m.retry()}
        </button>
      </div>
    );
  }

  const buildingName = (buildingId: number): string | null =>
    rows.find((row) => row.id === buildingId)?.name ?? null;
  const openRow = openId === null ? null : (rows.find((row) => row.id === openId) ?? null);
  const busy =
    mine.state.status === "loading" ||
    buildings.state.status === "loading" ||
    unitsHere.state.status === "loading" ||
    resources.state.status === "loading" ||
    nearby.state.status === "loading";

  return (
    <div className="city-card" data-map={unit.mapKey} data-unit={unit.unitId} data-tab={tab}>
      <div className="city-card-top">
        <label className="city-card-unit">
          <span className="visually-hidden">{m.home_city_unit_label()}</span>
          <select
            value={unit.unitId}
            onChange={(event) => {
              setChosen(Number(event.target.value));
              setOpenId(null);
              setOpenUnit(null);
              setProblem(null);
            }}
          >
            {sortMyUnits(units).map((entry) => (
              <option key={entry.unitId} value={entry.unitId}>
                {optionText(entry)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button-small city-card-refresh"
          aria-busy={busy}
          disabled={busy}
          onClick={refresh}
        >
          {m.reload()}
        </button>
        <HomeLink to={mapTarget(unit.mapKey)} className="home-card-action home-link-button city-card-map">
          <span>{m.home_city_open_map()}</span>
          <ExternalArrowIcon />
        </HomeLink>
      </div>

      <p className="city-card-place" data-wild={wild}>
        {world === null ? (
          <span className="home-muted">{cities.state.status === "error" ? "" : m.home_loading()}</span>
        ) : wild ? (
          <span className="city-card-place-name">{m.home_city_place_wild()}</span>
        ) : (
          here.map((city) => (
            <span key={city.id} className="city-card-place-name" data-city={city.id} translate="no">
              {[
                cityLabel(world.factions, city),
                factionName(world.factions, city.factionId),
                ...(city.grade === null ? [] : [m.map_city_grade({ grade: city.grade })]),
                ...(city.capital === true ? [m.map_city_capital()] : []),
              ].join(" · ")}
            </span>
          ))
        )}
        {claimable ? (
          <HomeLink
            to={mapTarget(unit.mapKey)}
            className="city-card-claim"
            data-part="claim"
            title={m.home_city_claim_hint()}
          >
            {m.home_city_claim_chip()}
          </HomeLink>
        ) : null}
      </p>

      {loop ? (
        <div className="city-card-loop" role="status" data-phase={loop.phase}>
          <span>{m.home_city_loop_line({ unit: unitText(unit), status: loopText(loop, buildingName) })}</span>
          {loop.phase !== "done" && loop.kindId !== null ? (
            <button
              type="button"
              className="button-small city-card-stop"
              disabled={sending}
              onClick={() => void send(() => sendGatherCommand({ t: "gather_stop", unitId: loop.unitId }))}
            >
              {m.gather_action_stop()}
            </button>
          ) : null}
        </div>
      ) : null}
      {problem ? (
        <p className="city-card-problem" role="alert">
          {problem}
        </p>
      ) : null}

      <div className="city-card-tabs" role="tablist" aria-label={m.home_city_tabs_label()}>
        {CITY_TABS.map((id, index) => (
          <button
            key={id}
            id={`${baseId}-tab-${id}`}
            type="button"
            role="tab"
            className="city-card-tab"
            data-tab={id}
            aria-selected={tab === id}
            aria-controls={`${baseId}-panel`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => onTabKey(event, index)}
          >
            <span>{TAB_TEXT[id]()}</span>
            {id === "buildings" && looks !== null ? (
              <span className="city-card-tab-count">{rows.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div
        id={`${baseId}-panel`}
        className="city-card-panel"
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${tab}`}
      >
        {mapKey === null && tab !== "info" ? (
          <p className="home-card-hint" data-part="unloaded">
            {m.home_city_unloaded()}
          </p>
        ) : tab === "buildings" ? (
          <CityBuildingList
            // 2차맵이 바뀌면 거르기를 처음으로
            key={unit.mapKey}
            state={buildings.state}
            rows={rows}
            openId={openId}
            onOpen={setOpenId}
            onRetry={buildings.reload}
          />
        ) : tab === "units" ? (
          <CityUnitList
            state={unitsHere.state}
            nearby={nearby.state}
            selected={unit.unitId}
            onPick={setChosen}
            onOpen={setOpenUnit}
            openId={openUnit?.unitId ?? null}
            onRetry={() => {
              unitsHere.reload();
              nearby.reload();
            }}
          />
        ) : tab === "resources" ? (
          <CityResourceList
            state={resources.state}
            at={{ x: unit.cellX, y: unit.cellY }}
            aboard={unit.aboardId !== null && unit.aboardId !== undefined}
            sending={sending}
            onGather={gather}
            onRetry={resources.reload}
          />
        ) : (
          <CityInfo
            unit={unit}
            world={world}
            cities={here}
            buildings={looks === null ? null : rows}
            mine={units
              .filter((entry) => entry.mapKey === unit.mapKey)
              .map((entry) => ({ unitId: entry.unitId, x: entry.cellX, y: entry.cellY }))}
            others={nearby.state.data?.status === "ready" ? nearby.state.data.units : []}
            terrain={terrain.state.data}
            claimable={claimable}
          />
        )}
      </div>

      {openId !== null ? (
        <ChunkErrorBoundary fallback={<p className="home-card-hint">{m.home_city_load_failed()}</p>}>
          <Suspense fallback={null}>
            <CityBuildingDialog
              key={openId}
              mapKey={unit.mapKey}
              buildingId={openId}
              buildingName={openRow?.name ?? null}
              actor={unit.unitId}
              onClose={closeDialog}
            />
          </Suspense>
        </ChunkErrorBoundary>
      ) : null}
      {openUnit !== null ? (
        <ChunkErrorBoundary fallback={<p className="home-card-hint">{m.home_city_load_failed()}</p>}>
          <Suspense fallback={null}>
            <CityUnitDialog
              key={openUnit.unitId}
              mapKey={unit.mapKey}
              unitId={openUnit.unitId}
              moving={openUnit.moving}
              leader={openUnit.kind === "npc_leader"}
              actor={unit.unitId}
              onClose={() => {
                setOpenUnit(null);
                nearby.reload();
              }}
            />
          </Suspense>
        </ChunkErrorBoundary>
      ) : null}
    </div>
  );
}
