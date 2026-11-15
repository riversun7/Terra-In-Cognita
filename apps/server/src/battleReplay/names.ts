// 다시보기 효과 이름 — 팩 effects의 {ko, en}(유닛 화면 이름 표에는 효과가 없다). 서버를 켤 때 한 번 읽는다(main.ts).
// 움직임 부품이 판정 안에서 거는 효과(효과 사전 밖, @terra/sim moves.ts)의 이름도 함께 준다: 묶기(move_root)·부딪힘 피해(move_collision,
// D-564 1587 — 리플레이에 지속 피해 사건으로 실린다).
import { type PackSource, effectEntrySchema, parseJson } from "@terra/content";
import type { ReplayName } from "@terra/protocol/battleReplay";

/** 판정이 만드는 움직임 효과 이름(팩 effects에 없다). 팩에 같은 ID가 있으면 팩 이름이 이긴다 */
const MOVE_EFFECT_NAMES: Readonly<Record<string, ReplayName>> = {
  move_root: { ko: "묶임", en: "Rooted" },
  move_collision: { ko: "부딪힘", en: "Impact" },
};

export function effectNamesOf(source: PackSource): Record<string, ReplayName> {
  return { ...MOVE_EFFECT_NAMES, ...packEffectNames(source) };
}

function packEffectNames(source: PackSource): Record<string, ReplayName> {
  const text = source.files.get("effects.json");
  if (text === undefined) return {};
  const value: unknown = parseJson(text);
  const entries: unknown =
    typeof value === "object" && value !== null ? Reflect.get(value, "entries") : undefined;
  if (!Array.isArray(entries)) return {};
  const list: readonly unknown[] = entries;
  return Object.fromEntries(
    list.map((raw) => {
      const entry = effectEntrySchema.parse(raw);
      return [entry.id, { ko: entry.name.ko, en: entry.name.en }];
    }),
  );
}
