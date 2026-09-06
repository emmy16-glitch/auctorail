import {
  canonicalize,
  hashCanonicalPayload
} from "../src/core/action-contract.js";
import {
  createGeneralAction,
  type GeneralActionEnvelope
} from "../src/core/general-action.js";
import {
  createGeneralMandate,
  type GeneralMandate
} from "../src/core/general-mandate.js";
import {
  executeGeneralAction
} from "../src/executor/general-executor.js";
import type {
  ConsumeResult,
  PermitConsumption,
  PermitConsumptionStore
} from "../src/executor/permit-store.js";
import {
  createGeneralAuthorizationDecision,
  mintGeneralPermit,
  type GeneralAuthorizationDecision,
  type GeneralPermit
} from "../src/permit/general-permit.js";
import {
  LocalDevelopmentSigner
} from "../src/permit/signer.js";
import {
  ActionAdapterRegistry,
  authorizeRegisteredAction,
  type AuctorailActionAdapter,
  type TrustedAdapterEvaluation
} from "../src/sdk/action-adapter.js";

const NOW = new Date("2026-09-03T06:30:00.000Z");
const TARGET = "github:emmy16-glitch/proof-gate#42";
const OTHER_TARGET = "github:attacker/repo#99";
const EVIDENCE_HASH = `0x${"a".repeat(64)}`;
const ALT_EVIDENCE_HASH = `0x${"b".repeat(64)}`;
const SECRET = "proofgate-general-fuzz-secret-0123456789abcdef0123456789abcdef";
const SIGNER = new LocalDevelopmentSigner(SECRET, "general-fuzz");
const CASES_PER_FAMILY = 100;

interface AttackResult {
  contained: boolean;
  unauthorizedExecutions: number;
}

class MemoryPermitStore implements PermitConsumptionStore {
  private readonly items = new Map<string, PermitConsumption>();

  private key(permitId: string, nonce: string): string {
    return `${permitId}:${nonce}`;
  }

  consume(
    permitId: string,
    nonce: string,
    consumedAt: string,
    executionId?: string
  ): ConsumeResult {
    const key = this.key(permitId, nonce);
    const existing = this.items.get(key);
    if (existing) {
      return {
        consumed: false,
        code:
          existing.executionId && executionId &&
          existing.executionId === executionId
            ? "permit_already_consumed_by_this_execution"
            : "permit_already_consumed_by_other_execution",
        consumption: existing
      };
    }

    const record: PermitConsumption = {
      permitId,
      nonce,
      consumedAt,
      ...(executionId ? { executionId } : {})
    };
    this.items.set(key, record);
    return {
      consumed: true,
      code: "permit_consumed",
      consumption: record
    };
  }

  isConsumed(permitId: string, nonce: string): boolean {
    return this.items.has(this.key(permitId, nonce));
  }

  getConsumption(
    permitId: string,
    nonce: string
  ): PermitConsumption | null {
    return this.items.get(this.key(permitId, nonce)) ?? null;
  }
}

function action(
  variant: number,
  overrides?: Partial<{
    type: string;
    target: string;
    branch: string;
    sha: string;
    policyId: string;
  }>
): GeneralActionEnvelope {
  return createGeneralAction({
    type: overrides?.type ?? "github.merge",
    target: overrides?.target ?? TARGET,
    parameters: {
      branch: overrides?.branch ?? "main",
      sha: overrides?.sha ?? `sha-${variant}`
    },
    policyId: overrides?.policyId ?? "github.merge.v1",
    policyVersion: 1
  }, {
    id: `general-action-${variant}`,
    now: NOW
  });
}

