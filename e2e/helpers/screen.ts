// 화면 검사·사진 도우미 — 가로 넘침, 누르는 곳 크기(--tap-size 44px, ADR 2026-10-29-app-shell 10절), 사진.
// 넘침·누르는 곳은 문제 목록(문자열)을 돌려준다. 시험은 expect(await horizontalOverflow(page)).toEqual([])처럼 본다.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { type Page, test } from "@playwright/test";

/** 누르는 곳 최소 크기(px) — apps/game/src/styles/tokens.css의 --tap-size */
export const TAP_SIZE = 44;

/**
 * 가로 넘침: 문서가 화면 폭보다 넓으면 오른쪽 끝이 화면 밖인 요소(가로 스크롤 상자 안은 뺀다)를 10개까지 돌려준다.
 * 넘치지 않으면 빈 목록.
 */
export async function horizontalOverflow(page: Page): Promise<string[]> {
  // 이 함수는 브라우저에서 돈다(바깥 변수·함수를 쓸 수 없다)
  return page.evaluate(() => {
    const root = document.documentElement;
    const width = root.clientWidth;
    if (root.scrollWidth <= width) return [];
    const offenders: string[] = [];
    for (const element of document.body.querySelectorAll("*")) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.right <= width + 1) continue;
      // 가로 스크롤·자르기 상자 안이면 문서를 넓히지 않는다
      let contained = false;
      for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
        if (getComputedStyle(node).overflowX !== "visible") {
          contained = true;
          break;
        }
      }
      if (contained) continue;
      const id = element.id ? `#${element.id}` : "";
      const classes = [...element.classList].map((name) => `.${name}`).join("");
      offenders.push(`${element.tagName.toLowerCase()}${id}${classes} 오른쪽 ${Math.round(rect.right)}px`);
      if (offenders.length >= 10) break;
    }
    return [`문서 폭 ${root.scrollWidth}px > 화면 ${width}px`, ...offenders];
  });
}

/**
 * 누르는 곳이 min px보다 작은 요소(보이는 단추·링크·입력·역할 있는 요소). 칸을 감싼 label이 있으면 label 크기로 본다.
 * 1px 이하로 숨긴 요소(읽기 프로그램용, 초점을 받으면 나타나는 건너뛰기 링크)와 ignore 선택자에 맞는 요소는 뺀다.
 */
export async function smallTapTargets(
  page: Page,
  options: { min?: number; ignore?: string } = {},
): Promise<string[]> {
  // 이 함수는 브라우저에서 돈다(바깥 변수·함수를 쓸 수 없다)
  return page.evaluate(
    ({ min, ignore }) => {
      const selector = [
        "a[href]",
        "button",
        'input:not([type="hidden"])',
        "select",
        "textarea",
        "summary",
        ...["button", "link", "tab", "checkbox", "radio", "switch", "menuitem", "option"].map(
          (role) => `[role="${role}"]`,
        ),
      ].join(",");
      const small: string[] = [];
      for (const element of document.querySelectorAll(selector)) {
        if (ignore && element.matches(ignore)) continue;
        if (element.matches(":disabled") || element.closest("[inert], [aria-hidden='true']")) continue;
        const style = getComputedStyle(element);
        if (style.visibility === "hidden" || style.display === "none") continue;
        const target = element.closest("label") ?? element;
        const rect = target.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) continue;
        if (rect.width >= min && rect.height >= min) continue;
        const name = (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 24);
        const tag = element.tagName.toLowerCase();
        small.push(
          `${tag}${name ? ` "${name}"` : ""} ${Math.round(rect.width)}×${Math.round(rect.height)}px`,
        );
      }
      return small;
    },
    { min: options.min ?? TAP_SIZE, ignore: options.ignore ?? "" },
  );
}

/**
 * 화면 사진을 찍고 파일 경로를 돌려준다. 폴더는 E2E_SHOTS_DIR(작업 기록에 남길 사진은 세션 임시 폴더 등 저장소 밖),
 * 없으면 e2e/test-results/shots(다음 실행이 지운다). 이름은 영문 소문자·숫자·`-`·`_`·`.`만(예: home-pastel-ko-390).
 */
export async function shot(page: Page, name: string, options: { fullPage?: boolean } = {}): Promise<string> {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) throw new Error(`사진 이름은 영문 소문자·숫자·-·_·.만: ${name}`);
  const info = test.info();
  const dir = process.env.E2E_SHOTS_DIR ?? path.join(info.project.outputDir, "shots");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: options.fullPage ?? false, animations: "disabled" });
  await info.attach(name, { path: file, contentType: "image/png" });
  return file;
}
