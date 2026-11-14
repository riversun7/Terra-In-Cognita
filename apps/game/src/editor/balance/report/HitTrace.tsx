// 한 대 풀이 — 공격 한 번이 판정 차례대로 지난 단계와 그 식(packages/sim/src/combat/formula.ts resolveAttack 차례).
// 예: "공격력 40 + 무기 20 = 60 → 방어율 20% − 관통 5% = 15%: 60 × 0.85 = 51 → 고정 −5 = 46 → 크리 ×1.5 = 69".
// 굴림·끝 값은 서버가 저장한 시드로 다시 돈 값이다(같은 설정 판·팩·SIM이면 같은 값).
import type { ReportHitTrace } from "@terra/shared/battleReport";
import { m } from "../../../paraglide/messages.js";
import { rowLabel } from "./reportMessages.ts";

/** ‰ → "12.5%" */
const pct = (pm: number, locale: string): string =>
  `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(pm / 10)}%`;
/** ‰ 배율 → "×1.5" */
const mul = (pm: number, locale: string): string =>
  `×${new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(pm / 1000)}`;
/** 굴림(0~9999) → "23.4%" */
const roll = (value: number, locale: string): string =>
  `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value / 100)}%`;

export interface TraceLine {
  readonly stage: string;
  readonly text: string;
  /** 이 단계에서 값이 줄었나(−)·늘었나(+)·멈췄나(stop) */
  readonly tone: "loss" | "gain" | "stop" | "plain";
}

