// 주문표 — D-6033(오른쪽: 주문 종류·가격·수량·매수/매도, "남은 주문 7/10")·D-6034(누르면 늘리는 법, 한도면 잠그고 다시 되는 시각)·
// D-6035(지정가 = 만료 기간, 시장가 = 최대 가격 안전망, 조건 = 가격 도달). 검사·미리 보기는 순수 함수(orderForm.ts)다.
// 실제 거래소(live: 서버 도시 경제, docs/adr/2026-11-07-play-flow.md WP4)면 [주문]이 WebSocket market_place를 보내고 결과를 알린다(지정가·시장가.
// 조건 주문은 아직 서버에 없어 잠근다). 시안 자료·거래소가 없는 세계는 "곧 열림"으로 잠근다(aria-disabled: 초점은 남고 누르면 아무 일도 없다).
// 칸 오류는 사람이 그 칸을 건드린 뒤에만 보인다(처음부터 빨간 글이 뜨지 않게). [주문]을 누르면 모든 칸을 건드린 것으로 친다.
// 값은 그 도시 화폐(나라 화폐, WP6)라 실제 거래소에서 그 화폐가 모자라면 환전 화면으로 가는 길을 함께 보인다.
import { type Dispatch, type ReactNode, type SetStateAction, useId, useState } from "react";
import { m } from "../../paraglide/messages.js";
import { AppLink } from "../../shell/AppLink.tsx";
import { formatRate } from "../amount.ts";
import { sendMarketCommand } from "./marketCommands.ts";
import { MARKET_ERROR_TEXT, refreshMarket, wireAmount } from "./marketText.ts";
import { fmt, formatClock, formatDays } from "../economyText.ts";
import {
  type FieldError,
  type OrderCheck,
  type OrderContext,
  type OrderDraft,
  type OrderField,
  type OrderKind,
  type OrderProblem,
  checkOrder,
  defaultGuard,
  maxQty,
  stepPrice,
} from "../orderForm.ts";

const FIELD_ERRORS: Readonly<Record<FieldError, () => string>> = {
  required: m.economy_err_required,
  integer: m.economy_err_integer,
  too_large: m.economy_err_too_large,
};

const PROBLEMS: Readonly<Record<OrderProblem, () => string>> = {
  cash: m.economy_err_cash,
  goods: m.economy_err_goods,
  liquidity: m.economy_err_liquidity,
  limit: m.economy_err_limit,
};

const KINDS: readonly { value: OrderKind; label: () => string }[] = [
  { value: "limit", label: m.economy_kind_limit },
  { value: "market", label: m.economy_kind_market },
  { value: "conditional", label: m.economy_kind_conditional },
];

function isKind(value: string): value is OrderKind {
  return value === "limit" || value === "market" || value === "conditional";
}

/** 숫자 칸 하나(글 입력 + 숫자 자판). 오류는 칸 아래, aria-describedby로 잇는다 */
function NumberField({
  id,
  name,
  label,
  value,
  error,
  onChange,
  onBlur,
  before,
  after,
}: {
  id: string;
  /** 칸 이름(form 값 이름, 자동 완성 구분) */
  name: string;
  label: string;
  value: string;
  error: FieldError | undefined;
  onChange: (value: string) => void;
  onBlur: () => void;
  before?: ReactNode;
  after?: ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="eco-field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="eco-field-row">
        {before}
        <input
          id={id}
          name={name}
          className="input eco-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={value}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
          onChange={(event) => onChange(event.currentTarget.value)}
          onBlur={onBlur}
        />
        {after}
      </div>
      {error === undefined ? null : (
        <p id={errorId} className="field-error eco-field-error">
          {FIELD_ERRORS[error]()}
        </p>
      )}
    </div>
  );
}

