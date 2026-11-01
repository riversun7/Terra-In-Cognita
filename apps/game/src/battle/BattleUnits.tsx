// 다시보기 유닛 줄 — 편마다 유닛 고르기(누르면 엔진에서 고르고 따라가기를 켤 수 있다), 시야 거르기, 고른 유닛 자세히.
// 좁은 화면은 줄 안에서만 가로로 민다(쪽 전체는 가로로 밀리지 않는다).
import type { BattleReplay } from "@terra/protocol/battleReplay";
import { m } from "../paraglide/messages.js";
import { type Locale, effectName, roleName, sideName, skillName, unitLabel } from "./battleText.ts";
import type { ReplayTimeline, UnitFrame } from "./replayTimeline.ts";

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
        <p className="br-unit-detail" aria-live="off">
          <strong>{unitLabel(replay, selected)}</strong> · {roleName(unit.kind)} ·{" "}
          {frame.status === "down"
            ? m.battle_status_down()
            : frame.status === "retreated"
              ? m.battle_status_retreated()
              : m.battle_unit_stats({
                  hp: frame.hp,
                  maxHp: unit.maxHp,
                  armor: frame.armor,
                  shield: frame.shield,
                  mp: frame.mp,
                  stamina: frame.stamina,
                })}
          {frame.cast ? ` · ${m.battle_casting({ skill: skillName(replay, frame.cast.skill, locale) })}` : ""}
          {frame.effects.length > 0
            ? ` · ${frame.effects.map((effect) => effectName(replay, effect.effect, locale)).join(", ")}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
