// 시험 틀 확인 — 화면 문구·배치가 아니라 바뀌지 않는 것만 본다. 그래서 앱 뼈대 줄기(W1~W4)가 이 파일을 고치지 않는다.
// - 로그인하면 주소가 `/`(D-6001: 로그인 직후 첫 화면은 `/`의 홈)
// - 본문 표지(main)가 하나 보인다(ADR 2026-10-29-app-shell 10절)
// - 기기 오류가 없다: 잡히지 않은 오류, console.error, 오류 보고(/api/telemetry/errors) 전송
// 화면마다의 시험은 각 줄기가 e2e/<줄기>.spec.ts로 더한다.
import { login } from "./helpers/auth.ts";
import { expect, test } from "./helpers/test.ts";

const SESSION_PATH = "/api/auth/get-session";

test("로그인 화면에서 들어가면 주소가 / 이고 본문이 있으며 기기 오류가 없다(player)", async ({
  page,
  deviceErrors,
}) => {
  await page.goto("/");
  await login(page, "player");
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByRole("main")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(deviceErrors).toEqual([]);
});

test.describe("저장한 세션", () => {
  test.use({ account: "admin" });

  test("저장한 세션으로 열면 로그인 화면 없이 / 에 본문이 있고 기기 오류가 없다(admin)", async ({
    page,
    deviceErrors,
  }) => {
    const session = page.waitForResponse((response) => new URL(response.url()).pathname === SESSION_PATH);
    await page.goto("/");
    // 서버가 이 세션을 로그인한 사용자로 본다
    const body: unknown = await (await session).json();
    expect(body).toMatchObject({ user: { loginId: "e2e_admin" } });
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.locator('input[name="password"]')).toHaveCount(0);
    await expect(page).toHaveURL((url) => url.pathname === "/");
    await page.waitForLoadState("networkidle");
    expect(deviceErrors).toEqual([]);
  });
});
