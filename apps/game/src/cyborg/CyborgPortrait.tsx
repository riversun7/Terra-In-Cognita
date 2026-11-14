// 사이보그 초상 칸 — 3D 외형을 썸네일 렌더러로 그린 그림(portrait.ts)을 보이고, 그리는 중·WebGL 없음·외형 없음이면 무늬 없는 실루엣
// (CyborgSilhouette, 부르는 쪽이 fallback으로 아이콘을 줄 수도 있다)을 보인다. docs/adr/2026-11-11-character-3d.md
// "바뀜 (2026-11-12, 초상)"·"바뀜 (2026-11-14, 2D 제거)" — 옛 2D 그림은 어디에도 보이지 않는다(사용자 지적 2026-11-14).
// - 다시 보는 초상은 기억(메모리 + persist면 기기 저장소)에서 첫 그림부터 바로 보인다.
// - 시험 표지: data-portrait(3d = 3D 초상, pending = 그리는 중, none = 그릴 수 없음), data-look(3D 외형 표지 characterLookKey).
// - 그림은 꾸밈이다: label이 있으면 칸이 role="img"로 이름을 읽고, 없으면 aria-hidden.
import { type CharacterLook, characterLookKey } from "@terra/shared/characterLook";
import type { ReactNode } from "react";
import { CyborgSilhouette } from "./CyborgSilhouette.tsx";
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
  /** 3D 외형(없으면 실루엣만) */
  look: CharacterLook | null;
  framing?: PortraitFraming;
  /** 그리는 크기(CSS px, 칸의 가장 큰 폭). 칸은 CSS로 줄어들 수 있다 */
  sizePx: number;
  className?: string;
  /** 읽는 이름. 없으면 꾸밈 */
  label?: string;
  /** 3D 초상이 없을 때 실루엣 대신 보일 것(위 띠 얼굴의 아이콘). 캐릭터 그림을 넣지 않는다 */
  fallback?: ReactNode;
  /** 기기 저장소에 남긴다(위 띠 얼굴·사이보그 화면처럼 다시 보는 것) */
  persist?: boolean;
}) {
  const { url, state } = usePortrait(look, framing, sizePx, persist);
  return (
    <span
      className={className ? `cyborg-portrait ${className}` : "cyborg-portrait"}
      data-portrait={state}
      data-framing={framing}
      data-look={look ? characterLookKey(look) : undefined}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {url !== null ? (
        <img
          className="cyborg-portrait-image"
          src={url}
          alt=""
          width={sizePx}
          height={sizePx}
          decoding="sync"
        />
      ) : (
        (fallback ?? <CyborgSilhouette framing={framing} pending={state === "pending"} />)
      )}
    </span>
  );
}
