// 2차맵 건물 판 — 사용자 요청 2026-11-15 "건물선택시 ui가 그냥 쓰레기다 제대로 꾸미고 … 주인의 건물관리 기능(운영자도 조작가능) … 재무제표 …
// 주식을 사고팔수있게도", docs/adr/2026-11-15-building-screen.md. 디자인 시스템(ADR 2026-10-28-design-system)·수·막대(ADR 2026-11-01-ui-visibility).
// - 머리: 시설 이름·레벨, 분류 칩, 주인 이름표(소유자 이름 또는 가장 많은 주주 이름·몫, 내 것이면 "내 것" 표시 — "남의 건물" 대신).
// - 칸(탭): 개요(하는 일·상태·안에 있는 유닛·채집소 요약·배 시설·정부) / 일꾼(일꾼·일자리·임대·계약) / 창고(채집소 창고·사업장 물건) /
//   장부(요약·막대 → [재무 보기] 화면) / 지분(주주·동시호가) / 관리(주인·대주주·운영자: 임금·임대료·정산·넣기·값·레벨 올리기).
//   사업장이 아닌 건물은 개요만. 관리 칸은 관리할 수 있을 때만.
// - 아래 고정: 보내는 유닛 줄 + [들어가기]·[닫기]. 모바일 우선(390px) — 판 높이 안에서 칸 몸만 넘긴다.
// - 반경 고리: 고른 채집소에 반경이 있으면(오브젝트 채집소) 칸과 상관없이 그린다(사용자 요청 "건물선택시 오브젝트 포함할 반경 표시").
import type { GatherBuildingResponse } from "@terra/shared/gather";
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { navigate } from "../../shell/routerStore.ts";
import { FACILITY_CATEGORY_TEXT } from "../facilityCategoryText.ts";
import { HarborPanel } from "../boats/HarborPanel.tsx";
import { BOOK_PERIODS, type BookPeriod, loadOwner, useBooks } from "../business/booksData.ts";
import { BooksAlert, BooksSummary, DayBars, GoodsSale, OwnerMoneyTools } from "../business/BooksParts.tsx";
import { ExchangeFeeService, FxFeeService } from "../business/FxFeeService.tsx";
import { RepairService } from "../business/RepairService.tsx";
import { ReserveTools } from "../business/ReserveTools.tsx";
import { ownerText, pmText } from "../business/businessText.ts";
import { ShareMarket } from "../business/ShareMarket.tsx";
import { nameText } from "../gather/gatherData.ts";
import type { GatherState } from "../gather/gatherState.ts";
import { StationPanel, useStation } from "../gather/StationPanel.tsx";
import { BuildingLabor, useLaborBuilding } from "./BuildingLabor.tsx";
import type { BuildingOwnerResponse } from "@terra/shared/businessBooks";
import "./building.css";

export type BuildingTab = "overview" | "work" | "storage" | "books" | "shares" | "manage";

const TAB_TEXT: Readonly<Record<BuildingTab, () => string>> = {
  overview: m.building_tab_overview,
  work: m.building_tab_work,
  storage: m.building_tab_storage,
  books: m.building_tab_books,
  shares: m.building_tab_shares,
  manage: m.building_tab_manage,
};

interface BuildingPanelProps {
  readonly state: GatherState;
  readonly mapKey: number;
  readonly buildingId: number;
  readonly building: GatherBuildingResponse | null;
  readonly reloadBuilding: () => void;
  readonly actor: number | null;
  readonly actorText: string;
  readonly unitLabel: (unitId: number) => string;
  /** 판 안에 더 넣을 몫(행정 건물의 정부 몫) */
  readonly extra?: ReactNode;
  /** 운영자 모드(남의 건물도 관리 — 서버가 다시 본다) */
  readonly operator: boolean;
  readonly sending: boolean;
  readonly onEnter: () => void;
  /** 들어가기로 머문 내 유닛 [나가기](멈추기 명령 — 서버가 안에 머묾을 끝낸다, 사용자 답 2026-11-15) */
  readonly onLeave: (unitId: number) => void;
  readonly onClose: () => void;
  readonly notify: (text: string) => void;
}

