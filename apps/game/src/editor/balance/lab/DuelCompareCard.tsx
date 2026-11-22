// 1:1 스탯 비교 카드 — 팀 A·B가 모두 1파티 1유닛일 때 자동으로 보여 준다.
// 두 유닛의 서버 미리 보기(battleLab.preview)를 나란히 받아 핵심 전투 스탯·1차 스탯을 한눈에 견준다.
import type { LabCatalogResponse, LabPreviewResponse, LabUnit } from "@terra/shared/battleLab";
import { PRIMARY_STATS } from "@terra/shared/roster";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "../../../net/api.ts";
import { m } from "../../../paraglide/messages.js";
import { primaryCode } from "../balanceMessages.ts";
import { isLabUnitShape, numberText, percentText } from "./labModel.ts";
import { teamText, unitTitle } from "./labMessages.ts";

const DUEL_PREVIEW_DELAY_MS = 250;

interface CompareRowSpec {
  readonly key: string;
  readonly label: string;
  readonly aText: string;
  readonly bText: string;
  /** 1 = A 우세, -1 = B 우세, 0 = 같음 */
  readonly edge: -1 | 0 | 1;
}

function edgeOf(a: number, b: number, lowerIsBetter = false): -1 | 0 | 1 {
  if (a === b) return 0;
  const aBetter = lowerIsBetter ? a < b : a > b;
  return aBetter ? 1 : -1;
}

