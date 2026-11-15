// 사이보그 화면(내 본체) — 기획 60 §9 "사이보그: 스탯·장비·인공장기·인벤토리·환생·랭킹"(D-018·D-026·D-040, 🟡 세부 미정).
// ADR 37 "구현하며 정한 것 (유닛·사이보그 화면)", ADR 2026-11-01-ui-visibility(옛 프로젝트 /character처럼 더 가시적으로).
// 위 띠의 사이보그 얼굴이 여는 화면이다(D-6010).
// - 머리 판: 가운데 큰 그림(외형 ID로 그린 SVG, 포인트 색 빛) + 양옆 인공장기·장비 칸(팩 unit_kinds 칸) + 경험치·피로·신앙도.
// - 핵심 사양(CoreStats.tsx, 옛 StatBar + 출처 상세)·상세 전투 스펙(CombatSpecs.tsx, 옛 SecondaryStatsCard), 스킬 칸·속성·인벤토리·
//   환생·랭킹·상태 줄(CyborgExtras.tsx). 값은 모두 서버가 계산해 보낸다.
// - 장비·인공장기 칸과 인벤토리는 보유 물건(holdings/, tRPC holdings.list + WebSocket 프로토콜 6)이다: 칸을 누르면 칸 고르기 창
//   (옛 EquipmentSlot → EquipmentSelectionModal), 인벤토리는 옛 LocationInventory 카드(장착·해제·사용, 걸린 효과·쓰기 쿨, D-501 교체 확인).
//   시안 자료를 켜면 시안 본체의 칸·인벤토리를 그대로 보인다(바꾸는 동작 없음). docs/adr/2026-11-03-item-holdings.md "바뀜 (화면)".
// - 핵심 사양·상세 전투 스펙에는 입은 장비·인공장기·1차 스탯 버프가 든다(서버 셈, 같은 ADR "바뀜 (2026-11-07 …)"). 보유 물건 목록이
//   다시 오면(장착·해제·사용 뒤) 사이보그 자료를 다시 받는다.
// - 3D 외형을 고르기 전에 만든 사이보그는 그림 아래 [외형 고르기]로 3D 외형을 한 번 고른다(LookPick.tsx, 질문 961 나).
// - 환생은 "곧 열림"이다. 환생 단추는 "가장 가까운 환생 시설로 가는 길"이다(D-441).
// - 좁은 폭은 판을 위에서 아래로(머리 → 핵심 사양 → 전투 스펙 → 스킬 → 속성 → 인벤토리 → 환생 → 랭킹),
//   넓은 폭(64em 이상)은 머리 판을 가로로 길게(인공장기 | 그림 | 장비) 두고 그 아래 두 열(왼쪽 핵심 사양·전투 스펙, 오른쪽 나머지).
// 지연 로딩 조각(routeViews.tsx). 그림·이 화면 코드는 첫 화면 묶음에 들어가지 않는다.
import type { CyborgBody, CyborgGetResponse, RosterNames, RosterSlot } from "@terra/shared/roster";
import type { HoldingsListResponse } from "@terra/shared/holdings";
import { Suspense, lazy, useEffect, useId, useRef, useState } from "react";
import { DevGrant } from "../holdings/DevGrant.tsx";
import { SlotTileButton } from "../holdings/HoldingParts.tsx";
import { ReplaceDialog, SlotSheet } from "../holdings/HoldingsDialogs.tsx";
import { HoldingsPanel } from "../holdings/HoldingsPanel.tsx";
import { type UnitHoldings, unitHoldings } from "../holdings/holdingsModel.ts";
import { holdingName, nameCompare } from "../holdings/holdingsText.ts";
import { type HoldingsController, useHoldings } from "../holdings/useHoldings.ts";
import "../holdings/holdings.css";
import { usePreviewOn } from "../inbox/preview.ts";
import { m } from "../paraglide/messages.js";
import { BackButton } from "../shell/BackButton.tsx";
import { AppLink } from "../shell/AppLink.tsx";
import { LoadState, Meter, PreviewTag, Section, SoonButton, slotValueText } from "../roster/parts.tsx";
import { UnitAdvice, guideStatsOf } from "../roster/UnitAdvice.tsx";
import { PreviewSwitch } from "../roster/PreviewSwitch.tsx";
import { formatNumber, localName, slotLabel } from "../roster/rosterText.ts";
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

