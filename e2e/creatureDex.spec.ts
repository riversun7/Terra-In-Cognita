// 크리쳐 편집기 도감·상세 탭 시험 — /dev/creatures (docs/adr/2026-11-25-creature-codex-groups.md).
// 보는 것:
// - 첫 탭은 도감(전체 목록)이고 줄을 고르면 상세 탭의 "도감 정보"(일러스트 + 3D 미리 보기, 스탯 조우 범위)로 넘어간다.
// - 3D 미리 보기: 모델 파일이 없으면 임시 몸, GLB가 있으면 그 모델(시험이 만든 삼각형 둘짜리 GLB를 가짜 응답으로 준다), 못 읽으면 임시 몸 + 알림.
// - 변종 그룹: [+ 변종 추가]로 만든 변종이 적용 뒤 도감에서 대표 아래에 들여 보인다.
// - 스탯: 오차(±)를 바꾸면 조우 범위가 따라가고, 랜덤 분포 뽑기는 합을 지키고 고정한 스탯을 그대로 둔다.
// - 전리품: 아이템 고르기 + 획득 확률만(수량 칸 없음).
// - 도감 표: 스탯 합이 앞, 6스탯 분포·스탯 여섯·기술 슬롯·속성 아이콘(강화형 구분). 칸 머리로 줄을 세우고 합 범위·주속성으로 거른다.
// - 분류(대·중·소): 분류 편집에서 중분류를 더하고 크리쳐를 골라 옮겨 적용하면 분류 띠에서 그 분류로 거른다.
// - 사진: 1440 × 개발 화면 테마 네온·라이트(도감·도감 정보) + 390 네온(E2E_SHOTS_DIR).
// 시험끼리 서버·DB를 같이 쓴다: 적용하는 시험은 끝에 크리쳐 덮어쓰기를 되돌린다(만든 변종은 지운다 — 그 ID는 이 실행에서 다시 쓰지 못한다).
import type { Locator, Page } from "@playwright/test";
import { horizontalOverflow, shot } from "./helpers/screen.ts";
import { type DevTheme, expect, test } from "./helpers/test.ts";
import { VIEWPORTS } from "./helpers/viewports.ts";

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

