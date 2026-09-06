/**
 * services/__tests__/runAllTests.ts
 *
 * Master Unified Test Runner for OFM Financial Data Accuracy & Parity Matrix.
 * Runs all unit and integration test suites and exits with code 0 if all pass.
 */

import { spawnSync } from "child_process";
import path from "path";

const rootDir = path.resolve(__dirname, "../..");

const testSuites = [
  {
    name: "1. Financial Flows & Web/Mobile Parity Suite",
    cmd: "npx",
    args: ["-y", "tsx", "services/__tests__/financialFlowsAndParity.test.ts"],
  },
  {
    name: "2. Production Financial Engine Suite",
    cmd: "npx",
    args: ["-y", "tsx", "services/__tests__/financialEngine.test.ts"],
  },
  {
    name: "3. Deterministic Financial Insights Suite",
    cmd: "npx",
    args: ["-y", "tsx", "services/__tests__/financialInsights.test.ts"],
  },
  {
    name: "4. Authoritative Financial Calculation Engine Suite",
    cmd: "npx",
    args: ["-y", "tsx", "--test", "services/__tests__/FinancialCalculationEngine.test.ts"],
  },
  {
    name: "5. Net Operating Balance Health Suite",
    cmd: "npx",
    args: ["-y", "tsx", "--test", "services/__tests__/NetOperatingBalanceHealth.test.ts"],
  },
  {
    name: "6. Native PDF Binary Generation & Templating Suite",
    cmd: "npx",
    args: ["-y", "tsx", "-r", "./services/__tests__/mockReactNative.js", "services/__tests__/pdfService.test.ts"],
  },
  {
    name: "7. Mobile Header Organization Name Dynamic Sizing Suite",
    cmd: "npx",
    args: ["-y", "tsx", "services/__tests__/orgBadgeHeader.test.ts"],
  },
];

console.log("\n=======================================================");
console.log("STARTING OFM MASTER TEST MATRIX EXECUTION");
console.log("=======================================================\n");

let allPassed = true;
let totalPassedSuites = 0;

for (const suite of testSuites) {
  console.log(`\n▶ Running: ${suite.name}...`);
  const result = spawnSync(suite.cmd, suite.args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: true,
  });

  if (result.status === 0) {
    totalPassedSuites++;
    console.log(`✔ SUCCESS: ${suite.name} PASSED\n`);
  } else {
    allPassed = false;
    console.error(`✖ FAILURE: ${suite.name} FAILED (exit code ${result.status})\n`);
  }
}

console.log("\n=======================================================");
console.log(`MASTER TEST SUMMARY: ${totalPassedSuites}/${testSuites.length} SUITES PASSED`);
console.log("=======================================================\n");

if (!allPassed) {
  process.exit(1);
} else {
  console.log("ALL TEST SUITES PASSED WITH ZERO DISCREPANCIES! ✅\n");
  process.exit(0);
}
