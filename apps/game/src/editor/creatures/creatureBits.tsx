// 크리쳐 편집기 작은 부품 — 속성 아이콘 줄, 6스탯 분포 막대, 스탯 합 배지, 분류 길 글. 도감·상세·그룹 카드가 같이 쓴다.
// docs/adr/2026-11-25-creature-codex-groups.md "바뀜 (2026-11-25, 도감 다시 짜기)".
// - 속성: 유닛창(cyborg/CyborgExtras.tsx)과 같은 12속성 아이콘(ui/elementIcons.tsx)과 색 토큰(--element-color)을 그대로 쓴다.
// - 6스탯 분포: 스탯 여섯의 몫을 한 줄 막대로(색 = --color-stat-*). 성향을 세 묶음으로 줄이지 않는다(사용자 지시).
// - 합 배지: 합이 사실상 등급이라 단계(creatureSumTier)마다 색이 다르다.
import {
  CREATURE_PRIMARY_CODES,
  type CreatureClassJson,
  type CreaturePrimariesJson,
  creatureClassPath,
  creatureStatShares,
  creatureSumTier,
} from "@terra/shared/creatureEditor";
import { ElementIcon } from "../../ui/elementIcons.tsx";
import { ELEMENT_LABELS, STAT_LABELS } from "./creatureModel.ts";

/** 속성 하나: 아이콘(+ 점수). enhanced면 강화형 표시 */
export function ElementChip({
  index,
  points,
  locale,
  dim = false,
}: {
  readonly index: number;
  readonly points?: number | undefined;
  readonly locale: "ko" | "en";
  readonly dim?: boolean | undefined;
}) {
  const info = ELEMENT_LABELS[index];
  if (!info) return null;
  const ko = locale !== "en";
  const name = ko ? info.ko : info.en;
  const kind = info.enhanced ? (ko ? "강화형" : "enhanced") : ko ? "기본형" : "basic";
  return (
    <span
      className="ce-el-chip"
      data-element={info.id}
      data-enhanced={info.enhanced ? "true" : undefined}
      data-dim={dim ? "true" : undefined}
      title={points === undefined ? `${name} (${kind})` : `${name} ${points} (${kind})`}
    >
      <ElementIcon code={info.id} className="ce-el-svg" />
      <span className="visually-hidden">{name}</span>
      {points === undefined ? null : <span className="ce-el-points">{points}</span>}
    </span>
  );
}

/** 속성 점수가 있는 칸을 큰 차례로(강화형은 2배로 쳐서) */
export function ElementChips({
  elements,
  locale,
  max = 4,
}: {
  readonly elements: readonly number[];
  readonly locale: "ko" | "en";
  readonly max?: number | undefined;
}) {
  const shown = elements
    .map((points, index) => ({ points, index, score: points * (index % 2 === 1 ? 2 : 1) }))
    .filter((item) => item.points > 0)
    .toSorted((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, max);
  if (shown.length === 0) return <span className="dev-muted">-</span>;
  return (
    <span className="ce-el-chips">
      {shown.map((item) => (
        <ElementChip key={item.index} index={item.index} points={item.points} locale={locale} />
      ))}
    </span>
  );
}

/** 6스탯 분포 막대(몫) */
export function StatShareBar({
  primaries,
  locale,
  large = false,
}: {
  readonly primaries: CreaturePrimariesJson;
  readonly locale: "ko" | "en";
  readonly large?: boolean | undefined;
}) {
  const ko = locale !== "en";
  const { sharePm } = creatureStatShares(primaries);
  const title = CREATURE_PRIMARY_CODES.map(
    (code) =>
      `${ko ? STAT_LABELS[code].ko : STAT_LABELS[code].en} ${primaries[code]} (${Math.round(sharePm[code] / 10)}%)`,
  ).join(" · ");
  return (
    <span
      className="ce-share-bar"
      data-large={large ? "true" : undefined}
      title={title}
      role="img"
      aria-label={title}
    >
      {CREATURE_PRIMARY_CODES.map((code) => (
        <span key={code} data-stat={code} style={{ width: `${sharePm[code] / 10}%` }} />
      ))}
    </span>
  );
}

/** 스탯 합 배지(단계 색) */
export function SumBadge({ sum, range }: { readonly sum: number; readonly range?: string | undefined }) {
  return (
    <span className="ce-sum" data-tier={creatureSumTier(sum)}>
      <strong>{sum}</strong>
      {range === undefined ? null : <span className="ce-sum-range">{range}</span>}
    </span>
  );
}

/** 분류 길 글("야수 › 여우류 › 북극여우"). 모르는 분류면 ID 그대로 */
export function classPathText(
  classes: readonly CreatureClassJson[],
  id: string,
  locale: "ko" | "en",
): string {
  const path = creatureClassPath(classes, id);
  if (path.length === 0) return id;
  return path.map((entry) => (locale === "en" ? entry.name.en : entry.name.ko)).join(" › ");
}