function mandate(
  variant: number,
  overrides?: Partial<{
    agentId: string;
    target: string;
    actionType: string;
    status: "ACTIVE" | "REVOKED" | "EXPIRED";
    expiresAt: string;
    requiredIntents: string[];
  }>
): GeneralMandate {
  return createGeneralMandate({
    mandateId: `general-mandate-${variant}`,
    principalId: "principal",
    agentId: overrides?.agentId ?? "coding-agent",
    allowedActionTypes: [overrides?.actionType ?? "github.merge"],
    allowedTargets: [overrides?.target ?? TARGET],
    requiredIntents:
      overrides?.requiredIntents ?? ["CI_STATUS", "SECURITY_SCAN"],
    policyId: "github.merge.v1",
    policyVersion: 1,
    status: overrides?.status ?? "ACTIVE",
    issuedAt: "2026-09-03T06:00:00.000Z",
    expiresAt:
      overrides?.expiresAt ?? "2026-09-03T07:00:00.000Z",
    version: 1
  });
}

function baseline(variant: number, options?: {
  mandate?: GeneralMandate;
  action?: GeneralActionEnvelope;
}): {
  mandate: GeneralMandate;
  action: GeneralActionEnvelope;
  decision: GeneralAuthorizationDecision;
  permit: GeneralPermit;
} {
  const currentAction = options?.action ?? action(variant);
  const currentMandate = options?.mandate ?? mandate(variant);
  const decision = createGeneralAuthorizationDecision({
    mandate: currentMandate,
    action: currentAction,
    agentId: "coding-agent",
    evidenceCommitmentHash: EVIDENCE_HASH,
    checks: [{
      name: "trusted_evidence",
      status: "PASS",
      reason: "Trusted evidence passed."
    }],
    now: NOW
  });
  const permit = mintGeneralPermit({
    mandate: currentMandate,
    action: currentAction,
    decision,
    signer: SIGNER,
    now: NOW,
    ttlSeconds: 30
  });

  return {
    mandate: currentMandate,
    action: currentAction,
    decision,
    permit
  };
}

const enabledKillSwitch = {
  async isDisabled(): Promise<boolean> {
    return false;
  }
};

function rehashDecision(
  decision: GeneralAuthorizationDecision
): void {
  const {
    decisionHash: _old,
    ...body
  } = decision;
  decision.decisionHash = hashCanonicalPayload(
    canonicalize(body)
  );
}

async function executeAttack(input: {
  context: ReturnType<typeof baseline>;
  mandate?: GeneralMandate;
  action?: GeneralActionEnvelope;
  decision?: GeneralAuthorizationDecision;
  permit?: GeneralPermit;
  now?: Date;
  killSwitch?: { isDisabled(): Promise<boolean> };
}): Promise<AttackResult> {
  let callbacks = 0;
  const result = await executeGeneralAction({
    mandate: input.mandate ?? input.context.mandate,
    action: input.action ?? input.context.action,
    decision: input.decision ?? input.context.decision,
    permit: input.permit ?? input.context.permit,
    verifier: SIGNER,
    store: new MemoryPermitStore(),
    killSwitch: input.killSwitch ?? enabledKillSwitch,
    executionId: "attack-execution",
    execute: async () => {
      callbacks++;
      return "unexpected";
    },
    now: input.now ?? NOW
  });

  return {
    contained: result.status !== "EXECUTED" && callbacks === 0,
    unauthorizedExecutions: callbacks
  };
}

interface AdapterOptions {
  evaluation?: TrustedAdapterEvaluation;
  requiredIntents?: string[];
  freezeType?: string;
  onEvaluate?: () => void;
}

function makeAdapter(
  options?: AdapterOptions
): AuctorailActionAdapter<{ target: string; variant: number }, string> {
  return {
    type: "github.merge",
    policyId: "github.merge.v1",
    policyVersion: 1,
    freeze(proposal) {
      return action(proposal.variant, {
        type: options?.freezeType ?? "github.merge",
        target: proposal.target
      });
    },
    requiredIntents() {
      return options?.requiredIntents ?? ["CI_STATUS", "SECURITY_SCAN"];
    },
    async evaluateTrusted() {
      options?.onEvaluate?.();
      return options?.evaluation ?? {
        evidenceCommitmentHash: EVIDENCE_HASH,
        coveredIntents: ["CI_STATUS", "SECURITY_SCAN"],
        checks: [{
          name: "trusted_adapter_evidence",
          status: "PASS",
          reason: "Trusted adapter evidence passed."
        }]
      };
    },
    async execute() {
      return "merged";
    }
  };
}

