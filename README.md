# llm-eval-board

LLM 모델·프롬프트 비교 평가 대시보드. 같은 평가셋을 여러 모델/프롬프트로 실행하고, 정확도·비용·지연·실패율(KPI)을 한 화면에서 비교합니다.

> 🚧 개발 중

## KPI
| 지표 | 정의 |
|---|---|
| 정확도 | 정답 일치 또는 LLM-judge 점수 평균 |
| 비용 | 실행당 토큰 사용량 × 모델 단가 |
| 지연 | 요청~응답 완료 시간 (p50 / p95) |
| 실패율 | 타임아웃·API 오류로 실패한 요청 비율 |

## Tech Stack
- Frontend: React, Vite, TypeScript, Tailwind
- Backend: NestJS, Prisma
- DB: PostgreSQL
- Infra: Docker Compose, GitHub Actions

## Getting Started
```bash
docker compose up -d        # PostgreSQL
cd apps/api && cp ../../.env.example .env
npm install && npx prisma migrate dev
npm run start:dev
```
