// 편집기 입력 조작 순수 계산(시험: contentEditorNumeric.test.ts) — docs/adr/2026-11-10-editor-input-controls.md.
// - 수 조작: 막대 범위 고르기(선형·로그·좁힌 창), 자리 ↔ 값, 한 걸음 크기, 끌어서 바꾸기(scrub) 걸음 수.
// - 합이 정해진 묶음(확률·가중치): 한 칸을 바꾸면 차이를 잠그지 않은 나머지에 지금 몫대로 나눈다(합은 늘 그대로), 경계 옮기기, 균등, 합 맞춤.
// - 표 묶음 바꾸기: 값으로·더하기·곱하기(%)·선형 채우기·등비 채우기, 끌어 채우기, 곡선(작은 막대) 높이.
// 저장하는 값은 모두 정수다(‰·bp·최소 단위). 화면에 보이는 기대값·백분율만 실수다. 판정 코드가 아니라 Math.log·exp를 쓴다(기기 화면 전용).

export const clampInt = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)));

/** 막대 눈금: 선형 또는 로그(넓은 범위) */
export type NumberScale = "linear" | "log";

export interface SliderRange {
  readonly min: number;
  readonly max: number;
  readonly scale: NumberScale;
  /** 기술 범위보다 좁힌 창(값 둘레)인가 */
  readonly soft: boolean;
}

/** 이 폭까지는 기술 범위 전체를 선형 막대로 */
export const LINEAR_SPAN_MAX = 10_000;
/** 이 폭까지(0 이상 범위)는 기술 범위 전체를 로그 막대로. 더 넓으면 값 둘레 창 */
export const LOG_SPAN_MAX = 10_000_000;
/** 창 폭 = 값(또는 팩 값)의 몇 배 */
const SOFT_FACTOR = 4;
const SOFT_FLOOR = 25;

/** x 이상인 가장 작은 1·2·5 × 10^k */
export function niceCeil(x: number): number {
  if (!(x > 1)) return 1;
  const pow = 10 ** Math.floor(Math.log10(x));
  for (const lead of [1, 2, 5, 10]) if (lead * pow >= x) return lead * pow;
  return 10 * pow;
}

/** x 이하인 가장 큰 1·2·5 × 10^k(1 이상) */
export function niceFloor(x: number): number {
  if (!(x > 1)) return 1;
  const pow = 10 ** Math.floor(Math.log10(x));
  for (const lead of [5, 2, 1]) if (lead * pow <= x) return lead * pow;
  return pow;
}

/**
 * 막대가 덮을 범위와 눈금.
 * - 폭 ≤ 10,000: 기술 범위 전체, 선형.
 * - 0 이상이고 폭 ≤ 1,000만: 기술 범위 전체, 로그.
 * - 그보다 넓거나 음수를 받는 넓은 범위: 값·팩 값의 4배 둘레 창(선형). 창 끝에 닿으면 놓은 뒤 창이 다시 넓어진다.
 */
export function sliderRange(input: {
  readonly min: number;
  readonly max: number;
  readonly value?: number | undefined;
  readonly pack?: number | undefined;
  readonly scale?: NumberScale | undefined;
  readonly soft?: readonly [number, number] | undefined;
}): SliderRange {
  const { min, max } = input;
  if (input.soft) {
    const lo = clampInt(input.soft[0], min, max);
    const hi = clampInt(Math.max(input.soft[1], lo + 1), min, max);
    return { min: lo, max: hi, scale: input.scale ?? "linear", soft: lo !== min || hi !== max };
  }
  const span = max - min;
  if (input.scale === "log" && min >= 0) return { min, max, scale: "log", soft: false };
  if (span <= LINEAR_SPAN_MAX) return { min, max, scale: "linear", soft: false };
  if (input.scale === undefined && min >= 0 && span <= LOG_SPAN_MAX)
    return { min, max, scale: "log", soft: false };
  const anchor = Math.max(Math.abs(input.value ?? 0), Math.abs(input.pack ?? 0), SOFT_FLOOR);
  const reach = niceCeil(anchor * SOFT_FACTOR);
  const lo = min >= 0 ? min : Math.max(min, -reach);
  const hi = Math.min(max, Math.max(lo + 1, min >= 0 ? Math.max(min + reach, reach) : reach));
  return { min: lo, max: hi, scale: "linear", soft: lo !== min || hi !== max };
}

/** 한 걸음(단추·화살표·끌어서 바꾸기): 선형은 폭에 맞춘 1·2·5 걸음(폭 ≤ 1000이면 1), 로그는 지금 값의 1/20쯤 */
export function stepOf(range: SliderRange, value: number): number {
  if (range.scale === "log") return niceFloor(Math.abs(value) / 20);
  const span = range.max - range.min;
  return span <= 1000 ? 1 : niceFloor(span / 200);
}

