// 다시보기 유닛 줄 — 편마다 유닛 고르기(누르면 엔진에서 고르고 따라가기를 켤 수 있다), 시야 거르기, 고른 유닛 자세히.
// 좁은 화면은 줄 안에서만 가로로 민다(쪽 전체는 가로로 밀리지 않는다).
import type { BattleReplay } from "@terra/protocol/battleReplay";
import { m } from "../paraglide/messages.js";
import { VitalTicks } from "../ui/VitalTicks.tsx";
import { type Locale, effectName, roleName, sideName, skillName, unitLabel } from "./battleText.ts";
import type { ReplayTimeline, UnitFrame } from "./replayTimeline.ts";

interface BattleVitalRow {
  readonly kind: "hp" | "armor" | "shield" | "mp" | "stamina";
  readonly label: string;
  readonly value: number;
  readonly max: number;
}

function pctOf(value: number, max: number): string {
  if (max <= 0) return "0.0%";
  const clamped = Math.max(0, Math.min(100, (value / max) * 100));
  return `${clamped.toFixed(1)}%`;
}

export function BattleUnits({
  replay,
  timeline,
  frames,
  selected,
  follow,
  vision,
  locale,
  onSelect,
  onFollow,
  onVision,
}: {
  readonly replay: BattleReplay;
  readonly timeline: ReplayTimeline;
  readonly frames: readonly UnitFrame[];
  readonly selected: number;
  readonly follow: boolean;
  readonly vision: number | null;
  readonly locale: Locale;
  readonly onSelect: (index: number) => void;
  readonly onFollow: (follow: boolean) => void;
  readonly onVision: (side: number | null) => void;
}) {
  const unit = replay.units[selected];
  const frame = frames[selected];
  return (
    <div className="br-units">
      <div className="br-unit-rows">
        {replay.sides.map((side) => (
          <div key={side.id} className="br-unit-row" role="group" aria-label={sideName(replay, side.id)}>
            {replay.units.map((row, index) =>
              row.side === side.id ? (
                <button
                  key={row.id}
                  type="button"
                  className="button-small br-unit-chip"
                  data-team={timeline.team(row.side)}
                  data-status={frames[index]?.status ?? "alive"}
                  aria-pressed={selected === index}
                  onClick={() => onSelect(selected === index ? -1 : index)}
                >
                  {unitLabel(replay, index)}
                </button>
              ) : null,
            )}
          </div>
        ))}
      </div>
      <div className="br-unit-tools">
        <button
          type="button"
          className="button-small"
          aria-pressed={follow}
          aria-disabled={selected < 0}
          onClick={() => {
            if (selected >= 0) onFollow(!follow);
          }}
        >
          {follow ? m.battle_free_camera() : m.battle_follow()}
        </button>
        <label className="br-vision">
          <span>{m.battle_vision()}</span>
          <select
            value={vision === null ? "all" : String(vision)}
            onChange={(event) => {
              const value = event.currentTarget.value;
              onVision(value === "all" ? null : Number(value));
            }}
          >
            <option value="all">{m.battle_vision_all()}</option>
            {replay.sides.map((side) => (
              <option key={side.id} value={String(side.id)}>
                {sideName(replay, side.id)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {unit && frame ? (
        <div className="br-unit-detail" aria-live="off">
          <p className="br-unit-detail-head">
            <strong>{unitLabel(replay, selected)}</strong> · {roleName(unit.kind)}
            {frame.status === "down"
              ? ` · ${m.battle_status_down()}`
              : frame.status === "retreated"
                ? ` · ${m.battle_status_retreated()}`
                : ""}
            {frame.cast
              ? ` · ${m.battle_casting({ skill: skillName(replay, frame.cast.skill, locale) })}`
              : ""}
            {frame.effects.length > 0
              ? ` · ${frame.effects.map((effect) => effectName(replay, effect.effect, locale)).join(", ")}`
              : ""}
          </p>
          {frame.status === "alive" ? (
            <div className="br-unit-vitals">
              {(
                [
                  { kind: "hp", label: m.vitals_hp(), value: frame.hp, max: unit.maxHp },
                  ...(unit.armorHp > 0
                    ? [
                        {
                          kind: "armor",
                          label: m.vitals_armor(),
                          value: frame.armor,
                          max: unit.armorHp,
                        } as const,
                      ]
                    : []),
                  ...(unit.shieldHp > 0
                    ? [
                        {
                          kind: "shield",
                          label: m.vitals_shield(),
                          value: frame.shield,
                          max: unit.shieldHp,
                        } as const,
                      ]
                    : []),
                  ...(unit.mpMax > 0
                    ? [
                        {
                          kind: "mp",
                          label: m.home_cyborg_vital_mp(),
                          value: frame.mp,
                          max: unit.mpMax,
                        } as const,
                      ]
                    : []),
                  ...(unit.staminaMax > 0
                    ? [
                        {
                          kind: "stamina",
                          label: m.home_cyborg_vital_stamina(),
                          value: frame.stamina,
                          max: unit.staminaMax,
                        } as const,
                      ]
                    : []),
                ] satisfies readonly BattleVitalRow[]
              ).map((entry) => (
                <div key={entry.kind} className="br-unit-vital" data-vital={entry.kind}>
                  <span className="br-unit-vital-head">
                    <span className="br-unit-vital-label">{entry.label}</span>
                    <span className="br-unit-vital-val" translate="no">
                      {entry.value}/{entry.max}
                    </span>
                  </span>
                  <span className="br-unit-vital-track" aria-hidden="true">
                    <span className="br-unit-vital-fill" style={{ width: pctOf(entry.value, entry.max) }} />
                    <VitalTicks max={entry.max} />
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
