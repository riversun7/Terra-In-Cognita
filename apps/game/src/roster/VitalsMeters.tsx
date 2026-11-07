// 생명 수치 막대(HP·아머·쉴드) — 기획 D-512. 사이보그 머리 판·유닛 상세가 같이 쓴다. 값은 useVitals가 기기에서 분 단위로 셈한 것이다.
// 회복 안내: 쉴드는 1분마다 쉴드 재생만큼 찬다. HP·아머는 회복 규칙이 없어(질문 343·344) 저절로 차지 않는다고 알린다.
import type { VitalsSnapshot } from "@terra/shared/vitals";
import { m } from "../paraglide/messages.js";
import { Meter } from "./parts.tsx";
import { formatNumber } from "./rosterText.ts";

/** [임시] HP 막대 경고 몫 — 화면 표시만(자동 물약 문턱 D-510 출발값 40%와 같은 값) */
const HP_WARN = 0.4;

/** "값 / 최대" 글 */
const text = (value: number, top: number): string =>
  m.roster_value_of({ value: formatNumber(value), max: formatNumber(top) });

export function VitalsMeters({ vitals }: { vitals: VitalsSnapshot }) {
  const { values, max, regen } = vitals;
  const missingNoRegen =
    (values.hp < max.hp && regen.hp <= 0) || (values.armor < max.armor && regen.armor <= 0);
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
      {values.shield < max.shield && regen.shield > 0 ? (
        <p className="roster-note">{m.vitals_regen_note({ amount: formatNumber(regen.shield) })}</p>
      ) : null}
      {missingNoRegen ? <p className="roster-note">{m.vitals_no_regen_note()}</p> : null}
    </div>
  );
}