/** 머리 이름표 자료(열 때 읽고, reload는 명령 뒤) */
function useOwner(buildingId: number): {
  readonly owner: BuildingOwnerResponse | null;
  readonly reload: () => void;
} {
  const [owner, setOwner] = useState<BuildingOwnerResponse | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    loadOwner(buildingId, controller.signal)
      .then((response) => setOwner(response))
      .catch(() => undefined);
    return () => controller.abort();
  }, [buildingId]);
  const reload = useCallback(() => {
    loadOwner(buildingId)
      .then((response) => setOwner(response))
      .catch(() => undefined);
  }, [buildingId]);
  return { owner: owner?.status === "ok" && owner.buildingId !== buildingId ? null : owner, reload };
}

export function BuildingPanel({
  state,
  mapKey,
  buildingId,
  building,
  reloadBuilding,
  actor,
  actorText,
  unitLabel,
  extra,
  operator,
  sending,
  onEnter,
  onLeave,
  onClose,
  notify,
}: BuildingPanelProps) {
  const baseId = useId();
  const [tab, setTab] = useState<BuildingTab>("overview");
  const [days, setDays] = useState<BookPeriod>(7);
  const { owner, reload: reloadOwner } = useOwner(buildingId);
  const { station, refresh: refreshStation } = useStation(buildingId);
  const ok = building?.status === "ok" ? building : null;
  const ownerOk = owner?.status === "ok" ? owner : null;
  const business = ownerOk?.business === true;
  const manage = ownerOk !== null && ownerOk.ownerKind !== null && (ownerOk.canManage || operator);
  // 정산·지급준비율·넣기(D-555 1502 "주인 또는 대주주" — 기획 대조 2047): 지분을 팔아 대주주가 아닌 건물 주인도 [관리] 칸을 본다(값 정하기는 manage만)
  const ownerTools = manage || (business && ownerOk !== null && ownerOk.mine);
  const booksOn = business && (tab === "books" || tab === "shares" || tab === "storage" || tab === "manage");
  const { books, failed, reload: reloadBooks } = useBooks(buildingId, days, booksOn);
  const laborOn = business && (tab === "work" || tab === "manage");
  const { data: labor, reload: reloadLabor } = useLaborBuilding(buildingId, laborOn);
  const booksOk = books?.status === "ok" ? books : null;
  const stationOk = station?.status === "ok" && station.kind !== null ? station : null;

  // 반경 고리: 반경이 있는 채집소(오브젝트 채집소)면 그린다, 판이 닫히면 지운다
  const ringRadius = stationOk?.buffs?.radiusCells ?? null;
  const ringX = stationOk && ringRadius !== null ? stationOk.x : null;
  const ringY = stationOk && ringRadius !== null ? stationOk.y : null;
  useEffect(() => {
    if (ringX === null || ringY === null || ringRadius === null) state.setRing(null);
    else state.setRing({ x: ringX, y: ringY, radius: ringRadius });
    return () => state.setRing(null);
  }, [state, ringX, ringY, ringRadius]);

  const tabs: BuildingTab[] = ["overview"];
  if (business) tabs.push("work");
  if (business || stationOk) tabs.push("storage");
  if (business) tabs.push("books", "shares");
  if (ownerTools) tabs.push("manage");
  const current = tabs.includes(tab) ? tab : "overview";

  /** 명령 뒤 모두 다시 읽는다(이름표·장부·노동·채집소·건물) */
  const reloadAll = (): void => {
    reloadOwner();
    reloadBooks();
    reloadLabor();
    void refreshStation();
    reloadBuilding();
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length] ?? "overview";
    setTab(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  };

  const stationPart = (part: "summary" | "workers" | "storage" | "upgrade") => (
    <StationPanel
      state={state}
      mapKey={mapKey}
      buildingId={buildingId}
      actor={actor}
      notify={notify}
      station={station}
      refresh={refreshStation}
      part={part}
      operator={operator}
    />
  );

  const ownerLabel = ownerOk
    ? ownerOk.top
      ? m.building_owner_top({
          name: ownerText(ownerOk.top.name, ownerOk.top.kind),
          pct: pmText(ownerOk.top.pm),
        })
      : ownerText(ownerOk.ownerName, ownerOk.ownerKind)
    : null;

  return (
    <section
      className="map-panel gather-sheet bp"
      aria-label={m.gather_building_label()}
      data-building={buildingId}
      data-tab={current}
    >
      <header className="bp-head">
        <div className="bp-title-row">
          <h2 className="gather-title bp-title">{nameText(ok?.name ?? null, m.gather_building_unknown())}</h2>
          {ok && ok.level > 0 ? (
            <span className="bp-level" data-part="building-level">
              {m.gather_building_level({ level: ok.level })}
            </span>
          ) : null}
        </div>
        <div className="bp-chips">
          {ok?.category ? (
            <span className="bp-chip" data-category={ok.category}>
              {FACILITY_CATEGORY_TEXT[ok.category]()}
            </span>
          ) : null}
          {ownerLabel !== null ? (
            <span
              className="bp-chip bp-owner"
              data-part="building-owner"
              data-kind={ownerOk?.ownerKind ?? "none"}
            >
              <span className="bp-chip-label">{m.building_owner_label()}</span>
              <span className="bp-owner-name">{ownerLabel}</span>
            </span>
          ) : null}
          {ownerOk?.mine ? (
            <span className="bp-chip bp-mine" data-part="building-mine">
              {m.building_mine_short()}
            </span>
          ) : null}
          {ownerOk && !ownerOk.mine && ownerOk.myPm > 0 ? (
            <span className="bp-chip bp-mine">{m.building_my_share({ pct: pmText(ownerOk.myPm) })}</span>
          ) : null}
          {operator && ownerOk && !ownerOk.canManage ? (
            <span className="bp-chip bp-operator">{m.building_operator_chip()}</span>
          ) : null}
        </div>
      </header>

      {tabs.length > 1 ? (
        <div className="bp-tabs" role="tablist" aria-label={m.building_tabs_label()}>
          {tabs.map((id, index) => (
            <button
              key={id}
              id={`${baseId}-tab-${id}`}
              type="button"
              role="tab"
              className="bp-tab"
              data-tab={id}
              aria-selected={current === id}
              aria-controls={`${baseId}-panel`}
              tabIndex={current === id ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={(event) => onTabKey(event, index)}
            >
              {TAB_TEXT[id]()}
            </button>
          ))}
        </div>
      ) : null}

      <div
        id={`${baseId}-panel`}
        className="bp-body"
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${current}`}
      >
        {current === "overview" ? (
          <>
            {ok ? (
              <p className="bp-lead">
                {ok.accepts
                  ? m.gather_building_accepts()
                  : ok.hires
                    ? m.gather_building_hires()
                    : m.gather_building_stays()}
              </p>
            ) : null}
            {stationPart("summary")}
            {ok ? (
              <section className="bp-card" aria-label={m.gather_building_inside()}>
                <h3 className="bp-card-title gather-inside-title">
                  {m.gather_building_inside()} <span className="bp-muted">· {ok.inside.length}</span>
                </h3>
                {ok.inside.length === 0 ? (
                  <p className="bp-muted">{m.gather_building_inside_none()}</p>
                ) : (
                  <ul className="bp-list gather-inside">
                    {ok.inside.map((unit) => (
                      <li key={unit.unitId} className="bp-row" data-unit={unit.unitId} data-via={unit.via}>
                        <span className="bp-tag" data-via={unit.via}>
                          {unit.via === "work" ? m.building_inside_work() : m.building_inside_stay()}
                        </span>
                        <span className="bp-grow">{unitLabel(unit.unitId)}</span>
                        {unit.own ? <span className="bp-mine-dot">{m.building_mine_short()}</span> : null}
                        {unit.own && unit.via === "inside" ? (
                          <button
                            type="button"
                            className="button-small gather-leave"
                            disabled={sending}
                            onClick={() => onLeave(unit.unitId)}
                          >
                            {m.gather_building_leave()}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
            {extra}
            {ok?.harbor ? (
              <HarborPanel
                key={buildingId}
                buildingId={buildingId}
                level={ok.level}
                mine={ok.mine}
                harbor={ok.harbor}
                reload={reloadBuilding}
              />
            ) : null}
          </>
        ) : null}

        {current === "work" ? (
          <>
            {stationPart("workers")}
            <BuildingLabor
              buildingId={buildingId}
              data={labor}
              reload={reloadAll}
              manage={manage}
              unitLabel={unitLabel}
              actor={actor}
              section="work"
            />
          </>
        ) : null}

        {current === "storage" ? (
          <>
            {stationPart("storage")}
            {booksOk ? <GoodsSale books={booksOk} manage={manage} reload={reloadAll} /> : null}
          </>
        ) : null}

        {current === "books" ? (
          booksOk ? (
            <>
              <BooksAlert books={booksOk} />
              <fieldset className="bp-periods">
                <legend className="bp-muted">{m.books_period()}</legend>
                {BOOK_PERIODS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={value === days ? "button-small button-primary" : "button-small"}
                    aria-pressed={value === days}
                    onClick={() => setDays(value)}
                  >
                    {m.books_days({ days: value })}
                  </button>
                ))}
              </fieldset>
              <BooksSummary books={booksOk} />
              <DayBars days={booksOk.days} />
              <button
                type="button"
                className="button-small button-primary bp-wide"
                data-part="books-open"
                onClick={() =>
                  navigate({ route: "building_books", params: { buildingId: String(buildingId) } })
                }
              >
                {m.building_open_finance()}
              </button>
            </>
          ) : (
            <p className="bp-muted">{failed ? m.books_load_failed() : m.books_loading()}</p>
          )
        ) : null}

        {current === "shares" ? (
          booksOk ? (
            <ShareMarket
              buildingId={buildingId}
              holders={booksOk.holders}
              market={booksOk.market}
              reload={reloadAll}
            />
          ) : (
            <p className="bp-muted">{failed ? m.books_load_failed() : m.books_loading()}</p>
          )
        ) : null}

        {current === "manage" ? (
          <>
            {operator && ownerOk && !ownerOk.canManage ? (
              <p className="bp-warn">{m.building_operator_note()}</p>
            ) : null}
            {booksOk ? <BooksAlert books={booksOk} /> : null}
            {business ? (
              <BuildingLabor
                buildingId={buildingId}
                data={labor}
                reload={reloadAll}
                manage={manage}
                unitLabel={unitLabel}
                actor={actor}
                section="manage"
              />
            ) : null}
            {booksOk ? <OwnerMoneyTools books={booksOk} reload={reloadAll} /> : null}
            {booksOk ? <ReserveTools books={booksOk} reload={reloadAll} /> : null}
            {booksOk ? <RepairService books={booksOk} reload={reloadAll} /> : null}
            {booksOk ? <FxFeeService books={booksOk} reload={reloadAll} /> : null}
            {booksOk ? <ExchangeFeeService books={booksOk} reload={reloadAll} /> : null}
            {stationPart("upgrade")}
          </>
        ) : null}
      </div>

      <footer className="gather-footer bp-foot">
        <p className="gather-actor">{actorText}</p>
        <div className="gather-actions">
          <button
            type="button"
            className="button-small button-primary gather-sheet-enter"
            disabled={actor === null || sending}
            onClick={onEnter}
          >
            {m.gather_action_enter()}
          </button>
          <button type="button" className="button-small gather-sheet-close" onClick={onClose}>
            {m.gather_action_close()}
          </button>
        </div>
      </footer>
    </section>
  );
}
