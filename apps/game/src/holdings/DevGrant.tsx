// 개발 시험 받기(dev·admin) — 사이보그·유닛 화면 인벤토리 아래 접힌 판. 펼치면 아이템 목록(tRPC items.list, 아이템 편집기와 같은 실효 팩)을
// 받아 고르고, dev_grant_item(프로토콜 6)으로 이 유닛(없으면 내 사이보그)이 든 물건으로 받는다. 굴림은 얻는 때 규칙 그대로(서버).
// 목록은 보유 모양으로 묶는다: 장비(하나하나)·쓰는 물건(쌓임)·신선도 묶음·원장 물자(받을 수 없음 → not_holdable — 오류 확인용으로 남김).
// 같은 판에 병원 치료(dev_treat_unit, 프로토콜 9, D-514 — 병원 시설이 생기기 전 규칙 고리: 부상을 지우고 HP를 가득) 버튼을 둔다.
// 플레이어에게는 그리지 않는다(서버도 forbidden으로 막는다).
import type { ItemEditorListResponse, ItemRow } from "@terra/shared/itemEditor";
import { type FormEvent, useId, useState } from "react";
import { useSession } from "../auth/session.ts";
import { api } from "../net/api.ts";
import { m } from "../paraglide/messages.js";
import { localName } from "../roster/rosterText.ts";
import type { HoldingsController } from "./useHoldings.ts";

type Group = "equipment" | "usable" | "perish" | "ledger";
const GROUPS: readonly Group[] = ["equipment", "usable", "perish", "ledger"];
const GROUP_LABELS = {
  equipment: () => m.holdings_dev_group_equipment(),
  usable: () => m.holdings_dev_group_usable(),
  perish: () => m.holdings_dev_group_perish(),
  ledger: () => m.holdings_dev_group_ledger(),
} satisfies Record<Group, () => string>;

/** 보유 모양 묶음(서버 holdingKindOf와 같은 차례: 장비 → 신선도 → 사용 효과 → 원장) */
function groupOf(row: ItemRow): Group {
  if (row.category === "equipment") return "equipment";
  if (row.shelfLifeMs !== null) return "perish";
  if (row.effects.length > 0) return "usable";
  return "ledger";
}

type ListState =
  | { readonly status: "idle" | "loading" | "error" }
  | { readonly status: "ready"; readonly rows: readonly ItemRow[] };

const QUANTITY_MAX = 1000;

export function DevGrant({ controller, unit }: { controller: HoldingsController; unit: number | null }) {
  const id = useId();
  const session = useSession();
  const [list, setList] = useState<ListState>({ status: "idle" });
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState(1);
  const allowed =
    session.kind === "signed_in" && session.user.roles.some((role) => role === "dev" || role === "admin");
  if (!allowed) return null;

  const load = (): void => {
    setList({ status: "loading" });
    api.items.list.query().then(
      (data: ItemEditorListResponse) => {
        const rows = data.items
          .filter((row) => row.enabled)
          .toSorted((a, b) => localName(a.name, a.id).localeCompare(localName(b.name, b.id)));
        setList({ status: "ready", rows });
        const first = rows.find((row) => groupOf(row) !== "ledger") ?? rows[0];
        if (first) setItem((current) => current || first.id);
      },
      () => setList({ status: "error" }),
    );
  };

  const rows = list.status === "ready" ? list.rows : [];
  const chosen = rows.find((row) => row.id === item);
  const busy = controller.pending !== null;
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (busy || !chosen) return;
    void controller.grant(chosen.id, quantity, unit, localName(chosen.name, chosen.id));
  };

  return (
    <details
      className="holdings-dev"
      onToggle={(event) => {
        if (event.currentTarget.open && (list.status === "idle" || list.status === "error")) load();
      }}
    >
      <summary className="holdings-dev-summary">{m.holdings_dev_title()}</summary>
      <p className="roster-note">{m.holdings_dev_note()}</p>
      {list.status === "loading" || list.status === "idle" ? (
        <p className="status" role="status">
          {m.holdings_dev_loading()}
        </p>
      ) : list.status === "error" ? (
        <div className="roster-failed">
          <p className="roster-empty">{m.holdings_dev_failed()}</p>
          <button type="button" className="button-small" onClick={load}>
            {m.retry()}
          </button>
        </div>
      ) : (
        <form className="holdings-dev-form" onSubmit={submit}>
          <label className="field" htmlFor={`${id}-item`}>
            <span className="field-label">{m.holdings_dev_item()}</span>
            <select
              id={`${id}-item`}
              className="input"
              value={item}
              onChange={(event) => setItem(event.currentTarget.value)}
            >
              {GROUPS.map((group) => {
                const inGroup = rows.filter((row) => groupOf(row) === group);
                return inGroup.length === 0 ? null : (
                  <optgroup key={group} label={GROUP_LABELS[group]()}>
                    {inGroup.map((row) => (
                      <option key={row.id} value={row.id}>
                        {m.holdings_dev_option({ name: localName(row.name, row.id), id: row.id })}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </label>
          <label className="field holdings-dev-qty" htmlFor={`${id}-qty`}>
            <span className="field-label">{m.holdings_dev_quantity()}</span>
            <input
              id={`${id}-qty`}
              className="input"
              type="number"
              inputMode="numeric"
              min={1}
              max={QUANTITY_MAX}
              value={quantity}
              onChange={(event) => {
                const value = Math.trunc(Number(event.currentTarget.value));
                setQuantity(Number.isFinite(value) ? Math.min(QUANTITY_MAX, Math.max(1, value)) : 1);
              }}
            />
          </label>
          <button
            type="submit"
            className="button-primary"
            aria-disabled={busy || !chosen ? "true" : undefined}
          >
            {m.holdings_dev_submit()}
          </button>
        </form>
      )}
      <div className="holdings-dev-treat">
        <p className="roster-note">{m.holdings_dev_treat_note()}</p>
        <button
          type="button"
          className="button-small"
          data-dev-treat="true"
          aria-disabled={busy ? "true" : undefined}
          onClick={() => {
            if (!busy) void controller.treat(unit);
          }}
        >
          {m.holdings_dev_treat()}
        </button>
      </div>
    </details>
  );
}
