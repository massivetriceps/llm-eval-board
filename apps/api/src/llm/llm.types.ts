export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface LlmResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface LlmProvider {
  generate(
    model: string,
    prompt: string,
    options: GenerateOptions,
  ): Promise<LlmResult>;
}

export const PROVIDERS = ['openai', 'gemini'] as const;
export type ProviderName = (typeof PROVIDERS)[number];