/** 유효 숫자 두 자리로 맞춘 정수(로그 막대의 값) */
export function roundSig2(value: number): number {
  const abs = Math.abs(value);
  if (abs < 100) return Math.round(value);
  const pow = 10 ** (Math.floor(Math.log10(abs)) - 1);
  return Math.round(value / pow) * pow;
}

/** 값 → 막대 위 자리(0~1). 범위 밖은 끝에 붙는다 */
export function valueToPos(value: number, range: SliderRange): number {
  const span = range.max - range.min;
  if (span <= 0) return 0;
  const at = Math.min(range.max, Math.max(range.min, value)) - range.min;
  if (range.scale === "log") return Math.log1p(at) / Math.log1p(span);
  return at / span;
}

/** 막대 위 자리(0~1) → 값(정수). 선형은 걸음에 맞추고, 로그는 유효 숫자 두 자리 */
export function posToValue(pos: number, range: SliderRange, step = 1): number {
  const span = range.max - range.min;
  const at = Math.min(1, Math.max(0, pos));
  if (span <= 0) return range.min;
  if (range.scale === "log") {
    const raw = range.min + Math.expm1(at * Math.log1p(span));
    return clampInt(roundSig2(raw), range.min, range.max);
  }
  const unit = Math.max(1, Math.round(step));
  const raw = at * span;
  // 끝에서는 걸음에 안 맞아도 끝 값을 낸다
  if (at >= 1) return range.max;
  return clampInt(range.min + Math.round(raw / unit) * unit, range.min, range.max);
}

/** 조작 보조 키: Shift = 10배, Alt = 잘게(1) */
export interface StepMods {
  readonly shift?: boolean | undefined;
  readonly alt?: boolean | undefined;
}

/** 보조 키를 얹은 걸음 */
export function stepWithMods(step: number, mods: StepMods): number {
  const base = mods.alt ? 1 : Math.max(1, step);
  return mods.shift ? base * 10 : base;
}

/** 끌어서 바꾸기: 가로로 끈 화소 → 더할 값(4화소에 한 걸음, Alt는 8화소에 1) */
export function scrubDelta(dx: number, step: number, mods: StepMods): number {
  const perStep = mods.alt ? 8 : 4;
  return Math.trunc(dx / perStep) * stepWithMods(step, mods);
}

// ── 합이 정해진 묶음 ──

const sumOf = (values: readonly number[]): number => values.reduce((acc, value) => acc + value, 0);

const cleanParts = (values: readonly number[]): number[] =>
  values.map((value) => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0));

/**
 * amount(0 이상 정수)를 weights 몫대로 정수로 나눈다(합 = amount). 버린 소수가 큰 칸부터 1씩, 같으면 몫이 큰 칸·앞 칸 먼저.
 * 몫이 모두 0이면 고르게 나눈다
 */
export function spread(amount: number, weights: readonly number[]): number[] {
  const count = weights.length;
  if (count === 0) return [];
  const total = Math.max(0, Math.round(amount));
  const clean = cleanParts(weights);
  const weightSum = sumOf(clean);
  const basis = weightSum > 0 ? clean : clean.map(() => 1);
  const basisSum = weightSum > 0 ? weightSum : count;
  const out = basis.map((weight) => Math.floor((total * weight) / basisSum));
  let rest = total - sumOf(out);
  const order = basis
    .map((weight, index) => ({ index, frac: (total * weight) % basisSum, weight }))
    .toSorted((a, b) => b.frac - a.frac || b.weight - a.weight || a.index - b.index);
  for (let i = 0; rest > 0 && i < order.length; i++) {
    const item = order[i];
    if (!item) continue;
    out[item.index] = (out[item.index] ?? 0) + 1;
    rest -= 1;
  }
  return out;
}

const NO_LOCKS: ReadonlySet<number> = new Set();

/**
 * 합 맞춤: 잠그지 않은 칸을 지금 몫대로 줄이거나 늘려 합을 total로 맞춘다. 잠근 칸의 합이 total을 넘으면 잠금을 무시하고 전체를 맞춘다
 */
export function normalizeParts(
  values: readonly number[],
  total: number,
  locked: ReadonlySet<number> = NO_LOCKS,
): number[] {
  const parts = cleanParts(values);
  const lockedSum = sumOf(parts.filter((_, index) => locked.has(index)));
  const free = parts.map((_, index) => index).filter((index) => !locked.has(index));
  if (free.length === 0 || lockedSum > total) return spread(total, parts);
  const shares = spread(
    total - lockedSum,
    free.map((index) => parts[index] ?? 0),
  );
  free.forEach((index, order) => {
    parts[index] = shares[order] ?? 0;
  });
  return parts;
}

