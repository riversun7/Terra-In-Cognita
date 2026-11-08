// 생명 수치 막대(HP·아머·쉴드) — 기획 D-512·D-514. 사이보그 머리 판·유닛 상세가 같이 쓴다. 값은 useVitals가 기기에서 분 단위로 셈한 것이다.
// 회복 안내: 모자란 칸마다 다음 1분에 차는 양(회복 구간 — 부상 중이면 느린 HP, 전투 밖 주기 회복이 걸리면 빠른 HP)을 알린다. 부상 중이면
// 단계 이름·한 단계 나을 때까지 남은 시간(D-525 시간·분)과 "회복이 느리고 능력치가 낮다"(D-514)를 알린다. 회복이 없는 칸이 모자라면(몸 자료를 모르는 유닛) 저절로 차지 않는다고 알린다.
import { vitalsRegenNow } from "@terra/shared/vitals";
import { m } from "../paraglide/messages.js";
import { Meter } from "./parts.tsx";
import { formatNumber, injuryLabel as stageLabel, recoveryLeft } from "./rosterText.ts";
import type { VitalsShown } from "./useVitals.ts";

/** 부상 단계 이름(1 경상·2 중상·3 중태, 유닛 화면과 같은 문구 D-525) */
const injuryLabel = (stage: number): string => stageLabel(Math.max(1, stage)) ?? "";

/** [임시] HP 막대 경고 몫 — 화면 표시만(자동 물약 문턱 D-510 출발값 40%와 같은 값) */
const HP_WARN = 0.4;

/** "값 / 최대" 글 */
const text = (value: number, top: number): string =>
  m.roster_value_of({ value: formatNumber(value), max: formatNumber(top) });

export function VitalsMeters({ vitals }: { vitals: VitalsShown }) {
  const { values, max } = vitals;
  const regen = vitalsRegenNow(vitals);
  const missingNoRegen =
    (values.hp < max.hp && regen.hp <= 0 && vitals.regen.hp <= 0) ||
    (values.armor < max.armor && regen.armor <= 0);
  const injury = vitals.injury;
  return (
    <div className="roster-vitals" data-vitals="true">
      <Meter
        label={m.vitals_hp()}
        value={values.hp}
        max={max.hp}
        valueText={text(values.hp, max.hp)}
        warnAt={HP_WARN}
        lowIsBad
        kind="hp"
      />
      {max.armor > 0 ? (
        <Meter
          label={m.vitals_armor()}
          value={values.armor}
          max={max.armor}
          valueText={text(values.armor, max.armor)}
          kind="armor"
        />
      ) : null}
      {max.shield > 0 ? (
        <Meter
          label={m.vitals_shield()}
          value={values.shield}
          max={max.shield}
          valueText={text(values.shield, max.shield)}
          kind="shield"
        />
      ) : null}
      {values.hp < max.hp && regen.hp > 0 ? (
        <p className="roster-note" data-regen="hp">
          {m.vitals_regen_hp_note({ amount: formatNumber(regen.hp) })}
        </p>
      ) : null}
      {values.armor < max.armor && regen.armor > 0 ? (
        <p className="roster-note" data-regen="armor">
          {m.vitals_regen_armor_note({ amount: formatNumber(regen.armor) })}
        </p>
      ) : null}
      {values.shield < max.shield && regen.shield > 0 ? (
        <p className="roster-note" data-regen="shield">
          {m.vitals_regen_note({ amount: formatNumber(regen.shield) })}
        </p>
      ) : null}
      {injury ? (
        <p className="roster-note" data-injury={injury.stage}>
          {m.vitals_injury_note({
            stage: injuryLabel(injury.stage),
            time: recoveryLeft(injury.until, vitals.at) ?? m.roster_soon(),
          })}
        </p>
      ) : null}
      {missingNoRegen ? <p className="roster-note">{m.vitals_no_regen_note()}</p> : null}
    </div>
  );
}
