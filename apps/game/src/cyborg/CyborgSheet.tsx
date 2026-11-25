// 사이보그 본체 판 — 유닛 상세가 내 사이보그 본체 줄(RosterUnit.self)을 열 때 그 안에 그린다(units/UnitDetail.tsx).
// 옛 사이보그 화면(/cyborg, 메뉴 "사이보그")은 없앴다: 사이보그도 유닛이라 유닛 창과 겹쳤다(사용자 결정 2026-11-24 "사이보그 패널은 아예
// 없애라 … 유닛에 넣었으니까 중복", docs/adr/2026-11-24-unit-cyborg-unify.md "바뀜 (사이보그 화면 없앰)"). 옛 주소 /cyborg는 유닛 창의 본체 줄로 넘긴다.
// 기획 60 §9 "사이보그: 스탯·장비·인공장기·인벤토리·환생·랭킹"(D-018·D-026·D-040), ADR 2026-11-01-ui-visibility(옛 프로젝트 /character처럼).
// - 머리 판: 가운데 큰 그림(3D 외형 초상) + 양옆 인공장기 10칸·일반장비 10칸(팩 unit_kinds 칸, 옛 프로젝트 차례) + 경험치·피로·신앙도.
// - 핵심 사양(CoreStats.tsx, 옛 StatBar + 출처 상세)·상세 전투 스펙(CombatSpecs.tsx, 옛 SecondaryStatsCard), 스킬 칸·속성·인벤토리·
//   환생·랭킹·상태 줄(CyborgExtras.tsx). 값은 모두 서버가 계산해 보낸다(cyborg.get).
// - 장비·인공장기 칸과 인벤토리는 보유 물건(holdings/, tRPC holdings.list + WebSocket 프로토콜 6)이다: 칸을 누르면 칸 고르기 창
//   (옛 EquipmentSlot → EquipmentSelectionModal), 인벤토리는 옛 LocationInventory 카드(장착·해제·사용, 걸린 효과·쓰기 쿨, D-501 교체 확인).
//   시안 자료를 켜면 시안 본체의 칸·인벤토리를 그대로 보인다(바꾸는 동작 없음).
// - 보유 물건 목록이 다시 오면(장착·해제·사용 뒤) 사이보그 자료를 다시 받고, 유닛 창에도 알린다(onChanged — 목록·생명 수치).
// - 3D 외형을 고르기 전에 만든 사이보그는 그림 아래 [외형 고르기]로 3D 외형을 한 번 고른다(LookPick.tsx, 질문 961 나).
// - 환생은 "곧 열림"이다. 환생 단추는 "가장 가까운 환생 시설로 가는 길"이다(D-441).
// 지연 로딩 조각(유닛 화면 조각 안). 그림·이 판 코드는 첫 화면 묶음에 들어가지 않는다.
import {
  type CyborgBody,
  type CyborgGetResponse,
  type RosterNames,
  type RosterSlot,
  isOrganSlot,
  sortSlotsForDisplay,
} from "@terra/shared/roster";
import type { HoldingsListResponse } from "@terra/shared/holdings";
import { type ReactNode, Suspense, lazy, useCallback, useEffect, useId, useRef, useState } from "react";
import { DevGrant } from "../holdings/DevGrant.tsx";
import { SlotTileButton, slotColumnsStyle } from "../holdings/HoldingParts.tsx";
import { ReplaceDialog, SlotSheet } from "../holdings/HoldingsDialogs.tsx";
import { HoldingsPanel } from "../holdings/HoldingsPanel.tsx";
import { type UnitHoldings, slotGroups, unitHoldings } from "../holdings/holdingsModel.ts";
import { holdingName, nameCompare } from "../holdings/holdingsText.ts";
import { type HoldingsController, useHoldings } from "../holdings/useHoldings.ts";
import "../holdings/holdings.css";
import { m } from "../paraglide/messages.js";
import { LoadState, Meter, PreviewTag, Section, SoonButton, slotValueText } from "../roster/parts.tsx";
import { UnitAdvice, guideStatsOf } from "../roster/UnitAdvice.tsx";
import { formatNumber, localName, slotCellLabel } from "../roster/rosterText.ts";
import { loadCyborg, useRosterQuery } from "../roster/useRosterQuery.ts";
import { type VitalsShown, useVitals } from "../roster/useVitals.ts";
import { VitalsMeters } from "../roster/VitalsMeters.tsx";
import { CyborgPortrait } from "./CyborgPortrait.tsx";
import { CombatSpecs } from "./CombatSpecs.tsx";
import { CoreStats } from "./CoreStats.tsx";
import { Elements, Inventory, Rankings, Rebirth, SkillSlots, StatusFooter } from "./CyborgExtras.tsx";
import "./cyborg.css";
import { ConditionFact } from "../roster/ConditionFact.tsx";