async function trpc(
  page: Page,
  procedure: string,
  input?: unknown,
  mutation = false,
): Promise<{ status: number; data: unknown; reason: unknown }> {
  return page.evaluate(
    async ({ procedure: name, input: body, mutation: post }) => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const get = (value: unknown, key: string): unknown =>
        typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
      const query = body === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(body))}`;
      const response = await fetch(
        post ? `/api/trpc/${name}` : `/api/trpc/${name}${query}`,
        post
          ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
          : { method: "GET" },
      );
      const json: unknown = await response.json();
      return {
        status: response.status,
        data: get(get(json, "result"), "data"),
        reason: get(get(get(json, "error"), "data"), "reason"),
      };
    },
    { procedure, input, mutation },
  );
}

/** 크리쳐·분류 덮어쓰기를 모두 되돌린다(가리키는 쪽 먼저: 변종 → 나머지 크리쳐 → 아래 분류 → 위 분류) */
async function resetCreatures(page: Page): Promise<void> {
  const passes = [
    { key: "creatures", op: "revert", ref: "variantOf", refFirst: true },
    { key: "creatures", op: "revert", ref: "variantOf", refFirst: false },
    { key: "classes", op: "revert_class", ref: "parent", refFirst: true },
    { key: "classes", op: "revert_class", ref: "parent", refFirst: false },
  ] as const;
  for (const pass of passes) {
    const current = await trpc(page, "creatures.list");
    const revision = field(current.data, "revision");
    if (typeof revision !== "number") throw new Error(`creatures.list ${current.status}`);
    const changes = list(field(current.data, pass.key)).flatMap((row) => {
      const origin = field(row, "origin");
      if (origin !== "edited" && origin !== "created") return [];
      const pointsUp = typeof field(field(row, "entry"), pass.ref) === "string";
      // 고친 팩 항목은 가리키는 칸과 상관없이 둘째 차례에 되돌린다
      if ((origin === "created" && pointsUp) !== pass.refFirst) return [];
      return [{ op: pass.op, id: field(field(row, "entry"), "id"), baseHash: field(row, "hash") }];
    });
    if (changes.length === 0) continue;
    const reverted = await trpc(page, "creatures.save", { expectedRevision: revision, changes }, true);
    if (reverted.status !== 200)
      throw new Error(`creatures.save revert ${reverted.status} ${String(reverted.reason)}`);
  }
}

/** 삼각형 둘(네모 한 장)짜리 GLB — 3D 미리 보기가 진짜 GLB를 읽는지 본다 */
function tinyGlb(): Buffer {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 2, 0, 0, 0, 0, 1, 2, 0, 0, 2, 0]);
  const bin = Buffer.from(positions.buffer);
  const json = JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 6, type: "VEC3", min: [0, 0, 0], max: [1, 2, 0] },
    ],
  });
  const jsonChunk = Buffer.from(json.padEnd(Math.ceil(json.length / 4) * 4, " "), "utf8");
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46_54_6c_67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + bin.length, 8);
  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(jsonChunk.length, 0);
  jsonHead.writeUInt32LE(0x4e_4f_53_4a, 4);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(bin.length, 0);
  binHead.writeUInt32LE(0x00_4e_49_42, 4);
  return Buffer.concat([header, jsonHead, jsonChunk, binHead, bin]);
}

const screen = (page: Page) => page.locator(".ce-screen");
/** 숫자 칸의 글자 입력(같은 이름표를 가진 걸음 단추·막대는 뺀다) */
const numberInput = (scope: Locator, label: RegExp) =>
  scope.locator("input[data-num]").and(scope.getByLabel(label));
const viewer = (page: Page) => page.locator(".ce-viewer");
const tab = (page: Page, name: RegExp) => page.getByRole("tab", { name });

async function openDex(page: Page): Promise<void> {
  await page.goto("/dev/creatures");
  await expect(screen(page)).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
}

async function openOverview(page: Page, id: string): Promise<void> {
  await openDex(page);
  await page.locator(`.ce-dex-row[data-id="${id}"] .ce-dex-open`).click();
  await expect(page.locator(`.ce-overview[data-creature="${id}"]`)).toBeVisible();
  await expect(viewer(page)).toHaveAttribute("data-viewer", "ready", { timeout: 20_000 });
}

test.describe("도감 → 상세", () => {
  test.use({ ...VIEWPORTS.desktop, account: "dev", devTheme: "neon" });

  test("첫 탭은 도감이고, 줄을 고르면 상세의 도감 정보(일러스트·3D·조우 범위)로 넘어간다", async ({
    page,
  }) => {
    await openDex(page);
    await expect(page.locator("#ce-tab-dex")).toHaveAttribute("aria-selected", "true");
    expect(await page.locator(".ce-dex-row").count()).toBeGreaterThanOrEqual(91);

    // 걸러 보기: 이름 검색
    await page.getByLabel("도감 검색").fill("늑대");
    await expect(page.locator('.ce-dex-row[data-id="wolf"]')).toBeVisible();
    expect(await page.locator(".ce-dex-row").count()).toBeLessThan(10);

    await page.locator('.ce-dex-row[data-id="wolf"] .ce-dex-open').click();
    await expect(page.locator("#ce-tab-detail")).toHaveAttribute("aria-selected", "true");
    await expect(tab(page, /^도감 정보/)).toHaveAttribute("aria-selected", "true");
    const overview = page.locator('.ce-overview[data-creature="wolf"]');
    await expect(overview).toBeVisible();
    await expect(overview.locator(".ce-overview-art img")).toBeVisible();
    // 기본 3D 모델(GLB)이 연결된 크리쳐: GLB 모델이 그려진다
    await expect(viewer(page)).toHaveAttribute("data-viewer", "ready", { timeout: 20_000 });
    await expect(viewer(page)).toHaveAttribute("data-kind", "model", { timeout: 20_000 });
    await expect(viewer(page)).toHaveAttribute("data-model", "ok");
    expect(Number(await viewer(page).getAttribute("data-triangles"))).toBeGreaterThan(0);
    // 1레벨 조우 범위: 회색늑대 STR 7 → 기본 오차 ±1 → 6~8
    await expect(overview.locator(".ce-range-row")).toHaveCount(6);
    await expect(overview.locator('.ce-range-row[data-stat="str"] .ce-range-text')).toContainText("6~8");
    // 상세 탭의 왼쪽 목록은 그대로 있다(옛 화면)
    await expect(page.locator('.ce-table-row[data-selected="true"]')).toHaveCount(1);
  });

  test("주소로 크리쳐를 열면 상세의 기본 탭(초상화)이 바로 뜬다", async ({ page }) => {
    await page.goto("/dev/creatures?creature=wolf");
    await expect(screen(page)).toHaveAttribute("data-status", "ready", { timeout: 20_000 });
    await expect(page.locator("#ce-tab-detail")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".ce-crop-stage")).toBeVisible();
  });

  test("3D 미리 보기: GLB 파일을 연결하면 그 모델을 그리고, 못 읽으면 임시 몸과 알림을 보인다", async ({
    page,
  }) => {
    await page.route("**/creatures/models/e2e_quad.glb", (route) =>
      route.fulfill({ status: 200, contentType: "model/gltf-binary", body: tinyGlb() }),
    );
    await page.route("**/creatures/models/e2e_missing.glb", (route) =>
      route.fulfill({ status: 404, body: "" }),
    );
    await openOverview(page, "wolf");

    await tab(page, /^1\. 기본/).click();
    const modelField = page.getByLabel("모델 파일 이름 또는 경로");
    // 모델 칸을 비우면 임시 몸으로 바뀐다
    await modelField.fill("");
    await tab(page, /^도감 정보/).click();
    await expect(viewer(page)).toHaveAttribute("data-model", "none", { timeout: 20_000 });
    await expect(viewer(page)).toHaveAttribute("data-kind", "placeholder");

    await tab(page, /^1\. 기본/).click();
    await modelField.fill("e2e_quad.glb");
    await tab(page, /^도감 정보/).click();
    await expect(viewer(page)).toHaveAttribute("data-model", "ok", { timeout: 20_000 });
    await expect(viewer(page)).toHaveAttribute("data-kind", "model");
    await expect(viewer(page)).toHaveAttribute("data-triangles", "2");

    await tab(page, /^1\. 기본/).click();
    await modelField.fill("e2e_missing.glb");
    await tab(page, /^도감 정보/).click();
    await expect(viewer(page)).toHaveAttribute("data-model", "failed", { timeout: 20_000 });
    await expect(viewer(page)).toHaveAttribute("data-kind", "placeholder");
    await expect(viewer(page).getByRole("status")).toContainText("읽지 못했습니다");
  });
});

test.describe("스탯 오차·랜덤 분포·전리품", () => {
  test.use({ ...VIEWPORTS.desktop, account: "dev", devTheme: "neon" });

  test("오차(±)를 바꾸면 조우 범위가 따라가고, 랜덤 분포 뽑기는 합을 지키고 고정한 스탯을 그대로 둔다", async ({
    page,
  }) => {
    await openOverview(page, "wolf");
    await tab(page, /^2\. 스탯/).click();
    const row = (stat: string) => page.locator(`.ce-stat-row[data-stat="${stat}"]`);
    await expect(row("str").locator(".ce-stat-range-text")).toHaveText("6~8");
    await numberInput(row("str"), /^오차 ±/).fill("3");
    await expect(row("str").locator(".ce-stat-range-text")).toHaveText("4~10");
    await page.getByRole("button", { name: "오차 기본값으로" }).click();
    await expect(row("str").locator(".ce-stat-range-text")).toHaveText("6~8");

    // 회색늑대(일반 등급) 기본 총합 36, VIT 고정
    const vit = await numberInput(row("vit"), /^체력/).inputValue();
    await page.getByRole("button", { name: new RegExp(`^체력 \\(VIT\\) ${vit}$`) }).click();
    await page.getByRole("button", { name: "랜덤 분포 뽑기" }).click();
    await expect(page.getByText(/^합계 36 · 조우 범위/)).toBeVisible();
    await expect(numberInput(row("vit"), /^체력/)).toHaveValue(vit);
  });

  test("전리품은 아이템을 고르고 획득 확률만 정한다", async ({ page }) => {
    await openOverview(page, "wolf");
    await tab(page, /^4\. 전리품/).click();
    const before = await page.locator(".ce-loot-row").count();
    await expect(page.getByLabel(/수량/)).toHaveCount(0);
    await page.getByLabel("아이템 찾기").fill("iron");
    const picked = await page.locator("#ce-loot-item").inputValue();
    expect(picked).not.toBe("");
    await page.getByRole("button", { name: "+ 전리품 추가" }).click();
    await expect(page.locator(".ce-loot-row")).toHaveCount(before + 1);
    await expect(page.locator(`.ce-loot-row[data-item="${picked}"]`)).toBeVisible();
    await expect(numberInput(page.locator(`.ce-loot-row[data-item="${picked}"]`), /^획득 확률/)).toHaveValue(
      "250",
    );
  });
});

test.describe("변종 그룹", () => {
  test.use({ ...VIEWPORTS.desktop, account: "dev", devTheme: "neon" });

  test("단독 크리쳐에서 변종을 만들어 적용하면 도감에서 대표 아래에 들여 보인다", async ({ page }) => {
    await openOverview(page, "slime");
    await resetCreatures(page);
    try {
      const card = page.locator(".ce-group-card");
      await expect(card).toHaveAttribute("data-members", "1");
      await card.getByRole("button", { name: "+ 변종 추가" }).click();
      await card.getByLabel(/^변종 ID/).fill("slime_e2e_fire");
      await card.getByLabel("한국어 이름").fill("불 슬라임");
      await card.getByLabel("영어 이름").fill("Fire Slime");
      await card.getByLabel("새 주속성").selectOption({ index: 1 });
      await card.getByRole("button", { name: /변종 만들기/ }).click();

      // 만든 변종으로 넘어가고, 그룹에 대표와 변종이 보인다
      await expect(page.locator('.ce-overview[data-creature="slime_e2e_fire"]')).toBeVisible();
      await expect(card).toHaveAttribute("data-root", "slime");
      await expect(card).toHaveAttribute("data-members", "2");

      const apply = page.getByRole("button", { name: /즉시 반영/ });
      await expect(apply).toBeEnabled({ timeout: 15_000 });
      await apply.click();
      await expect(page.getByText(/크리처 변경 1건을 반영했습니다/)).toBeVisible({ timeout: 15_000 });

      await page.locator("#ce-tab-dex").click();
      const rows = page.locator(".ce-dex-row");
      const ids = await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id")));
      const at = ids.indexOf("slime");
      expect(ids[at + 1]).toBe("slime_e2e_fire");
      await expect(page.locator('.ce-dex-row[data-id="slime_e2e_fire"]')).toHaveAttribute("data-depth", "1");
      // 그룹 접기
      await page
        .locator('.ce-dex-row[data-id="slime"]')
        .getByRole("button", { name: /^변종 1/ })
        .click();
      await expect(page.locator('.ce-dex-row[data-id="slime_e2e_fire"]')).toHaveCount(0);
    } finally {
      await resetCreatures(page);
    }
  });
});

const column = (page: Page, stat: string, depth?: 0 | 1) =>
  page
    .locator(
      `${depth === undefined ? ".ce-dex-row" : `.ce-dex-row[data-depth="${depth}"]`} .ce-dex-stat[data-stat="${stat}"] .ce-dex-stat-value`,
    )
    .evaluateAll((nodes) => nodes.map((node) => Number(node.textContent)));
const sums = (page: Page, depth?: 0 | 1) =>
  page
    .locator(`${depth === undefined ? ".ce-dex-row" : `.ce-dex-row[data-depth="${depth}"]`} .ce-sum strong`)
    .evaluateAll((nodes) => nodes.map((node) => Number(node.textContent)));

test.describe("도감 표 — 정렬·필터·속성·기술 슬롯", () => {
  test.use({ ...VIEWPORTS.desktop, account: "dev", devTheme: "neon" });

  test("칸 머리로 줄을 세우고(스탯·합·기술 슬롯), 합 범위와 주속성으로 거른다", async ({ page }) => {
    await openDex(page);
    const total = await page.locator(".ce-dex-row").count();

    // STR 큰 것부터 → 작은 것부터 → 도감 차례 (그룹 묶기 상태에서는 대표 줄이 정렬된다)
    await page.locator('.ce-sort[data-sort="str"]').click();
    const desc = await column(page, "str", 0);
    expect(desc).toEqual(desc.toSorted((a, b) => b - a));
    await page.locator('.ce-sort[data-sort="str"]').click();
    const asc = await column(page, "str", 0);
    expect(asc).toEqual(asc.toSorted((a, b) => a - b));
    await page.locator('.ce-sort[data-sort="str"]').click();
    await expect(page.locator(".ce-dex-row").first()).toHaveAttribute("data-id", "wolf");

    // 그룹 묶기를 끄면 모든 줄이 통째로 정렬된다 (DEX 스탯 — 도감 차례와 이름이 겹치지 않는다)
    await page.getByRole("button", { name: "그룹으로 묶기" }).click();
    await page.locator('.ce-sort[data-sort="dex"]').click();
    const byDex = await column(page, "dex");
    expect(byDex).toEqual(byDex.toSorted((a, b) => b - a));
    expect(new Set(byDex).size).toBeGreaterThan(1);
    await page.locator('.ce-sort[data-sort="dex"]').click();
    await page.locator('.ce-sort[data-sort="dex"]').click();
    await expect(page.locator('.ce-sort[data-active="true"]')).toHaveCount(0);

    await page.locator('.ce-sort[data-sort="sum"]').click();
    const bySum = await sums(page);
    expect(bySum).toEqual(bySum.toSorted((a, b) => b - a));
    await page.locator('.ce-sort[data-sort="sum"]').click();
    await page.locator('.ce-sort[data-sort="sum"]').click();
    await page.getByRole("button", { name: "그룹으로 묶기" }).click();

    // 합 범위
    await page.getByLabel("스탯 합 최소").fill("70");
    const high = await sums(page);
    expect(high.length).toBeGreaterThan(0);
    expect(high.length).toBeLessThan(total);
    expect(Math.min(...high)).toBeGreaterThanOrEqual(70);
    await page.getByRole("button", { name: "필터 초기화" }).click();
    await expect(page.locator(".ce-dex-row")).toHaveCount(total);

    // 주속성(아이콘 단추): 불
    await page.locator('.ce-el-button[data-element="fire"]').click();
    const fire = await page.locator(".ce-dex-row").count();
    expect(fire).toBeGreaterThan(0);
    expect(fire).toBeLessThan(total);
    await page.getByRole("button", { name: "필터 초기화" }).click();

    // 속성 아이콘: 회색늑대 = 땅(기본형), 강철 골렘 = 크리스탈(강화형 표시), 기술 슬롯
    const wolf = page.locator('.ce-dex-row[data-id="wolf"]');
    await expect(wolf.locator('.ce-el-chip[data-element="earth"]')).toHaveCount(1);
    await expect(wolf.locator('.ce-el-chip[data-element="earth"]')).not.toHaveAttribute(
      "data-enhanced",
      "true",
    );
    await expect(wolf.locator(".ce-slots")).toHaveAttribute("data-slots", "4");
    await expect(
      page.locator('.ce-dex-row[data-id="iron_golem"] .ce-el-chip[data-element="crystal"]'),
    ).toHaveAttribute("data-enhanced", "true");
  });
});

test.describe("분류 편집(대·중·소)", () => {
  test.use({ ...VIEWPORTS.desktop, account: "dev", devTheme: "neon" });

  test("중분류를 더하고 크리쳐를 골라 옮겨 적용하면 분류 띠에서 그 분류로 거른다", async ({ page }) => {
    await openDex(page);
    await resetCreatures(page);
    try {
      await page.getByRole("button", { name: "분류 편집" }).click();
      const beast = page.locator('.ce-class-row[data-class="beast"]');
      await beast.getByRole("button", { name: "+ 하위 분류" }).click();
      await page.locator("#ce-class-new-id-beast").fill("e2e_wolves");
      await page.locator("#ce-class-new-ko-beast").fill("늑대류");
      await page.locator("#ce-class-new-en-beast").fill("Wolves");
      await page.getByRole("button", { name: "야수 아래에 넣기" }).click();
      await expect(page.locator('.ce-class-row[data-class="e2e_wolves"]')).toHaveAttribute("data-depth", "2");

      // 소분류까지: 늑대류 아래
      await page
        .locator('.ce-class-row[data-class="e2e_wolves"]')
        .getByRole("button", { name: "+ 하위 분류" })
        .click();
      await page.locator("#ce-class-new-id-e2e_wolves").fill("e2e_dire_wolves");
      await page.locator("#ce-class-new-ko-e2e_wolves").fill("방랑늑대류");
      await page.getByRole("button", { name: "늑대류 아래에 넣기" }).click();
      const small = page.locator('.ce-class-row[data-class="e2e_dire_wolves"]');
      await expect(small).toHaveAttribute("data-depth", "3");
      // 셋째 단계에는 하위 분류를 더 넣지 못한다
      await expect(small.getByRole("button", { name: "+ 하위 분류" })).toHaveCount(0);

      // 크리쳐 둘을 골라 늑대류로 옮긴다
      await page.getByLabel("회색늑대 고르기").check();
      await page.getByLabel("방랑대늑대 고르기").check();
      await page.getByLabel("옮길 분류").selectOption("e2e_wolves");
      await page.getByRole("button", { name: "이 분류로 옮기기" }).click();

      const apply = page.getByRole("button", { name: /즉시 반영/ });
      await expect(apply).toBeEnabled({ timeout: 15_000 });
      await apply.click();
      await expect(page.getByText(/크리처 변경 4건을 반영했습니다/)).toBeVisible({ timeout: 15_000 });

      // 분류 편집 머리의 [닫기] 단추로 닫힌다
      await page.locator(".ce-class-editor").getByRole("button", { name: "닫기" }).click();
      await expect(page.locator(".ce-class-editor")).toHaveCount(0);

      // 분류 띠: 야수 → 늑대류 2종
      await page.locator('.ce-class-card[data-class="beast"]').click();
      await page.locator('.ce-class-chips .ce-tag-chip[data-class="e2e_wolves"]').click();
      await expect(page.locator(".ce-dex-row")).toHaveCount(2);
      await expect(page.locator('.ce-dex-row[data-id="wolf"] .ce-dex-class')).toHaveText("야수 › 늑대류");
    } finally {
      await resetCreatures(page);
    }
  });
});

test.describe("사진", () => {
  for (const devTheme of ["neon", "light"] as const satisfies readonly DevTheme[]) {
    test.describe(`1440 ${devTheme}`, () => {
      test.use({ ...VIEWPORTS.desktop, account: "dev", devTheme });
      test("도감 탭·도감 정보 탭", async ({ page }) => {
        await openDex(page);
        await shot(page, `creatures-dex-1440-${devTheme}`);
        if (devTheme === "neon") {
          await page.getByRole("button", { name: "분류 편집" }).click();
          await expect(page.locator(".ce-class-editor")).toBeVisible();
          await shot(page, "creatures-classes-1440-neon");
          await page.locator(".ce-class-editor").getByRole("button", { name: "닫기" }).click();
        }
        await page.locator('.ce-dex-row[data-id="wolf"] .ce-dex-open').click();
        await expect(viewer(page)).toHaveAttribute("data-kind", "model", { timeout: 20_000 });
        await page.getByRole("button", { name: "돌림판" }).click();
        await expect
          .poll(() =>
            page
              .locator(".ce-overview-art img")
              .evaluate((img) => img instanceof HTMLImageElement && img.complete),
          )
          .toBe(true);
        await shot(page, `creatures-overview-1440-${devTheme}`, { fullPage: true });
        await tab(page, /^2\. 스탯/).click();
        await shot(page, `creatures-stats-1440-${devTheme}`, { fullPage: true });
        await tab(page, /^4\. 전리품/).click();
        await shot(page, `creatures-loot-1440-${devTheme}`, { fullPage: true });
      });
    });
  }

  test.describe("390 neon", () => {
    test.use({ ...VIEWPORTS.phone, account: "dev", devTheme: "neon" });
    test("도감 탭·도감 정보 탭(가로 넘침 없음)", async ({ page }) => {
      await openDex(page);
      expect(await horizontalOverflow(page)).toEqual([]);
      await shot(page, "creatures-dex-390-neon");
      await page.locator('.ce-dex-row[data-id="wolf"] .ce-dex-open').click();
      await expect(viewer(page)).toHaveAttribute("data-kind", "model", { timeout: 20_000 });
      await page.getByRole("button", { name: "돌림판" }).click();
      expect(await horizontalOverflow(page)).toEqual([]);
      await shot(page, "creatures-overview-390-neon", { fullPage: true });
    });
  });
});
