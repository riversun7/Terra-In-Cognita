// 자산 묶음 표시 — 사용자 요청 2026-11-23 "기준통화란 소속한 국가의 화폐", "다른나라 화폐는 외환보유고에 따로 표시… 화폐표시 뒤에 해당 세력
// 국기", "주식같은경우 해당 사업장이름(중복금지), 도시… 금화표시도 안되고 화폐와 구분". docs/adr/2026-11-23-nation-money.md.
// 서버가 붙인 표시 정보(@terra/shared/economy AssetTag)로 줄을 나눈다:
// - 기준 통화(소속 국가 화폐) → 외환 보유고(다른 나라 화폐, 화폐 이름 뒤에 그 나라 국기) → 주식(동전 없이 증서 아이콘 + 사업장 이름 #건물 번호·도시)
// - 표시 정보가 없는 줄(옛 서버·시안 자료·그 밖의 자산)은 예전처럼 돈 표시로 맨 아래에 둔다.
// 국고·내 잔고(세력 화면)와 지갑(창고 화면)이 같이 쓴다.
import type { AssetNation, AssetTag } from "@terra/shared/economy";
import type { ReactNode } from "react";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { Money } from "./Money.tsx";
import { NationEmblem } from "./NationEmblem.tsx";
import "./assetGroups.css";

export interface AssetRow {
  readonly key: string;
  /** 자리 쉼표를 넣은 수량 글 */
  readonly amount: string;
  /** 화폐·자산 이름(지분은 쓰지 않는다 — 표시 정보로 만든다) */
  readonly name: string;
  /** 큰 차례로 놓을 때 쓰는 수량 */
  readonly qty: bigint;
  readonly tag?: AssetTag | undefined;
  /** 이름 곁에 붙일 것(시안 자료 표시 등) */
  readonly extra?: ReactNode;
}

const nationLabel = (nation: AssetNation | null | undefined): string | undefined => {
  if (!nation?.name) return undefined;
  return getLocale() === "en" ? nation.name.en : nation.name.ko;
};

/** 화폐 이름 뒤 국기(그 화폐를 찍는 나라). 국기를 모르면 없음 */
function Flag({ nation }: { nation: AssetNation | null | undefined }) {
  if (!nation?.emblem) return null;
  const name = nationLabel(nation);
  return (
    <NationEmblem
      spec={nation.emblem.spec}
      color={nation.emblem.color}
      uploaded={nation.emblem.uploaded}
      size={18}
      label={name === undefined ? undefined : m.asset_flag_label({ nation: name })}
      className="asset-flag"
    />
  );
}

/** 증서 아이콘(주식 — 동전과 다른 모양·색) */
function Certificate() {
  return (
    <svg className="asset-share-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <path d="M4 10.5 6.5 8l2 1.5L12 6" />
    </svg>
  );
}

/** 지분 이름: 사업장 = "시설 이름 #건물 번호"(세계에서 하나), 도시 지분 = "도시 이름 정부 지분" */
function shareTitle(row: AssetRow, tag: AssetTag): string {
  if (tag.kind === "business_share") {
    const id = String(tag.buildingId ?? "");
    if (!tag.business) return m.asset_share_business_unknown({ id });
    return m.asset_share_business({ name: getLocale() === "en" ? tag.business.en : tag.business.ko, id });
  }
  return m.asset_share_city({
    city: tag.city ?? m.asset_share_city_unknown({ id: String(tag.cityId ?? "") }),
  });
}

function ShareLine({ row, tag }: { row: AssetRow; tag: AssetTag }) {
  const place = tag.kind === "business_share" ? tag.city : nationLabel(tag.nation);
  return (
    <li className="asset-share">
      <Certificate />
      <span className="asset-share-main">
        <span className="asset-share-name">
          {shareTitle(row, tag)}
          <Flag nation={tag.nation} />
        </span>
        {place ? <span className="asset-share-place">{place}</span> : null}
      </span>
      <span className="asset-share-count" translate="no">
        {m.asset_share_count({ count: row.amount })}
      </span>
    </li>
  );
}

function MoneyLine({ row, size }: { row: AssetRow; size: "md" | "lg" }) {
  return (
    <li className="asset-money">
      <Money amount={row.amount} unit={row.name} size={size} />
      <Flag nation={row.tag?.nation} />
      {row.extra}
    </li>
  );
}

const byQty = (a: AssetRow, b: AssetRow): number =>
  a.qty === b.qty ? a.key.localeCompare(b.key) : a.qty > b.qty ? -1 : 1;

export function AssetGroups({ rows, size = "md" }: { rows: readonly AssetRow[]; size?: "md" | "lg" }) {
  const of = (...kinds: AssetTag["kind"][]): AssetRow[] =>
    rows.filter((row) => row.tag !== undefined && kinds.includes(row.tag.kind)).toSorted(byQty);
  const home = of("home");
  const foreign = of("foreign");
  const shares = of("city_share", "business_share");
  const other = rows.filter((row) => row.tag === undefined).toSorted(byQty);
  return (
    <div className="asset-groups">
      {home.length === 0 ? null : (
        <section className="asset-group" data-kind="home">
          <h3 className="asset-group-title">{m.asset_group_home()}</h3>
          <ul className="asset-group-list">
            {home.map((row) => (
              <MoneyLine key={row.key} row={row} size={size} />
            ))}
          </ul>
        </section>
      )}
      {foreign.length === 0 ? null : (
        <section className="asset-group" data-kind="foreign">
          <h3 className="asset-group-title">{m.asset_group_foreign()}</h3>
          <ul className="asset-group-list">
            {foreign.map((row) => (
              <MoneyLine key={row.key} row={row} size="md" />
            ))}
          </ul>
        </section>
      )}
      {shares.length === 0 ? null : (
        <section className="asset-group" data-kind="shares">
          <h3 className="asset-group-title">{m.asset_group_shares()}</h3>
          <ul className="asset-group-list">
            {shares.map((row) => (row.tag ? <ShareLine key={row.key} row={row} tag={row.tag} /> : null))}
          </ul>
        </section>
      )}
      {other.length === 0 ? null : (
        <section className="asset-group" data-kind="other">
          {home.length + foreign.length + shares.length === 0 ? null : (
            <h3 className="asset-group-title">{m.asset_group_other()}</h3>
          )}
          <ul className="asset-group-list">
            {other.map((row) => (
              <MoneyLine key={row.key} row={row} size="md" />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
