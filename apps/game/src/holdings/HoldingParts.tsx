// 보유 물건 부품 — 막대(내구도·신선도), 물건 카드(옛 LocationInventory 카드 + ItemTooltip 내용), 걸린 효과·쓰기 쿨, 알림 줄.
// 옛 화면에서 가져온 것: 분류 색 왼쪽 띠, 수량 표 "×n", 착용 표, 굴린 스탯 표(+초록·−빨강), 내구도 막대(60%·30% 문턱 색)와 "현재/최대",
// 파손이면 장착 막음("수리 필요"). 새로 더한 것: 신선도 막대·썩는 때(N49), 점수(D-5006), 쓰기 버튼과 쿨 남은 시간(D-509·D-510),
// 식품 포장 표·[포장 풀기](D-524 — 포장 칸은 신선도가 멈추고, 풀면 낱개가 되어 그때부터 준다).
// 스타일은 holdings.css(토큰만).
import type { RosterNames } from "@terra/shared/roster";
import type { HoldingView } from "@terra/shared/holdings";
import type { CSSProperties } from "react";
import { m } from "../paraglide/messages.js";
import { slotValueText } from "../roster/parts.tsx";
import { formatNumber, remaining } from "../roster/rosterText.ts";
import { LiveMessage } from "../ui/LiveMessage.tsx";
import {
  type SlotCell,
  type UnitHoldings,
  cooldownFor,
  formatClock,
  isBroken,
  isEquipment,
  isPacked,
  isUsable,
  percentOf,
  pickSlot,
  ratioTone,
} from "./holdingsModel.ts";
import {
  cooldownLabel,
  effectName,
  effectValueText,
  holdingName,
  slotKindLabel,
  usesText,
} from "./holdingsText.ts";
import type { HoldingsController, HoldingsNotice } from "./useHoldings.ts";

// style에 CSS 변수를 넣을 수 있게 React 타입에 더한다(map/nationColor.ts와 같은 방식)
declare module "react" {
  interface CSSProperties {
    "--slot-rows"?: string;
  }
}

/** 값/최대 막대(색 = 단계). label은 막대 이름, valueText는 읽는 값 */
export function HoldingBar({
  label,
  value,
  max,
  valueText,
  kind,
}: {
  label: string;
  value: number;
  max: number;
  valueText: string;
  kind: "durability" | "freshness";
}) {
  const { ratio, tone } = ratioTone(value, max);
  return (
    <div className="holding-bar" data-kind={kind}>
      <span className="holding-bar-label">{label}</span>
      <span
        className="holding-bar-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        data-tone={tone}
      >
        <span className="holding-bar-fill" style={{ inlineSize: `${Math.round(ratio * 100)}%` }} />
      </span>
      <span className="holding-bar-value">{valueText}</span>
    </div>
  );
}

/** 내구도 막대(최대가 없으면 그리지 않는다). 파손이면 "수리 필요"를 함께 */
export function DurabilityLine({ holding }: { holding: HoldingView }) {
  if (holding.durability === null || holding.maxDurability === null) return null;
  return (
    <>
      <HoldingBar
        kind="durability"
        label={m.holdings_durability()}
        value={holding.durability}
        max={holding.maxDurability}
        valueText={m.roster_value_of({
          value: formatNumber(holding.durability),
          max: formatNumber(holding.maxDurability),
        })}
      />
      {isBroken(holding) ? <p className="holding-broken">{m.holdings_broken()}</p> : null}
    </>
  );
}

/** 신선도 막대와 썩는 때(신선도 묶음만). 포장 칸이면 멈춘 까닭을 함께(D-524) */
function FreshnessLine({ holding, now }: { holding: HoldingView; now: number }) {
  if (holding.freshnessPm === null) return null;
  const spoils = holding.spoilsAt === null || isPacked(holding) ? null : remaining(holding.spoilsAt, now);
  return (
    <>
      <HoldingBar
        kind="freshness"
        label={m.holdings_freshness()}
        value={holding.freshnessPm}
        max={1000}
        valueText={m.holdings_percent({ percent: formatNumber(percentOf(holding.freshnessPm)) })}
      />
      {spoils ? <p className="roster-meta">{m.holdings_spoils({ time: spoils })}</p> : null}
      {isPacked(holding) ? <p className="roster-note">{m.holdings_packed_note()}</p> : null}
    </>
  );
}

/** 굴린 스탯 표(+는 초록, −는 빨강 — 옛 어드밴티지·디스어드밴티지 표) */
export function StatChips({ holding, names }: { holding: HoldingView; names: RosterNames }) {
  if (holding.stats.length === 0) return null;
  return (
    <ul className="holding-stats">
      {holding.stats.map((entry) => (
        <li key={entry.stat} className="holding-stat" data-sign={entry.value < 0 ? "minus" : "plus"}>
          {slotValueText(entry.stat, entry.value, names)}
        </li>
      ))}
    </ul>
  );
}

