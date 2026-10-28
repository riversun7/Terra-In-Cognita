// 이름표 — 앱 아이콘(public/favicon.svg, 앱 껍데기로 미리 캐시됨)과 게임 이름. 로그인 화면은 크게(소개 한 줄 포함),
// 새 아이디·비밀번호 찾기 화면은 한 줄로. 화면 제목(h1)은 따로 있어서 이름표는 문단이다. 아이콘은 꾸밈(alt="")이다.
// 크기는 CSS(--mark-lg·--mark-sm)가 정한다. width·height는 그림 비율(64×64 viewBox)을 미리 알려 자리가 흔들리지 않게 한다.
import { m } from "../paraglide/messages.js";

export function Brand({ size }: { size: "large" | "small" }) {
  return (
    <div className={size === "large" ? "brand" : "brand brand-small"}>
      <img className="brand-mark" src="/favicon.svg" alt="" width="64" height="64" />
      <p className="brand-title" translate="no">
        {m.app_title()}
      </p>
      {size === "large" ? <p className="brand-tag">{m.app_description()}</p> : null}
    </div>
  );
}