// 3D 외형 한 번 고르기 창(질문 961 나): 누를 때 받는다(미리 보기 엔진·외형 단계 코드를 이 조각에 넣지 않는다)
const LookPick = lazy(() => import("./LookPick.tsx"));

/**
 * 본체 판. preview = 시안 자료를 켰나(켜면 시안 본체 — 옛 사이보그 화면과 같다: 화면 검토용, 바꾸는 동작 없음).
 * onChanged = 보유 물건이 바뀌었거나 외형을 골랐다(유닛 창이 목록·생명 수치를 다시 받는다)
 */
export function CyborgSheet({
  preview,
  onChanged,
  between,
}: {
  preview: boolean;
  onChanged?: (() => void) | undefined;
  /** 머리 판(초상·칸)과 사양 판 사이에 넣을 것(유닛 상세의 상태·부상·AI 작전 칸) */
  between?: ReactNode;
}) {
  const query = useRosterQuery(loadCyborg, preview);
  const state = query.state;
  const reloadCyborg = query.reload;
  const reload = useCallback(() => {
    reloadCyborg();
    onChanged?.();
  }, [reloadCyborg, onChanged]);
  return (
    <div className="cyborg cyborg-embedded">
      {state.status === "ready" ? (
        <CyborgBodyView data={state.data} onHoldingsChanged={reload} between={between} />
      ) : (
        <>
          <LoadState state={state} onRetry={query.reload} />
          {between}
        </>
      )}
    </div>
  );
}

/** 만든 사이보그(시안이 아님)면 보유 물건을 받아 칸·인벤토리에 쓴다 */
function CyborgBodyView({
  data,
  onHoldingsChanged,
  between,
}: {
  data: CyborgGetResponse;
  onHoldingsChanged: () => void;
  between: ReactNode;
}) {
  const real = !data.preview && data.body !== null && !data.body.preview;
  return real ? (
    <WithHoldings data={data} onHoldingsChanged={onHoldingsChanged} between={between} />
  ) : (
    <BodyLayout data={data} holdings={null} between={between} />
  );
}

/** 보유 물건 조작 묶음 + 사이보그 유닛의 칸·든 물건(사이보그가 아직 세계에 없으면 view = null) */
interface CyborgHoldings {
  readonly controller: HoldingsController;
  readonly view: UnitHoldings | null;
}

/**
 * 보유 물건 목록이 다시 오면(장착·해제·사용 뒤, 처음 받은 것은 빼고) 사이보그 자료(cyborg.get)를 다시 받는다: 입은 장비·버프가 스탯·공격
 * 값에 든다(docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07 …)"). 다시 받는 동안 앞 자료를 그린다(useRosterQuery)
 */
function WithHoldings({
  data,
  onHoldingsChanged,
  between,
}: {
  data: CyborgGetResponse;
  onHoldingsChanged: () => void;
  between: ReactNode;
}) {
  const controller = useHoldings();
  const state = controller.state;
  const listed = state.status === "ready" ? state.data : null;
  const seen = useRef<HoldingsListResponse | null>(null);
  useEffect(() => {
    if (!listed) return;
    if (seen.current !== null && seen.current !== listed) onHoldingsChanged();
    seen.current = listed;
  }, [listed, onHoldingsChanged]);
  const unit = state.status === "ready" ? (state.data.cyborgUnit ?? null) : null;
  const view =
    state.status === "ready" && unit !== null
      ? unitHoldings(
          state.data,
          unit,
          (data.body?.slots ?? []).map((slot) => slot.slot),
          controller.now,
          nameCompare(),
          holdingName,
        )
      : null;
  return (
    <>
      <BodyLayout
        data={data}
        holdings={{ controller, view }}
        onReload={onHoldingsChanged}
        between={between}
      />
      <SlotSheet view={view} controller={controller} names={data.names} />
      <ReplaceDialog view={view} controller={controller} />
    </>
  );
}

