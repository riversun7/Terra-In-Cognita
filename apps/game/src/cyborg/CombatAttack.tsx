// 상세 전투 스펙의 판정 값 — 공격 묶음 아래 실제 공격력·명중·크리 확률·공격 간격, 전투자원 묶음의 실제 스태미나 회복(D-511).
// 서버가 전투 사양(specFromStats)과 같은 함수로 셈해 보낸 값(CyborgBody.combat)을 보이기만 한다(입은 장비·1차 스탯 버프가 든 몸,
// docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07, 입은 장비·버프 → 스탯·전투)"). 줄 모양은 2차 스탯 줄과 같다(SpecRow).
// 공식 글은 D-502: 공격력 = 스탯 공격력 + 무기 공격력 × 비율(STR·INT ÷ 적정), 명중·크리 = 무기 값 × 비율(DEX), 간격 = 무기 간격 ÷ 비율(AGI).
import type { RosterCombat, RosterNames, RosterWeaponPart } from "@terra/shared/roster";
import { type ReactNode, useId, useState } from "react";
import { m } from "../paraglide/messages.js";
import { formatMilli, formatNumber, localName, primaryCode } from "../roster/rosterText.ts";
import { barFill } from "./cyborgText.ts";
import { StatIcon } from "./statIcons.tsx";

const pct = (share: number): string => `${String(Math.round(share * 1000) / 10)}%`;
/** 비율‰ → "40%" */
const ratioText = (ratioPm: number): string => `${formatNumber(Math.round(ratioPm / 10))}%`;
/** 확률 ‰ → "74.9%" */
const chanceText = (pm: number): string => `${formatMilli(pm * 100)}%`;

/** 2차 스탯 줄과 같은 모양(▶ 펼침 + 아이콘 + 이름 + 막대 + 값, 펼치면 공식 상자) */
export function SpecRow({
  sec,
  name,
  shown,
  fill,
  real,
  children,
}: {
  sec: string;
  name: string;
  shown: string;
  fill: number;
  /** 판정 값 줄 표지(시험·스타일) */
  real?: string | undefined;
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <li className="combat-row" data-sec={sec} data-real={real} data-open={open ? "true" : undefined}>
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
          <span className="combat-bar" aria-hidden="true">
            <span className="combat-bar-fill" style={{ inlineSize: pct(fill) }} />
          </span>
        </span>
        <span className="combat-value">{shown}</span>
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

/** 공격 묶음 아래 판정 값 네 줄(든 무기·맨손 표지 포함) */
export function AttackRows({ combat, names }: { combat: RosterCombat; names: RosterNames }) {
  const { attack, hit, crit, interval } = combat;
  const attackCode = primaryCode(attack.kind === "physical" ? "str" : "int");
  const dex = primaryCode("dex");
  const agi = primaryCode("agi");
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
        fill={barFill({ shape: "quantity", value: attack.real, cap: null })}
      >
        <p className="combat-formula">
          <span className="combat-formula-label">{m.cyborg_formula_label()} </span>
          {m.cyborg_attack_formula({ stat: attackCode })}
        </p>
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
      </SpecRow>
      <SpecRow
        sec="hit"
        real="hit"
        name={m.cyborg_attack_hit()}
        shown={chanceText(hit.real)}
        fill={barFill({ shape: "probability", value: hit.real, cap: 1000 })}
      >
        <PartLine code={dex} part={hit.part} />
        <p className="combat-line combat-result" translate="no">
          {m.cyborg_attack_scaled({
            weapon: chanceText(hit.weaponPm),
            ratio: ratioText(hit.part.ratioPm),
            real: chanceText(hit.real),
          })}
        </p>
      </SpecRow>
      <SpecRow
        sec="crit_chance"
        real="crit"
        name={m.cyborg_attack_crit()}
        shown={chanceText(crit.real)}
        fill={barFill({ shape: "probability", value: crit.real, cap: 1000 })}
      >
        <PartLine code={dex} part={crit.part} />
        <p className="combat-line combat-result" translate="no">
          {m.cyborg_attack_scaled({
            weapon: chanceText(crit.weaponPm),
            ratio: ratioText(crit.part.ratioPm),
            real: chanceText(crit.real),
          })}
        </p>
      </SpecRow>
      <SpecRow
        sec="action_speed"
        real="interval"
        name={m.cyborg_attack_interval()}
        shown={m.cyborg_ms({ value: formatNumber(interval.real) })}
        fill={barFill({ shape: "quantity", value: interval.real, cap: null })}
      >
        <PartLine code={agi} part={interval.part} />
        <p className="combat-line combat-result" translate="no">
          {m.cyborg_attack_interval_line({
            weapon: formatNumber(interval.weaponMs),
            ratio: ratioText(interval.part.ratioPm),
            real: formatNumber(interval.real),
          })}
        </p>
      </SpecRow>
    </>
  );
}

/** 스태미나 회복 줄을 펼친 공식 상자 끝: 실제 회복 = 행 값 × min(2, STA 점수 ÷ 적정 STA)(D-511) */
export function StaminaRealLines({ regen }: { regen: RosterCombat["staminaRegen"] }) {
  return (
    <>
      <p className="combat-formula">
        <span className="combat-formula-label">{m.cyborg_formula_label()} </span>
        {m.cyborg_stamina_real_formula()}
      </p>
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
