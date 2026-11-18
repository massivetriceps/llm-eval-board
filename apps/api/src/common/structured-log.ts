// 한 줄에 JSON 하나를 쓰는 구조화 로그. runId 같은 값을 필드로 남겨서
// `grep runId` 나 로그 수집기에서 한 실행의 흐름을 그대로 따라갈 수 있게 한다.
// LOG_LEVEL: debug | info(기본) | warn | error | silent

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

const ORDER: Record<LogLevel | 'silent', number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return ORDER[configured as keyof typeof ORDER] ?? ORDER.info;
}

export type LogWriter = (line: string) => void;

const stdoutWriter: LogWriter = (line) => {
  process.stdout.write(`${line}\n`);
};

// Error 객체는 JSON.stringify 하면 비어 보이므로 메시지만 남긴다
function replacer(_key: string, value: unknown): unknown {
  return value instanceof Error ? value.message : value;
}

export function log(
  level: LogLevel,
  event: string,
  fields: LogFields = {},
  write: LogWriter = stdoutWriter,
): void {
  if (ORDER[level] < threshold()) return;
  // 필드가 event/level/ts 를 덮어쓰지 못하도록 뒤에 둔다
  write(
    JSON.stringify({ ...fields, ts: new Date().toISOString(), level, event }, replacer),
  );
}