/** 인벤토리 판 내용: 보유 물건(받는 중·실패·사이보그 유닛 없음) 또는 시안 인벤토리 */
function InventoryBody({
  body,
  data,
  holdings,
}: {
  body: CyborgBody;
  data: CyborgGetResponse;
  holdings: CyborgHoldings | null;
}) {
  if (!holdings) return <Inventory body={body} data={data} />;
  const { controller, view } = holdings;
  if (controller.state.status !== "ready")
    return <LoadState state={controller.state} onRetry={controller.reload} />;
  return (
    <>
      {view ? (
        <HoldingsPanel view={view} controller={controller} names={data.names} includeOrgans={false} />
      ) : (
        <p className="roster-empty">{m.holdings_no_cyborg_unit()}</p>
      )}
      <DevGrant controller={controller} unit={view?.unit ?? null} />
    </>
  );
}

function BodyLayout({
  data,
  holdings,
  onReload,
  between,
}: {
  data: CyborgGetResponse;
  holdings: CyborgHoldings | null;
  between: ReactNode;
  /** 사이보그 자료를 다시 받는다(외형을 고른 뒤 — 실제 사이보그만) */
  onReload?: () => void;
}) {
  const id = useId();
  const body = data.body;
  // 생명 수치(D-512): 실제 본체만(시안 본체에는 붙이지 않는다). 보유 물건 목록이 다시 오면(회복 물약 등) 같이 다시 받는다
  const holdingsData =
    holdings?.controller.state.status === "ready" ? holdings.controller.state.data : undefined;
  const vitals = useVitals(holdingsData);
  return (
    <>
      <Hero
        data={data}
        holdings={holdings}
        vitals={data.preview ? undefined : vitals.cyborg}
        onReload={onReload}
      />
      {between}
      <div className="cyborg-columns">
        <div className="cyborg-column">
          {body ? (
            <>
              <CoreStats body={body} names={data.names} />
              <Section id={`${id}-advice`} title={m.unit_advice_label()}>
                <UnitAdvice stats={guideStatsOf(body.stats.primaries)} />
              </Section>
              <CombatSpecs body={body} names={data.names} />
            </>
          ) : (
            <Section id={`${id}-stats`} title={m.roster_stats_title()}>
              <Later text={m.cyborg_stats_later()} />
            </Section>
          )}
        </div>
        <div className="cyborg-column">
          <Section
            id={`${id}-skills`}
            title={m.roster_skills_title()}
            end={body?.preview ? <PreviewTag /> : null}
          >
            {body ? <SkillSlots body={body} names={data.names} /> : <Later text={m.cyborg_skills_later()} />}
          </Section>
          {body ? (
            <Section id={`${id}-elements`} title={m.cyborg_elements_title()}>
              <Elements values={body.elements} />
            </Section>
          ) : null}
          <Section
            id={`${id}-inventory`}
            title={m.cyborg_inventory_title()}
            end={body?.preview ? <PreviewTag /> : null}
          >
            {body ? (
              <InventoryBody body={body} data={data} holdings={holdings} />
            ) : (
              <Later text={m.cyborg_inventory_later()} />
            )}
          </Section>
          <Section id={`${id}-rebirth`} title={m.cyborg_rebirth_title()}>
            <Rebirth body={body} rule={data.rebirth} />
          </Section>
          <Section
            id={`${id}-ranking`}
            title={m.cyborg_ranking_title()}
            end={body?.preview ? <PreviewTag /> : null}
          >
            {body ? <Rankings body={body} /> : <Later text={m.cyborg_ranking_later()} />}
          </Section>
        </div>
      </div>
      {body ? <StatusFooter data={data} body={body} /> : null}
    </>
  );
}

