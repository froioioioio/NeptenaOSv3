/**
 * Neptena-OS: Model Provider & System Configuration Module
 * 
 * Reads model provider settings and runtime parameters dynamically
 * from environment configuration rather than hardcoding values.
 */

import { normalizeGeminiModel } from '@/lib/gemini-models';

export type ModelProviderType = 'gemini' | 'openrouter' | 'ollama' | 'custom';

export interface ModelTierConfig {
  ceo: string;
  growth: string;
  development: string;
  worker: string;
}

export interface ModelProviderSettings {
  provider: ModelProviderType;
  models: ModelTierConfig;
  temperature: {
    orchestrator: number;
    agent: number;
    worker: number;
  };
  maxTokens: {
    orchestrator: number;
    agent: number;
    worker: number;
  };
  isProTier: boolean;
}

/**
 * Parses and returns the active AI model configuration from environment variables.
 * Provides sensible defaults if specific tier overrides are not present.
 */
export function getModelProviderConfig(): ModelProviderSettings {
  // Provider resolution from environment
  const rawProvider = (process.env.NEXT_PUBLIC_AI_MODEL_PROVIDER || process.env.AI_MODEL_PROVIDER || 'gemini').toLowerCase();
  const provider: ModelProviderType = (['gemini', 'openrouter', 'ollama', 'custom'].includes(rawProvider)) 
    ? (rawProvider as ModelProviderType) 
    : 'gemini';

  // Tiered model resolution from environment with deprecation fallback normalization
  const models: ModelTierConfig = {
    ceo: normalizeGeminiModel(process.env.NEXT_PUBLIC_GEMINI_MODEL_CEO || process.env.GEMINI_MODEL_CEO || 'gemini-3.6-flash'),
    growth: normalizeGeminiModel(process.env.NEXT_PUBLIC_GEMINI_MODEL_GROWTH || process.env.GEMINI_MODEL_GROWTH || 'gemini-3.6-flash'),
    development: normalizeGeminiModel(process.env.NEXT_PUBLIC_GEMINI_MODEL_DEV || process.env.GEMINI_MODEL_DEV || 'gemini-3.6-flash'),
    worker: normalizeGeminiModel(process.env.NEXT_PUBLIC_GEMINI_MODEL_WORKER || process.env.GEMINI_MODEL_WORKER || 'gemini-3.6-flash'),
  };

  // Temperature configuration
  const temperature = {
    orchestrator: Number(process.env.TEMPERATURE_CEO ?? 0.2),
    agent: Number(process.env.TEMPERATURE_AGENT ?? 0.4),
    worker: Number(process.env.TEMPERATURE_WORKER ?? 0.2),
  };

  // Max token boundaries
  const maxTokens = {
    orchestrator: Number(process.env.MAX_TOKENS_CEO ?? 8192),
    agent: Number(process.env.MAX_TOKENS_AGENT ?? 4096),
    worker: Number(process.env.MAX_TOKENS_WORKER ?? 2048),
  };

  const isProTier = process.env.AI_STUDIO_TIER?.toLowerCase() !== 'free';

  return {
    provider,
    models,
    temperature,
    maxTokens,
    isProTier,
  };
}

export const activeModelConfig = getModelProviderConfig();
