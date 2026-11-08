// 운영 권한 부여 화면(/dev/ops-grants) — 개발자만(주소 표 access "dev", 서버 권한 manage_grants = dev 기본).
// 운영자 콘솔의 탭이었다가 개발자 영역으로 옮겼다(사용자 결정 2026-11-08 "권한부여는 개발자가하는 기능이다. 운영자는 불가능").
import type { AccountView } from "@terra/shared";
import { m } from "../paraglide/messages.js";
import { BackButton } from "../shell/BackButton.tsx";
import { useMountFocus } from "../ui/useMountFocus.ts";
import { GrantsTab } from "./GrantsTab.tsx";
import "./ops.css";

export default function OpsGrantsScreen({ viewer }: { viewer: AccountView }) {
  const headingRef = useMountFocus<HTMLHeadingElement>(true);
  return (
    <section className="screen ops" data-density="compact" aria-labelledby="ops-grants-title">
      <div className="screen-header">
        <h1 id="ops-grants-title" className="screen-title" ref={headingRef} tabIndex={-1}>
          {m.shell_route_dev_ops_grants()}
        </h1>
        <BackButton />
      </div>
      <GrantsTab viewerId={viewer.id} canSearch />
    </section>
  );
}
