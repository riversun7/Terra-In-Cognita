// 앱 안 링크 — 진짜 <a href>라 새 탭·주소 복사가 되고, 그냥 누르면 라우터가 옮긴다(ADR 2026-10-29-app-shell 1절).
// 보조 키(⌘·Ctrl·Shift·Alt)·가운데 버튼·target(새 창)은 브라우저에 맡긴다. 쌓을지 바꿀지는 라우터가 주소 종류로 정한다.
import type { RouteTarget } from "@terra/shared";
import { targetPath } from "@terra/shared";
import type { AnchorHTMLAttributes, MouseEvent, Ref } from "react";
import { navigate } from "./routerStore.ts";

interface AppLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: RouteTarget;
  /** 지금 칸을 바꾼다(지도 모드 전환 등) */
  replace?: boolean;
  /** 옮긴 뒤 초점을 둘 요소 id(없으면 새 화면 제목) */
  focusId?: string;
  ref?: Ref<HTMLAnchorElement>;
}

/** 브라우저에 맡길 누르기인지(새 탭·새 창·내려받기 등) */
function leaveToBrowser(event: MouseEvent<HTMLAnchorElement>): boolean {
  const target = event.currentTarget.getAttribute("target");
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    (target !== null && target !== "_self") ||
    event.currentTarget.hasAttribute("download")
  );
}

export function AppLink({ to, replace, focusId, onClick, ref, ...anchor }: AppLinkProps) {
  return (
    <a
      {...anchor}
      ref={ref}
      href={targetPath(to)}
      onClick={(event) => {
        onClick?.(event);
        if (leaveToBrowser(event)) return;
        event.preventDefault();
        navigate(to, {
          ...(replace === undefined ? {} : { replace }),
          ...(focusId === undefined ? {} : { focusId }),
        });
      }}
    />
  );
}
