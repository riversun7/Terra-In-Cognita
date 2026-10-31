// 우편 화면 시험 — /mail(D-270: 물건·세력 화폐를 보내는 우편). 실제 우편함(지금은 빈 것)과 시안 자료를 켠 dev.
// - 플레이어: 받은·보낸 우편이 비어 있고, 쓰기 칸은 검사만 한다(보내기는 곧 열림 → 명령을 보내지 않는다).
// - dev + 시안 자료: 시안 우편(apps/server/src/mail/preview.ts) — 받은 4(읽지 않음 2), 보낸 2, 첨부 물건·세력 화폐, 한·영 원문.
//   좁은 화면은 목록 ↔ 읽기 칸을 번갈아, 넓은 화면은 둘을 나란히 보인다. [답장]은 쓰기 칸을 채운다.
// - 사진: 390·1440 × 파스텔·다크 × 한국어·영어(받은 우편 + 읽기, 쓰기 오류).
// 자리는 화면 부품의 class·role로 찾는다(apps/game/src/mail/*.tsx). 문구는 메시지 원본.
import type { Page } from "@playwright/test";
import { message } from "./helpers/messages.ts";
import { horizontalOverflow, shot, smallTapTargets } from "./helpers/screen.ts";
import { type Language, type Theme, expect, test } from "./helpers/test.ts";
import { hideSummary, rewriteTrpc } from "./helpers/trpc.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

/**
 * 화면 전체 사진: 화면 높이를 문서 높이로 늘려 찍는다(fullPage는 고정된 위 띠·하단 탭을 스크롤 자리에 그려 가운데에 겹친다).
 * 찍은 뒤 원래 크기로 돌린다
 */
async function tallShot(page: Page, name: string): Promise<void> {
  const size = page.viewportSize();
  if (size === null) throw new Error("화면 크기를 모릅니다");
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: size.width, height: Math.min(Math.max(height, size.height), 12_000) });
  await shot(page, name);
  await page.setViewportSize(size);
}

/** 화면이 WebSocket으로 보낸 기능 메시지(연결 인사·시계 맞추기는 뺀다) */
function watchCommands(page: Page): string[] {
  const sent: string[] = [];
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      const text = typeof payload === "string" ? payload : payload.toString("utf8");
      let type: unknown = null;
      try {
        const value: unknown = JSON.parse(text);
        type = typeof value === "object" && value !== null ? Reflect.get(value, "t") : null;
      } catch {
        type = null;
      }
      if (type !== "hello" && type !== "ping") sent.push(text);
    });
  });
  return sent;
}

const tabOf = (page: Page, language: Language, tab: "inbox" | "sent" | "compose") =>
  page
    .locator("section.mail")
    .getByRole("tab", { name: new RegExp(`^${message(language, `mail_tab_${tab}`)}`) });

async function openMail(page: Page): Promise<void> {
  await page.goto("/mail");
  await expect(page.locator("section.mail [role=tablist]")).toBeVisible({ timeout: 20_000 });
}

