// 편집기 입력 조작 도우미 — 막대 끌기·요소 끌기(docs/adr/2026-11-10-editor-input-controls.md).
// 막대(role="slider")는 <input>이 아니라 포인터로 끄는 div라 fill()로 바꿀 수 없다: 마우스로 누르고 옮기고 뗀다.
import { type Locator, type Page, expect } from "@playwright/test";

/** 요소의 화면 상자(보일 때까지 기다린다) */
async function boxOf(target: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  if (!box) throw new Error("요소 상자를 읽지 못했습니다");
  return box;
}

/** 막대를 폭의 from → to 자리(0~1)로 끈다(누름 → 여러 걸음 옮김 → 뗌) */
export async function dragSlider(page: Page, slider: Locator, from: number, to: number): Promise<void> {
  const box = await boxOf(slider);
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * from, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to, y, { steps: 6 });
  await page.mouse.up();
}

/** 막대의 폭 at 자리(0~1)를 한 번 누른다(팩 값 눈금 자리를 누르면 팩 값) */
export async function clickSlider(page: Page, slider: Locator, at: number): Promise<void> {
  const box = await boxOf(slider);
  await page.mouse.click(box.x + box.width * at, box.y + box.height / 2);
}

/** 요소 가운데를 잡고 가로로 dx 화소(세로 dy) 끈다. keys = 끄는 동안 누를 보조 키 */
export async function dragBy(
  page: Page,
  target: Locator,
  dx: number,
  dy = 0,
  keys: readonly ("Shift" | "Alt")[] = [],
): Promise<void> {
  const box = await boxOf(target);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (const key of keys) await page.keyboard.down(key);
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  for (const key of keys) await page.keyboard.up(key);
  await page.mouse.up();
}

/** 한 요소의 가운데에서 다른 요소의 가운데까지 끈다(끌어 채우기) */
export async function dragTo(page: Page, from: Locator, to: Locator): Promise<void> {
  const a = await boxOf(from);
  const b = await boxOf(to);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

/** 입력 칸들의 값(수) — 표 한 줄·한 열의 값을 한꺼번에 읽는다 */
export function inputValues(inputs: Locator): Promise<number[]> {
  return inputs.evaluateAll((nodes) =>
    nodes.map((node) => (node instanceof HTMLInputElement ? Number(node.value) : Number.NaN)),
  );
}
