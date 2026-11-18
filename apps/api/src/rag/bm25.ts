import { tokenize } from './text';

export interface SearchHit {
  // 생성할 때 넘긴 문서 배열에서의 위치
  index: number;
  score: number;
}

// 임베딩 없이 단어 빈도로 순위를 매기는 BM25. 같은 입력이면 항상 같은 결과가 나온다.
export class Bm25Index {
  private readonly termFreqs: Map<string, number>[];
  private readonly docLengths: number[];
  private readonly docFreq = new Map<string, number>();
  private readonly avgLength: number;

  constructor(
    documents: string[],
    private readonly k1 = 1.5,
    private readonly b = 0.75,
  ) {
    this.termFreqs = documents.map((document) => {
      const freqs = new Map<string, number>();
      for (const token of tokenize(document)) {
        freqs.set(token, (freqs.get(token) ?? 0) + 1);
      }
      return freqs;
    });
    this.docLengths = this.termFreqs.map((freqs) =>
      [...freqs.values()].reduce((sum, count) => sum + count, 0),
    );
    for (const freqs of this.termFreqs) {
      for (const term of freqs.keys()) {
        this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1);
      }
    }
    const total = this.docLengths.reduce((sum, length) => sum + length, 0);
    this.avgLength = documents.length > 0 ? total / documents.length : 0;
  }

  // 점수가 0 보다 큰 문서만 높은 순서로 돌려준다 (동점이면 앞에 있는 문서가 먼저)
  search(query: string, topK: number): SearchHit[] {
    const queryTerms = [...new Set(tokenize(query))];
    const total = this.termFreqs.length;
    const hits: SearchHit[] = [];
    for (let index = 0; index < total; index++) {
      let score = 0;
      for (const term of queryTerms) {
        const tf = this.termFreqs[index].get(term);
        if (!tf) continue;
        const df = this.docFreq.get(term) ?? 0;
        const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
        const norm =
          1 - this.b + (this.b * this.docLengths[index]) / (this.avgLength || 1);
        score += (idf * tf * (this.k1 + 1)) / (tf + this.k1 * norm);
      }
      if (score > 0) hits.push({ index, score });
    }
    hits.sort((a, b) => b.score - a.score || a.index - b.index);
    return hits.slice(0, topK);
  }
}