async function sdkDecision(
  variant: number,
  adapterOptions?: AdapterOptions,
  mandateOverride?: GeneralMandate
) {
  const registry = new ActionAdapterRegistry();
  registry.register(makeAdapter(adapterOptions));
  return authorizeRegisteredAction({
    registry,
    adapterType: "github.merge",
    policyId: "github.merge.v1",
    policyVersion: 1,
    proposal: { target: TARGET, variant },
    mandate: mandateOverride ?? mandate(variant),
    agentId: "coding-agent",
    signer: SIGNER,
    now: NOW,
    ttlSeconds: 30
  });
}

const families: Array<{
  name: string;
  run(variant: number): Promise<AttackResult>;
}> = [
  {
    name: "action_target_valid_substitution",
    async run(i) {
      const context = baseline(i);
      return executeAttack({
        context,
        action: action(i, { target: OTHER_TARGET })
      });
    }
  },
  {
    name: "action_parameters_valid_substitution",
    async run(i) {
      const context = baseline(i);
      return executeAttack({
        context,
        action: action(i, { branch: "release" })
      });
    }
  },
  {
    name: "action_stale_hash_semantic_tamper",
    async run(i) {
      const context = baseline(i);
      const tampered = structuredClone(context.action);
      tampered.parameters.branch = "attacker";
      return executeAttack({ context, action: tampered });
    }
  },
  {
    name: "action_policy_valid_substitution",
    async run(i) {
      const context = baseline(i);
      return executeAttack({
        context,
        action: action(i, { policyId: "github.admin.v1" })
      });
    }
  },
  {
    name: "mandate_agent_substitution",
    async run(i) {
      const context = baseline(i);
      return executeAttack({
        context,
        mandate: mandate(i, { agentId: "attacker-agent" })
      });
    }
  },
  {
    name: "mandate_target_scope_substitution",
    async run(i) {
      const context = baseline(i);
      return executeAttack({
        context,
        mandate: mandate(i, { target: OTHER_TARGET })
      });
    }
  },
  {
    name: "mandate_action_type_substitution",
    async run(i) {
      const context = baseline(i);
      return executeAttack({
        context,
        mandate: mandate(i, { actionType: "github.close" })
      });
    }
  },
  {
    name: "mandate_revoked_substitution",
    async run(i) {
      const context = baseline(i);
      return executeAttack({
        context,
        mandate: mandate(i, { status: "REVOKED" })
      });
    }
  },
  {
    name: "mandate_expires_before_live_permit",
    async run(i) {
      const shortMandate = mandate(i, {
        expiresAt: "2026-09-03T06:30:10.000Z"
      });
      const context = baseline(i, { mandate: shortMandate });
      return executeAttack({
        context,
        now: new Date("2026-09-03T06:30:11.000Z")
      });
    }
  },
  {
    name: "decision_wrong_agent_self_consistent",
    async run(i) {
      const context = baseline(i);
      const forged = createGeneralAuthorizationDecision({
        mandate: context.mandate,
        action: context.action,
        agentId: "attacker-agent",
        evidenceCommitmentHash: EVIDENCE_HASH,
        checks: [{
          name: "forged",
          status: "PASS",
          reason: "forged"
        }],
        now: NOW
      });
      let minted = false;
      try {
        mintGeneralPermit({
          mandate: context.mandate,
          action: context.action,
          decision: forged,
          signer: SIGNER,
          now: NOW
        });
        minted = true;
      } catch {
        // expected
      }
      return {
        contained: !minted,
        unauthorizedExecutions: 0
      };
    }
  },
  {
    name: "decision_status_check_semantic_forgery",
    async run(i) {
      const context = baseline(i);
      const forged = structuredClone(context.decision);
      forged.checks[0].status = "HOLD";
      forged.decision = "ALLOW";
      rehashDecision(forged);
      return executeAttack({ context, decision: forged });
    }
  },
  {
    name: "decision_check_tamper_stale_hash",
    async run(i) {
      const context = baseline(i);
      const forged = structuredClone(context.decision);
      forged.checks[0].reason = "tampered";
      return executeAttack({ context, decision: forged });
    }
  },
  {
    name: "decision_evidence_commitment_substitution",
    async run(i) {
      const context = baseline(i);
      const forged = structuredClone(context.decision);
      forged.evidenceCommitmentHash = ALT_EVIDENCE_HASH;
      rehashDecision(forged);
      return executeAttack({ context, decision: forged });
    }
  },
  {
    name: "permit_signature_forgery",
    async run(i) {
      const context = baseline(i);
      const permit = structuredClone(context.permit);
      permit.signature = `0x${"0".repeat(64)}`;
      return executeAttack({ context, permit });
    }
  },
  {
    name: "permit_action_binding_tamper",
    async run(i) {
      const context = baseline(i);
      const permit = structuredClone(context.permit);
      permit.payload.actionHash = ALT_EVIDENCE_HASH;
      return executeAttack({ context, permit });
    }
  },
  {
    name: "permit_decision_binding_tamper",
    async run(i) {
      const context = baseline(i);
      const permit = structuredClone(context.permit);
      permit.payload.decisionHash = ALT_EVIDENCE_HASH;
      return executeAttack({ context, permit });
    }
  },
  {
    name: "permit_evidence_binding_tamper",
    async run(i) {
      const context = baseline(i);
      const permit = structuredClone(context.permit);
      permit.payload.evidenceCommitmentHash = ALT_EVIDENCE_HASH;
      return executeAttack({ context, permit });
    }
  },
  {
    name: "permit_expired",
    async run(i) {
      const context = baseline(i);
      return executeAttack({
        context,
        now: new Date("2026-09-03T06:30:31.000Z")
      });
    }
  },
  {
    name: "execution_kill_switch_disabled",
    async run(i) {
      const context = baseline(i);
      return executeAttack({
        context,
        killSwitch: {
          async isDisabled() { return true; }
        }
      });
    }
  },
  {
    name: "execution_kill_switch_unavailable",
    async run(i) {
      const context = baseline(i);
      return executeAttack({
        context,
        killSwitch: {
          async isDisabled() {
            throw new Error("kill_switch_store_down");
          }
        }
      });
    }
  },
  {
    name: "permit_replay",
    async run(i) {
      const context = baseline(i);
      const store = new MemoryPermitStore();
      let callbacks = 0;
      const execute = async () => {
        callbacks++;
        return "ok";
      };
      const first = await executeGeneralAction({
        ...context,
        verifier: SIGNER,
        store,
        killSwitch: enabledKillSwitch,
        executionId: "first",
        execute,
        now: NOW
      });
      const second = await executeGeneralAction({
        ...context,
        verifier: SIGNER,
        store,
        killSwitch: enabledKillSwitch,
        executionId: "second",
        execute,
        now: NOW
      });
      return {
        contained:
          first.status === "EXECUTED" &&
          second.status === "BLOCKED" &&
          callbacks === 1,
        unauthorizedExecutions:
          Math.max(0, callbacks - 1)
      };
    }
  },
  {
    name: "ambiguous_effect_replay",
    async run(i) {
      const context = baseline(i);
      const store = new MemoryPermitStore();
      let callbacks = 0;
      const execute = async () => {
        callbacks++;
        throw new Error("transport_lost_after_submit");
      };
      const first = await executeGeneralAction({
        ...context,
        verifier: SIGNER,
        store,
        killSwitch: enabledKillSwitch,
        executionId: "first",
        execute,
        now: NOW
      });
      const second = await executeGeneralAction({
        ...context,
        verifier: SIGNER,
        store,
        killSwitch: enabledKillSwitch,
        executionId: "second",
        execute,
        now: NOW
      });
      return {
        contained:
          first.status === "AMBIGUOUS" &&
          second.status === "BLOCKED" &&
          callbacks === 1,
        unauthorizedExecutions:
          Math.max(0, callbacks - 1)
      };
    }
  },
  {
    name: "adapter_missing_required_intent_coverage",
    async run(i) {
      const result = await sdkDecision(i, {
        evaluation: {
          evidenceCommitmentHash: EVIDENCE_HASH,
          coveredIntents: ["CI_STATUS"],
          checks: [{
            name: "partial",
            status: "PASS",
            reason: "partial"
          }]
        }
      });
      return {
        contained:
          result.decision.decision === "HOLD" &&
          result.permit === null,
        unauthorizedExecutions: 0
      };
    }
  },
  {
    name: "adapter_unrequested_intent_claim",
    async run(i) {
      const result = await sdkDecision(i, {
        evaluation: {
          evidenceCommitmentHash: EVIDENCE_HASH,
          coveredIntents: [
            "CI_STATUS",
            "SECURITY_SCAN",
            "ADMIN_OVERRIDE"
          ],
          checks: [{
            name: "extra",
            status: "PASS",
            reason: "extra"
          }]
        }
      });
      return {
        contained:
          result.decision.decision === "BLOCK" &&
          result.permit === null,
        unauthorizedExecutions: 0
      };
    }
  },
  {
    name: "adapter_missing_evidence_commitment",
    async run(i) {
      const result = await sdkDecision(i, {
        evaluation: {
          evidenceCommitmentHash: null,
          coveredIntents: ["CI_STATUS", "SECURITY_SCAN"],
          checks: [{
            name: "uncommitted",
            status: "PASS",
            reason: "uncommitted"
          }]
        }
      });
      return {
        contained:
          result.decision.decision === "HOLD" &&
          result.permit === null,
        unauthorizedExecutions: 0
      };
    }
  },
  {
    name: "adapter_missing_trusted_checks",
    async run(i) {
      const result = await sdkDecision(i, {
        evaluation: {
          evidenceCommitmentHash: EVIDENCE_HASH,
          coveredIntents: ["CI_STATUS", "SECURITY_SCAN"],
          checks: []
        }
      });
      return {
        contained:
          result.decision.decision === "HOLD" &&
          result.permit === null,
        unauthorizedExecutions: 0
      };
    }
  },
  {
    name: "undelegated_action_blocks_before_evidence",
    async run(i) {
      let evaluations = 0;
      const result = await sdkDecision(
        i,
        { onEvaluate: () => { evaluations++; } },
        mandate(i, { target: OTHER_TARGET })
      );
      return {
        contained:
          result.decision.decision === "BLOCK" &&
          result.permit === null &&
          evaluations === 0,
        unauthorizedExecutions: 0
      };
    }
  },
  {
    name: "undelegated_required_intent_blocks_before_evidence",
    async run(i) {
      let evaluations = 0;
      const result = await sdkDecision(
        i,
        { onEvaluate: () => { evaluations++; } },
        mandate(i, { requiredIntents: ["CI_STATUS"] })
      );
      return {
        contained:
          result.decision.decision === "BLOCK" &&
          result.permit === null &&
          evaluations === 0,
        unauthorizedExecutions: 0
      };
    }
  },
  {
    name: "adapter_freeze_contract_mismatch",
    async run(i) {
      let contained = false;
      try {
        await sdkDecision(i, {
          freezeType: "github.close"
        });
      } catch (error: unknown) {
        contained =
          error instanceof Error &&
          error.message === "action_adapter_freeze_contract_mismatch";
      }
      return {
        contained,
        unauthorizedExecutions: 0
      };
    }
  },
  {
    name: "unregistered_adapter",
    async run(i) {
      const registry = new ActionAdapterRegistry();
      let contained = false;
      try {
        await authorizeRegisteredAction({
          registry,
          adapterType: "github.merge",
          policyId: "github.merge.v1",
          policyVersion: 1,
          proposal: { target: TARGET, variant: i },
          mandate: mandate(i),
          agentId: "coding-agent",
          signer: SIGNER,
          now: NOW
        });
      } catch (error: unknown) {
        contained =
          error instanceof Error &&
          error.message === "action_adapter_not_registered";
      }
      return {
        contained,
        unauthorizedExecutions: 0
      };
    }
  },
  {
    name: "non_finite_action_parameter_rejected",
    async run(i) {
      let contained = false;
      try {
        createGeneralAction({
          type: "github.merge",
          target: TARGET,
          parameters: { value: Number.POSITIVE_INFINITY },
          policyId: "github.merge.v1"
        }, {
          id: `bad-number-${i}`,
          now: NOW
        });
      } catch {
        contained = true;
      }
      return {
        contained,
        unauthorizedExecutions: 0
      };
    }
  }
];

