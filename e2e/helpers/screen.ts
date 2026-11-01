// 화면 검사·사진 도우미 — 가로 넘침, 누르는 곳 크기(--tap-size, ADR 2026-10-29-app-shell 10절), 사진.
// 넘침·누르는 곳은 문제 목록(문자열)을 돌려준다. 시험은 expect(await horizontalOverflow(page)).toEqual([])처럼 본다.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { type Locator, type Page, test } from "@playwright/test";

/** 누르는 곳 최소 크기(px)를 화면에서 읽지 못할 때 쓰는 값 — apps/game/src/styles/tokens.css의 --tap-size(44px) */
const TAP_SIZE_FALLBACK = 44;

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
 * 누르는 곳이 최소 크기보다 작은 요소(보이는 단추·링크·입력·역할 있는 요소). 최소 크기는 min, 없으면 화면의 --tap-size
 * (문서 뿌리의 계산 값. px 값이 아니면 44).
 * - 칸(input·select·textarea·button)은 이어진 label(감싼 것·for로 이은 것) 중 하나가 크기를 넘으면 통과다(label을 눌러도 된다).
 * - 모달 대화 상자(showModal: 서랍·시트)가 열려 있으면 그 안만 본다. 밖은 누를 수 없다(inert 속성 없이 막힌다).
 * - 1px 이하로 숨긴 요소(읽기 프로그램용, 초점을 받으면 나타나는 건너뛰기 링크)와 ignore 선택자에 맞는 요소는 뺀다.
 */
export async function smallTapTargets(
  page: Page,
  options: { min?: number; ignore?: string } = {},
): Promise<string[]> {
  // 이 함수는 브라우저에서 돈다(바깥 변수·함수를 쓸 수 없다)
  return page.evaluate(
    ({ min, ignore, fallback }) => {
      const token = getComputedStyle(document.documentElement).getPropertyValue("--tap-size").trim();
      const size = min ?? (/^\d+(\.\d+)?px$/.test(token) ? Number.parseFloat(token) : fallback);
      const modalOpen = document.querySelector("dialog:modal") !== null;
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
        if (modalOpen && element.closest("dialog:modal") === null) continue;
        const style = getComputedStyle(element);
        if (style.visibility === "hidden" || style.display === "none") continue;
        const labels =
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLButtonElement
            ? [...(element.labels ?? [])]
            : [];
        // 누를 수 있는 상자: 요소 자신 + 이어진 label. 1px 이하(숨김)는 뺀다
        const boxes = [element, ...labels]
          .map((node) => ({ rect: node.getBoundingClientRect(), label: node !== element }))
          .filter(({ rect }) => rect.width > 1 && rect.height > 1);
        if (boxes.length === 0) continue;
        if (boxes.some(({ rect }) => rect.width >= size && rect.height >= size)) continue;
        const biggest = boxes.reduce((a, b) =>
          b.rect.width * b.rect.height > a.rect.width * a.rect.height ? b : a,
        );
        const name = (
          element.getAttribute("aria-label") ??
          labels[0]?.textContent ??
          element.textContent ??
          ""
        )
          .trim()
          .slice(0, 24);
        const tag = element.tagName.toLowerCase();
        const { width, height } = biggest.rect;
        const where = biggest.label ? " (label)" : "";
        small.push(`${tag}${name ? ` "${name}"` : ""} ${Math.round(width)}×${Math.round(height)}px${where}`);
      }
      return small;
    },
    { min: options.min ?? null, ignore: options.ignore ?? "", fallback: TAP_SIZE_FALLBACK },
  );
}

/**
 * 화면 사진을 찍고 파일 경로를 돌려준다. 폴더는 E2E_SHOTS_DIR(작업 기록에 남길 사진은 세션 임시 폴더 등 저장소 밖),
 * 없으면 e2e/test-results/shots(다음 실행이 지운다). 이름은 영문 소문자·숫자·`-`·`_`·`.`만(예: home-pastel-ko-390).
 */
export async function shot(page: Page, name: string, options: { fullPage?: boolean } = {}): Promise<string> {
  return capture(name, (file) =>
    page.screenshot({ path: file, fullPage: options.fullPage ?? false, animations: "disabled" }),
  );
}

/** 요소 하나만 찍는다(그림·판 하나). 폴더·이름 규칙은 shot과 같다 */
export async function elementShot(locator: Locator, name: string): Promise<string> {
  return capture(name, (file) => locator.screenshot({ path: file, animations: "disabled" }));
}

async function capture(name: string, take: (path: string) => Promise<unknown>): Promise<string> {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) throw new Error(`사진 이름은 영문 소문자·숫자·-·_·.만: ${name}`);
  const info = test.info();
  const dir = process.env.E2E_SHOTS_DIR ?? path.join(info.project.outputDir, "shots");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await take(file);
  await info.attach(name, { path: file, contentType: "image/png" });
  return file;
}