function Summary({ check, draft, taxBp }: { check: OrderCheck; draft: OrderDraft; taxBp: number }) {
  const preview = check.preview;
  if (!preview) return null;
  return (
    <dl className="eco-summary">
      {preview.fillQty > 0n && preview.avgPrice !== null ? (
        <div className="eco-summary-note">
          <dd>{m.economy_sum_fill({ qty: fmt(preview.fillQty), price: fmt(preview.avgPrice) })}</dd>
        </div>
      ) : null}
      {draft.kind === "limit" && preview.restQty > 0n && preview.fillQty > 0n ? (
        <div className="eco-summary-note">
          <dd>{m.economy_sum_rest({ qty: fmt(preview.restQty) })}</dd>
        </div>
      ) : null}
      {preview.unfilledQty > 0n ? (
        <div className="eco-summary-note" data-tone="warning">
          <dd>{m.economy_sum_unfilled({ qty: fmt(preview.unfilledQty) })}</dd>
        </div>
      ) : null}
      <div>
        <dt>{m.economy_sum_total()}</dt>
        <dd className="eco-num">{fmt(preview.gross)}</dd>
      </div>
      {draft.side === "sell" ? (
        <>
          <div>
            <dt>{m.economy_sum_tax({ pct: formatRate(taxBp) })}</dt>
            <dd className="eco-num">−{fmt(preview.tax)}</dd>
          </div>
          <div className="eco-summary-strong">
            <dt>{m.economy_sum_net()}</dt>
            <dd className="eco-num">{fmt(preview.net)}</dd>
          </div>
        </>
      ) : null}
      {preview.escrow ? (
        <div>
          <dt>
            {preview.escrow.kind === "cash" ? m.economy_sum_escrow_cash() : m.economy_sum_escrow_goods()}
          </dt>
          <dd className="eco-num">{fmt(preview.escrow.amount)}</dd>
        </div>
      ) : (
        <div className="eco-summary-note">
          <dd>{m.economy_sum_conditional()}</dd>
        </div>
      )}
    </dl>
  );
}

export interface OrderFormProps {
  readonly draft: OrderDraft;
  readonly setDraft: Dispatch<SetStateAction<OrderDraft>>;
  readonly context: OrderContext;
  readonly expiryDays: readonly number[];
  readonly limit: { readonly used: number; readonly max: number; readonly recoversAt: number | null };
  /** 이 도시에 내 창고가 있는지(없으면 매수 때 보관·운송 안내, D-6032) */
  readonly hasWarehouse: boolean;
  /** 지난 값(값 칸이 비었을 때 올리기·내리기의 시작) */
  readonly lastPrice: bigint | null;
  readonly now: number;
  /** 실제 거래소면 보낼 도시·물건(시안 자료·거래소 없음이면 null — 보내지 않는다) */
  readonly live?: { readonly city: number; readonly item: string } | null | undefined;
}

/** 보낸 주문의 결과 문구 */
interface Sent {
  readonly ok: boolean;
  readonly text: string;
}

