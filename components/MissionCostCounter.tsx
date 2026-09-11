'use client';

import React from 'react';
import { Coins, Sparkles, Zap } from 'lucide-react';
import { formatUsd, formatPhp, getModelCategory, getModelPricingTier } from '@/lib/token-pricing';

interface ModelStat {
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
  costUsd: number;
  costPhp: number;
  callsCount: number;
}

interface MissionCostCounterProps {
  costUsd?: number;
  costPhp?: number;
  totalTokensInput?: number;
  totalTokensOutput?: number;
  totalTokens?: number;
  llmCallsCount?: number;
  modelsUsed?: string[];
  modelUsageBreakdown?: Record<string, ModelStat>;
  compact?: boolean;
}

export function MissionCostCounter({
  costUsd = 0,
  costPhp = 0,
  totalTokensInput = 0,
  totalTokensOutput = 0,
  totalTokens,
  llmCallsCount = 0,
  modelsUsed = [],
  modelUsageBreakdown,
  compact = false,
}: MissionCostCounterProps) {
  const calculatedTotalTokens = totalTokens ?? (totalTokensInput + totalTokensOutput);

  // Determine if Pro, Flash, or Hybrid models were utilized
  const detectedModels = modelsUsed.length > 0
    ? modelsUsed
    : (modelUsageBreakdown ? Object.keys(modelUsageBreakdown) : []);
  
  const hasProModel = detectedModels.some(m => getModelCategory(m) === 'pro') || (costUsd > 0 && detectedModels.length === 0);
  const hasFlashModel = detectedModels.some(m => getModelCategory(m) === 'flash') || detectedModels.length === 0;

  if (compact) {
    return (
      <div className="inline-flex flex-wrap items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-[11px] font-mono shadow-sm">
        <Coins className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="text-emerald-300 font-bold">{formatUsd(costUsd)}</span>
        <span className="text-slate-500">•</span>
        <span className="text-teal-300 font-semibold">{formatPhp(costPhp)}</span>
        {calculatedTotalTokens > 0 && (
          <>
            <span className="text-slate-500 hidden sm:inline">•</span>
            <span className="text-slate-400 text-[10px] hidden sm:inline">
              {calculatedTotalTokens.toLocaleString()} tokens
            </span>
          </>
        )}
        {detectedModels.length > 0 && (
          <span className="ml-1 text-[9px] px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-slate-300 font-sans">
            {detectedModels.some(m => getModelCategory(m) === 'pro') && detectedModels.some(m => getModelCategory(m) === 'flash')
              ? 'Pro + Flash'
              : detectedModels.some(m => getModelCategory(m) === 'pro')
                ? 'Gemini Pro'
                : 'Gemini Flash'}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-slate-950/80 border border-emerald-900/60 text-xs font-mono">
        <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
          <Coins className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-white text-xs font-bold">{formatUsd(costUsd)}</span>
          <span className="text-slate-500 text-[11px] font-normal">USD</span>
        </div>

        <span className="text-slate-700">|</span>

        <div className="flex items-center gap-1 text-teal-300 font-semibold">
          <span>{formatPhp(costPhp)}</span>
          <span className="text-slate-500 text-[11px] font-normal">PHP</span>
        </div>

        <span className="text-slate-700">|</span>

        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span title={`Input: ${totalTokensInput.toLocaleString()} | Output: ${totalTokensOutput.toLocaleString()}`}>
            ⚡ {calculatedTotalTokens > 0 ? calculatedTotalTokens.toLocaleString() : '0'} tokens
          </span>
          {llmCallsCount > 0 && (
            <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-slate-400">
              {llmCallsCount} LLM {llmCallsCount === 1 ? 'call' : 'calls'}
            </span>
          )}
        </div>

        {/* Model Tier Indicator Badges */}
        <div className="ml-auto flex items-center gap-1.5 text-[10px]">
          {hasProModel && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-950/80 border border-purple-800 text-purple-300 font-sans font-medium">
              <Sparkles className="w-2.5 h-2.5 text-purple-400" />
              Pro Tier
            </span>
          )}
          {hasFlashModel && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800 text-cyan-300 font-sans font-medium">
              <Zap className="w-2.5 h-2.5 text-cyan-400" />
              Flash Tier
            </span>
          )}
        </div>
      </div>

      {/* Model Breakdown Details if multiple models exist */}
      {modelUsageBreakdown && Object.keys(modelUsageBreakdown).length > 0 && (
        <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
          {Object.entries(modelUsageBreakdown).map(([modelKey, stats]) => {
            const pricing = getModelPricingTier(modelKey);
            const isPro = pricing.category === 'pro';
            return (
              <div key={modelKey} className="flex items-center justify-between p-1.5 rounded bg-slate-950 border border-slate-800/60">
                <div className="flex items-center gap-1.5">
                  {isPro ? (
                    <Sparkles className="w-3 h-3 text-purple-400" />
                  ) : (
                    <Zap className="w-3 h-3 text-cyan-400" />
                  )}
                  <div>
                    <span className="text-slate-200 font-sans font-medium">{pricing.displayName}</span>
                    <div className="text-[10px] text-slate-500">{stats.callsCount} {stats.callsCount === 1 ? 'call' : 'calls'}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-emerald-300 font-bold">{formatUsd(stats.costUsd)}</div>
                  <div className="text-[10px] text-slate-400">{stats.totalTokens.toLocaleString()} tok</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
