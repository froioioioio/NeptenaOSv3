/**
 * Token Pricing & Cost Calculation Utilities for Neptena-OS
 * 
 * Supports Multi-Model Hybrid Orchestration across CEO Executive Agent (Gemini Pro)
 * and Specialist Agents (Growth, Development, Quality using Gemini Flash & Pro).
 * 
 * Pricing Reference:
 * - Gemini 3.7 Flash & 2.5 Flash:
 *   - Input / Prompt tokens: $0.10 / 1M tokens ($0.00000010 per token)
 *   - Output / Candidate tokens: $0.40 / 1M tokens ($0.00000040 per token)
 * - Gemini 3.1 Pro Preview & 2.5 Pro:
 *   - Input / Prompt tokens: $1.25 / 1M tokens ($0.00000125 per token)
 *   - Output / Candidate tokens: $5.00 / 1M tokens ($0.00000500 per token)
 * 
 * Exchange Rate:
 * - 1 USD = ~58.50 PHP (standard baseline convertible rate)
 */

export interface TokenUsageRecord {
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
  model: string;
}

export interface ModelPricingTier {
  model: string;
  category: 'pro' | 'flash';
  displayName: string;
  inputCostPerMillionUsd: number;
  outputCostPerMillionUsd: number;
}

export const USD_TO_PHP_EXCHANGE_RATE = 58.50;

export const MODEL_PRICING_TABLE: Record<string, ModelPricingTier> = {
  'gemini-3.7-flash': {
    model: 'gemini-3.7-flash',
    category: 'flash',
    displayName: 'Gemini 3.7 Flash',
    inputCostPerMillionUsd: 0.10,
    outputCostPerMillionUsd: 0.40,
  },
  'gemini-3.6-flash': {
    model: 'gemini-3.6-flash',
    category: 'flash',
    displayName: 'Gemini 3.6 Flash',
    inputCostPerMillionUsd: 0.10,
    outputCostPerMillionUsd: 0.40,
  },
  'gemini-3-flash-preview': {
    model: 'gemini-3-flash-preview',
    category: 'flash',
    displayName: 'Gemini 3 Flash Preview',
    inputCostPerMillionUsd: 0.10,
    outputCostPerMillionUsd: 0.40,
  },
  'gemini-3.1-pro-preview': {
    model: 'gemini-3.1-pro-preview',
    category: 'pro',
    displayName: 'Gemini 3.1 Pro Preview',
    inputCostPerMillionUsd: 1.25,
    outputCostPerMillionUsd: 5.00,
  },
  'gemini-2.5-flash': {
    model: 'gemini-2.5-flash',
    category: 'flash',
    displayName: 'Gemini 2.5 Flash',
    inputCostPerMillionUsd: 0.10,
    outputCostPerMillionUsd: 0.40,
  },
  'gemini-2.5-pro': {
    model: 'gemini-2.5-pro',
    category: 'pro',
    displayName: 'Gemini 2.5 Pro',
    inputCostPerMillionUsd: 1.25,
    outputCostPerMillionUsd: 5.00,
  },
  'gemini-2.0-flash': {
    model: 'gemini-2.0-flash',
    category: 'flash',
    displayName: 'Gemini 2.0 Flash',
    inputCostPerMillionUsd: 0.10,
    outputCostPerMillionUsd: 0.40,
  },
  'gemini-2.0-flash-lite-preview-02-27': {
    model: 'gemini-2.0-flash-lite-preview-02-27',
    category: 'flash',
    displayName: 'Gemini 2.0 Flash Lite',
    inputCostPerMillionUsd: 0.075,
    outputCostPerMillionUsd: 0.30,
  },
  'gemini-2.0-pro-exp-02-05': {
    model: 'gemini-2.0-pro-exp-02-05',
    category: 'pro',
    displayName: 'Gemini 2.0 Pro Exp',
    inputCostPerMillionUsd: 1.25,
    outputCostPerMillionUsd: 5.00,
  },
  'gemini-2.0-flash-thinking-exp-01-21': {
    model: 'gemini-2.0-flash-thinking-exp-01-21',
    category: 'flash',
    displayName: 'Gemini 2.0 Flash Thinking',
    inputCostPerMillionUsd: 0.10,
    outputCostPerMillionUsd: 0.40,
  },
  'gemini-1.5-pro': {
    model: 'gemini-1.5-pro',
    category: 'pro',
    displayName: 'Gemini 1.5 Pro',
    inputCostPerMillionUsd: 1.25,
    outputCostPerMillionUsd: 5.00,
  },
  'gemini-1.5-flash': {
    model: 'gemini-1.5-flash',
    category: 'flash',
    displayName: 'Gemini 1.5 Flash',
    inputCostPerMillionUsd: 0.075,
    outputCostPerMillionUsd: 0.30,
  },
  'gemini-pro': {
    model: 'gemini-3.1-pro-preview',
    category: 'pro',
    displayName: 'Gemini 3.1 Pro',
    inputCostPerMillionUsd: 1.25,
    outputCostPerMillionUsd: 5.00,
  },
  'gemini-flash': {
    model: 'gemini-3.7-flash',
    category: 'flash',
    displayName: 'Gemini 3.7 Flash',
    inputCostPerMillionUsd: 0.10,
    outputCostPerMillionUsd: 0.40,
  },
  'default': {
    model: 'gemini-3.7-flash',
    category: 'flash',
    displayName: 'Gemini 3.7 Flash',
    inputCostPerMillionUsd: 0.10,
    outputCostPerMillionUsd: 0.40,
  },
};

