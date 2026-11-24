// 핵심 사양 — 옛 프로젝트 StatBar를 따른다(사용자 요청 2026-11-01: "기본 1차스탯이 장비나 스킬등에 합쳐지는것이니 마우스 오버나 모바일에서
// 스탯바 클릭시 세부 기여 출처를 적어주는거고"). ADR 2026-11-01-ui-visibility "바뀜".
// - 줄 = 약자·이름 | 막대(합친 값, 그 스탯 색의 진하기로 몸 값 → 장비 → 인공장기 → 스킬·효과) | 합계(스탯 색, 굵게).
// - 막대를 올리면(마우스) 또는 누르면(휴대폰·키보드) 출처 상세: 몸 값(평소 하나, 만렙이면 처음 값·레벨 성장 + K, D-449),
//   장비 칸 아이템마다, 인공장기, 스킬·효과, 합계. 출처는 서버가 보낸다(CyborgBody.primarySources).
// - 두 칸씩 묶음·스탯 색은 그대로(D-448).
// - 버프 몫(질문 354 → D-515 "기본값과 버프를 나눠 보인다"): 합계 칸 = 기본(몸 값 + 장비) + 걸린 효과의 몫 알약(버프 색, 디버프는 디버프 색).
//   막대의 효과 칸도 버프 색 빗금, 디버프는 기본 막대 끝에서 깎인 몫을 디버프 색으로. 상세 판의 합계는 판정 값(기본 + 몫).
import {
  PRIMARY_STAT_PAIRS,
  type PrimaryStat,
  type RosterNames,
  type RosterPrimarySource,
  type RosterSheet,
} from "@terra/shared/roster";
import { type KeyboardEvent, useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { PreviewTag, Section } from "../roster/parts.tsx";
import {
  formatK,
  formatNumber,
  formatSigned,
  localName,
  primaryCode,
  primaryLabel,
  slotLabel,
} from "../roster/rosterText.ts";
import { BuffChip } from "./BuffChip.tsx";
import { type CorePart, coreSegments, corePartOf, effectShare } from "./cyborgText.ts";
import "../roster/statPairs.css";
import "./coreStats.css";

const total = (sources: readonly RosterPrimarySource[]): number =>
  sources.reduce((sum, source) => sum + source.value, 0);

const signed = (value: number): string => `${value >= 0 ? "+" : ""}${formatNumber(value)}`;

const percent = (value: number, max: number): string =>
  `${String(Math.round((Math.min(Math.max(0, value), max) / Math.max(1, max)) * 1000) / 10)}%`;

/** body = 사이보그 본체(CyborgBody) 또는 유닛 상세 사양(units.sheet) — 같은 칸을 쓴다 */
export function CoreStats({
  body,
  names,
}: {
  body: Pick<RosterSheet, "primarySources" | "growth" | "preview">;
  names: RosterNames;
}) {
  const id = useId();
  const [open, setOpen] = useState<PrimaryStat | null>(null);
  const sources = body.primarySources;
  // 막대 끝: 가장 큰 합의 1.2배(작으면 30) — 옛 StatBar와 같은 오토 스케일
  const top = Math.max(...PRIMARY_STAT_PAIRS.flat().map((stat) => total(sources[stat])));
  const max = Math.max(30, Math.floor(top * 1.2));
  const split = body.growth !== null;
  const legend: readonly { part: CorePart; text: string }[] = [
    ...(split
      ? [
          { part: "initial" as const, text: m.cyborg_core_legend_initial() },
          { part: "growth" as const, text: m.cyborg_core_legend_growth() },
        ]
      : [{ part: "body" as const, text: m.cyborg_core_legend_body() }]),
    { part: "gear", text: m.cyborg_core_legend_gear() },
    { part: "organ", text: m.cyborg_core_legend_organ() },
    { part: "effect", text: m.cyborg_core_legend_effect() },
    // 디버프가 걸린 스탯이 있을 때만(깎인 몫의 색)
    ...(PRIMARY_STAT_PAIRS.flat().some((stat) => effectShare(sources[stat]) < 0)
      ? [{ part: "debuff" as const, text: m.cyborg_core_legend_debuff() }]
      : []),
  ];
  return (
    <Section id={`${id}-core`} title={m.cyborg_core_title()} end={body.preview ? <PreviewTag /> : null}>
      <ul className="core-legend">
        {legend.map((item) => (
          <li key={item.part} className="core-legend-item" data-part={item.part}>
            <span className="core-swatch" aria-hidden="true" />
            {item.text}
          </li>
        ))}
      </ul>
      <div className="core-pairs">
        {PRIMARY_STAT_PAIRS.map((pair) => (
          <div
            key={pair.join("-")}
            className="core-pair"
            data-pair={pair.join("-")}
            role="group"
            aria-label={pair.map((stat) => primaryLabel(stat)).join("·")}
          >
            {pair.map((stat) => (
              <CoreRow
                key={stat}
                stat={stat}
                sources={sources[stat]}
                max={max}
                names={names}
                open={open === stat}
                onToggle={() => setOpen((current) => (current === stat ? null : stat))}
                onClose={() => setOpen(null)}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="roster-note">{split ? m.cyborg_core_note_max() : m.cyborg_core_note()}</p>
    </Section>
  );
}

function CoreRow({
  stat,
  sources,
  max,
  names,
  open,
  onToggle,
  onClose,
}: {
  stat: PrimaryStat;
  sources: readonly RosterPrimarySource[];
  max: number;
  names: RosterNames;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const sum = total(sources);
  const growth = sources.find((source) => source.kind === "growth");
  // 버프 몫(걸린 효과의 합)과 기본(몸 값 + 장비)
  const share = effectShare(sources);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      onClose();
    }
  };
  return (
    <div
      className="core-row"
      data-stat={stat}
      data-buff={share === 0 ? undefined : share}
      data-open={open ? "true" : undefined}
    >
      <button
        type="button"
        className="core-toggle"
        aria-expanded={open}
        aria-controls={`${id}-pop`}
        onClick={onToggle}
        onKeyDown={onKeyDown}
      >
        <span className="core-label">
          <span className="core-code" translate="no">
            {primaryCode(stat)}
          </span>
          <span className="core-name">{primaryLabel(stat)}</span>
          {growth?.kind === "growth" ? (
            <span className="core-k">{m.roster_stat_k({ value: formatK(growth.kPm) })}</span>
          ) : null}
        </span>
        <span className="core-bar" aria-hidden="true">
          {coreSegments(sources).map((segment) => (
            <span
              key={segment.part}
              className="core-seg"
              data-part={segment.part}
              style={{ inlineSize: percent(segment.value, max) }}
            />
          ))}
        </span>
        <span className="core-total">
          <span className="core-total-value">{formatNumber(sum - share)}</span>
          {share === 0 ? null : <BuffChip text={formatSigned(share)} tone={share > 0 ? "up" : "down"} />}
        </span>
      </button>
      <div id={`${id}-pop`} className="core-pop" hidden={!open}>
        <p className="core-pop-title">
          {m.cyborg_core_detail({ code: primaryCode(stat), name: primaryLabel(stat) })}
        </p>
        <ul className="core-pop-rows">
          {sources
            .filter((source) => source.kind !== "effect")
            .map((source, index) => (
              <li
                // 같은 아이템이 두 칸(장신구 2)에 있을 수 있어 차례를 열쇠에 더한다
                key={`${source.kind}-${String(index)}`}
                className="core-pop-row"
                data-part={corePartOf(source)}
              >
                <span className="core-swatch" aria-hidden="true" />
                <span className="core-pop-name">{sourceLabel(source, names)}</span>
                <span className="core-pop-value">
                  {index === 0 ? formatNumber(source.value) : signed(source.value)}
                </span>
              </li>
            ))}
          <li className="core-pop-row" data-part={share < 0 ? "debuff" : "effect"}>
            <span className="core-swatch" aria-hidden="true" />
            <span className="core-pop-name">{m.cyborg_source_effect()}</span>
            <span className="core-pop-value">{signed(share)}</span>
          </li>
        </ul>
        <p className="core-pop-total">
          <span>{m.cyborg_source_total()}</span>
          <span className="core-pop-sum">{formatNumber(sum)}</span>
        </p>
      </div>
    </div>
  );
}

function sourceLabel(source: RosterPrimarySource, names: RosterNames): string {
  switch (source.kind) {
    case "body":
      return m.cyborg_source_body();
    case "initial":
      return m.cyborg_source_initial();
    case "growth":
      return m.cyborg_source_growth({ k: formatK(source.kPm) });
    case "item":
      return m.cyborg_source_item({
        item: localName(names.items[source.item], source.item),
        slot: slotLabel(source.slot),
      });
    case "effect":
      return m.cyborg_source_effect();
    default: {
      const unknown: never = source;
      return String(unknown);
    }
  }
}
