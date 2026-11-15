// 파티·군단 명령 칸 — 기획 D-545·D-549(진형 전진·자리 지키기·목표 공격·퇴각·거두기)·D-558(집결·따라가기·대형 고르기·AI 전개 방식),
// docs/adr/2026-11-14-battle-report.md "바뀜 (2026-11-14, 파티·군단 명령)"·"바뀜 (D-558)". 팀(군단)마다 시각 명령 줄: 시각(초) · 받는 쪽(군단
// 전체 또는 n번 파티) · 명령 · 목표(목표 공격 — 상대가 실험실 군단일 때)·앞 파티(따라가기)·대형·전개 방식. 전진·집결의 칸은 3D 관람 전투맵
// 명령 화면에서 넣고 여기서는 보이기만 한다. 판정은 서버가 한다(군단 명령은 지휘관 정원 안 파티만 받는다 — 화면은 막지 않고 결과에 거절 수를
// 보인다). 시험용: .rp-orders[data-team], .rp-order(줄), .rp-order-add, .rp-order-remove, select.rp-order-who·.rp-order-kind·.rp-order-target·
// .rp-order-leader·.rp-order-shape·.rp-order-tactic, .rp-order-cell.
import {
  REPORT_FORMATIONS,
  REPORT_LEGION_ORDER,
  REPORT_LIMITS,
  REPORT_ORDER_KINDS,
  REPORT_TACTICS,
  type ReportFormation,
  type ReportOrder,
  type ReportOrderKind,
  type ReportTactic,
} from "@terra/shared/battleReport";
import { useId } from "react";
import { formationText, tacticText } from "../../../battle/battleCommandText.ts";
import { m } from "../../../paraglide/messages.js";
import { NumberField } from "../lab/fields.tsx";
import { orderKindText } from "./reportMessages.ts";

const isKind = (value: string): value is ReportOrderKind =>
  (REPORT_ORDER_KINDS as readonly string[]).includes(value);
const isFormation = (value: string): value is ReportFormation =>
  (REPORT_FORMATIONS as readonly string[]).includes(value);
const isTactic = (value: string): value is ReportTactic =>
  (REPORT_TACTICS as readonly string[]).includes(value);

/** 종류를 바꾼 명령: 그 종류의 칸만 남기고 기본값을 채운다(따라가기 = 다른 첫 파티, 대형 = 횡대, 전개 방식 = 돌격) */
function withKind(
  order: ReportOrder,
  kind: ReportOrderKind,
  firstTarget: { party: number; index: number } | undefined,
  parties: number,
): ReportOrder {
  const base = { atSec: order.atSec, party: order.party, kind };
  if (kind === "attack" && firstTarget) return { ...base, target: firstTarget };
  if (kind === "follow") return { ...base, leader: order.party === 0 && parties > 1 ? 1 : 0 };
  if (kind === "formation") return { ...base, shape: "line" };
  if (kind === "tactic") return { ...base, tactic: "assault" };
  return base;
}

/** 목표 칸 값 `<파티>.<자리>` */
const targetValue = (target: { party: number; index: number }): string => `${target.party}.${target.index}`;

