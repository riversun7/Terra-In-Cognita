// [이름 만들기] — 시드 난수로 만든 후보 다섯에서 하나를 고른다(@terra/shared/nameGen, 같은 말씨·종류·시드면 같은 후보).
// [다른 후보]는 시드를 하나 올린다. 후보는 사람이 고른다: 실제 지명·인물과 우연히 겹칠 수 있다(D-076).
import { type GeneratedName, type NameKind, type NameStyleId, generateNames } from "@terra/shared/nameGen";
import { emblemSeedOf } from "@terra/shared/nationEmblem";
import { useState } from "react";
import { m } from "../../paraglide/messages.js";

export function NameGenerator({
  style,
  kind,
  seedKey,
  label,
  count = 5,
  many = false,
  onPick,
}: {
  style: NameStyleId;
  kind: NameKind;
  /** 시드 바탕(국가 ID + 칸 이름). 같은 칸은 늘 같은 후보에서 시작한다 */
  seedKey: string;
  /** 단추 이름(무엇의 이름을 만드는지) */
  label: string;
  count?: number;
  /** 참이면 후보를 하나씩이 아니라 한꺼번에 넣는 단추도 보인다(도시·사람 이름 목록) */
  many?: boolean;
  onPick: (names: readonly GeneratedName[]) => void;
}) {
  const [round, setRound] = useState<number | null>(null);
  const names = round === null ? [] : generateNames(style, kind, emblemSeedOf(seedKey) + round, count);
  return (
    <div className="ne-namegen" data-kind={kind}>
      <button
        type="button"
        className="button-small ne-namegen-open"
        aria-expanded={round !== null}
        onClick={() => setRound(round === null ? 0 : null)}
      >
        {label}
      </button>
      {round === null ? null : (
        <div className="ne-namegen-panel" role="group" aria-label={label}>
          <ul className="ne-namegen-list">
            {names.map((name) => (
              <li key={name.en}>
                <button type="button" className="ne-namegen-pick" onClick={() => onPick([name])}>
                  <span>{name.ko === name.en ? name.en : `${name.ko} · ${name.en}`}</span>
                </button>
              </li>
            ))}
          </ul>
          <span className="ce-inline-actions">
            <button
              type="button"
              className="button-small ne-namegen-more"
              onClick={() => setRound(round + 1)}
            >
              {m.dev_nations_namegen_more()}
            </button>
            {many ? (
              <button type="button" className="button-small ne-namegen-all" onClick={() => onPick(names)}>
                {m.dev_nations_namegen_all({ count: names.length })}
              </button>
            ) : null}
          </span>
          <p className="field-hint">{m.dev_nations_namegen_note()}</p>
        </div>
      )}
    </div>
  );
}
