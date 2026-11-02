// 미리 보기 — 채집 티어 추첨(D-506, 49 N43). 서버 items.preview의 gather 칸을 보이기만 한다(기기는 셈하지 않는다).
// 시설·스탯 짝·기준 유닛 스탯, 시설 Lv1~5의 유효 스탯과 묶음 하나에서 이 아이템이 나올 확률, 확률표 전체(읽기만: 고치는 곳은 팩
// gather_tiers. 편집 화면은 다음 줄기). 이 아이템 티어 열과 Lv1 구간 행을 표시한다.
import type { ItemGatherPreview } from "@terra/shared/itemEditor";
import { useId } from "react";
import { m } from "../../paraglide/messages.js";
import { PRIMARY_TEXT } from "./itemMessages.ts";

/** ‰ → "12.5%" (보이기만, 판정 아님) */
const pmText = (pm: number): string => `${(pm / 10).toFixed(1)}%`;
/** 만분율 → "5.00%" */
const bpText = (bp: number): string => `${(bp / 100).toFixed(2)}%`;

export function GatherPart({ gather, locale }: { gather: ItemGatherPreview; locale: "ko" | "en" }) {
  const { tier } = gather;
  const levelsId = useId();
  const bandsId = useId();
  const stats = `${PRIMARY_TEXT[gather.primary]()}+${PRIMARY_TEXT[gather.secondary]()}`;
  const firstBand = gather.levels[0]?.band ?? -1;
  const tiers = gather.bands[0]?.weightsPm.map((_, index) => index) ?? [];
  return (
    <>
      <p className="field-hint" data-part="gather-summary">
        {m.dev_items_gather_summary({
          facility: gather.facilityName[locale],
          stats,
          stat: gather.unitStat,
          bonus: gather.levelBonus,
        })}
      </p>
      {gather.enabled ? null : <p className="field-hint">{m.dev_items_gather_off()}</p>}
      {gather.enabled && gather.sameTier > 1 ? (
        <p className="field-hint">{m.dev_items_gather_shared({ n: gather.sameTier })}</p>
      ) : null}
      <div className="ie-table-wrap">
        <table className="ie-table" aria-labelledby={levelsId}>
          <caption id={levelsId}>{m.dev_items_gather_levels()}</caption>
          <thead>
            <tr>
              <th scope="col">{m.dev_items_gather_col_level()}</th>
              <th scope="col">{m.dev_items_gather_col_stat()}</th>
              <th scope="col">{m.dev_items_gather_col_chance({ tier })}</th>
            </tr>
          </thead>
          <tbody>
            {gather.levels.map((row) => (
              <tr key={row.level} data-level={row.level}>
                <th scope="row">{`Lv${row.level}`}</th>
                <td>{row.stat}</td>
                <td data-part="chance">{bpText(row.chanceBp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="ie-gather-bands">
        <summary>{m.dev_items_gather_table()}</summary>
        {/* 넓은 표는 이 칸 안에서만 가로로 민다(키보드로도 밀 수 있게 tabIndex) */}
        <div className="ie-table-wrap" tabIndex={0} role="region" aria-labelledby={bandsId}>
          <table className="ie-table">
            <caption id={bandsId}>{m.dev_items_gather_table_caption()}</caption>
            <thead>
              <tr>
                <th scope="col">{m.dev_items_gather_col_band()}</th>
                {tiers.map((index) => (
                  <th key={index} scope="col" data-hit={index === tier || undefined}>
                    {`T${index}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gather.bands.map((band, row) => (
                <tr key={band.from} data-hit={row === firstBand || undefined}>
                  <th scope="row">
                    {band.to === null
                      ? m.dev_items_gather_band_open({ from: band.from })
                      : m.dev_items_gather_band_range({ from: band.from, to: band.to })}
                  </th>
                  {band.weightsPm.map((pm, index) => (
                    // oxlint-disable-next-line react/no-array-index-key -- 티어 차례가 열쇠다(T0~T9 고정)
                    <td key={index} data-hit={index === tier || undefined}>
                      {pm === 0 ? "—" : pmText(pm)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="field-hint">{m.dev_items_gather_note()}</p>
    </>
  );
}
