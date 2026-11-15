// 파티·군단 명령 칸 — 기획 D-545·D-549(진형 전진·자리 지키기·목표 공격·퇴각·거두기), docs/adr/2026-11-14-battle-report.md
// "바뀜 (2026-11-14, 파티·군단 명령)". 팀(군단)마다 시각 명령 줄: 시각(초) · 받는 쪽(군단 전체 또는 n번 파티) · 명령 · 목표(목표 공격만,
// 상대가 실험실 군단일 때). 판정은 서버가 한다(군단 명령은 지휘관 정원 안 파티만 받는다 — 화면은 막지 않고 결과에 거절 수를 보인다).
// 시험용: .rp-orders[data-team], .rp-order(줄), .rp-order-add, .rp-order-remove, select.rp-order-who·.rp-order-kind·.rp-order-target.
import {
  REPORT_LEGION_ORDER,
  REPORT_LIMITS,
  REPORT_ORDER_KINDS,
  type ReportOrder,
  type ReportOrderKind,
} from "@terra/shared/battleReport";
import { useId } from "react";
import { m } from "../../../paraglide/messages.js";
import { NumberField } from "../lab/fields.tsx";
import { orderKindText } from "./reportMessages.ts";

const isKind = (value: string): value is ReportOrderKind =>
  (REPORT_ORDER_KINDS as readonly string[]).includes(value);

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
  const kinds = REPORT_ORDER_KINDS.filter((kind) => kind !== "attack" || enemy !== null);
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
            const { target: _old, ...rest } = order;
            props.onChange(
              kind === "attack" && firstTarget ? { ...rest, kind, target: firstTarget } : { ...rest, kind },
            );
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