/** 물건 이름 + 수량·착용/비활성 표 */
export function HoldingTitle({ holding }: { holding: HoldingView }) {
  const broken = isBroken(holding);
  return (
    <span className="holding-title">
      <span className="holding-name">{holdingName(holding)}</span>
      {holding.quantity > 1 ? (
        <span className="holding-qty">{m.holdings_quantity({ count: formatNumber(holding.quantity) })}</span>
      ) : null}
      {holding.slot !== null ? (
        <span className={broken ? "roster-tag holding-inactive" : "roster-tag holding-worn"}>
          {broken ? m.holdings_inactive_badge() : m.holdings_equipped()}
        </span>
      ) : null}
      {holding.packed === true || holding.packed === false ? (
        <span className="roster-tag holding-pack" data-packed={holding.packed ? "true" : "false"}>
          {holding.packed ? m.holdings_packed() : m.holdings_unpacked()}
        </span>
      ) : null}
    </span>
  );
}

/** 내구도 0 비활성 장착 장비 경고 알림 띠 */
export function BrokenGearAlert({ count }: { readonly count: number }) {
  if (count <= 0) return null;
  return (
    <p className="holding-broken-alert" role="status">
      <span className="holding-broken-alert-badge" aria-hidden="true">
        !
      </span>
      <span>{m.holdings_broken_warning({ count: formatNumber(count) })}</span>
    </p>
  );
}