export const SUPPORTED_GEMINI_MODELS = Object.keys(MODEL_PRICING_TABLE).filter(key => 
  key !== 'default' && key !== 'gemini-pro' && key !== 'gemini-flash'
);

/**
 * Returns model tier information given a model name.
 */
export function getModelPricingTier(modelName: string = 'gemini-3.7-flash'): ModelPricingTier {
  return MODEL_PRICING_TABLE[modelName] || (
    modelName.toLowerCase().includes('pro') ? MODEL_PRICING_TABLE['gemini-3.1-pro-preview'] : MODEL_PRICING_TABLE['gemini-3.7-flash']
  );
}

/**
 * Returns whether a model is in the 'pro' or 'flash' category.
 */
export function getModelCategory(modelName: string = 'gemini-3.7-flash'): 'pro' | 'flash' {
  return getModelPricingTier(modelName).category;
}

/**
 * Calculates USD and PHP cost given prompt tokens, candidate tokens, and model.
 */
export function calculateTokenCost(
  promptTokens: number = 0,
  candidateTokens: number = 0,
  modelName: string = 'gemini-3.7-flash'
): { costUsd: number; costPhp: number; pricing: ModelPricingTier } {
  const pricing = getModelPricingTier(modelName);
  
  const inputCost = (promptTokens / 1_000_000) * pricing.inputCostPerMillionUsd;
  const outputCost = (candidateTokens / 1_000_000) * pricing.outputCostPerMillionUsd;
  const costUsd = Number((inputCost + outputCost).toFixed(6));
  const costPhp = Number((costUsd * USD_TO_PHP_EXCHANGE_RATE).toFixed(4));

  return { costUsd, costPhp, pricing };
}

/**
 * Formats a USD cost value with appropriate decimals for display ($0.000042 or $0.012).
 */
export function formatUsd(amount: number = 0): string {
  if (amount === 0) return '$0.000000';
  if (amount < 0.0001) return `$${amount.toFixed(6)}`;
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(3)}`;
}

/**
 * Formats a PHP cost value with appropriate decimals for display (₱0.0024 or ₱0.70).
 */
export function formatPhp(amount: number = 0): string {
  if (amount === 0) return '₱0.0000';
  if (amount < 0.01) return `₱${amount.toFixed(4)}`;
  return `₱${amount.toFixed(2)}`;
}
