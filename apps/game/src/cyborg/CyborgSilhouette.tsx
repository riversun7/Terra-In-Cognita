// 사이보그 실루엣 — 3D 초상을 그리는 동안·그릴 수 없을 때(WebGL 없음·외형 없는 옛 사이보그) 그 자리에 두는 무늬 없는 그림.
// docs/adr/2026-11-11-character-3d.md "바뀜 (2026-11-14, 2D 제거)": 옛 2D 사이보그 그림(CyborgAvatar)을 지우고 이것으로 바꿨다
// (사용자 지적 2026-11-14 "기존의 2d 사이보그 이미지가 빠르게 떳다가 사라진다").
// - 캐릭터 그림이 아니다: 동그란 머리 + 몸(구도 body) 또는 머리 + 어깨(구도 face)의 한 색 덩어리. 색은 CSS 토큰(currentColor)이다.
// - 정사각 viewBox라 3D 초상 img(aspect-ratio 1)와 같은 자리를 차지한다(바뀔 때 화면이 밀리지 않는다).
// - pending이면 천천히 깜박인다(움직임 줄이기면 멈춤, portrait.css).
import type { PortraitFraming } from "./portrait.ts";
import "./portrait.css";

export function CyborgSilhouette({
  framing = "body",
  pending = false,
  className,
}: {
  framing?: PortraitFraming;
  /** 그리는 중(깜박임) */
  pending?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={className ? `cyborg-silhouette ${className}` : "cyborg-silhouette"}
      viewBox="0 0 100 100"
      data-pending={pending ? "true" : undefined}
      aria-hidden="true"
      focusable="false"
    >
      {framing === "face" ? (
        <>
          <circle cx="50" cy="40" r="24" fill="currentColor" />
          <path d="M16 100 C16 78 30 68 50 68 C70 68 84 78 84 100 Z" fill="currentColor" />
        </>
      ) : (
        <>
          <circle cx="50" cy="27" r="17" fill="currentColor" />
          <rect x="30" y="47" width="40" height="33" rx="14" fill="currentColor" />
          <rect x="36" y="78" width="11" height="14" rx="5.5" fill="currentColor" />
          <rect x="53" y="78" width="11" height="14" rx="5.5" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
