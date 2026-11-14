// 인벤토리 화면(/inventory) — 사용자 요청 2026-11-14 "인벤토리 시스템 추가 … 첫 페이지에도 통합으로 유닛별, 창고별, 건물별, 전체적으로
// 보유한 아이템을 볼수있게". 옛 경제 창고 칸(/economy/warehouse)을 이리로 옮겼다(그 주소는 [창고별] 칸으로 바꿔 연다).
// docs/adr/2026-11-14-inventory-screen.md. 지연 로딩 조각이다(default export, shell/routeViews.tsx).
// - [전체]: 지갑(화폐) + 모든 자리의 같은 물건을 더한 줄과 추정 가치(inventoryModel.ts).
// - [유닛별]: 유닛마다 화물 + 장비·지닌 물건(장착·해제·사용, UnitsTab.tsx).
// - [창고별]: 도시 창고 + 내 창고 시설(넣기·꺼내기 = WebSocket storage_move, economy/StorageParts.tsx의 폼 그대로).
// - [건물별]: 그 밖의 건물 창고(생산 시설 창고·임대 몫).
// 자료는 서버 조회(economy.holdings·facilities.overview·economy.marketItems·units.list)를 그대로 쓴다. 바꾸는 명령은 WebSocket뿐이다.
import type { RouteTarget } from "@terra/shared";
import type { FacilitiesOverviewResponse } from "@terra/shared/facilities";
import { useState } from "react";
import { type CatalogIndex, assetName, indexCatalog, pickName } from "../economy/economyText.ts";
import { sendFacilityCommand } from "../economy/facilityCommands.ts";
import { FACILITY_ERROR_TEXT, type FacilityRun } from "../economy/facilityText.ts";
import { Amount, Loaded } from "../economy/parts.tsx";
import { NO_ARGS, useCatalog, useFacilities, useHoldings, useMarketItems } from "../economy/queries.ts";
import { StorageMoveForm } from "../economy/StorageParts.tsx";
import { m } from "../paraglide/messages.js";
import { AppLink } from "../shell/AppLink.tsx";
import { BackButton } from "../shell/BackButton.tsx";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import {
  INVENTORY_TABS,
  type InventoryTab,
  type ItemPrice,
  type PlaceGroups,
  type TotalLine,
  buildingIdOf,
  estimateValue,
  groupPlaces,
  parseInventoryTab,
  totalLines,
} from "./inventoryModel.ts";
import { priceLookup, valueText } from "./inventoryValue.ts";
import { PlaceCard, WalletPanel } from "./PlaceCard.tsx";
import { UnitsTab } from "./UnitsTab.tsx";
import { useGearSources } from "./unitGear.ts";
import "../economy/economy.css";
import "./inventory.css";

const TAB_LABELS: Readonly<Record<InventoryTab, () => string>> = {
  all: m.inventory_tab_all,
  units: m.inventory_tab_units,
  warehouses: m.inventory_tab_warehouses,
  buildings: m.inventory_tab_buildings,
};