function Later({ text }: { text: string }) {
  return <p className="roster-empty">{text}</p>;
}

/** 머리 판: 레벨, 그림(가운데)과 인공장기·일반장비 칸, 막대(생명 수치 D-512 → 경험치·피로). 이름은 유닛 상세 머리가 보인다 */
function Hero({
  data,
  holdings,
  vitals,
  onReload,
}: {
  data: CyborgGetResponse;
  holdings: CyborgHoldings | null;
  vitals: VitalsShown | undefined;
  onReload: (() => void) | undefined;
}) {
  const id = useId();
  const body = data.body;
  return (
    <div className="panel cyborg-profile">
      <div className="cyborg-who">
        <p className="roster-meta">
          {body
            ? [
                m.roster_level_of({ level: formatNumber(body.level), max: formatNumber(body.maxLevel) }),
                body.rebirths > 0 ? m.roster_rebirths({ count: formatNumber(body.rebirths) }) : null,
              ]
                .filter((part) => part !== null)
                .join(" · ")
            : m.cyborg_body_later()}
        </p>
        {body?.preview ? <PreviewTag /> : null}
      </div>
      <div className="cyborg-bay">
        <div className="cyborg-stage">
          {data.look ? (
            // 만든 사이보그의 외형: 3D 외형의 초상(옛 2D만 있던 사이보그는 서버가 넘겨 채웠다 — D-560 1421). 기기 저장소에 남겨 다시 들어오면 바로
            // 보이고, 그리는 동안·WebGL 없음이면 무늬 없는 실루엣(docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-14, 2D 제거)")
            <CyborgPortrait
              look={data.look}
              sizePx={HERO_PORTRAIT_PX}
              className="cyborg-avatar"
              label={m.cyborg_appearance_label({ name: data.name })}
              persist
            />
          ) : (
            <span className="roster-avatar roster-avatar-lg" data-type="cyborg" aria-hidden="true">
              {Array.from(data.name)[0] ?? "?"}
            </span>
          )}
          {data.lookPick && data.look && holdings && onReload ? (
            <LookPickEntry look={data.look} onSaved={onReload} />
          ) : null}
        </div>
        <SlotGroup
          id={`${id}-organs`}
          side="organ"
          title={m.cyborg_organs_title()}
          action={m.cyborg_action_implant()}
          body={body}
          names={data.names}
          later={null}
          holdings={holdings}
        />
        <SlotGroup
          id={`${id}-gear`}
          side="gear"
          title={m.roster_gear_title()}
          action={m.roster_action_equip()}
          body={body}
          names={data.names}
          later={m.cyborg_gear_later()}
          holdings={holdings}
        />
      </div>
      {body ? (
        <div className="cyborg-meters">
          {vitals ? <VitalsMeters vitals={vitals} /> : null}
          <Meter
            label={m.cyborg_exp()}
            value={body.exp.into}
            max={body.exp.span}
            valueText={m.roster_value_of({
              value: formatNumber(body.exp.into),
              max: formatNumber(body.exp.span),
            })}
          />
          <Meter
            label={m.roster_fatigue()}
            value={body.fatigue.value}
            max={body.fatigue.max}
            valueText={m.roster_value_of({
              value: formatNumber(body.fatigue.value),
              max: formatNumber(body.fatigue.max),
            })}
          />
          <dl className="roster-facts cyborg-faith">
            <div>
              <dt>{m.cyborg_faith()}</dt>
              <dd className="roster-num">{formatNumber(body.faith)}</dd>
            </div>
            {body.condition ? <ConditionFact condition={body.condition} /> : null}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

/**
 * [외형 고르기](질문 961 나): 3D 외형을 고르기 전에 만든 사이보그에게만 보인다(서버 lookPick). 누르면 외형 고르기 창을 연다. 정하면 자료를 다시
 * 받고, 서버가 lookPick을 거두면 이 단추가 사라진다
 */
/** 사이보그 화면 초상 크기(px) = 넓은 화면의 --avatar-hero-lg(좁은 화면은 CSS가 줄인다) */
const HERO_PORTRAIT_PX = 220;

function LookPickEntry({
  look,
  onSaved,
}: {
  look: NonNullable<CyborgGetResponse["look"]>;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="cyborg-look-entry">
      <button
        type="button"
        className="button-small cyborg-look-pick-open"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {m.cyborg_look_pick()}
      </button>
      <p className="roster-note">{m.cyborg_look_pick_note()}</p>
      {open ? (
        <Suspense fallback={null}>
          <LookPick
            initial={look}
            onClose={() => setOpen(false)}
            onSaved={() => {
              setOpen(false);
              onSaved();
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

/**
 * 칸 묶음(인공장기 10칸 또는 일반장비 10칸). 칸은 옛 프로젝트 화면 차례로 두 줄에 놓는다(왼 줄 5 → 오른 줄 5, @terra/shared/roster
 * sortSlotsForDisplay — 칸 번호는 팩 unit_kinds 차례 그대로다). 보유 물건이 있으면(만든 사이보그가 세계에 있음) 칸마다
 * 누르는 칸(칸 고르기 창), 아니면 시안 본체의 칸(바꾸는 동작은 곧 열림)
 */
function SlotGroup({
  id,
  side,
  title,
  action,
  body,
  names,
  later,
  holdings,
}: {
  id: string;
  side: "organ" | "gear";
  title: string;
  action: string;
  body: CyborgBody | null;
  names: RosterNames;
  later: string | null;
  holdings: CyborgHoldings | null;
}) {
  const view = holdings?.view ?? null;
  const cells = view ? slotGroups(view)[side] : null;
  // 시안 본체: 받은 칸을 화면 차례로 놓고 같은 종류에 번호를 붙인다
  const slots = body
    ? sortSlotsForDisplay(body.slots.map((slot) => slot.slot)).flatMap((cell) => {
        const slot = body.slots[cell.index];
        return slot && (side === "organ") === isOrganSlot(cell.kind) ? [{ slot, ordinal: cell.ordinal }] : [];
      })
    : [];
  return (
    <section className="cyborg-slot-group" data-side={side} aria-labelledby={id}>
      <div className="cyborg-slot-head">
        <h2 id={id} className="cyborg-slot-title">
          {title}
        </h2>
        {body && !cells ? <SoonButton label={action} /> : null}
      </div>
      {side === "organ" ? <p className="roster-note">{m.cyborg_organs_note()}</p> : null}
      {cells && view && holdings ? (
        <ul className="cyborg-slots slot-columns" style={slotColumnsStyle(cells.length)}>
          {cells.map((cell) => (
            <SlotTileButton
              key={cell.index}
              cell={cell}
              names={names}
              className="cyborg-slot"
              onOpen={() => holdings.controller.openSlot({ unit: view.unit, index: cell.index })}
            />
          ))}
        </ul>
      ) : body ? (
        <ul className="cyborg-slots slot-columns" style={slotColumnsStyle(slots.length)}>
          {slots.map((entry, index) => (
            // 같은 종류 칸이 여럿이다(반지 2·임플란트 5): 차례로 열쇠를 만든다
            <SlotTile
              key={`${entry.slot.slot}-${String(index)}`}
              slot={entry.slot}
              ordinal={entry.ordinal}
              names={names}
            />
          ))}
        </ul>
      ) : later ? (
        <Later text={later} />
      ) : null}
    </section>
  );
}

function SlotTile({ slot, ordinal, names }: { slot: RosterSlot; ordinal: number; names: RosterNames }) {
  return (
    <li className="cyborg-slot" data-slot={slot.slot} data-empty={slot.item ? undefined : "true"}>
      <span className="cyborg-slot-kind">{slotCellLabel(slot.slot, ordinal)}</span>
      {slot.item ? (
        <>
          <span className="cyborg-slot-name">{localName(names.items[slot.item.id], slot.item.id)}</span>
          {slot.item.values.length > 0 ? (
            <span className="cyborg-slot-values">
              {slot.item.values.map((value) => slotValueText(value.stat, value.value, names)).join(" · ")}
            </span>
          ) : null}
        </>
      ) : (
        <span className="cyborg-slot-name roster-muted">{m.roster_slot_empty()}</span>
      )}
    </li>
  );
}
