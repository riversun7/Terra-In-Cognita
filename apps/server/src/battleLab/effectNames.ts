// 3D 관람(전투 실험실·보고서 리플레이) 효과 이름 — 팩 effects의 {ko, en}(유닛 화면 이름 표에는 효과가 없다). 서버를 켤 때 한 번 읽는다(main.ts).
import { type PackSource, effectEntrySchema, parseJson } from "@terra/content";
import type { ReplayName } from "@terra/protocol/battleReplay";

export function effectNamesOf(source: PackSource): Record<string, ReplayName> {
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
