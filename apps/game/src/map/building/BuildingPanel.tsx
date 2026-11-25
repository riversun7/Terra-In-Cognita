// 2차맵 건물 판 — 사용자 요청 2026-11-15 "건물선택시 ui가 그냥 쓰레기다 제대로 꾸미고 … 주인의 건물관리 기능(운영자도 조작가능) … 재무제표 …
// 주식을 사고팔수있게도", docs/adr/2026-11-15-building-screen.md. 디자인 시스템(ADR 2026-10-28-design-system)·수·막대(ADR 2026-11-01-ui-visibility).
// - 머리: 시설 이름·레벨, 분류 칩, 주인 이름표(소유자 이름 또는 가장 많은 주주 이름·몫, 내 것이면 "내 것" 표시 — "남의 건물" 대신).
// - 칸(탭): 개요(하는 일·상태·안에 있는 유닛·채집소 요약·배 시설·정부) / 일꾼(일꾼·일자리·임대·계약) / 창고(채집소 창고·사업장 물건) /
//   장부(요약·막대 → [재무 보기] 화면) / 지분(주주·동시호가) / 관리(주인·대주주·운영자: 임금·임대료·정산·넣기·값·레벨 올리기).
//   사업장이 아닌 건물은 개요만. 관리 칸은 관리할 수 있을 때만. 증권 거래소 건물은 개요 칸에 거래소 판(shares/ShareHub.tsx — D-583).
//   주거 건물(생활 단계)이면 개요에 [사는 곳] 카드(D-585 1 — ResidenceCard.tsx).
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
import { ExchangeFeeService, FxFeeService, ShareFeeService } from "../business/FxFeeService.tsx";
import { HaulService } from "../business/HaulService.tsx";
import { RepairService } from "../business/RepairService.tsx";
import { ReserveTools } from "../business/ReserveTools.tsx";
import { ownerText, pmText } from "../business/businessText.ts";
import { ShareMarket } from "../business/ShareMarket.tsx";
import { nameText } from "../gather/gatherData.ts";
import type { GatherState } from "../gather/gatherState.ts";
import { StationPanel, useStation } from "../gather/StationPanel.tsx";
import { BuildingAccessControl } from "./BuildingAccessControl.tsx";
import { BuildingLabor, useLaborBuilding } from "./BuildingLabor.tsx";
import { BuildingReloadContext } from "./buildingReloadContext.ts";
import { ResidenceCard } from "./ResidenceCard.tsx";
import type { BuildingOwnerResponse } from "@terra/shared/businessBooks";
import { STOCK_EXCHANGE_FACILITY } from "@terra/shared/cityShares";
import { ShareHub } from "../../shares/ShareHub.tsx";
import { EntityRef, EntitySymbol } from "../../ui/EntityRef.tsx";
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

