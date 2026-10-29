// 로그인 도우미 — 로그인 화면의 아이디·비밀번호 칸을 채워 들어간다. 화면 문구가 아니라 칸 이름(name)으로 찾는다
// (apps/game/src/auth/LoginScreen.tsx: username·password, 보내기 단추 type=submit).
// 서버 시도 제한(apps/server/src/auth/limits.ts): 들어가기는 아이디마다 15분에 10번, 주소마다 분당 10번이다.
// 서버를 켤 때마다 처음부터 센다. 전역 준비가 계정마다 한 번씩 쓴다. 그래서 로그인 자체를 보는 시험만 login()을 쓰고,
// 나머지는 test.use({ account })로 저장한 세션을 쓴다(helpers/test.ts).
import { type Page, expect } from "@playwright/test";
import { type AccountName, harness } from "./harness.ts";

/** packages/shared/src/accountApi.ts의 ACCOUNT_API_PATHS.enter */
const ENTER_PATH = "/api/account/enter";

/** 지금 화면(로그인 화면)에서 그 계정으로 들어간다. 들어가서 로그인 화면이 내려갈 때까지 기다린다 */
export async function login(page: Page, name: AccountName): Promise<void> {
  const { id, password } = harness().accounts[name];
  const form = page.locator("form").filter({ has: page.locator('input[name="password"]') });
  await form.locator('input[name="username"]').fill(id);
  await form.locator('input[name="password"]').fill(password);
  const entered = page.waitForResponse(
    (response) => response.request().method() === "POST" && new URL(response.url()).pathname === ENTER_PATH,
  );
  await form.locator('button[type="submit"]').click();
  const response = await entered;
  const body: unknown = await response.json().catch(() => null);
  const status = typeof body === "object" && body !== null ? Reflect.get(body, "status") : undefined;
  if (response.status() !== 200 || status !== "signed_in") {
    throw new Error(`${name}(${id}) 로그인 실패: HTTP ${response.status()}, status ${String(status)}`);
  }
  // 앱이 세션을 다시 읽고 로그인 화면을 내린다
  await expect(form).toHaveCount(0);
}
