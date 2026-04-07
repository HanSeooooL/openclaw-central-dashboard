import type { SessionInfo } from "./types";

// ─────────────────────────────────────────
// 단가 테이블 ($ per 1M tokens)
// ─────────────────────────────────────────

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus":        { inputPer1M: 15,    outputPer1M: 75 },
  "claude-sonnet":      { inputPer1M: 3,     outputPer1M: 15 },
  "claude-haiku":       { inputPer1M: 0.8,   outputPer1M: 4 },
  "gpt-5":              { inputPer1M: 10,    outputPer1M: 30 },
  "gpt-4.1-mini":       { inputPer1M: 0.4,   outputPer1M: 1.6 },
  "gpt-4.1":            { inputPer1M: 2,     outputPer1M: 8 },
  "gpt-4o":             { inputPer1M: 2.5,   outputPer1M: 10 },
  "gpt-4o-mini":        { inputPer1M: 0.15,  outputPer1M: 0.6 },
  "gemini-2.5-pro":     { inputPer1M: 1.25,  outputPer1M: 5 },
  "gemini-2.5-flash":   { inputPer1M: 0.15,  outputPer1M: 0.35 },
  "gemini-2.0-flash":   { inputPer1M: 0.1,   outputPer1M: 0.4 },
  "llama":              { inputPer1M: 0,     outputPer1M: 0 },
};

/** 모델명 퍼지 매칭 */
export function findPricing(model: string): ModelPricing | null {
  const lower = model.toLowerCase();
  const sortedKeys = Object.keys(MODEL_PRICING).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (lower.includes(key)) return MODEL_PRICING[key];
  }
  return null;
}

/** 총 토큰 수로 비용 추정 (input 70% / output 30% 가정) */
export function estimateCost(totalTokens: number, model: string): number | null {
  if (totalTokens <= 0) return null;
  const pricing = findPricing(model);
  if (!pricing) return null;
  const input = totalTokens * 0.7;
  const output = totalTokens * 0.3;
  return (input * pricing.inputPer1M + output * pricing.outputPer1M) / 1_000_000;
}

/** 비용을 사람이 읽기 좋은 문자열로 변환 */
export function formatCost(usd: number | null): string {
  if (usd === null) return "-";
  if (usd < 0.001) return `$${(usd * 1000).toFixed(3)}m`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export interface ModelCostSummary {
  model: string;
  totalTokens: number;
  estimatedCost: number;
  sessionCount: number;
}

/** 세션 배열에서 모델별 비용 집계 */
export function aggregateCostByModel(sessions: SessionInfo[]): ModelCostSummary[] {
  const map: Record<string, ModelCostSummary> = {};
  for (const s of sessions) {
    const cost = estimateCost(s.total_tokens, s.model) ?? 0;
    if (!map[s.model]) {
      map[s.model] = { model: s.model, totalTokens: 0, estimatedCost: 0, sessionCount: 0 };
    }
    map[s.model].totalTokens += s.total_tokens;
    map[s.model].estimatedCost += cost;
    map[s.model].sessionCount += 1;
  }
  return Object.values(map).sort((a, b) => b.estimatedCost - a.estimatedCost);
}

/** 세션 배열의 총 추정 비용 */
export function totalCost(sessions: SessionInfo[]): number {
  return sessions.reduce((sum, s) => sum + (estimateCost(s.total_tokens, s.model) ?? 0), 0);
}