function InventoryTabs({ current }: { current: InventoryTab }) {
  return (
    <nav className="eco-tabs" aria-label={m.inventory_tabs_label()}>
      <ul className="eco-tabs-list">
        {INVENTORY_TABS.map((tab) => {
          const target: RouteTarget = { route: "inventory", search: tab === "all" ? {} : { tab } };
          return (
            <li key={tab}>
              <AppLink
                to={target}
                replace
                className="eco-tab"
                data-tab={tab}
                aria-current={tab === current ? "page" : undefined}
              >
                {TAB_LABELS[tab]()}
              </AppLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function AllTab({
  wallet,
  totals,
  groups,
  index,
  priceOf,
}: {
  wallet: Parameters<typeof WalletPanel>[0]["wallet"];
  totals: readonly TotalLine[];
  groups: PlaceGroups;
  index: CatalogIndex;
  priceOf: (item: string) => ItemPrice | null;
}) {
  const value = estimateValue(totals, priceOf);
  const placeCount =
    groups.warehouses.length + groups.buildings.length + groups.cargo.size + groups.ledger.length;
  return (
    <div className="eco-stack">
      <WalletPanel wallet={wallet} index={index} />
      <section className="panel inventory-summary" aria-labelledby="inventory-summary-title">
        <h2 id="inventory-summary-title" className="eco-section-title">
          {m.inventory_summary_title()}
        </h2>
        <dl className="inventory-facts">
          <div>
            <dt>{m.inventory_fact_kinds()}</dt>
            <dd data-fact="kinds">{totals.length}</dd>
          </div>
          <div>
            <dt>{m.inventory_fact_places()}</dt>
            <dd data-fact="places">{placeCount}</dd>
          </div>
          <div>
            <dt>{m.inventory_fact_value()}</dt>
            <dd data-fact="value">{valueText(value, index) ?? m.inventory_value_none()}</dd>
          </div>
        </dl>
        <p className="eco-footnote">{m.inventory_value_note({ unpriced: value.unpriced })}</p>
      </section>
      <section className="panel" aria-labelledby="inventory-totals-title">
        <h2 id="inventory-totals-title" className="eco-section-title">
          {m.inventory_totals_title()}
        </h2>
        {totals.length === 0 ? (
          <p className="eco-empty">{m.inventory_empty()}</p>
        ) : (
          <ul className="eco-hold-list" data-part="totals">
            {totals.map((total) => (
              <li key={total.asset} className="eco-hold-row" data-asset={total.asset}>
                <span className="eco-hold-name">
                  <span className="eco-hold-title">{assetName(index, total.line)}</span>
                  <span className="eco-hold-meta">{m.inventory_total_places({ places: total.places })}</span>
                </span>
                <Amount value={total.qty.toString()} className="eco-hold-qty" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** 건물 창고 이름: 내 시설이면 시설 이름 #건물 ID, 아니면 서버 이름·건물 번호 */
function buildingTitle(
  buildingId: number | null,
  facilities: FacilitiesOverviewResponse | null,
): string | undefined {
  if (buildingId === null) return undefined;
  const mine = facilities?.facilities.find((facility) => facility.buildingId === buildingId);
  return mine
    ? m.facility_place_storage({ name: pickName(mine.name, mine.facilityId), id: buildingId })
    : undefined;
}

function PlacesTab({
  places,
  index,
  now,
  facilities,
  run,
  busy,
  empty,
}: {
  places: PlaceGroups["warehouses"];
  index: CatalogIndex;
  now: number;
  facilities: FacilitiesOverviewResponse | null;
  run: FacilityRun;
  busy: boolean;
  empty: string;
}) {
  if (places.length === 0) return <p className="panel eco-empty">{empty}</p>;
  return (
    <>
      <div className="eco-places">
        {places.map((place) => {
          const buildingId = buildingIdOf(place);
          const facility =
            buildingId === null
              ? undefined
              : facilities?.facilities.find((entry) => entry.buildingId === buildingId);
          return (
            <PlaceCard
              key={place.id}
              place={place}
              index={index}
              now={now}
              title={buildingTitle(buildingId, facilities)}
            >
              {facility && facilities && facility.storage && facility.level >= 1 ? (
                <StorageMoveForm facility={facility} data={facilities} run={run} busy={busy} />
              ) : null}
            </PlaceCard>
          );
        })}
      </div>
      {/* 용량은 지금 개수, 최종 단위는 무게(D-443) — 옛 창고 칸과 같은 안내 */}
      {places.some((place) => place.capacity) ? (
        <p className="eco-footnote">{m.economy_capacity_unit_note()}</p>
      ) : null}
    </>
  );
}

export default function InventoryScreen({
  tab,
  unit,
}: {
  tab: string | undefined;
  unit: string | undefined;
}) {
  const current = parseInventoryTab(tab);
  const catalog = useCatalog(NO_ARGS);
  const holdings = useHoldings(NO_ARGS);
  const facilities = useFacilities(NO_ARGS);
  const market = useMarketItems(current === "all" ? NO_ARGS : null);
  const gear = useGearSources();
  const live = useLiveLines();
  const [busy, setBusy] = useState(false);
  const [tone, setTone] = useState<"success" | "error">("success");
  const index = indexCatalog(catalog.data);
  // 창고 시설 넣기·꺼내기: 건물 화면과 같은 명령. 끝나면 자리 잔고·건물 자료를 다시 받는다
  const run: FacilityRun = async (command) => {
    setBusy(true);
    const outcome = await sendFacilityCommand(command);
    setBusy(false);
    setTone(outcome.ok ? "success" : "error");
    live.show([outcome.ok ? m.facility_done() : FACILITY_ERROR_TEXT[outcome.code]()]);
    holdings.refresh();
    facilities.refresh();
    return outcome.ok;
  };
  const openUnit = unit !== undefined && /^\d+$/.test(unit) ? Number(unit) : null;
  return (
    <section
      className="screen screen-wide economy inventory"
      aria-labelledby="inventory-title"
      data-tab={current}
    >
      <div className="screen-header">
        <h1 id="inventory-title" className="screen-title" tabIndex={-1}>
          {m.inventory_title()}
        </h1>
        <BackButton />
      </div>
      <InventoryTabs current={current} />
      <Loaded view={holdings}>
        {(data) => {
          if (!data.hasOwner) return <p className="panel eco-empty">{m.economy_no_owner()}</p>;
          const storages = new Set(
            (facilities.data?.facilities ?? [])
              .filter((entry) => entry.storage)
              .map((entry) => entry.buildingId),
          );
          const groups = groupPlaces(data.places, storages);
          const now = data.generatedAt;
          switch (current) {
            case "all":
              return (
                <AllTab
                  wallet={data.wallet}
                  totals={totalLines(data.places)}
                  groups={groups}
                  index={index}
                  priceOf={priceLookup(index, market.data, catalog.data?.baseCurrency ?? null)}
                />
              );
            case "units":
              return <UnitsTab gear={gear} cargo={groups.cargo} index={index} now={now} open={openUnit} />;
            case "warehouses":
              return (
                <PlacesTab
                  places={[...groups.warehouses, ...groups.ledger]}
                  index={index}
                  now={now}
                  facilities={facilities.data}
                  run={run}
                  busy={busy}
                  empty={m.economy_warehouse_empty()}
                />
              );
            case "buildings":
              return (
                <PlacesTab
                  places={groups.buildings}
                  index={index}
                  now={now}
                  facilities={facilities.data}
                  run={run}
                  busy={busy}
                  empty={m.inventory_buildings_empty()}
                />
              );
            default: {
              const unhandled: never = current;
              return unhandled;
            }
          }
        }}
      </Loaded>
      <LiveMessage tone={tone} lines={live.lines} version={live.version} />
    </section>
  );
}