async function main(): Promise<void> {
  console.log("\nPROOFGATE GENERAL AUTHORIZATION FUZZ");
  console.log("====================================");
  console.log("Mode: OFFLINE_DETERMINISTIC");
  console.log("Core: proofgate.action.v2 / mandate.v2 / permit.v2");
  console.log(`Mutation families: ${families.length}`);
  console.log(`Cases per family: ${CASES_PER_FAMILY}\n`);

  let contained = 0;
  let total = 0;
  let unauthorizedExecutions = 0;
  let uncaughtErrors = 0;

  for (const family of families) {
    let familyContained = 0;

    for (let i = 0; i < CASES_PER_FAMILY; i++) {
      total++;
      try {
        const result = await family.run(i);
        unauthorizedExecutions += result.unauthorizedExecutions;
        if (result.contained) {
          contained++;
          familyContained++;
        }
      } catch (error) {
        uncaughtErrors++;
        console.error(
          `UNCAUGHT | ${family.name} | case ${i} |`,
          error
        );
      }
    }

    console.log(
      `${familyContained === CASES_PER_FAMILY ? "PASS" : "FAIL"} | ` +
      `${family.name} | ${familyContained}/${CASES_PER_FAMILY}`
    );
  }

  let validControls = 0;
  for (let i = 0; i < CASES_PER_FAMILY; i++) {
    try {
      const context = baseline(10_000 + i);
      let callbacks = 0;
      const result = await executeGeneralAction({
        ...context,
        verifier: SIGNER,
        store: new MemoryPermitStore(),
        killSwitch: enabledKillSwitch,
        executionId: `control-${i}`,
        execute: async () => {
          callbacks++;
          return "ok";
        },
        now: NOW
      });
      if (result.status === "EXECUTED" && callbacks === 1) {
        validControls++;
      }
    } catch (error) {
      uncaughtErrors++;
      console.error(`UNCAUGHT | valid_control | case ${i} |`, error);
    }
  }

  console.log(`\nAdversarial cases contained: ${contained}/${total}`);
  console.log(`Valid controls passed: ${validControls}/${CASES_PER_FAMILY}`);
  console.log(`Unauthorized executions: ${unauthorizedExecutions}`);
  console.log(`Uncaught errors: ${uncaughtErrors}`);
  console.log("Telegraph requests: 0");
  console.log("x402 payments: 0");
  console.log("Blockchain writes: 0");

  if (
    contained !== total ||
    validControls !== CASES_PER_FAMILY ||
    unauthorizedExecutions !== 0 ||
    uncaughtErrors !== 0
  ) {
    process.exitCode = 1;
  }
}

await main();