/** 물건 카드 하나: 표·스탯·막대·버튼(장착·해제·사용) */
export function HoldingCard({
  holding,
  view,
  controller,
  names,
}: {
  holding: HoldingView;
  view: UnitHoldings;
  controller: HoldingsController;
  names: RosterNames;
}) {
  const busy = controller.pending !== null;
  const name = holdingName(holding);
  const equipment = isEquipment(holding);
  const target = holding.slot === null ? pickSlot(view, holding) : null;
  const broken = isBroken(holding);
  const readyAt = isUsable(holding) ? cooldownFor(view, holding) : null;
  const waitMs = readyAt === null ? 0 : readyAt - controller.now;
  const waiting = waitMs > 0;
  const score = holding.scorePm;
  const uses = usesText(holding);
  const label = (action: string) => m.holdings_action_label({ action, item: name });
  return (
    <li
      className="holding-card"
      data-group={equipment ? "equipment" : isUsable(holding) ? "usable" : "other"}
      data-holding={holding.id}
      data-item={holding.item}
      data-broken={broken ? "true" : undefined}
      data-packed={holding.packed === true ? "true" : holding.packed === false ? "false" : undefined}
    >
      <HoldingTitle holding={holding} />
      <StatChips holding={holding} names={names} />
      {score !== null || uses ? (
        <p className="roster-meta">
          {[score === null ? null : m.holdings_score({ percent: formatNumber(percentOf(score)) }), uses]
            .filter((part) => part !== null)
            .join(" · ")}
        </p>
      ) : null}
      <DurabilityLine holding={holding} />
      <FreshnessLine holding={holding} now={controller.now} />
      {holding.slot !== null || target || isUsable(holding) || isPacked(holding) ? (
        <div className="holding-actions">
          {holding.slot !== null ? (
            <button
              type="button"
              className="button-small"
              aria-label={label(m.holdings_action_unequip())}
              aria-disabled={busy ? "true" : undefined}
              onClick={() => {
                if (!busy) controller.unequip(holding);
              }}
            >
              {m.holdings_action_unequip()}
            </button>
          ) : target ? (
            <button
              type="button"
              className="button-small"
              data-action="equip"
              aria-label={label(m.roster_action_equip())}
              aria-disabled={busy || broken ? "true" : undefined}
              onClick={() => {
                if (!busy && !broken) controller.equip(holding, target.index);
              }}
            >
              {m.roster_action_equip()}
            </button>
          ) : null}
          {isUsable(holding) ? (
            <button
              type="button"
              className="button-small"
              data-action="use"
              aria-label={label(m.holdings_action_use())}
              aria-disabled={busy || waiting ? "true" : undefined}
              onClick={() => {
                if (!busy && !waiting) controller.consume(holding);
              }}
            >
              {m.holdings_action_use()}
              {waiting ? (
                <span className="holding-wait">{m.holdings_action_wait({ time: formatClock(waitMs) })}</span>
              ) : null}
            </button>
          ) : null}
          {isPacked(holding) ? (
            <button
              type="button"
              className="button-small"
              data-action="unpack"
              aria-label={label(m.holdings_action_unpack())}
              aria-disabled={busy ? "true" : undefined}
              onClick={() => {
                if (!busy) controller.unpack(holding);
              }}
            >
              {m.holdings_action_unpack()}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** 걸린 효과(이름·효과량·남은 시간)와 쓰기 쿨(종류·남은 시간) */
export function EffectsAndCooldowns({ view, now }: { view: UnitHoldings; now: number }) {
  return (
    <div className="holding-buffs">
      <section className="holding-buff-box" aria-label={m.holdings_effects_title()}>
        <h3 className="holding-subtitle">{m.holdings_effects_title()}</h3>
        {view.effects.length === 0 ? (
          <p className="roster-empty">{m.holdings_effects_none()}</p>
        ) : (
          <ul className="holding-effects">
            {view.effects.map((effect) => (
              <li key={effect.effect} className="holding-effect" data-effect={effect.effect}>
                <span className="holding-effect-name">{effectName(effect)}</span>
                <span className="holding-effect-value">{effectValueText(effect)}</span>
                <span className="holding-effect-left">
                  {m.holdings_effect_left({ time: formatClock(effect.until - now) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {view.cooldowns.length > 0 ? (
        <section className="holding-buff-box" aria-label={m.holdings_cooldowns_title()}>
          <h3 className="holding-subtitle">{m.holdings_cooldowns_title()}</h3>
          <ul className="holding-cooldowns">
            {view.cooldowns.map((cooldown) => (
              <li key={cooldown.kind} className="holding-cooldown" data-kind={cooldown.kind}>
                <span>{cooldownLabel(cooldown.kind)}</span>
                <span className="holding-cooldown-left">{formatClock(cooldown.until - now)}</span>
              </li>
            ))}
          </ul>
          <p className="roster-note">{m.holdings_cooldown_note()}</p>
        </section>
      ) : null}
    </div>
  );
}

/** 명령 결과 알림(성공 = status, 실패 = alert) */
export function NoticeLine({ notice }: { notice: HoldingsNotice | null }) {
  return (
    <LiveMessage
      tone={notice?.tone === "error" ? "error" : "success"}
      lines={notice?.lines ?? []}
      version={notice?.version ?? 0}
      className="holding-notice"
    />
  );
}

/**
 * 칸 묶음을 두 줄로 놓는 격자의 줄 수(옛 프로젝트 화면: 왼 줄을 위에서 아래로 채운 뒤 오른 줄 — holdings.css .slot-columns).
 * 칸이 10개면 5줄 × 2
 */
export function slotColumnsStyle(count: number): CSSProperties {
  return { "--slot-rows": String(Math.max(1, Math.ceil(count / 2))) };
}

/**
 * 장비 칸 하나(누르면 칸 고르기 창 — 옛 EquipmentSlot). 칸 종류·물건 이름·굴린 스탯·내구도. className은 화면의 칸 모양
 * (사이보그 화면 .cyborg-slot, 유닛 상세 .roster-slot)
 */
export function SlotTileButton({
  cell,
  names,
  className,
  onOpen,
}: {
  cell: SlotCell;
  names: RosterNames;
  className: string;
  onOpen: () => void;
}) {
  const kind = slotKindLabel(cell.kind, cell.ordinal);
  const holding = cell.holding;
  const broken = holding !== null && isBroken(holding);
  const durability =
    holding && holding.durability !== null && holding.maxDurability !== null
      ? { value: holding.durability, max: holding.maxDurability }
      : null;
  return (
    <li
      className={`${className} holding-slot`}
      data-slot={cell.kind}
      data-index={cell.index}
      data-empty={holding ? undefined : "true"}
      data-broken={broken ? "true" : undefined}
    >
      <button type="button" className="holding-slot-button" aria-haspopup="dialog" onClick={onOpen}>
        <span className="holding-slot-head">
          <span className="holding-slot-kind">{kind}</span>
          {broken ? <span className="holding-slot-badge">{m.holdings_inactive_badge()}</span> : null}
        </span>
        {holding ? (
          <>
            <span className="holding-slot-name">{holdingName(holding)}</span>
            {holding.stats.length > 0 ? (
              <span className="holding-slot-values">
                {holding.stats.map((entry) => slotValueText(entry.stat, entry.value, names)).join(" · ")}
              </span>
            ) : null}
            {durability ? (
              <span
                className="holding-slot-durability"
                data-tone={ratioTone(durability.value, durability.max).tone}
              >
                {m.holdings_durability()}{" "}
                {m.roster_value_of({
                  value: formatNumber(durability.value),
                  max: formatNumber(durability.max),
                })}
              </span>
            ) : null}
            {broken ? <span className="holding-slot-warn">{m.holdings_broken_slot_note()}</span> : null}
          </>
        ) : (
          <span className="holding-slot-name roster-muted">{m.roster_slot_empty()}</span>
        )}
      </button>
    </li>
  );
}
