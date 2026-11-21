// 월드 하트비트(10초): 살아 있음 표시를 쓰고 주기 일을 돌린다. world.ts에서 꺼냈다(줄 수 상한) — 가문 시야 묶음 다시 읽기(houseTies.ts),
// 비접속 유저 유닛 관리인(labor/offlineSteward.ts)이 여기 붙는다. 주기 일이 던진 오류는 기록만 하고 다음 박자에 다시 돈다.
export function startHeartbeat(o: {
  readonly everyMs: number;
  /** 살아 있음 표시 쓰기 */
  readonly beat: () => void;
  /** 박자마다 도는 일(이름 → 일) */
  readonly tasks: Readonly<Record<string, () => Promise<unknown>>>;
  readonly log: { warn(obj: object, message: string): void };
}): ReturnType<typeof setInterval> {
  o.beat();
  const timer = setInterval(() => {
    o.beat();
    for (const [name, task] of Object.entries(o.tasks))
      task().catch((error: unknown) => o.log.warn({ err: error }, `${name} failed`));
  }, o.everyMs);
  timer.unref();
  return timer;
}