function OrderRow(props: {
  readonly order: ReportOrder;
  readonly number: number;
  readonly parties: number;
  readonly limitSec: number;
  /** 상대 군단 파티마다 유닛 수(목표 공격을 못 하면 null)·상대 팀 글자 */
  readonly enemy: readonly number[] | null;
  readonly enemyTag: string;
  readonly onChange: (order: ReportOrder) => void;
  readonly onRemove: () => void;
}) {
  const { order, enemy } = props;
  const id = useId();
  const kinds = REPORT_ORDER_KINDS.filter(
    (kind) => (kind !== "attack" || enemy !== null) && (kind !== "follow" || props.parties > 1),
  );
  const firstTarget = enemy && enemy.length > 0 ? { party: 0, index: 0 } : undefined;
  return (
    <li className="rp-order">
      <NumberField
        label={m.dev_report_order_at()}
        value={order.atSec}
        min={0}
        max={props.limitSec}
        className="rp-order-at"
        onChange={(atSec) => props.onChange({ ...order, atSec })}
      />
      <div className="field">
        <label className="field-label" htmlFor={`${id}-who`}>
          {m.dev_report_order_who()}
        </label>
        <select
          id={`${id}-who`}
          className="rp-order-who"
          value={order.party}
          onChange={(event) => props.onChange({ ...order, party: Number(event.target.value) })}
        >
          <option value={REPORT_LEGION_ORDER}>{m.dev_report_order_legion()}</option>
          {Array.from({ length: props.parties }, (_, p) => (
            <option key={p} value={p}>
              {m.dev_report_order_party({ n: p + 1 })}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor={`${id}-kind`}>
          {m.dev_report_order_kind()}
        </label>
        <select
          id={`${id}-kind`}
          className="rp-order-kind"
          value={order.kind}
          onChange={(event) => {
            const kind = event.target.value;
            if (!isKind(kind)) return;
            props.onChange(withKind(order, kind, firstTarget, props.parties));
          }}
        >
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {orderKindText(kind)}
            </option>
          ))}
        </select>
      </div>
      {order.kind === "attack" && enemy ? (
        <div className="field">
          <label className="field-label" htmlFor={`${id}-target`}>
            {m.dev_report_order_target()}
          </label>
          <select
            id={`${id}-target`}
            className="rp-order-target"
            value={order.target ? targetValue(order.target) : ""}
            onChange={(event) => {
              const [party, index] = event.target.value.split(".").map(Number);
              if (party === undefined || index === undefined) return;
              props.onChange({ ...order, target: { party, index } });
            }}
          >
            {enemy.flatMap((count, p) =>
              Array.from({ length: count }, (_, index) => (
                <option key={`${p}.${index}`} value={`${p}.${index}`}>
                  {`${props.enemyTag}${p + 1}·${index + 1}`}
                </option>
              )),
            )}
          </select>
        </div>
      ) : null}
      {order.kind === "follow" ? (
        <div className="field">
          <label className="field-label" htmlFor={`${id}-leader`}>
            {m.battle_cmd_follow_who()}
          </label>
          <select
            id={`${id}-leader`}
            className="rp-order-leader"
            value={order.leader ?? 0}
            onChange={(event) => props.onChange({ ...order, leader: Number(event.target.value) })}
          >
            {Array.from({ length: props.parties }, (_, p) =>
              p === order.party ? null : (
                <option key={p} value={p}>
                  {m.dev_report_order_party({ n: p + 1 })}
                </option>
              ),
            )}
          </select>
        </div>
      ) : null}
      {order.kind === "formation" ? (
        <div className="field">
          <label className="field-label" htmlFor={`${id}-shape`}>
            {m.battle_cmd_shape()}
          </label>
          <select
            id={`${id}-shape`}
            className="rp-order-shape"
            value={order.shape ?? "line"}
            onChange={(event) => {
              if (isFormation(event.target.value)) props.onChange({ ...order, shape: event.target.value });
            }}
          >
            {REPORT_FORMATIONS.map((shape) => (
              <option key={shape} value={shape}>
                {formationText(shape)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {order.kind === "tactic" ? (
        <div className="field">
          <label className="field-label" htmlFor={`${id}-tactic`}>
            {m.battle_cmd_tactic()}
          </label>
          <select
            id={`${id}-tactic`}
            className="rp-order-tactic"
            value={order.tactic ?? "assault"}
            onChange={(event) => {
              if (isTactic(event.target.value)) props.onChange({ ...order, tactic: event.target.value });
            }}
          >
            {REPORT_TACTICS.map((tactic) => (
              <option key={tactic} value={tactic}>
                {tacticText(tactic)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {order.cell ? (
        <span className="rp-order-cell">{m.dev_report_order_cell({ x: order.cell.x, y: order.cell.y })}</span>
      ) : null}
      <button
        type="button"
        className="button-small rp-order-remove"
        aria-label={m.dev_report_order_remove({ n: props.number })}
        onClick={props.onRemove}
      >
        ×
      </button>
    </li>
  );
}

/** 팀 하나(군단)의 명령 줄 */
export function OrdersEditor(props: {
  readonly team: "a" | "b";
  readonly orders: readonly ReportOrder[];
  readonly parties: number;
  readonly limitSec: number;
  readonly enemy: readonly number[] | null;
  readonly onChange: (orders: ReportOrder[]) => void;
}) {
  const { orders, onChange } = props;
  const tag = props.team.toUpperCase();
  const enemyTag = props.team === "a" ? "B" : "A";
  return (
    <div className="rp-orders" data-team={props.team}>
      <h3 className="rp-orders-title">{m.dev_report_orders_team({ team: tag })}</h3>
      {orders.length === 0 ? <p className="field-hint">{m.dev_report_orders_empty()}</p> : null}
      <ol className="rp-order-list">
        {orders.map((order, index) => (
          <OrderRow
            // 줄은 차례로 고정이다(시각을 바꿔도 줄을 다시 세우지 않는다 — 서버가 시각 차례로 넣는다)
            // biome-ignore lint/suspicious/noArrayIndexKey: 줄 자리 = 명령 번호
            key={index}
            order={order}
            number={index + 1}
            parties={props.parties}
            limitSec={props.limitSec}
            enemy={props.enemy}
            enemyTag={enemyTag}
            onChange={(next) => onChange(orders.map((entry, at) => (at === index ? next : entry)))}
            onRemove={() => onChange(orders.filter((_, at) => at !== index))}
          />
        ))}
      </ol>
      {orders.length < REPORT_LIMITS.legionOrdersMax ? (
        <button
          type="button"
          className="button-small rp-order-add"
          onClick={() => onChange([...orders, { atSec: 0, party: REPORT_LEGION_ORDER, kind: "advance" }])}
        >
          {m.dev_report_order_add()}
        </button>
      ) : null}
    </div>
  );
}
