import { runAllCoreFeatureSuites } from "./tests/index";
import { runMissionControlDelegationSuite } from "./tests/mission-control.test";
import { runAgentsTestSuite } from "./tests/agents.test";
import { runApprovalGateTest } from "./tests/approval-gate.test";
import { runDevelopmentAgentTest } from "./tests/development-agent.test";

async function main() {
  console.log("1. Running Core Suites...");
  const core = await runAllCoreFeatureSuites();
  console.log("Core Suites Success:", core.overallSuccess);
  if (!core.overallSuccess) console.log(JSON.stringify(core.suites, null, 2));

  console.log("\n2. Running Mission Control Suite...");
  const mc = await runMissionControlDelegationSuite();
  console.log("Mission Control Success:", mc.success);
  if (!mc.success) console.log(JSON.stringify(mc, null, 2));

  console.log("\n3. Running Agents Suite...");
  const ag = await runAgentsTestSuite();
  console.log("Agents Success:", ag.success);
  if (!ag.success) console.log(JSON.stringify(ag, null, 2));

  console.log("\n4. Running Approval Gate Suite...");
  const ap = await runApprovalGateTest();
  console.log("Approval Gate Success:", ap.success);
  if (!ap.success) console.log(JSON.stringify(ap.results, null, 2));

  console.log("\n5. Running Development Agent Suite...");
  const da = await runDevelopmentAgentTest();
  console.log("Development Agent Success:", da.success);
  if (!da.success) console.log(JSON.stringify(da.results, null, 2));
  
  const allGood = core.overallSuccess && mc.success && ag.success && ap.success && da.success;
  console.log("\n=================================");
  console.log("ALL REGRESSION TEST SUITES PASSED:", allGood);
  console.log("=================================");
  process.exit(allGood ? 0 : 1);
}
main();
