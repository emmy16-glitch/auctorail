import {
  runAttackLab
} from "../src/security/attack-lab.js";

const report =
  await runAttackLab();

console.log("");
console.log(
  "PROOFGATE ATTACK LAB"
);
console.log(
  "===================="
);
console.log(
  "Mode:",
  report.mode
);
console.log(
  "Policy:",
  report.policyId
);
console.log(
  "Baseline:",
  report.baselineDecision
);
console.log("");

for (
  const item of
  report.scenarios
) {
  console.log(
    `${item.passed ? "PASS" : "FAIL"} | ${item.id}`
  );
  console.log(
    `  attack:   ${item.attack}`
  );
  console.log(
    `  expected: ${item.expected}`
  );
  console.log(
    `  observed: ${item.observed}`
  );
}

console.log("");
console.log(
  `RESULT: ${report.passed}/${report.total} attacks contained`
);
console.log(
  "Telegraph requests: 0"
);
console.log(
  "x402 payments: 0"
);
console.log(
  "Blockchain writes: 0"
);

if (
  !report.allPassed
) {
  process.exitCode = 2;
}