export function OrderFormPanel({
  draft,
  setDraft,
  context,
  expiryDays,
  limit,
  hasWarehouse,
  lastPrice,
  now,
  live,
}: OrderFormProps) {
  const id = useId();
  const [touched, setTouched] = useState<ReadonlySet<OrderField>>(() => new Set());
  const [helpOpen, setHelpOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const check = checkOrder(draft, context);
  const touch = (field: OrderField) => () =>
    setTouched((previous) => (previous.has(field) ? previous : new Set([...previous, field])));
  const shown = (field: OrderField): FieldError | undefined =>
    touched.has(field) ? check.fields[field] : undefined;
  const update = (patch: Partial<OrderDraft>) => setDraft((previous) => ({ ...previous, ...patch }));
  const left = Math.max(0, limit.max - limit.used);
  const problems = check.preview ? check.problems : check.problems.filter((problem) => problem === "limit");
  const guardLabel = draft.side === "buy" ? m.economy_guard_buy() : m.economy_guard_sell();

  return (
    <section className="eco-form" aria-labelledby={`${id}-title`} data-side={draft.side}>
      <h2 id={`${id}-title`} className="eco-panel-title">
        {m.economy_form_title()}
      </h2>
      <fieldset className="eco-sides">
        <legend className="visually-hidden">{m.economy_side_label()}</legend>
        {(["buy", "sell"] as const).map((side) => (
          <label key={side} className="eco-side" data-side={side}>
            <input
              type="radio"
              name={`${id}-side`}
              value={side}
              checked={draft.side === side}
              onChange={() =>
                update({ side, guard: draft.kind === "market" ? defaultGuard(side, context) : draft.guard })
              }
            />
            <span>{side === "buy" ? m.economy_side_buy() : m.economy_side_sell()}</span>
          </label>
        ))}
      </fieldset>
      <div className="eco-field">
        <label className="field-label" htmlFor={`${id}-kind`}>
          {m.economy_kind_label()}
        </label>
        <select
          id={`${id}-kind`}
          className="eco-select"
          value={draft.kind}
          onChange={(event) => {
            const kind = event.currentTarget.value;
            if (!isKind(kind)) return;
            update({
              kind,
              guard:
                kind === "market" && draft.guard === "" ? defaultGuard(draft.side, context) : draft.guard,
            });
          }}
        >
          {KINDS.map((kind) => (
            <option key={kind.value} value={kind.value}>
              {kind.label()}
            </option>
          ))}
        </select>
      </div>
      {draft.kind === "conditional" ? (
        <>
          <div className="eco-field">
            <label className="field-label" htmlFor={`${id}-direction`}>
              {m.economy_trigger_direction()}
            </label>
            <select
              id={`${id}-direction`}
              className="eco-select"
              value={draft.triggerDirection}
              onChange={(event) =>
                update({ triggerDirection: event.currentTarget.value === "above" ? "above" : "below" })
              }
            >
              <option value="below">{m.economy_trigger_below()}</option>
              <option value="above">{m.economy_trigger_above()}</option>
            </select>
          </div>
          <NumberField
            id={`${id}-trigger`}
            name="trigger"
            label={m.economy_trigger()}
            value={draft.trigger}
            error={shown("trigger")}
            onChange={(trigger) => update({ trigger })}
            onBlur={touch("trigger")}
          />
        </>
      ) : null}
      {draft.kind === "market" ? (
        <NumberField
          id={`${id}-guard`}
          name="guard"
          label={guardLabel}
          value={draft.guard}
          error={shown("guard")}
          onChange={(guard) => update({ guard })}
          onBlur={touch("guard")}
        />
      ) : (
        <NumberField
          id={`${id}-price`}
          name="price"
          label={m.economy_price()}
          value={draft.price}
          error={shown("price")}
          onChange={(price) => update({ price })}
          onBlur={touch("price")}
          before={
            <button
              type="button"
              className="eco-step"
              aria-label={m.economy_step_down()}
              onClick={() => update({ price: stepPrice(draft.price, -1, lastPrice) })}
            >
              −
            </button>
          }
          after={
            <button
              type="button"
              className="eco-step"
              aria-label={m.economy_step_up()}
              onClick={() => update({ price: stepPrice(draft.price, 1, lastPrice) })}
            >
              +
            </button>
          }
        />
      )}
      <NumberField
        id={`${id}-qty`}
        name="qty"
        label={m.economy_qty()}
        value={draft.qty}
        error={shown("qty")}
        onChange={(qty) => update({ qty })}
        onBlur={touch("qty")}
        after={
          <button
            type="button"
            className="eco-step eco-step-wide"
            onClick={() => {
              const most = maxQty(draft, context);
              if (most > 0n) update({ qty: String(most) });
            }}
          >
            {m.economy_qty_max()}
          </button>
        }
      />
      <p className="eco-have">
        {draft.side === "buy"
          ? m.economy_have_cash({ amount: fmt(context.cash) })
          : m.economy_have_goods({ qty: fmt(context.goods) })}
      </p>
      {draft.kind === "market" ? null : (
        <div className="eco-field">
          <label className="field-label" htmlFor={`${id}-expiry`}>
            {m.economy_expiry()}
          </label>
          <select
            id={`${id}-expiry`}
            className="eco-select"
            value={String(draft.expiryDays)}
            onChange={(event) => update({ expiryDays: Number(event.currentTarget.value) })}
          >
            {expiryDays.map((days) => (
              <option key={days} value={String(days)}>
                {formatDays(days)}
              </option>
            ))}
          </select>
        </div>
      )}
      <Summary check={check} draft={draft} taxBp={context.taxBp} />
      {draft.side === "sell" && check.preview ? (
        <p className="eco-footnote">{m.economy_sum_tax_note()}</p>
      ) : null}
      {draft.side === "buy" && !hasWarehouse ? (
        <p className="eco-footnote">{m.economy_no_warehouse()}</p>
      ) : null}
      <div className="eco-problems" aria-live="polite">
        {problems.map((problem) => (
          <p key={problem} className="field-error">
            {problem === "limit" && limit.recoversAt !== null
              ? m.economy_limit_reached_at({ time: formatClock(limit.recoversAt, now) })
              : PROBLEMS[problem]()}
            {problem === "cash" && live ? (
              <>
                {" "}
                <AppLink to={{ route: "economy_exchange" }}>{m.market_go_exchange()}</AppLink>
              </>
            ) : null}
          </p>
        ))}
      </div>
      <button
        type="button"
        className="button-text eco-limit"
        aria-expanded={helpOpen}
        aria-controls={`${id}-limit-help`}
        onClick={() => setHelpOpen((open) => !open)}
      >
        {m.economy_limit({ left, max: limit.max })}
      </button>
      {helpOpen ? (
        <p id={`${id}-limit-help`} className="eco-footnote">
          {m.economy_limit_help()}
        </p>
      ) : null}
      {live ? (
        <LiveSubmit
          id={id}
          draft={draft}
          ok={check.ok}
          sending={sending}
          sent={sent}
          onSubmit={() => {
            setTouched(new Set<OrderField>(["price", "qty", "guard", "trigger"]));
            if (!check.ok || sending || draft.kind === "conditional") return;
            const price = wireAmount(draft.kind === "market" ? draft.guard : draft.price);
            const qty = wireAmount(draft.qty);
            if (price === null || qty === null) return;
            setSending(true);
            setSent(null);
            void sendMarketCommand({
              t: "market_place",
              city: live.city,
              item: live.item,
              side: draft.side,
              kind: draft.kind,
              price,
              qty,
              ...(draft.kind === "limit" ? { expiryDays: draft.expiryDays } : {}),
            }).then((outcome) => {
              setSending(false);
              if (!outcome.ok) {
                setSent({ ok: false, text: MARKET_ERROR_TEXT[outcome.code]() });
                return;
              }
              setSent({
                ok: true,
                text: m.market_placed({
                  filled: fmt(outcome.filled ?? "0"),
                  resting: fmt(outcome.resting ?? "0"),
                }),
              });
              setDraft((previous) => ({ ...previous, qty: "" }));
              refreshMarket();
            });
          }}
        />
      ) : (
        <>
          <button
            type="button"
            className="button-primary eco-submit"
            data-side={draft.side}
            aria-disabled="true"
            aria-describedby={`${id}-soon`}
          >
            {m.economy_submit_soon()}
          </button>
          <p id={`${id}-soon`} className="eco-footnote">
            {m.economy_submit_hint()}
          </p>
        </>
      )}
    </section>
  );
}

/** 실제 거래소의 [주문]: 보내는 중에는 잠그고, 결과를 알린다. 조건 주문은 아직 서버에 없어 잠근다 */
function LiveSubmit({
  id,
  draft,
  ok,
  sending,
  sent,
  onSubmit,
}: {
  id: string;
  draft: OrderDraft;
  ok: boolean;
  sending: boolean;
  sent: Sent | null;
  onSubmit: () => void;
}) {
  const conditional = draft.kind === "conditional";
  const locked = conditional || sending;
  return (
    <>
      <button
        type="button"
        className="button-primary eco-submit"
        data-side={draft.side}
        aria-disabled={locked || !ok ? "true" : undefined}
        aria-describedby={conditional ? `${id}-conditional` : sent ? `${id}-sent` : undefined}
        onClick={onSubmit}
      >
        {sending ? m.market_sending() : draft.side === "buy" ? m.market_submit_buy() : m.market_submit_sell()}
      </button>
      {conditional ? (
        <p id={`${id}-conditional`} className="eco-footnote">
          {m.market_conditional_soon()}
        </p>
      ) : null}
      <p
        id={`${id}-sent`}
        className="eco-sent"
        role="status"
        data-tone={sent ? (sent.ok ? "ok" : "error") : undefined}
      >
        {sent?.text ?? ""}
      </p>
    </>
  );
}

/** 처음 주문표: 매수 지정가, 값 = 최우선 매도(없으면 지난 값), 만료 = 가장 긴 것 */
export function initialDraft(
  context: OrderContext,
  lastPrice: bigint | null,
  expiryDays: readonly number[],
): OrderDraft {
  const best = context.asks[0]?.price ?? lastPrice;
  return {
    side: "buy",
    kind: "limit",
    price: best === null ? "" : String(best),
    qty: "",
    guard: "",
    trigger: "",
    triggerDirection: "below",
    expiryDays: expiryDays.at(-1) ?? 7,
  };
}