export default function CyborgScreen() {
  const id = useId();
  const preview = usePreviewOn();
  const query = useRosterQuery(loadCyborg, preview);
  const state = query.state;
  return (
    <section className="screen screen-wide cyborg" aria-labelledby={`${id}-title`}>
      <div className="screen-header">
        <h1 id={`${id}-title`} className="screen-title" tabIndex={-1}>
          {m.nav_cyborg()}
        </h1>
        <PreviewSwitch />
        <BackButton />
      </div>
      {state.status === "ready" ? (
        <CyborgBodyView data={state.data} onHoldingsChanged={query.reload} />
      ) : (
        <LoadState state={state} onRetry={query.reload} />
      )}
    </section>
  );
}

/** 만든 사이보그(시안이 아님)면 보유 물건을 받아 칸·인벤토리에 쓴다 */
function CyborgBodyView({
  data,
  onHoldingsChanged,
}: {
  data: CyborgGetResponse;
  onHoldingsChanged: () => void;
}) {
  const real = !data.preview && data.body !== null && !data.body.preview;
  return real ? (
    <WithHoldings data={data} onHoldingsChanged={onHoldingsChanged} />
  ) : (
    <BodyLayout data={data} holdings={null} />
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
}: {
  data: CyborgGetResponse;
  onHoldingsChanged: () => void;
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
      <BodyLayout data={data} holdings={{ controller, view }} onReload={onHoldingsChanged} />
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
        <HoldingsPanel view={view} controller={controller} names={data.names} />
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
}: {
  data: CyborgGetResponse;
  holdings: CyborgHoldings | null;
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
      {data.preview ? <p className="roster-notice">{m.roster_preview_notice()}</p> : null}
      <Hero
        data={data}
        holdings={holdings}
        vitals={data.preview ? undefined : vitals.cyborg}
        onReload={onReload}
      />
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

/** 머리 판: 이름·레벨, 그림(가운데)과 인공장기·장비 칸, 막대(생명 수치 D-512 → 경험치·피로) */
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
        <div className="cyborg-names">
          <p className="cyborg-name">{data.name}</p>
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
        </div>
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
      <p className="cyborg-units">
        <AppLink to={{ route: "units" }} className="cyborg-units-link">
          {m.cyborg_units_link({ count: formatNumber(data.unitCount) })}
        </AppLink>
      </p>
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
 * 칸 묶음(인공장기 또는 그 밖의 장비). 칸 배치는 팩 unit_kinds 차례 그대로. 보유 물건이 있으면(만든 사이보그가 세계에 있음) 칸마다
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
  const slots = body ? body.slots.filter((slot) => (side === "organ") === (slot.slot === "organ")) : [];
  const view = holdings?.view ?? null;
  const cells = view ? view.slots.filter((cell) => (side === "organ") === (cell.kind === "organ")) : null;
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
        <ul className="cyborg-slots">
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
        <ul className="cyborg-slots">
          {slots.map((slot, index) => (
            // 같은 종류 칸이 여럿이다(장신구 2·인공장기 3): 차례로 열쇠를 만든다
            <SlotTile key={`${slot.slot}-${String(index)}`} slot={slot} names={names} />
          ))}
        </ul>
      ) : later ? (
        <Later text={later} />
      ) : null}
    </section>
  );
}

function SlotTile({ slot, names }: { slot: RosterSlot; names: RosterNames }) {
  return (
    <li className="cyborg-slot" data-slot={slot.slot} data-empty={slot.item ? undefined : "true"}>
      <span className="cyborg-slot-kind">{slotLabel(slot.slot)}</span>
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