test.describe("플레이어(실제 우편함)", () => {
  test.use({ account: "player" });

  test("빈 우편함, 쓰기 칸 검사(틀린 칸에 초점), 맞으면 곧 열림 안내만(명령 없음)", async ({
    page,
    deviceErrors,
  }) => {
    const commands = watchCommands(page);
    await openMail(page);
    const screen = page.locator("section.mail");
    await expect(screen.locator("h1")).toHaveText(message("ko", "shell_mail"));
    await expect(screen.locator(".mail-empty")).toContainText(message("ko", "mail_empty_inbox"));
    // 시스템 우편은 없다(D-443): 보상·안내는 처리할 일로 온다고 알린다
    await expect(screen.locator(".mail-empty")).toContainText(message("ko", "mail_empty_inbox_hint"));
    await tabOf(page, "ko", "sent").click();
    await expect(screen.locator(".mail-empty")).toContainText(message("ko", "mail_empty_sent"));

    await tabOf(page, "ko", "compose").click();
    const form = screen.locator("form.mail-compose");
    await expect(form).toContainText(message("ko", "mail_attach_none"));
    const send = form.getByRole("button", { name: new RegExp(message("ko", "mail_send")) });
    await send.click();
    await expect(form).toContainText(message("ko", "mail_err_recipient_empty"));
    await expect(form).toContainText(message("ko", "mail_err_subject_empty"));
    await expect(form).toContainText(message("ko", "mail_send_invalid"));
    const recipient = form.getByLabel(message("ko", "mail_field_recipient"));
    await expect(recipient).toBeFocused();
    // 사이보그 이름은 서버 고유(D-443)라는 안내가 받는 사람 칸 설명이다
    await expect(recipient).toHaveAccessibleDescription(new RegExp(message("ko", "mail_recipient_hint")));
    await expect(recipient).toHaveAttribute("aria-invalid", "true");

    await recipient.fill("M");
    await expect(form).toContainText(message("ko", "mail_err_too_short", { min: 2 }));
    await recipient.fill("Mora");
    await form.getByLabel(message("ko", "mail_field_subject")).fill("창고 정리");
    await form.getByLabel(message("ko", "mail_field_body")).fill("보냅니다.\n고마워요");
    await send.click();
    await expect(form).toContainText(message("ko", "mail_send_soon"));
    await expect(recipient).not.toHaveAttribute("aria-invalid", "true");
    expect(commands).toEqual([]);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("dev 시안 자료(390px)", () => {
  test.use({ account: "dev", preview: "dev" });

  test("목록 → 읽기 칸(목록 숨김) → [목록으로]는 그 줄로 초점, 첨부·받기(곧 열림)·번역 단추, [답장]은 쓰기 칸을 채운다", async ({
    page,
    deviceErrors,
  }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    const commands = watchCommands(page);
    await openMail(page);
    const screen = page.locator("section.mail");
    await expect(screen.locator(".preview-notice")).toContainText(message("ko", "mail_preview_notice"));
    await expect(tabOf(page, "ko", "inbox").locator(".screen-tab-count")).toHaveText("2");
    const rows = screen.locator(".mail-row");
    await expect(rows).toHaveCount(4);
    await expect(screen.locator('.mail-row[data-unread="true"]')).toHaveCount(2);

    // 영어로 쓴 우편(Rook): 세력 화폐 첨부, 한국어 화면이라 [번역]
    await rows.filter({ hasText: "Re: siege on Saltmarsh" }).click();
    const reader = screen.locator(".mail-reader");
    await expect(reader.locator("h2")).toBeFocused();
    await expect(screen.locator(".mail-list-pane")).toBeHidden();
    await expect(reader).toContainText(
      message("ko", "mail_attachment_currency", { name: "Kestrel mark", amount: "2,000" }),
    );
    await expect(
      reader.getByRole("button", { name: new RegExp(message("ko", "mail_translate")) }),
    ).toBeVisible();
    await reader
      .getByRole("button", { name: new RegExp(`^${message("ko", "mail_claim")}`) })
      .click({ force: true });
    await expect(screen.locator(".soon-live")).toContainText(message("ko", "screen_soon_pressed"));

    await reader.getByRole("button", { name: message("ko", "mail_back_to_list") }).click();
    await expect(screen.locator(".mail-list-pane")).toBeVisible();
    await expect(rows.filter({ hasText: "Re: siege on Saltmarsh" })).toBeFocused();

    // 한국어 우편(Mora)에 답장 → 쓰기 칸에 받는 사람·제목
    await rows.filter({ hasText: "Nova 창고 정리했어요" }).click();
    await expect(
      reader.getByRole("button", { name: new RegExp(message("ko", "mail_translate")) }),
    ).toHaveCount(0);
    await reader.getByRole("button", { name: message("ko", "mail_reply") }).click();
    await expect(tabOf(page, "ko", "compose")).toHaveAttribute("aria-selected", "true");
    const form = screen.locator("form.mail-compose");
    await expect(form.getByLabel(message("ko", "mail_field_recipient"))).toHaveValue("Mora");
    await expect(form.getByLabel(message("ko", "mail_field_subject"))).toHaveValue(
      message("ko", "mail_reply_subject", { subject: "Nova 창고 정리했어요" }),
    );

    // 첨부: 가진 것보다 많으면 오류, 고치면 통과
    await form.getByRole("button", { name: message("ko", "mail_attach_add") }).click();
    const row = form.locator(".mail-attach-row").first();
    await row.locator("select").selectOption("preview_iron_ore");
    await expect(row).toContainText(message("ko", "mail_attach_have", { max: "260" }));
    await row.getByLabel(message("ko", "mail_attach_amount")).fill("999");
    await form.getByRole("button", { name: new RegExp(message("ko", "mail_send")) }).click();
    await expect(row).toContainText(message("ko", "mail_err_attach_over"));
    await expect(row.getByLabel(message("ko", "mail_attach_amount"))).toBeFocused();
    await row.getByLabel(message("ko", "mail_attach_amount")).fill("40");
    await form.getByRole("button", { name: new RegExp(message("ko", "mail_send")) }).click();
    await expect(form).toContainText(message("ko", "mail_send_soon"));
    expect(commands).toEqual([]);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await smallTapTargets(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });

  test("긴 제목·본문(띄어쓰기 없음)과 큰 수: 가로 넘침 없음", async ({ page, deviceErrors }) => {
    const LONG = "Unbroken_subject_line_that_never_ends_and_keeps_going_far_beyond_the_screen_edge";
    await rewriteTrpc(page, {
      "summary.get": hideSummary,
      "mail.list": (data) => {
        const items: unknown = typeof data === "object" && data !== null ? Reflect.get(data, "items") : null;
        if (!Array.isArray(items)) throw new Error("mail.list 응답 모양이 다릅니다");
        for (const item of items) {
          Reflect.set(item, "subject", LONG);
          Reflect.set(item, "body", LONG.repeat(6));
          Reflect.set(item, "from", { name: LONG, factionTag: "LONG" });
        }
      },
    });
    await openMail(page);
    expect(await horizontalOverflow(page)).toEqual([]);
    await page.locator("section.mail .mail-row").first().click();
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(deviceErrors).toEqual([]);
  });
});

test.describe("dev 시안 자료(1440px)", () => {
  test.use({ account: "dev", preview: "dev", ...VIEWPORTS.desktop });

  test("목록과 읽기 칸을 나란히(고르기 전 안내), [목록으로]는 없다", async ({ page, deviceErrors }) => {
    await rewriteTrpc(page, { "summary.get": hideSummary });
    await openMail(page);
    const screen = page.locator("section.mail");
    await expect(screen.locator(".mail-pick")).toHaveText(message("ko", "mail_pick_hint"));
    await screen.locator(".mail-row").first().click();
    await expect(screen.locator(".mail-list-pane")).toBeVisible();
    await expect(screen.locator(".mail-reader")).toBeVisible();
    await expect(screen.getByRole("button", { name: message("ko", "mail_back_to_list") })).toBeHidden();
    expect(deviceErrors).toEqual([]);
  });
});

const LAYOUTS: readonly { theme: Theme; language: Language }[] = [
  { theme: "pastel", language: "ko" },
  { theme: "pastel", language: "en" },
  { theme: "dark", language: "ko" },
  { theme: "dark", language: "en" },
];

for (const [size, preset] of [
  ["390", VIEWPORTS.phone],
  ["1440", VIEWPORTS.desktop],
] as const) {
  test.describe(`사진 ${size}px`, () => {
    test.use({ account: "dev", preview: "dev", ...preset });
    for (const { theme, language } of LAYOUTS) {
      test.describe(`${theme}·${language}`, () => {
        test.use({ theme, language });

        test("받은 우편·읽기·쓰기 오류: 가로 넘침 없음, 사진", async ({ page, deviceErrors }) => {
          await rewriteTrpc(page, { "summary.get": hideSummary });
          await openMail(page);
          const screen = page.locator("section.mail");
          await expect(screen.locator(".mail-row")).toHaveCount(4);
          await tallShot(page, `mail-inbox-${theme}-${language}-${size}`);
          await screen.locator(".mail-row").first().click();
          await expect(screen.locator(".mail-reader")).toBeVisible();
          expect(await horizontalOverflow(page)).toEqual([]);
          await tallShot(page, `mail-read-${theme}-${language}-${size}`);
          await tabOf(page, language, "compose").click();
          const form = screen.locator("form.mail-compose");
          await form.getByRole("button", { name: message(language, "mail_attach_add") }).click();
          await form.getByRole("button", { name: new RegExp(message(language, "mail_send")) }).click();
          await expect(form).toContainText(message(language, "mail_send_invalid"));
          expect(await horizontalOverflow(page)).toEqual([]);
          await tallShot(page, `mail-compose-${theme}-${language}-${size}`);
          expect(deviceErrors).toEqual([]);
        });
      });
    }
  });
}

test.describe("사진 플레이어", () => {
  test.use({ account: "player", theme: "dark", language: "en", ...VIEWPORTS.desktop });

  test("빈 우편함(1440·다크·영어), 사진", async ({ page, deviceErrors }) => {
    await openMail(page);
    await expect(page.locator("section.mail .mail-empty")).toBeVisible();
    await tallShot(page, "mail-player-dark-en-1440");
    expect(deviceErrors).toEqual([]);
  });
});
