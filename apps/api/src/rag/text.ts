// 문서를 검색 단위(chunk)로 나눈다: 빈 줄 기준으로 문단을 나누고,
// maxChars 보다 긴 문단은 문장 끝이나 공백 근처에서 잘라 여러 조각으로 만든다.
export function chunkText(text: string, maxChars = 500): string[] {
  const chunks: string[] = [];
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');

  for (const paragraph of paragraphs) {
    let rest = paragraph;
    while (rest.length > maxChars) {
      const window = rest.slice(0, maxChars);
      // 뒤쪽 절반 안에서 문장 끝 > 공백 순으로 자를 자리를 찾는다
      const half = Math.floor(maxChars / 2);
      let cut = Math.max(
        window.lastIndexOf('. '),
        window.lastIndexOf('? '),
        window.lastIndexOf('! '),
        window.lastIndexOf('\n'),
      );
      if (cut < half) cut = window.lastIndexOf(' ');
      const end = cut < half ? maxChars : cut + 1;
      chunks.push(rest.slice(0, end).trim());
      rest = rest.slice(end).trim();
    }
    if (rest !== '') chunks.push(rest);
  }
  return chunks;
}

// 검색용 토큰: 소문자 단어. 한글 단어는 조사가 붙어도 매칭되도록 2글자 조각(bigram)도 함께 넣는다.
export function tokenize(text: string): string[] {
  const words = text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const tokens: string[] = [];
  for (const word of words) {
    tokens.push(word);
    if (word.length >= 2 && /\p{Script=Hangul}/u.test(word)) {
      for (let i = 0; i < word.length - 1; i++) {
        tokens.push(word.slice(i, i + 2));
      }
    }
  }
  return tokens;
}
