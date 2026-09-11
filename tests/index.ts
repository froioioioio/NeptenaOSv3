/**
 * Neptena-OS: Tests Directory
 * 
 * Test suites for orchestrator workflows, agent validation,
 * database connection integrity checks, repository CRUD operations,
 * task dependency DAG scheduling, token pricing, project workspaces,
 * and multi-format deliverable generators.
 */

export * from './crud.test';
export * from './mission-control.test';
export * from './agents.test';
export * from './approval-gate.test';
export * from './knowledge-repository.test';
export * from './mission-consolidation.test';
export * from './task-dependency.test';
export * from './token-pricing.test';
export * from './deliverable-generators.test';
export * from './project-workspace.test';

import { runTaskDependencyTestSuite } from './task-dependency.test';
import { runTokenPricingTestSuite } from './token-pricing.test';
import { runDeliverableGeneratorsTestSuite } from './deliverable-generators.test';
import { runProjectWorkspaceTestSuite } from './project-workspace.test';

export interface CoreTestSuiteSummary {
  timestamp: number;
  overallSuccess: boolean;
  totalSuites: number;
  passedSuites: number;
  failedSuites: number;
  durationMs: number;
  suites: {
    taskDependency: Awaited<ReturnType<typeof runTaskDependencyTestSuite>>;
    tokenPricing: Awaited<ReturnType<typeof runTokenPricingTestSuite>>;
    deliverableGenerators: Awaited<ReturnType<typeof runDeliverableGeneratorsTestSuite>>;
    projectWorkspace: Awaited<ReturnType<typeof runProjectWorkspaceTestSuite>>;
  };
}

/**
 * Executes all in-memory and filesystem core feature test suites sequentially.
 */
export async function runAllCoreFeatureSuites(): Promise<CoreTestSuiteSummary> {
  const startTime = Date.now();

  const taskDependency = await runTaskDependencyTestSuite();
  const tokenPricing = await runTokenPricingTestSuite();
  const deliverableGenerators = await runDeliverableGeneratorsTestSuite();
  const projectWorkspace = await runProjectWorkspaceTestSuite();

  const suiteResults = [taskDependency, tokenPricing, deliverableGenerators, projectWorkspace];
  const passedSuites = suiteResults.filter(s => s.success).length;
  const failedSuites = suiteResults.filter(s => !s.success).length;

  return {
    timestamp: startTime,
    overallSuccess: failedSuites === 0,
    totalSuites: suiteResults.length,
    passedSuites,
    failedSuites,
    durationMs: Date.now() - startTime,
    suites: {
      taskDependency,
      tokenPricing,
      deliverableGenerators,
      projectWorkspace,
    },
  };
}

export const RUN_CONNECTION_CHECK = async (statusCheckFn: () => Promise<boolean>): Promise<{ success: boolean; latencyMs: number }> => {
  const start = Date.now();
  try {
    const isHealthy = await statusCheckFn();
    return {
      success: isHealthy,
      latencyMs: Date.now() - start,
    };
  } catch {
    return {
      success: false,
      latencyMs: Date.now() - start,
    };
  }
};