/** 탭별 14px 미니 아이콘(안 C — 아이콘 + 짧은 글자 언더라인 탭바) */
function TabIcon({ tab }: { readonly tab: BuildingTab }) {
  let path: ReactNode;
  switch (tab) {
    case "overview":
      path = (
        <>
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </>
      );
      break;
    case "work":
      path = (
        <>
          <circle cx="9.5" cy="8.5" r="3" />
          <path d="M4 19c.6-3.2 2.7-5 5.5-5s4.9 1.8 5.5 5" />
          <circle cx="17" cy="9.5" r="2.2" />
          <path d="M16.2 14.2c2.1-.2 3.8 1.2 4.3 4.3" />
        </>
      );
      break;
    case "storage":
      path = (
        <>
          <path d="M4 8.5 12 4.5l8 4v7L12 19.5l-8-4z" />
          <path d="M4 8.5 12 12.5l8-4M12 12.5v7" />
        </>
      );
      break;
    case "books":
      path = (
        <>
          <path d="M4 19h16" />
          <path d="M7 15v-4M12 15V7M17 15v-6" />
        </>
      );
      break;
    case "shares":
      path = (
        <>
          <path d="M12 3.5A8.5 8.5 0 1 0 20.5 12H12z" />
          <path d="M14.5 3.8A8.5 8.5 0 0 1 20.2 9.5H14.5z" />
        </>
      );
      break;
    default:
      path = (
        <>
          <path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12M20 17h0" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="10" cy="12" r="2" />
          <circle cx="18" cy="17" r="2" />
        </>
      );
      break;
  }
  return (
    <svg
      className="bp-tab-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path}
    </svg>
  );
}

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

  const ownerEntity = ownerOk
    ? ownerOk.top
      ? {
          isMajor: true,
          kind: ownerOk.top.kind,
          name: ownerText(ownerOk.top.name, ownerOk.top.kind),
          pct: pmText(ownerOk.top.pm),
        }
      : {
          isMajor: false,
          kind: ownerOk.ownerKind,
          name: ownerText(ownerOk.ownerName, ownerOk.ownerKind),
          pct: undefined,
        }
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
          <EntitySymbol kind="building" />
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
          {ownerEntity !== null ? (
            business ? (
              <button
                type="button"
                className="bp-chip bp-chip-btn bp-owner"
                data-part="building-owner"
                data-kind={ownerEntity.kind ?? "none"}
                title={m.building_owner_open_shares()}
                onClick={() => setTab("shares")}
              >
                <span className="bp-chip-label">
                  {ownerEntity.isMajor ? m.building_major_holder_label() : m.building_owner_label()}
                </span>
                <EntityRef
                  kind={ownerEntity.kind === "npc" ? "nation" : "unit"}
                  role={ownerEntity.kind === "npc" ? undefined : "cyborg"}
                  name={ownerEntity.name}
                  suffix={ownerEntity.pct}
                  mine={ownerEntity.kind === "me"}
                />
                <span className="bp-chip-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            ) : (
              <span
                className="bp-chip bp-owner"
                data-part="building-owner"
                data-kind={ownerEntity.kind ?? "none"}
              >
                <span className="bp-chip-label">
                  {ownerEntity.isMajor ? m.building_major_holder_label() : m.building_owner_label()}
                </span>
                <EntityRef
                  kind={ownerEntity.kind === "npc" ? "nation" : "unit"}
                  role={ownerEntity.kind === "npc" ? undefined : "cyborg"}
                  name={ownerEntity.name}
                  suffix={ownerEntity.pct}
                  mine={ownerEntity.kind === "me"}
                />
              </span>
            )
          ) : null}
          {ownerOk?.mine ? (
            <span className="bp-chip bp-mine" data-part="building-mine">
              {m.building_mine_short()}
            </span>
          ) : null}
          {ownerOk && !ownerOk.mine && ownerOk.myPm > 0 ? (
            <button
              type="button"
              className="bp-chip bp-chip-btn bp-mine"
              title={m.building_owner_open_shares()}
              onClick={() => setTab("shares")}
            >
              {m.building_my_share({ pct: pmText(ownerOk.myPm) })}
            </button>
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
              <TabIcon tab={id} />
              <span>{TAB_TEXT[id]()}</span>
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
            {ownerOk?.accessScope !== undefined ? (
              <BuildingAccessControl
                key={`${buildingId}-${ownerOk.ownAccessScope ?? "default"}`}
                buildingId={buildingId}
                scope={ownerOk.accessScope}
                ownScope={ownerOk.ownAccessScope ?? null}
                allowed={ownerOk.accessAllowed ?? true}
                reason={ownerOk.accessBlockReason ?? null}
                canSet={ownerOk.canSetAccess === true || operator}
                showEditor={!ownerTools && (ownerOk.canSetAccess === true || operator)}
                reload={reloadAll}
              />
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
                    {ok.inside.map((unit) => {
                      const label = unitLabel(unit.unitId);
                      const role = unit.own ? "cyborg" : "human";
                      return (
                        <li key={unit.unitId} className="bp-row" data-unit={unit.unitId} data-via={unit.via}>
                          <span className="bp-tag" data-via={unit.via}>
                            {unit.via === "work" ? m.building_inside_work() : m.building_inside_stay()}
                          </span>
                          <span className="bp-grow">
                            <EntityRef
                              kind="unit"
                              role={role}
                              name={label}
                              mine={unit.own}
                              popup={{
                                kind: "unit",
                                role,
                                title: label,
                                kindLabel: unit.own ? m.entity_kind_cyborg() : m.entity_kind_unit(),
                                facts: [
                                  {
                                    label: m.entity_unit_field_state(),
                                    value:
                                      unit.via === "work"
                                        ? m.entity_unit_state_work()
                                        : m.entity_unit_state_stay(),
                                  },
                                  { label: m.entity_unit_field_id(), value: `#${unit.unitId}` },
                                ],
                              }}
                            />
                          </span>
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
                      );
                    })}
                  </ul>
                )}
              </section>
            ) : null}
            {ok?.stage === "living" ? (
              <ResidenceCard buildingId={buildingId} actor={actor} unitLabel={unitLabel} />
            ) : null}
            {extra ? <BuildingReloadContext value={reloadAll}>{extra}</BuildingReloadContext> : null}
            {ok?.facilityId === STOCK_EXCHANGE_FACILITY && ok.level > 0 ? (
              // 증권 거래소 주기능(D-583): 그 나라 정부 지분·사업장 지분 시장
              <ShareHub key={buildingId} buildingId={buildingId} />
            ) : null}
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
            {ownerOk?.accessScope !== undefined && (ownerOk.canSetAccess === true || operator) ? (
              <BuildingAccessControl
                key={`${buildingId}-manage-${ownerOk.ownAccessScope ?? "default"}`}
                buildingId={buildingId}
                scope={ownerOk.accessScope}
                ownScope={ownerOk.ownAccessScope ?? null}
                allowed={ownerOk.accessAllowed ?? true}
                reason={ownerOk.accessBlockReason ?? null}
                canSet={true}
                showEditor={true}
                reload={reloadAll}
              />
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
            {booksOk ? <ShareFeeService books={booksOk} reload={reloadAll} /> : null}
            {booksOk ? <HaulService books={booksOk} reload={reloadAll} /> : null}
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