/**
 * 한 칸을 바꾼다(합은 total 그대로): 그 칸 = 0 ~ (total − 잠근 칸 합)으로 자르고, 남은 양을 잠그지 않은 나머지에 base의 몫대로 나눈다.
 * base는 조작을 시작할 때의 묶음이다(끄는 동안 같은 base에서 다시 셈해야 반올림이 쌓이지 않는다).
 * 나눌 칸이 없으면(나머지가 모두 잠김) 그 칸은 남은 양으로 정해진다
 */
export function redistribute(
  base: readonly number[],
  index: number,
  raw: number,
  total: number,
  locked: ReadonlySet<number> = NO_LOCKS,
): number[] {
  const parts = cleanParts(base);
  if (index < 0 || index >= parts.length) return normalizeParts(parts, total, locked);
  const others = parts.map((_, at) => at).filter((at) => at !== index && !locked.has(at));
  const lockedSum = sumOf(parts.filter((_, at) => at !== index && locked.has(at)));
  const room = total - lockedSum;
  if (room < 0) return normalizeParts(parts, total);
  const value = others.length === 0 ? room : clampInt(raw, 0, room);
  const shares = spread(
    room - value,
    others.map((at) => parts[at] ?? 0),
  );
  parts[index] = value;
  others.forEach((at, order) => {
    parts[at] = shares[order] ?? 0;
  });
  return parts;
}

/**
 * 쌓은 막대의 경계를 옮긴다: delta > 0이면 left가 커지고 right부터 오른쪽 칸들이 차례로 줄어든다(0이 되면 다음 칸을 민다),
 * delta < 0이면 right가 커지고 left부터 왼쪽 칸들이 줄어든다. 잠근 칸은 건너뛴다. left·right가 잠겼으면 그대로다. 합은 바뀌지 않는다
 */
export function moveBoundary(
  base: readonly number[],
  left: number,
  right: number,
  delta: number,
  locked: ReadonlySet<number> = NO_LOCKS,
): number[] {
  const parts = cleanParts(base);
  const amount = Math.round(delta);
  if (amount === 0 || left < 0 || right >= parts.length || left >= right) return parts;
  if (locked.has(left) || locked.has(right)) return parts;
  const grow = amount > 0 ? left : right;
  const donors: number[] = [];
  if (amount > 0) {
    for (let at = right; at < parts.length; at++) if (!locked.has(at)) donors.push(at);
  } else {
    for (let at = left; at >= 0; at--) if (!locked.has(at)) donors.push(at);
  }
  let want = Math.abs(amount);
  for (const at of donors) {
    if (want <= 0) break;
    const take = Math.min(parts[at] ?? 0, want);
    parts[at] = (parts[at] ?? 0) - take;
    parts[grow] = (parts[grow] ?? 0) + take;
    want -= take;
  }
  return parts;
}

/** 균등: 잠그지 않은 칸(only가 있으면 그 안에서)에 남은 양을 고르게 나눈다(나머지는 앞 칸부터 1씩). only 밖의 잠그지 않은 칸은 0 */
export function equalize(
  values: readonly number[],
  total: number,
  locked: ReadonlySet<number> = NO_LOCKS,
  only?: ReadonlySet<number>,
): number[] {
  const parts = cleanParts(values);
  const lockedSum = sumOf(parts.filter((_, index) => locked.has(index)));
  const free = parts.map((_, index) => index).filter((index) => !locked.has(index));
  const targets = only ? free.filter((index) => only.has(index)) : free;
  if (targets.length === 0 || lockedSum > total) return normalizeParts(parts, total, locked);
  for (const index of free) parts[index] = 0;
  const shares = spread(
    total - lockedSum,
    targets.map(() => 1),
  );
  targets.forEach((index, order) => {
    parts[index] = shares[order] ?? 0;
  });
  return parts;
}

/** 기대 차례(평균 티어 등): Σ(차례 × 몫) ÷ Σ몫. 합이 0이면 null. 보이기만 하는 실수 */
export function expectedIndex(values: readonly number[]): number | null {
  const parts = cleanParts(values);
  const total = sumOf(parts);
  if (total <= 0) return null;
  return parts.reduce((acc, value, index) => acc + value * index, 0) / total;
}

/** 몫 글(백분율, 소수 한 자리) */
export function shareText(value: number, total: number): string {
  if (total <= 0) return "0%";
  const tenths = Math.round((value * 1000) / total);
  return `${Math.trunc(tenths / 10)}.${Math.abs(tenths % 10)}%`;
}

// ── 표 묶음 바꾸기 ──

