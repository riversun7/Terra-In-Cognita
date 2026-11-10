// 국가 마크 — 만든 마크(사양 → SVG)나 올린 그림(PNG)을 아무 크기로 그린다. docs/adr/2026-11-10-nation-editor.md 4절.
// 시작 국가 설정 편집기·세력 화면이 같이 쓴다. 색은 국가 시그니처 컬러에서 나온 그림 자료라 화면 토큰을 쓰지 않는다(세력 표지 색과 같다).
// 꾸밈 그림이다(이름이 곁에 있다): 이름표(label)를 주면 그림 이름으로 읽힌다.
import { nationEmblemUrl } from "@terra/shared/nationEditor";
import { type NationEmblemSpec, emblemParts } from "@terra/shared/nationEmblem";
import { useId } from "react";
import "./nationEmblem.css";

export function NationEmblem({
  spec,
  color,
  uploaded,
  size = 24,
  label,
  className,
}: {
  /** 만든 마크 사양(없으면 기본 방패·별) */
  spec: Partial<NationEmblemSpec> | undefined;
  /** 국가 시그니처 컬러(#rrggbb) */
  color: string;
  /** 올린 그림 해시(있으면 그림이 먼저) */
  uploaded?: string | null | undefined;
  /** 한 변(px) */
  size?: number;
  label?: string | undefined;
  className?: string | undefined;
}) {
  const clipId = useId();
  const names = `nation-emblem ${className ?? ""}`;
  if (uploaded)
    return (
      <img
        className={`${names} nation-emblem-image`}
        src={nationEmblemUrl(uploaded)}
        width={size}
        height={size}
        alt={label ?? ""}
        decoding="async"
        draggable={false}
      />
    );
  const parts = emblemParts(spec, color);
  return (
    <svg
      className={names}
      viewBox={parts.viewBox}
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <clipPath id={clipId}>
        <path d={parts.shape} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {parts.layers.map((layer) => (
          <path
            key={`${layer.fill}:${layer.transform ?? ""}:${layer.d.length}`}
            d={layer.d}
            fill={layer.fill}
            transform={layer.transform}
            fillRule={layer.evenodd ? "evenodd" : undefined}
          />
        ))}
      </g>
      <path d={parts.shape} fill="none" stroke={parts.outline} strokeWidth={3} strokeLinejoin="round" />
    </svg>
  );
}
