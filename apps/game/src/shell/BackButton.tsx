// 화면 안 [뒤로] — 홈이 아닌 모든 화면에 둔다(iOS 홈 화면 앱에는 브라우저 뒤로 버튼이 없다, ADR 2026-10-29-app-shell 2절).
// 앱 안에서 쌓은 기록이 있으면 history.back(), 없으면(푸시·즐겨찾기로 바로 연 주소) 부모 화면으로 바꾼다(router.ts planBack).
import { m } from "../paraglide/messages.js";
import { Icon } from "../ui/icons.tsx";
import { goBack } from "./routerStore.ts";

export function BackButton() {
  return (
    <button type="button" className="button-small back-button" onClick={goBack}>
      <Icon name="back" />
      {m.shell_back()}
    </button>
  );
}
