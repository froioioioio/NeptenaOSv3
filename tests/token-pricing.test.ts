import {
  calculateTokenCost,
  getModelPricingTier,
  getModelCategory,
  formatUsd,
  formatPhp,
  USD_TO_PHP_EXCHANGE_RATE,
  MODEL_PRICING_TABLE,
} from '@/lib/token-pricing';

export interface TokenPricingTestResult {
  step: string;
  status: 'passed' | 'failed';
  latencyMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

export interface TokenPricingTestSuiteReport {
  timestamp: number;
  totalTests: number;
  passed: number;
  failed: number;
  durationMs: number;
  success: boolean;
  steps: TokenPricingTestResult[];
}

export async function runTokenPricingTestSuite(): Promise<TokenPricingTestSuiteReport> {
  const startTime = Date.now();
  const steps: TokenPricingTestResult[] = [];

  const runStep = async (step: string, action: () => Promise<Record<string, unknown> | void>) => {
    const stepStart = Date.now();
    try {
      const details = await action();
      steps.push({
        step,
        status: 'passed',
        latencyMs: Date.now() - stepStart,
        details: (details as Record<string, unknown>) || undefined,
      });
    } catch (err: unknown) {
      steps.push({
        step,
        status: 'failed',
        latencyMs: Date.now() - stepStart,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Step 1: Gemini Flash Tier Pricing Calculation
  await runStep('1. Gemini Flash Tier Pricing Calculation (3.7 Flash)', async () => {
    // 1M prompt tokens = $0.10, 1M candidate tokens = $0.40
    // 10,000 prompt tokens = $0.001
    // 2,500 candidate tokens = $0.001
    // Total = $0.002
    const result = calculateTokenCost(10000, 2500, 'gemini-3.7-flash');

    if (result.pricing.category !== 'flash') throw new Error('Expected flash category');
    if (result.costUsd !== 0.002) throw new Error(`Expected $0.002 USD cost, got $${result.costUsd}`);
    
    const expectedPhp = Number((0.002 * USD_TO_PHP_EXCHANGE_RATE).toFixed(4));
    if (result.costPhp !== expectedPhp) throw new Error(`Expected ${expectedPhp} PHP cost, got ${result.costPhp}`);

    return {
      model: 'gemini-3.7-flash',
      promptTokens: 10000,
      candidateTokens: 2500,
      costUsd: result.costUsd,
      costPhp: result.costPhp,
      category: result.pricing.category,
    };
  });

  // Step 2: Gemini Pro Tier Pricing Calculation
  await runStep('2. Gemini Pro Tier Pricing Calculation (3.1 Pro Preview)', async () => {
    // 1M prompt tokens = $1.25, 1M candidate tokens = $5.00
    // 10,000 prompt tokens = $0.0125
    // 2,000 candidate tokens = $0.0100
    // Total = $0.0225
    const result = calculateTokenCost(10000, 2000, 'gemini-3.1-pro-preview');

    if (result.pricing.category !== 'pro') throw new Error('Expected pro category');
    if (result.costUsd !== 0.0225) throw new Error(`Expected $0.0225 USD cost, got $${result.costUsd}`);

    const expectedPhp = Number((0.0225 * USD_TO_PHP_EXCHANGE_RATE).toFixed(4));
    if (result.costPhp !== expectedPhp) throw new Error(`Expected ${expectedPhp} PHP cost, got ${result.costPhp}`);

    return {
      model: 'gemini-3.1-pro-preview',
      costUsd: result.costUsd,
      costPhp: result.costPhp,
      category: result.pricing.category,
    };
  });

  // Step 3: Model Tier Lookup and Fallbacks
  await runStep('3. Model Tier Lookup & Pro/Flash Category Resolution', async () => {
    const flashTier = getModelPricingTier('gemini-3.7-flash');
    const proTier = getModelPricingTier('gemini-3.1-pro-preview');
    const unknownProFallback = getModelPricingTier('custom-fine-tuned-pro-v1');
    const unknownDefaultFallback = getModelPricingTier('unknown-model-identifier');

    if (flashTier.category !== 'flash') throw new Error('Flash tier resolution failed');
    if (proTier.category !== 'pro') throw new Error('Pro tier resolution failed');
    if (unknownProFallback.category !== 'pro') throw new Error('Unknown model containing "pro" did not resolve to pro');
    if (unknownDefaultFallback.category !== 'flash') throw new Error('Unknown model should fallback to flash category');

    const catFlash = getModelCategory('gemini-2.5-flash');
    const catPro = getModelCategory('gemini-2.5-pro');
    if (catFlash !== 'flash' || catPro !== 'pro') throw new Error('getModelCategory failed');

    return {
      flashCategory: flashTier.category,
      proCategory: proTier.category,
      fallbackPro: unknownProFallback.displayName,
      fallbackDefault: unknownDefaultFallback.displayName,
    };
  });

  // Step 4: Currency Formatting Precision (USD and PHP)
  await runStep('4. Dual-Currency Display Formatting Helpers', async () => {
    // USD Formatting
    if (formatUsd(0) !== '$0.000000') throw new Error(`formatUsd(0) mismatch: ${formatUsd(0)}`);
    if (formatUsd(0.000042) !== '$0.000042') throw new Error(`formatUsd micro mismatch: ${formatUsd(0.000042)}`);
    if (formatUsd(0.005) !== '$0.0050') throw new Error(`formatUsd cent mismatch: ${formatUsd(0.005)}`);
    if (formatUsd(1.2345) !== '$1.234') throw new Error(`formatUsd standard mismatch: ${formatUsd(1.2345)}`);

    // PHP Formatting
    if (formatPhp(0) !== '₱0.0000') throw new Error(`formatPhp(0) mismatch: ${formatPhp(0)}`);
    if (formatPhp(0.0042) !== '₱0.0042') throw new Error(`formatPhp micro mismatch: ${formatPhp(0.0042)}`);
    if (formatPhp(12.5) !== '₱12.50') throw new Error(`formatPhp standard mismatch: ${formatPhp(12.5)}`);

    return {
      usdZero: formatUsd(0),
      usdMicro: formatUsd(0.000042),
      usdStandard: formatUsd(1.2345),
      phpZero: formatPhp(0),
      phpStandard: formatPhp(12.5),
    };
  });

  const passed = steps.filter(s => s.status === 'passed').length;
  const failed = steps.filter(s => s.status === 'failed').length;

  return {
    timestamp: startTime,
    totalTests: steps.length,
    passed,
    failed,
    durationMs: Date.now() - startTime,
    success: failed === 0,
    steps,
  };
}