export type BulkOp =
  | { readonly kind: "set"; readonly value: number }
  | { readonly kind: "add"; readonly value: number }
  /** 지금 값 × percent ÷ 100 (반올림) */
  | { readonly kind: "scale"; readonly percent: number }
  /** 고른 첫 칸과 끝 칸 사이를 같은 차이로 */
  | { readonly kind: "linear" }
  /** 고른 첫 칸과 끝 칸 사이를 같은 비율로(두 끝이 양수일 때. 아니면 선형) */
  | { readonly kind: "geometric" };

export interface IntLimits {
  readonly min: number;
  readonly max: number;
}

/** 한 줄(열 하나·사다리)의 고른 칸에 묶음 바꾸기를 한다. picked = 칸 차례(오름차순으로 다시 세운다). 결과는 범위 안 정수 */
export function bulkApply(
  values: readonly number[],
  picked: readonly number[],
  op: BulkOp,
  limits: IntLimits,
): number[] {
  const out = [...values];
  const cells = [...new Set(picked)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < values.length)
    .toSorted((a, b) => a - b);
  if (cells.length === 0) return out;
  const fit = (value: number): number => clampInt(value, limits.min, limits.max);
  if (op.kind === "linear" || op.kind === "geometric") {
    const first = values[cells[0] ?? 0] ?? 0;
    const last = values[cells.at(-1) ?? 0] ?? 0;
    const steps = cells.length - 1;
    if (steps < 1) return out;
    const ratio = op.kind === "geometric" && first > 0 && last > 0;
    cells.forEach((index, order) => {
      const t = order / steps;
      out[index] = fit(ratio ? first * Math.exp(Math.log(last / first) * t) : first + (last - first) * t);
    });
    // 두 끝은 그대로(반올림으로 흔들리지 않게)
    out[cells[0] ?? 0] = fit(first);
    out[cells.at(-1) ?? 0] = fit(last);
    return out;
  }
  for (const index of cells) {
    const now = values[index] ?? 0;
    out[index] =
      op.kind === "set"
        ? fit(op.value)
        : op.kind === "add"
          ? fit(now + op.value)
          : fit((now * op.percent) / 100);
  }
  return out;
}

/** 끌어 채우기: from 칸의 값을 from~to 사이 칸에 넣는다 */
export function dragFill(values: readonly number[], from: number, to: number): number[] {
  const out = [...values];
  const source = values[from];
  if (source === undefined) return out;
  const lo = Math.max(0, Math.min(from, to));
  const hi = Math.min(values.length - 1, Math.max(from, to));
  for (let index = lo; index <= hi; index++) out[index] = source;
  return out;
}

/** 곡선(작은 막대) 높이 0~1: 바닥 = min(0, 가장 작은 값), 천장 = 가장 큰 값. 모두 같으면 값이 0보다 클 때 1 */
export function sparkHeights(values: readonly number[]): number[] {
  if (values.length === 0) return [];
  const floor = Math.min(0, ...values);
  const top = Math.max(...values);
  const span = top - floor;
  if (span <= 0) return values.map(() => 0);
  return values.map((value) => (value - floor) / span);
}

/** 곡선이 한 방향인가(늘기만·줄기만·평평) — 꺾인 곳을 알리는 데 쓴다 */
export function curveShape(values: readonly number[]): "flat" | "up" | "down" | "mixed" {
  let up = false;
  let down = false;
  for (let index = 1; index < values.length; index++) {
    const diff = (values[index] ?? 0) - (values[index - 1] ?? 0);
    if (diff > 0) up = true;
    if (diff < 0) down = true;
  }
  return up && down ? "mixed" : up ? "up" : down ? "down" : "flat";
}

/** 표 칸 열쇠("줄:열") */
export const cellKey = (row: number, col: number): string => `${row}:${col}`;

/** 두 칸을 모서리로 하는 네모 안의 칸 열쇠 */
export function rectKeys(a: readonly [number, number], b: readonly [number, number]): string[] {
  const keys: string[] = [];
  for (let row = Math.min(a[0], b[0]); row <= Math.max(a[0], b[0]); row++)
    for (let col = Math.min(a[1], b[1]); col <= Math.max(a[1], b[1]); col++) keys.push(cellKey(row, col));
  return keys;
}

/** 고른 칸 열쇠 → 열마다 줄 차례(오름차순) */
export function pickedByColumn(picked: Iterable<string>): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (const key of picked) {
    const [row, col] = key.split(":").map(Number);
    if (row === undefined || col === undefined || !Number.isInteger(row) || !Number.isInteger(col)) continue;
    out.set(col, [...(out.get(col) ?? []), row]);
  }
  for (const [col, rows] of out)
    out.set(
      col,
      rows.toSorted((a, b) => a - b),
    );
  return out;
}
