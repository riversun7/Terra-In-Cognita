// 위 띠 사이보그 얼굴 — 내 사이보그 3D 외형의 머리·어깨 초상(cyborg/portrait.ts, 구도 face). docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-12, 초상)".
// 지연 조각이다(TopBar가 React.lazy로 부른다): 외형 표지 함수·초상 기억이 첫 화면 묶음에 들지 않고, 엔진(three)은 초상을 처음 그릴 때 받는다.
// 그린 얼굴은 기기 저장소에 한 장 남겨(persist) 다음 시작 때 엔진 없이 바로 보인다. 그리는 동안·WebGL 없음이면 기본 실루엣.
import type { CharacterLook } from "@terra/shared/characterLook";
import { CyborgPortrait } from "../cyborg/CyborgPortrait.tsx";
import { Icon } from "../ui/icons.tsx";

/** 얼굴 동그라미 크기(px) = --tap-size − --space-1 */
const FACE_PX = 40;

export default function TopBarFace({ look }: { look: CharacterLook }) {
  return (
    <CyborgPortrait
      look={look}
      framing="face"
      sizePx={FACE_PX}
      className="topbar-face-portrait"
      fallback={<Icon name="cyborg" />}
      persist
    />
  );
}
