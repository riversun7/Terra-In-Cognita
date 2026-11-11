// 사이보그 초상 칸 — 3D 외형을 썸네일 렌더러로 그린 그림(portrait.ts)을 보이고, 그리는 중·WebGL 없음·외형 없음이면 fallback(옛 2D 그림·실루엣)을
// 보인다. docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-12, 초상)" — 사용자 지적 2026-11-12 "마지막 2d이미지는 만든 외형과 전혀 다른 옛날 이미지".
// - 시험 표지: data-portrait(3d = 3D 초상, 2d = 기다리는 동안·못 그릴 때의 옛 그림), data-look(3D 외형 표지 characterLookKey).
// - 그림은 꾸밈이다: label이 있으면 칸이 role="img"로 이름을 읽고, 없으면 aria-hidden.
import { type CharacterLook, characterLookKey } from "@terra/shared/characterLook";
import type { ReactNode } from "react";
import { type PortraitFraming, usePortrait } from "./portrait.ts";
import "./portrait.css";

export function CyborgPortrait({
  look,
  framing = "body",
  sizePx,
  className,
  label,
  fallback,
  persist = false,
}: {
  /** 3D 외형(없으면 fallback만) */
  look: CharacterLook | null;
  framing?: PortraitFraming;
  /** 그리는 크기(CSS px, 칸의 가장 큰 폭). 칸은 CSS로 줄어들 수 있다 */
  sizePx: number;
  className?: string;
  /** 읽는 이름. 없으면 꾸밈 */
  label?: string;
  /** 3D 초상이 없을 때 보일 것 */
  fallback: ReactNode;
  /** 기기 저장소에 남긴다(위 띠 얼굴처럼 켤 때마다 보이는 것) */
  persist?: boolean;
}) {
  const url = usePortrait(look, framing, sizePx, persist);
  return (
    <span
      className={className ? `cyborg-portrait ${className}` : "cyborg-portrait"}
      data-portrait={url === null ? "2d" : "3d"}
      data-framing={framing}
      data-look={look ? characterLookKey(look) : undefined}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {url === null ? (
        fallback
      ) : (
        <img
          className="cyborg-portrait-image"
          src={url}
          alt=""
          width={sizePx}
          height={sizePx}
          decoding="async"
        />
      )}
    </span>
  );
}
