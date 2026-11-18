// 숫자 환경변수를 읽는다. 없거나 0 이하, 숫자가 아니면 기본값을 쓴다
export function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
