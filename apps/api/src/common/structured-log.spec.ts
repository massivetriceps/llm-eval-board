import { log } from './structured-log';

describe('structured log', () => {
  const original = process.env.LOG_LEVEL;
  afterEach(() => {
    if (original === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = original;
  });

  it('writes one JSON line with event, level and fields', () => {
    delete process.env.LOG_LEVEL;
    const lines: string[] = [];
    log('info', 'item.done', { runId: 'r1', attempts: 2 }, (line) => lines.push(line));
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(parsed).toMatchObject({ level: 'info', event: 'item.done', runId: 'r1', attempts: 2 });
    expect(typeof parsed.ts).toBe('string');
  });

  it('does not let fields override event or level', () => {
    const lines: string[] = [];
    log('warn', 'real', { event: 'fake', level: 'debug' }, (line) => lines.push(line));
    expect(JSON.parse(lines[0])).toMatchObject({ event: 'real', level: 'warn' });
  });

  it('serializes Error values as their message', () => {
    const lines: string[] = [];
    log('error', 'run.crashed', { error: new Error('boom') }, (line) => lines.push(line));
    expect(JSON.parse(lines[0])).toMatchObject({ error: 'boom' });
  });

  it('respects LOG_LEVEL', () => {
    const lines: string[] = [];
    process.env.LOG_LEVEL = 'warn';
    log('info', 'skipped', {}, (line) => lines.push(line));
    log('warn', 'kept', {}, (line) => lines.push(line));
    expect(lines).toHaveLength(1);
    process.env.LOG_LEVEL = 'silent';
    log('error', 'silenced', {}, (line) => lines.push(line));
    expect(lines).toHaveLength(1);
  });
});
