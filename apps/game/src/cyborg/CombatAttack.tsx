// 상세 전투 스펙의 판정 값 — 공격 묶음 아래 실제 공격력·명중·크리 확률·공격 간격, 전투자원 묶음의 실제 스태미나 회복(D-511).
// 서버가 전투 사양(specFromStats)과 같은 함수로 셈해 보낸 값(CyborgBody.combat)을 보이기만 한다(입은 장비·1차 스탯 버프가 든 몸,
// docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07, 입은 장비·버프 → 스탯·전투)"). 줄 모양은 2차 스탯 줄과 같다(SpecRow).
// 공식 글은 D-502: 공격력 = 스탯 공격력 + 무기 공격력 × 비율(STR·INT ÷ 적정), 명중·크리 = 무기 값 × 비율(DEX),
// 간격 = 무기 간격 ÷ 비율²(AGI, 적정 2배 상한 — 사용자 결정 2026-11-13 "무기도 같은 꼴로"·"적정스탯 상한").
// 버프 몫(질문 354 → D-515): 줄 값은 걸린 효과를 뺀 기본, 옆 알약·막대 빗금 칸이 몫(CyborgBody.buffs, 공격은 공격 ‰ 배율까지).
// 2차 행이 없는 관통은 값이 있을 때만 줄을 더한다. 이동 속도 줄은 서버가 걷기 빠르기(move)를 보내면 늘 있다(2026-11-12).
// 맨손 크리(crit.bare)는 맨손 식 풀이 "맨손 크리 = AGI(10) + DEX(10) = 20‰ = 2%", 맨손 명중(hit.bare)은 늘 100%(사용자 결정 2026-11-12),
// 맨손 간격(interval.bare)은 "2,000 ÷ (AGI(10) ÷ 10)² = 2,000ms"(사용자 답 1252).
// 공식 첫 줄(D-556): 서버가 보낸 판정 식(combat.formulas)을 글로 푼 것 — "크리 확률 = AGI + DEX (‰)". 옛 서버(식 없음)는 옛 문구.
import type {
  RosterBuffs,
  RosterCombat,
  RosterMove,
  RosterNames,
  RosterStatBreakdown,
  RosterWeaponPart,
} from "@terra/shared/roster";
import { type ReactNode, useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { formatMilli, formatNumber, formatSigned, localName, primaryCode } from "../roster/rosterText.ts";
import { combatSourceText } from "../roster/formulaLabels.ts";
import { BuffChip } from "./BuffChip.tsx";
import {
  barFill,
  barSplit,
  bareIntervalBaseMilli,
  buffTone,
  mapCrossMinutes,
  walkCellsMilli,
} from "./cyborgText.ts";
import { FormulaTextLines } from "./FormulaTextLines.tsx";
import { StatIcon } from "./statIcons.tsx";

const pct = (share: number): string => `${String(Math.round(share * 1000) / 10)}%`;
/** 비율‰ → "40%" */
const ratioText = (ratioPm: number): string => `${formatNumber(Math.round(ratioPm / 10))}%`;
/** 확률 ‰ → "74.9%" */
const chanceText = (pm: number): string => `${formatMilli(pm * 100)}%`;

/** 부호 붙인 확률 ‰ → "+1.2%" */
const signedChance = (pm: number): string => `${pm < 0 ? "-" : "+"}${chanceText(Math.abs(pm))}`;
/** 전투 수치 버프 ‰ → "+5%"(효과 사전 값 그대로를 백분율로) */
export const modifierText = (pm: number): string =>
  `${pm < 0 ? "-" : "+"}${formatMilli(Math.abs(pm) * 100)}%`;

/** 줄의 버프 몫 표(알약 글·쪽·막대 몫 칸) */
export interface SpecBuff {
  readonly text: string;
  readonly tone: "up" | "down";
  readonly extra: number;
}

/**
 * 기본값·몫 → 막대 두 칸과 알약(몫이 0이면 알약 없음). 막대 끝은 기본과 판정 값 가운데 큰 값(barSplit). lowerIsBetter: 공격 간격처럼
 * 작을수록 좋은 값
 */
export function shareOf(
  row: Pick<RosterStatBreakdown, "shape" | "cap">,
  base: number,
  share: number,
  text: string,
  lowerIsBetter = false,
): { fill: number; buff: SpecBuff | undefined } {
  if (share === 0) return { fill: barFill({ ...row, value: base }), buff: undefined };
  const { fill, extra } = barSplit(row, base, base + share);
  return { fill, buff: { text, tone: buffTone(share, lowerIsBetter), extra } };
}

/** 펼친 공식 상자 끝의 버프 줄: (전투 수치 버프 ‰) + "버프 +n → 전투 m" */
export function BuffLines({
  share,
  total,
  modifierPm = 0,
}: {
  share: string;
  total: string;
  modifierPm?: number | undefined;
}) {
  return (
    <>
      {modifierPm === 0 ? null : (
        <p className="combat-line" translate="no">
          {m.cyborg_buff_combat({ value: modifierText(modifierPm) })}
        </p>
      )}
      <p className="combat-line combat-buff-line" translate="no">
        {m.cyborg_buff_line({ share, total })}
      </p>
    </>
  );
}

/** 2차 스탯 줄과 같은 모양(▶ 펼침 + 아이콘 + 이름 + 막대 + 값, 펼치면 공식 상자). buff = 기본값 옆 버프 몫(알약·막대 빗금 칸) */
export function SpecRow({
  sec,
  name,
  shown,
  fill,
  real,
  buff,
  badge,
  children,
}: {
  sec: string;
  name: string;
  shown: string;
  fill: number;
  /** 판정 값 줄 표지(시험·스타일) */
  real?: string | undefined;
  buff?: SpecBuff | undefined;
  /** 값 옆 표(채집 줄의 "최적" 등) */
  badge?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <li
      className="combat-row"
      data-sec={sec}
      data-real={real}
      data-buff={buff?.tone}
      data-open={open ? "true" : undefined}
    >
      <button
        type="button"
        className="combat-toggle"
        aria-expanded={open}
        aria-controls={`${id}-detail`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="combat-caret" aria-hidden="true" />
        <StatIcon id={sec} />
        <span className="combat-main">
          <span className="combat-label">{name}</span>
          <span
            className="combat-bar"
            aria-hidden="true"
            data-split={buff && buff.extra > 0 ? "" : undefined}
          >
            <span className="combat-bar-fill" style={{ inlineSize: pct(fill) }} />
            {buff && buff.extra > 0 ? (
              <span
                className="combat-bar-buff"
                data-tone={buff.tone}
                style={{ inlineSize: pct(buff.extra) }}
              />
            ) : null}
          </span>
        </span>
        <span className="combat-value">
          <span className="combat-value-base">{shown}</span>
          {buff ? <BuffChip text={buff.text} tone={buff.tone} /> : null}
          {badge}
        </span>
      </button>
      <div id={`${id}-detail`} className="combat-detail" hidden={!open}>
        {children}
      </div>
    </li>
  );
}

/** 무기 몫 비율 줄: "STR 10 ÷ 적정 25 → 40%" 또는 "적정 없음 → 100%" */
function PartLine({ code, part }: { code: string; part: RosterWeaponPart }) {
  return (
    <p className="combat-line" translate="no">
      {part.appropriateMilli > 0
        ? m.cyborg_attack_ratio({
            stat: code,
            value: formatNumber(part.stat),
            appropriate: formatMilli(part.appropriateMilli),
            ratio: ratioText(part.ratioPm),
          })
        : m.cyborg_attack_no_appropriate({ ratio: ratioText(part.ratioPm) })}
    </p>
  );
}

const QUANTITY = { shape: "quantity", cap: null } as const;
const CHANCE = { shape: "probability", cap: 1000 } as const;

/** 공격 묶음 아래 판정 값 네 줄(든 무기·맨손 표지 포함)과 관통(값이 있을 때). buffs = 버프 몫(없으면 몫을 보이지 않는다) */
export function AttackRows({
  combat,
  names,
  buffs,
  level = 1,
}: {
  combat: RosterCombat;
  names: RosterNames;
  buffs?: RosterBuffs | undefined;
  /** 유닛 레벨(맨손 간격 풀이의 레벨 기준 AGI) */
  level?: number;
}) {
  const { attack, hit, crit, interval } = combat;
  const attackShare = buffs?.attack ?? 0;
  const hitShare = buffs?.hit ?? 0;
  const critShare = buffs?.crit ?? 0;
  const intervalShare = buffs?.interval ?? 0;
  const attackBar = shareOf(QUANTITY, attack.real, attackShare, formatSigned(attackShare));
  const hitBar = shareOf(CHANCE, hit.real, hitShare, signedChance(hitShare));
  const critBar = shareOf(CHANCE, crit.real, critShare, signedChance(critShare));
  const intervalText = `${intervalShare < 0 ? "-" : "+"}${m.cyborg_ms({ value: formatNumber(Math.abs(intervalShare)) })}`;
  const intervalBar = shareOf(QUANTITY, interval.real, intervalShare, intervalText, true);
  const attackCode = primaryCode(attack.kind === "physical" ? "str" : "int");
  const dex = primaryCode("dex");
  const agi = primaryCode("agi");
  const attackStat = attack.kind === "physical" ? "str" : "int";
  const texts = {
    attack: combatSourceText(combat.formulas?.attack, attackStat),
    hit: combatSourceText(combat.formulas?.hit),
    crit: combatSourceText(combat.formulas?.crit),
    interval: combatSourceText(combat.formulas?.interval),
  };
  const ids = {
    attack: combat.formulas?.attack.id ?? null,
    hit: combat.formulas?.hit.id ?? null,
    crit: combat.formulas?.crit.id ?? null,
    interval: combat.formulas?.interval.id ?? null,
  };
  const weapon =
    combat.weapon === null
      ? m.cyborg_attack_bare()
      : m.cyborg_attack_weapon({ name: localName(names.items[combat.weapon], combat.weapon) });
  return (
    <>
      <SpecRow
        sec={attack.kind === "physical" ? "physical_attack" : "elemental_attack"}
        real="attack"
        name={m.cyborg_attack_real()}
        shown={formatNumber(attack.real)}
        fill={attackBar.fill}
        buff={attackBar.buff}
      >
        {texts.attack ? (
          <FormulaTextLines name={m.cyborg_attack_real()} text={texts.attack} formulaId={ids.attack} />
        ) : (
          <p className="combat-formula">
            <span className="combat-formula-label">{m.cyborg_formula_label()} </span>
            {m.cyborg_attack_formula({ stat: attackCode })}
          </p>
        )}
        <p className="combat-line">{weapon}</p>
        <PartLine code={attackCode} part={attack.part} />
        <p className="combat-line combat-result" translate="no">
          {m.cyborg_attack_sum({
            stat: formatNumber(attack.statAttack),
            weapon: formatNumber(attack.weaponAttack),
            ratio: ratioText(attack.part.ratioPm),
            real: formatNumber(attack.real),
          })}
        </p>
        {attackBar.buff ? (
          <BuffLines
            share={attackBar.buff.text}
            total={formatNumber(attack.real + attackShare)}
            modifierPm={buffs?.modifiers.attack}
          />
        ) : null}
      </SpecRow>
      <SpecRow
        sec="hit"
        real="hit"
        name={m.cyborg_attack_hit()}
        shown={chanceText(hit.real)}
        fill={hitBar.fill}
        buff={hitBar.buff}
      >
        {texts.hit ? (
          <FormulaTextLines name={m.cyborg_attack_hit()} text={texts.hit} unit="pm" formulaId={ids.hit} />
        ) : null}
        {hit.bare ? (
          <>
            <p className={texts.hit ? "combat-formula-note" : "combat-formula"}>
              {texts.hit ? null : <span className="combat-formula-label">{m.cyborg_formula_label()} </span>}
              {m.cyborg_attack_bare_hit_formula()}
            </p>
            <p className="combat-line combat-result" translate="no">
              = {chanceText(hit.real)}
            </p>
          </>
        ) : (
          <>
            <PartLine code={dex} part={hit.part} />
            <p className="combat-line combat-result" translate="no">
              {m.cyborg_attack_scaled({
                weapon: chanceText(hit.weaponPm),
                ratio: ratioText(hit.part.ratioPm),
                real: chanceText(hit.real),
              })}
            </p>
          </>
        )}
        {hitBar.buff ? <BuffLines share={hitBar.buff.text} total={chanceText(hit.real + hitShare)} /> : null}
      </SpecRow>
      <SpecRow
        sec="crit_chance"
        real="crit"
        name={m.cyborg_attack_crit()}
        shown={chanceText(crit.real)}
        fill={critBar.fill}
        buff={critBar.buff}
      >
        {texts.crit ? (
          <FormulaTextLines name={m.cyborg_attack_crit()} text={texts.crit} unit="pm" formulaId={ids.crit} />
        ) : null}
        {crit.bare ? (
          <>
            {texts.crit ? null : (
              <p className="combat-formula">
                <span className="combat-formula-label">{m.cyborg_formula_label()} </span>
                {m.cyborg_attack_bare_crit_formula({ agi, dex })}
              </p>
            )}
            <p className="combat-line combat-result" translate="no">
              {m.cyborg_attack_bare_crit_line({
                agi,
                dex,
                agiValue: formatNumber(crit.bare.agi),
                dexValue: formatNumber(crit.part.stat),
                pm: formatNumber(crit.real),
                real: chanceText(crit.real),
              })}
            </p>
          </>
        ) : (
          <>
            <PartLine code={dex} part={crit.part} />
            <p className="combat-line combat-result" translate="no">
              {m.cyborg_attack_scaled({
                weapon: chanceText(crit.weaponPm),
                ratio: ratioText(crit.part.ratioPm),
                real: chanceText(crit.real),
              })}
            </p>
          </>
        )}
        {critBar.buff ? (
          <BuffLines share={critBar.buff.text} total={chanceText(crit.real + critShare)} />
        ) : null}
      </SpecRow>
      <SpecRow
        sec="action_speed"
        real="interval"
        name={m.cyborg_attack_interval()}
        shown={m.cyborg_ms({ value: formatNumber(interval.real) })}
        fill={intervalBar.fill}
        buff={intervalBar.buff}
      >
        {texts.interval ? (
          <FormulaTextLines
            name={m.cyborg_attack_interval()}
            text={texts.interval}
            unit="ms"
            formulaId={ids.interval}
          />
        ) : null}
        {interval.bare ? (
          <>
            {texts.interval ? null : (
              <p className="combat-formula">
                <span className="combat-formula-label">{m.cyborg_formula_label()} </span>
                {m.cyborg_attack_bare_interval_formula({ agi })}
              </p>
            )}
            <p className="combat-line combat-result" translate="no">
              {m.cyborg_attack_bare_interval_line({
                agi,
                agiValue: formatNumber(interval.part.stat),
                base: formatMilli(bareIntervalBaseMilli(level)),
                real: formatNumber(interval.real),
              })}
            </p>
          </>
        ) : (
          <>
            <PartLine code={agi} part={interval.part} />
            <p className="combat-line combat-result" translate="no">
              {m.cyborg_attack_interval_line({
                weapon: formatNumber(interval.weaponMs),
                ratio: ratioText(interval.part.ratioPm),
                real: formatNumber(interval.real),
              })}
            </p>
          </>
        )}
        {intervalBar.buff ? (
          <BuffLines
            share={intervalBar.buff.text}
            total={m.cyborg_ms({ value: formatNumber(interval.real + intervalShare) })}
          />
        ) : null}
      </SpecRow>
      {buffs && (buffs.penetration.basePm !== 0 || buffs.penetration.buffPm !== 0) ? (
        <PenetrationRow penetration={buffs.penetration} />
      ) : null}
    </>
  );
}

/** 관통(‰, 2차 행이 없다): 장비 몫 + 버프 몫. 값이 있을 때만 */
function PenetrationRow({ penetration }: { penetration: RosterBuffs["penetration"] }) {
  const { basePm, buffPm } = penetration;
  const bar = shareOf(CHANCE, basePm, buffPm, signedChance(buffPm));
  return (
    <SpecRow
      sec="penetration"
      real="penetration"
      name={m.cyborg_penetration()}
      shown={chanceText(basePm)}
      fill={bar.fill}
      buff={bar.buff}
    >
      <p className="combat-line" translate="no">
        {m.cyborg_penetration_line({ gear: chanceText(basePm) })}
      </p>
      {bar.buff ? (
        <BuffLines share={bar.buff.text} total={chanceText(basePm + buffPm)} modifierPm={buffPm} />
      ) : null}
    </SpecRow>
  );
}

/**
 * 이동 속도(기동 묶음, 2차 행이 없다 — 사용자 요청 2026-11-12 "기동에 이동속도가 왜 없는가?"). 값 = 서버가 쓰는 2차맵 걷기 빠르기(칸/초).
 * 걷기 = 계산식 walk_speed(실효 AGI, 사용자 결정 D-540 "걷기만 AGI 반영") → 풀이는 AGI → 빠르기, 기본(AGI 0)·상한, 차·배는 수단 속도.
 * agi가 없는 옛 서버는 옛 풀이(1차 스탯 몫 없음). 전투 수치 버프 move_speed는 전투맵 걸음에만 든다(알약·버프 줄).
 * move가 없는 옛 서버는 버프 몫이 있을 때만 옛 모양(기본 100%)
 */
export function MoveSpeedRow({
  move,
  buffs,
}: {
  move?: RosterMove | undefined;
  buffs?: RosterBuffs | undefined;
}) {
  const share = buffs?.moveSpeedPm ?? 0;
  const buff: SpecBuff | undefined =
    share === 0 ? undefined : { text: signedChance(share), tone: buffTone(share), extra: 0 };
  if (!move) {
    const bar = shareOf(CHANCE, 1000, share, signedChance(share));
    return (
      <SpecRow
        sec="move_speed"
        real="move_speed"
        name={m.cyborg_move_speed()}
        shown={chanceText(1000)}
        fill={bar.fill}
        buff={bar.buff}
      >
        <p className="combat-formula">
          <span className="combat-formula-label">{m.cyborg_formula_label()} </span>
          {m.cyborg_move_speed_formula()}
        </p>
      </SpecRow>
    );
  }
  const cells = walkCellsMilli(move);
  const shown = m.cyborg_move_cells({ value: formatMilli(cells) });
  return (
    <SpecRow
      sec="move_speed"
      real="move_speed"
      name={m.cyborg_move_speed()}
      shown={shown}
      fill={barFill({ shape: "quantity", cap: null, value: cells })}
      buff={buff}
    >
      <p className="combat-formula">
        <span className="combat-formula-label">{m.cyborg_formula_label()} </span>
        {move.agi === undefined ? m.cyborg_move_formula_old() : m.cyborg_move_formula()}
      </p>
      {move.agi === undefined ? (
        <>
          <p className="combat-line" translate="no">
            {m.cyborg_move_base({
              walk: formatNumber(move.walk),
              unit: formatNumber(move.cellUnits),
              value: formatMilli(cells),
            })}
          </p>
          <p className="combat-line">{m.cyborg_move_no_stats()}</p>
        </>
      ) : (
        <>
          <p className="combat-line" translate="no">
            {m.cyborg_move_agi_line({
              agi: formatNumber(move.agi),
              walk: formatNumber(move.walk),
              unit: formatNumber(move.cellUnits),
              value: formatMilli(cells),
            })}
          </p>
          {move.walkBase === undefined || move.walkCap === undefined ? null : (
            <p className="combat-line" translate="no">
              {m.cyborg_move_range({
                base: formatNumber(move.walkBase),
                cap: formatNumber(move.walkCap),
                capCells: formatMilli(walkCellsMilli({ walk: move.walkCap, cellUnits: move.cellUnits })),
              })}
            </p>
          )}
          <p className="combat-line">{m.cyborg_move_vehicle()}</p>
        </>
      )}
      <p className="combat-line combat-result" translate="no">
        {m.cyborg_move_result({
          value: shown,
          cells: formatNumber(move.mapCells),
          minutes: formatNumber(mapCrossMinutes(move)),
        })}
      </p>
      <p className="combat-line" translate="no">
        {m.cyborg_move_battle({ ms: formatNumber(move.battleMs) })}
      </p>
      {share === 0 ? null : (
        <>
          <p className="combat-line">{m.cyborg_move_speed_formula()}</p>
          <p className="combat-line combat-buff-line" translate="no">
            {m.cyborg_move_battle_buff({ share: signedChance(share) })}
          </p>
        </>
      )}
    </SpecRow>
  );
}

/** 스태미나 회복 줄을 펼친 공식 상자 끝: 실제 회복 = 행 값 × min(2, STA 점수 ÷ 적정 STA)(D-511) */
export function StaminaRealLines({
  regen,
  formula,
}: {
  regen: RosterCombat["staminaRegen"];
  /** 판정 식(real_stamina_regen, D-556). 옛 서버는 없음 */
  formula?: { readonly id: string; readonly source: string } | undefined;
}) {
  const text = combatSourceText(formula);
  return (
    <>
      {text ? (
        <FormulaTextLines name={m.cyborg_stamina_real()} text={text} formulaId={formula?.id ?? null} />
      ) : (
        <p className="combat-formula">
          <span className="combat-formula-label">{m.cyborg_formula_label()} </span>
          {m.cyborg_stamina_real_formula()}
        </p>
      )}
      <p className="combat-line combat-result" translate="no">
        {m.cyborg_stamina_real_line({
          row: formatNumber(regen.row),
          score: formatNumber(regen.score),
          appropriate: formatMilli(regen.appropriateMilli),
          real: formatNumber(regen.real),
        })}
      </p>
    </>
  );
}
