import { Bm25Index } from './bm25';
import { chunkText, tokenize } from './text';

describe('chunkText', () => {
  it('빈 줄 기준으로 문단을 나눈다', () => {
    expect(chunkText('첫째 문단\n\n둘째 문단\r\n\r\n\n셋째')).toEqual([
      '첫째 문단',
      '둘째 문단',
      '셋째',
    ]);
  });

  it('긴 문단은 maxChars 이하로 자른다', () => {
    const sentence = 'This is a sentence. ';
    const chunks = chunkText(sentence.repeat(30), 100);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
  });

  it('공백이 없는 긴 글도 잘라서 내용이 사라지지 않는다', () => {
    const chunks = chunkText('a'.repeat(250), 100);
    expect(chunks.join('')).toBe('a'.repeat(250));
  });

  it('빈 입력은 빈 배열이다', () => {
    expect(chunkText('  \n\n  ')).toEqual([]);
  });
});

describe('tokenize', () => {
  it('소문자 단어로 나누고 문장부호는 버린다', () => {
    expect(tokenize("Hello, World's 2026!")).toEqual(['hello', 'world', 's', '2026']);
  });

  it('한글 단어는 2글자 조각도 넣는다', () => {
    expect(tokenize('서울시')).toEqual(['서울시', '서울', '울시']);
  });
});

describe('Bm25Index', () => {
  const docs = [
    'The Zorblax engine runs on purple hydrogen.',
    'Mount Quillon is the tallest peak on the island of Verra.',
    'The Marlow library opens at nine and closes at five.',
  ];
  const index = new Bm25Index(docs);

  it('질문과 관련 있는 문단을 1등으로 찾는다', () => {
    expect(index.search('Which is the tallest peak on Verra?', 3)[0].index).toBe(1);
    expect(index.search('What fuel does the Zorblax engine use?', 3)[0].index).toBe(0);
  });

  it('topK 개까지만 돌려주고 점수는 내림차순이다', () => {
    const hits = index.search('the engine library peak', 2);
    expect(hits.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
  });

  it('겹치는 단어가 없으면 빈 배열이다', () => {
    expect(index.search('completely unrelated xyzzy', 3)).toEqual([]);
  });

  it('문서가 없어도 오류 없이 빈 배열이다', () => {
    expect(new Bm25Index([]).search('anything', 3)).toEqual([]);
  });

  it('한글 조사가 붙어도 찾는다', () => {
    const korean = new Bm25Index(['서울은 대한민국의 수도입니다.', '부산은 항구 도시입니다.']);
    expect(korean.search('대한민국의 수도는?', 1)[0].index).toBe(0);
  });
});