export function DuelCompareCard(props: {
  readonly unitA: LabUnit;
  readonly unitB: LabUnit;
  readonly catalog: LabCatalogResponse;
  readonly locale: string;
}) {
  const { unitA, unitB, catalog, locale } = props;
  const id = useId();
  const [data, setData] = useState<{
    readonly key: string;
    readonly a: LabPreviewResponse;
    readonly b: LabPreviewResponse;
  } | null>(null);
  const seqRef = useRef(0);
  const jsonA = JSON.stringify(unitA);
  const jsonB = JSON.stringify(unitB);
  const pairKey = `${jsonA}|${jsonB}`;

  useEffect(() => {
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    const timer = setTimeout(() => {
      const parsedA: unknown = JSON.parse(jsonA);
      const parsedB: unknown = JSON.parse(jsonB);
      if (!isLabUnitShape(parsedA) || !isLabUnitShape(parsedB)) return;
      Promise.all([api.battleLab.preview.query(parsedA), api.battleLab.preview.query(parsedB)]).then(
        ([a, b]) => {
          if (seqRef.current !== seq) return;
          setData({ key: pairKey, a, b });
        },
        () => {
          // 개별 미리 보기 오류가 메인 편집 흐름을 방해하지 않게 둔다
        },
      );
    }, DUEL_PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [jsonA, jsonB, pairKey]);

  const n = (value: number) => numberText(value, locale);
  const p = (pm: number) => `${percentText(pm, locale)}%`;

  const rows: CompareRowSpec[] = data
    ? [
        {
          key: "hp",
          label: m.dev_lab_c_hp(),
          aText: `${n(data.a.combat.maxHp)} / ${n(data.a.combat.armorHp)} / ${n(data.a.combat.shieldHp)}`,
          bText: `${n(data.b.combat.maxHp)} / ${n(data.b.combat.armorHp)} / ${n(data.b.combat.shieldHp)}`,
          edge: edgeOf(
            data.a.combat.maxHp + data.a.combat.armorHp + data.a.combat.shieldHp,
            data.b.combat.maxHp + data.b.combat.armorHp + data.b.combat.shieldHp,
          ),
        },
        {
          key: "attack",
          label: m.dev_lab_c_attack(),
          aText: `${data.a.combat.basic === "physical" ? m.dev_lab_weapon_physical() : m.dev_lab_weapon_elemental()} ${n(data.a.combat.realAttack)}`,
          bText: `${data.b.combat.basic === "physical" ? m.dev_lab_weapon_physical() : m.dev_lab_weapon_elemental()} ${n(data.b.combat.realAttack)}`,
          edge: edgeOf(data.a.combat.realAttack, data.b.combat.realAttack),
        },
        {
          key: "interval",
          label: m.dev_lab_c_interval(),
          aText: m.dev_lab_ms({ value: n(data.a.combat.attackIntervalMs) }),
          bText: m.dev_lab_ms({ value: n(data.b.combat.attackIntervalMs) }),
          edge: edgeOf(data.a.combat.attackIntervalMs, data.b.combat.attackIntervalMs, true),
        },
        {
          key: "range",
          label: m.dev_lab_c_range(),
          aText: n(data.a.combat.range),
          bText: n(data.b.combat.range),
          edge: edgeOf(data.a.combat.range, data.b.combat.range),
        },
        {
          key: "hit",
          label: m.dev_lab_c_hit_crit(),
          aText: `${p(data.a.combat.hitPm)} · ${p(data.a.combat.critPm)}`,
          bText: `${p(data.b.combat.hitPm)} · ${p(data.b.combat.critPm)}`,
          edge: edgeOf(
            data.a.combat.hitPm + data.a.combat.critPm,
            data.b.combat.hitPm + data.b.combat.critPm,
          ),
        },
        {
          key: "defense",
          label: m.dev_lab_c_defense(),
          aText: `${p(data.a.combat.defenseRatePm)} · ${p(data.a.combat.elementalDefenseRatePm)} · ${p(data.a.combat.evadePm)}`,
          bText: `${p(data.b.combat.defenseRatePm)} · ${p(data.b.combat.elementalDefenseRatePm)} · ${p(data.b.combat.evadePm)}`,
          edge: edgeOf(
            data.a.combat.defenseRatePm + data.a.combat.elementalDefenseRatePm + data.a.combat.evadePm,
            data.b.combat.defenseRatePm + data.b.combat.elementalDefenseRatePm + data.b.combat.evadePm,
          ),
        },
        {
          key: "primaries",
          label: m.dev_lab_section_primaries(),
          aText: PRIMARY_STATS.map((stat) => `${primaryCode(stat)} ${n(data.a.primaries[stat].total)}`).join(
            " · ",
          ),
          bText: PRIMARY_STATS.map((stat) => `${primaryCode(stat)} ${n(data.b.primaries[stat].total)}`).join(
            " · ",
          ),
          edge: edgeOf(
            PRIMARY_STATS.reduce((sum, stat) => sum + data.a.primaries[stat].total, 0),
            PRIMARY_STATS.reduce((sum, stat) => sum + data.b.primaries[stat].total, 0),
          ),
        },
      ]
    : [];

  return (
    <section
      className="bp-panel bl-duel-card"
      aria-labelledby={`${id}-title`}
      aria-busy={data !== null && data.key !== pairKey ? true : undefined}
    >
      <div className="bp-panel-head">
        <h2 id={`${id}-title`} className="bp-title">
          {m.dev_lab_duel_title()}
        </h2>
        <span className="field-hint">
          {`${teamText("a")}: ${unitTitle(unitA, catalog, locale)}  vs  ${teamText("b")}: ${unitTitle(unitB, catalog, locale)}`}
        </span>
      </div>
      {!data ? (
        <p className="field-hint">{m.dev_balance_loading()}</p>
      ) : (
        <div className="bl-scroll">
          <table className="bl-duel-table">
            <thead>
              <tr>
                <th scope="col" className="bl-duel-col-a">
                  {`${teamText("a")} (A1) · ${unitTitle(unitA, catalog, locale)}`}
                </th>
                <th scope="col" className="bl-duel-col-mid">
                  {m.dev_lab_duel_metric()}
                </th>
                <th scope="col" className="bl-duel-col-b">
                  {`${teamText("b")} (B1) · ${unitTitle(unitB, catalog, locale)}`}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="bl-duel-val-a" data-win={row.edge === 1 ? "" : undefined}>
                    {row.aText}
                  </td>
                  <th scope="row" className="bl-duel-metric">
                    {row.label}
                  </th>
                  <td className="bl-duel-val-b" data-win={row.edge === -1 ? "" : undefined}>
                    {row.bText}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
