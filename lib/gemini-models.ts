/**
 * Neptena-OS: Gemini Model Normalization & Tier Utility
 * 
 * Maps legacy, deprecated, or shorthand model names to active supported Gemini 3 series models.
 * Safe to import on both client and server sides (pure string manipulation, no Node/Firebase/GenAI dependencies).
 */

import { SUPPORTED_GEMINI_MODELS } from './token-pricing';

export function normalizeGeminiModel(model?: string): string {
  if (!model) return 'gemini-3.7-flash';
  const clean = model.trim().toLowerCase();

  // If it's explicitly a supported model, return it directly
  if (SUPPORTED_GEMINI_MODELS.includes(clean)) {
    return clean;
  }

  // Pro model mappings for generic terms
  if (
    clean === 'gemini-pro' ||
    clean === 'gemini-pro-latest' ||
    clean === 'gemini-3-pro' ||
    clean.includes('pro-preview')
  ) {
    return 'gemini-3.1-pro-preview';
  }

  // Flash model mappings for generic terms
  if (
    clean === 'gemini-flash' ||
    clean === 'gemini-flash-latest' ||
    clean === 'gemini-3-flash'
  ) {
    return 'gemini-3.7-flash';
  }

  return clean;
}

/**
 * Returns prioritized fallback models in order of stability and quota availability.
 */
export function getGeminiModelCandidateChain(preferredModel?: string): string[] {
  const primary = normalizeGeminiModel(preferredModel);
  const isPro = primary.includes('pro');

  const candidates = [
    primary,
    ...(isPro ? [
      'gemini-3.1-pro-preview',
      'gemini-2.5-pro',
      'gemini-1.5-pro'
    ] : []),
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ];

  // Deduplicate preserving order
  return Array.from(new Set(candidates.filter(Boolean)));
}

