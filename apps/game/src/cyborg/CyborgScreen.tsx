// 사이보그 화면(내 본체) — 기획 60 §9 "사이보그: 스탯·장비·인공장기·인벤토리·환생·랭킹"(D-018·D-026·D-040, 🟡 세부 미정).
// ADR 37 "구현하며 정한 것 (유닛·사이보그 화면)", ADR 2026-11-01-ui-visibility(옛 프로젝트 /character처럼 더 가시적으로).
// 위 띠의 사이보그 얼굴이 여는 화면이다(D-6010).
// - 머리 판: 가운데 큰 그림(외형 ID로 그린 SVG, 포인트 색 빛) + 양옆 인공장기·장비 칸(팩 unit_kinds 칸) + 경험치·피로·신앙도.
// - 핵심 사양(CoreStats.tsx, 옛 StatBar + 출처 상세)·상세 전투 스펙(CombatSpecs.tsx, 옛 SecondaryStatsCard), 스킬 칸·속성·인벤토리·
//   환생·랭킹·상태 줄(CyborgExtras.tsx). 값은 모두 서버가 계산해 보낸다.
// - 바꾸는 동작(장착·인공장기 시술·환생)은 "곧 열림"이다. 환생 단추는 "가장 가까운 환생 시설로 가는 길"이다(D-441).
// - 좁은 폭은 판을 위에서 아래로(머리 → 핵심 사양 → 전투 스펙 → 스킬 → 속성 → 인벤토리 → 환생 → 랭킹),
//   넓은 폭(64em 이상)은 머리 판을 가로로 길게(인공장기 | 그림 | 장비) 두고 그 아래 두 열(왼쪽 핵심 사양·전투 스펙, 오른쪽 나머지).
// 지연 로딩 조각(routeViews.tsx). 그림·이 화면 코드는 첫 화면 묶음에 들어가지 않는다.
import type { CyborgBody, CyborgGetResponse, RosterNames, RosterSlot } from "@terra/shared/roster";
import type { VitalsSnapshot } from "@terra/shared/vitals";
import { useId } from "react";
import { usePreviewOn } from "../inbox/preview.ts";
import { m } from "../paraglide/messages.js";
import { BackButton } from "../shell/BackButton.tsx";
import { AppLink } from "../shell/AppLink.tsx";
import { LoadState, Meter, PreviewTag, Section, SoonButton, slotValueText } from "../roster/parts.tsx";
import { PreviewSwitch } from "../roster/PreviewSwitch.tsx";
import { formatNumber, localName, slotLabel } from "../roster/rosterText.ts";
import { loadCyborg, useRosterQuery } from "../roster/useRosterQuery.ts";
import { useVitals } from "../roster/useVitals.ts";
import { VitalsMeters } from "../roster/VitalsMeters.tsx";
import { CyborgAvatar } from "./CyborgAvatar.tsx";
import { CombatSpecs } from "./CombatSpecs.tsx";
import { CoreStats } from "./CoreStats.tsx";
import { Elements, Inventory, Rankings, Rebirth, SkillSlots, StatusFooter } from "./CyborgExtras.tsx";
import "./cyborg.css";

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
        <CyborgBodyView data={state.data} />
      ) : (
        <LoadState state={state} onRetry={query.reload} />
      )}
    </section>
  );
}

function CyborgBodyView({ data }: { data: CyborgGetResponse }) {
  const id = useId();
  const body = data.body;
  // 생명 수치(D-512): 실제 본체만(시안 본체에는 붙이지 않는다)
  const vitals = useVitals();
  return (
    <>
      {data.preview ? <p className="roster-notice">{m.roster_preview_notice()}</p> : null}
      <Hero data={data} vitals={data.preview ? undefined : vitals.cyborg} />
      <div className="cyborg-columns">
        <div className="cyborg-column">
          {body ? (
            <>
              <CoreStats body={body} names={data.names} />
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
            {body ? <Inventory body={body} data={data} /> : <Later text={m.cyborg_inventory_later()} />}
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
function Hero({ data, vitals }: { data: CyborgGetResponse; vitals: VitalsSnapshot | undefined }) {
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
          {data.appearance ? (
            // 만든 사이보그의 외형(첫 접속, D-6040): 2D 그림
            <CyborgAvatar
              look={data.appearance}
              halo
              className="cyborg-avatar"
              label={m.cyborg_appearance_label({ name: data.name })}
            />
          ) : (
            <span className="roster-avatar roster-avatar-lg" data-type="cyborg" aria-hidden="true">
              {Array.from(data.name)[0] ?? "?"}
            </span>
          )}
        </div>
        <SlotGroup
          id={`${id}-organs`}
          side="organ"
          title={m.cyborg_organs_title()}
          action={m.cyborg_action_implant()}
          body={body}
          names={data.names}
          later={null}
        />
        <SlotGroup
          id={`${id}-gear`}
          side="gear"
          title={m.roster_gear_title()}
          action={m.roster_action_equip()}
          body={body}
          names={data.names}
          later={m.cyborg_gear_later()}
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

/** 칸 묶음(인공장기 또는 그 밖의 장비). 칸 배치는 팩 unit_kinds 차례 그대로 */
function SlotGroup({
  id,
  side,
  title,
  action,
  body,
  names,
  later,
}: {
  id: string;
  side: "organ" | "gear";
  title: string;
  action: string;
  body: CyborgBody | null;
  names: RosterNames;
  later: string | null;
}) {
  const slots = body ? body.slots.filter((slot) => (side === "organ") === (slot.slot === "organ")) : [];
  return (
    <section className="cyborg-slot-group" data-side={side} aria-labelledby={id}>
      <div className="cyborg-slot-head">
        <h2 id={id} className="cyborg-slot-title">
          {title}
        </h2>
        {body ? <SoonButton label={action} /> : null}
      </div>
      {side === "organ" ? <p className="roster-note">{m.cyborg_organs_note()}</p> : null}
      {body ? (
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