/** 단계 글 줄(판정 차례). 굴림에서 멈추면 그 뒤는 없다 */
export function traceLines(hit: ReportHitTrace, locale: string): TraceLine[] {
  const n = (value: number) => new Intl.NumberFormat(locale).format(value);
  const lines: TraceLine[] = [];
  const hitOk = hit.outcome !== "miss";
  lines.push({
    stage: m.dev_report_stage_hit(),
    text: m.dev_report_trace_hit({
      chance: pct(hit.hitPm, locale),
      roll: roll(hit.hitRoll, locale),
      result: hitOk ? m.dev_report_trace_pass() : m.dev_report_trace_miss(),
    }),
    tone: hitOk ? "plain" : "stop",
  });
  if (!hitOk) return lines;
  const evaded = hit.outcome === "evaded";
  lines.push({
    stage: m.dev_report_stage_evade(),
    text: m.dev_report_trace_evade({
      base: pct(hit.evadeBasePm, locale),
      relative: `${hit.evadeRelativePm >= 0 ? "+" : ""}${pct(hit.evadeRelativePm, locale)}`,
      final: pct(hit.evadePm, locale),
      roll: roll(hit.evadeRoll, locale),
      result: evaded ? m.dev_report_trace_evaded() : m.dev_report_trace_pass(),
    }),
    tone: evaded ? "stop" : "plain",
  });
  if (evaded) return lines;
  lines.push({
    stage: m.dev_report_stage_crit_roll(),
    text: m.dev_report_trace_crit_roll({
      chance: pct(hit.critPm, locale),
      roll: roll(hit.critRoll, locale),
      result: hit.crit ? m.dev_report_trace_crit_yes() : m.dev_report_trace_crit_no(),
    }),
    tone: "plain",
  });
  lines.push({
    stage: m.dev_report_stage_raw(),
    text: m.dev_report_trace_raw({
      kind: hit.kind === "physical" ? m.dev_lab_weapon_physical() : m.dev_lab_weapon_elemental(),
      stat: n(hit.statAttack),
      weapon: n(hit.weaponAttack),
      real: n(hit.realAttack),
      physical: n(hit.physicalRaw),
      elemental: n(hit.elementalRaw),
      add: pct(hit.elementAddPm, locale),
    }),
    tone: "plain",
  });
  if (hit.kind === "physical") {
    lines.push({
      stage: m.dev_report_stage_rate(),
      text: m.dev_report_trace_rate({
        before: n(hit.physicalRaw),
        defense: pct(hit.defenseRatePm, locale),
        penetration: pct(hit.penetrationPm, locale),
        rate: pct(hit.ratePm, locale),
        after: n(hit.physicalAfterRate),
      }),
      tone: hit.physicalAfterRate < hit.physicalRaw ? "loss" : "plain",
    });
    lines.push({
      stage: m.dev_report_stage_flat(),
      text: m.dev_report_trace_flat({
        before: n(hit.physicalAfterRate),
        flat: n(hit.defenseFlat),
        after: n(hit.physicalAfterFlat),
      }),
      tone: hit.physicalAfterFlat < hit.physicalAfterRate ? "loss" : "plain",
    });
  } else
    lines.push({ stage: m.dev_report_stage_rate(), text: m.dev_report_trace_no_physical(), tone: "plain" });
  if (hit.elementalRaw > 0) {
    lines.push({
      stage: m.dev_report_stage_matchup(),
      text: m.dev_report_trace_factor({
        before: n(hit.elementalRaw),
        factor: `${hit.matchupPm >= 0 ? "+" : ""}${pct(hit.matchupPm, locale)}`,
        after: n(hit.elementalAfterMatchup),
      }),
      tone:
        hit.elementalAfterMatchup < hit.elementalRaw
          ? "loss"
          : hit.elementalAfterMatchup > hit.elementalRaw
            ? "gain"
            : "plain",
    });
    lines.push({
      stage: m.dev_report_stage_elemental_defense(),
      text: m.dev_report_trace_factor({
        before: n(hit.elementalAfterMatchup),
        factor: `−${pct(hit.elementalDefensePm, locale)}`,
        after: n(hit.elementalAfterDefense),
      }),
      tone: hit.elementalAfterDefense < hit.elementalAfterMatchup ? "loss" : "plain",
    });
    lines.push({
      stage: m.dev_report_stage_resist(),
      text: m.dev_report_trace_factor({
        before: n(hit.elementalAfterDefense),
        factor: `−${pct(hit.resistPm, locale)}`,
        after: n(hit.elementalAfterResist),
      }),
      tone:
        hit.elementalAfterResist < hit.elementalAfterDefense
          ? "loss"
          : hit.elementalAfterResist > hit.elementalAfterDefense
            ? "gain"
            : "plain",
    });
  } else
    lines.push({
      stage: m.dev_report_stage_matchup(),
      text: m.dev_report_trace_no_elemental(),
      tone: "plain",
    });
  const beforeCrit = hit.physicalAfterFlat + hit.elementalAfterResist;
  const afterCrit = hit.physicalAfterCrit + hit.elementalAfterCrit;
  lines.push({
    stage: m.dev_report_stage_crit(),
    text: hit.crit
      ? m.dev_report_trace_multiply({
          before: n(beforeCrit),
          factor: mul(hit.critMulPm, locale),
          after: n(afterCrit),
        })
      : m.dev_report_trace_skip(),
    tone: hit.crit ? "gain" : "plain",
  });
  const afterSkill = hit.physicalAfterSkill + hit.elementalAfterSkill;
  lines.push({
    stage: m.dev_report_stage_skill(),
    text: m.dev_report_trace_multiply({
      before: n(afterCrit),
      factor: mul(hit.skillMulPm, locale),
      after: n(afterSkill),
    }),
    tone: afterSkill > afterCrit ? "gain" : afterSkill < afterCrit ? "loss" : "plain",
  });
  const afterBuff = hit.physicalAfterBuff + hit.elementalAfterBuff;
  lines.push({
    stage: m.dev_report_stage_buff(),
    text: m.dev_report_trace_multiply({
      before: n(afterSkill),
      factor: mul(hit.buffPm, locale),
      after: n(afterBuff),
    }),
    tone: afterBuff > afterSkill ? "gain" : afterBuff < afterSkill ? "loss" : "plain",
  });
  lines.push({
    stage: m.dev_report_stage_floor(),
    text: hit.floored
      ? m.dev_report_trace_floored({ after: n(hit.physical + hit.elemental) })
      : m.dev_report_trace_skip(),
    tone: hit.floored ? "gain" : "plain",
  });
  lines.push({
    stage: m.dev_report_stage_final(),
    text: m.dev_report_trace_final({
      physical: n(hit.physical),
      elemental: n(hit.elemental),
      flat: n(hit.flat),
      total: n(hit.physical + hit.elemental + hit.flat),
    }),
    tone: "plain",
  });
  lines.push({
    stage: m.dev_report_stage_applied(),
    text: m.dev_report_trace_applied({
      armor: n(hit.toArmor),
      shield: n(hit.toShield),
      hp: n(hit.toHp),
      overkill: n(hit.overkill),
    }),
    tone: "plain",
  });
  return lines;
}

export function HitTrace({ hit, locale }: { readonly hit: ReportHitTrace; readonly locale: string }) {
  const lines = traceLines(hit, locale);
  return (
    <figure className="rp-trace" data-outcome={hit.outcome}>
      <figcaption className="rp-trace-head">
        {m.dev_report_trace_head({
          time: (hit.ms / 1000).toFixed(1),
          attacker: rowLabel(hit.attacker, ""),
          target: rowLabel(hit.target, ""),
          source: hit.source === "skill" ? m.dev_report_trace_skill() : m.dev_report_trace_attack(),
        })}
      </figcaption>
      <ol className="rp-trace-steps">
        {lines.map((line, index) => (
          <li key={index} className="rp-trace-step" data-tone={line.tone}>
            <span className="rp-trace-stage">{line.stage}</span>
            <span className="rp-trace-text">{line.text}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
