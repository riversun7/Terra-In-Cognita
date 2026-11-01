// 입력이 멈춘 뒤 한 번 부르기 — key가 바뀔 때마다 새로 붙어 delay 뒤에 run을 한 번 부른다(아이템 편집기의 서버 검사·미리 보기).
// 붙을 때의 run을 들고 있으므로 효과 의존성이 바뀌지 않는다(그리는 동안 새 함수가 와도 다시 걸지 않는다).
import { useEffect, useState } from "react";

export function DebouncedTask({ delay, run }: { delay: number; run: () => void }) {
  const [task] = useState(() => run);
  useEffect(() => {
    const timer = setTimeout(task, delay);
    return () => clearTimeout(timer);
  }, [task, delay]);
  return null;
}
