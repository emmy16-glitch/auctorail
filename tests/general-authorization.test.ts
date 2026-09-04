import { describe, expect, it } from "vitest";

import {
  createGeneralAction,
  verifyGeneralActionIntegrity,
  type GeneralActionEnvelope
} from "../src/core/general-action.js";
import {
  createGeneralMandate,
  evaluateGeneralMandate
} from "../src/core/general-mandate.js";
import type {
  PermitConsumption,
  PermitConsumptionStore,
  ConsumeResult
} from "../src/executor/permit-store.js";
import {
  createGeneralAuthorizationDecision,
  mintGeneralPermit,
  verifyGeneralDecision
} from "../src/permit/general-permit.js";
import {
  LocalDevelopmentSigner
} from "../src/permit/signer.js";
import {
  ActionAdapterRegistry,
  authorizeRegisteredAction,
  executeRegisteredAction,
  type ProofGateActionAdapter,
  type TrustedAdapterEvaluation
} from "../src/sdk/action-adapter.js";

const NOW = new Date("2026-09-03T06:30:00.000Z");
const TARGET = "github:emmy16-glitch/proof-gate#42";
const EVIDENCE_HASH = `0x${"a".repeat(64)}`;
const SIGNER = new LocalDevelopmentSigner(
  "proofgate-general-test-secret-1234567890abcdef"
);

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
          existing.executionId &&
          executionId &&
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

function mandate(overrides?: Partial<{
  agentId: string;
  target: string;
  requiredIntents: string[];
  expiresAt: string;
}>) {
  return createGeneralMandate({
    mandateId: "general-test-mandate",
    principalId: "general-test-principal",
    agentId: overrides?.agentId ?? "coding-agent",
    allowedActionTypes: ["github.merge"],
    allowedTargets: [overrides?.target ?? TARGET],
    requiredIntents:
      overrides?.requiredIntents ?? ["CI_STATUS", "SECURITY_SCAN"],
    policyId: "github.merge.v1",
    policyVersion: 1,
    status: "ACTIVE",
    issuedAt: "2026-09-03T06:00:00.000Z",
    expiresAt:
      overrides?.expiresAt ?? "2026-09-03T07:00:00.000Z",
    version: 1
  });
}

interface MergeProposal {
  target: string;
  branch: string;
  sha: string;
}

function adapter(options?: Partial<{
  evaluation: TrustedAdapterEvaluation;
  onEvaluate: () => void;
  onExecute: () => Promise<string>;
}>): ProofGateActionAdapter<MergeProposal, string> {
  return {
    type: "github.merge",
    policyId: "github.merge.v1",
    policyVersion: 1,
    freeze(proposal) {
      return createGeneralAction({
        type: "github.merge",
        target: proposal.target,
        parameters: {
          branch: proposal.branch,
          sha: proposal.sha
        },
        policyId: "github.merge.v1",
        policyVersion: 1
      }, { now: NOW });
    },
    requiredIntents() {
      return ["CI_STATUS", "SECURITY_SCAN"];
    },
    async evaluateTrusted() {
      options?.onEvaluate?.();
      return options?.evaluation ?? {
        evidenceCommitmentHash: EVIDENCE_HASH,
        coveredIntents: ["CI_STATUS", "SECURITY_SCAN"],
        checks: [
          {
            name: "trusted_ci_and_security_evidence",
            status: "PASS",
            reason: "Trusted host verified required CI and security evidence."
          }
        ]
      };
    },
    async execute() {
      return options?.onExecute
        ? options.onExecute()
        : "merged";
    }
  };
}

function proposal(target = TARGET): MergeProposal {
  return {
    target,
    branch: "main",
    sha: "abc123"
  };
}

const enabledKillSwitch = {
  async isDisabled(): Promise<boolean> {
    return false;
  }
};

describe("generic ProofGate authorization", () => {
  it("canonicalizes arbitrary action parameters and detects semantic tampering", () => {
    const action = createGeneralAction({
      type: "github.merge",
      target: TARGET,
      parameters: {
        sha: "abc123",
        nested: { z: 1, a: true },
        branch: "main"
      },
      policyId: "github.merge.v1"
    }, { now: NOW });

    expect(verifyGeneralActionIntegrity(action)).toBe(true);

    const tampered = structuredClone(action);
    tampered.parameters.branch = "release";
    expect(verifyGeneralActionIntegrity(tampered)).toBe(false);
  });

  it("checks exact agent, action type, target and policy in a general Mandate", () => {
    const action = adapter().freeze(proposal());
    const good = evaluateGeneralMandate(
      mandate(),
      action,
      "coding-agent",
      NOW
    );
    expect(good.valid).toBe(true);

    const wrongAgent = evaluateGeneralMandate(
      mandate(),
      action,
      "other-agent",
      NOW
    );
    expect(wrongAgent.valid).toBe(false);

    const outsideTarget = adapter().freeze(
      proposal("github:other/repo#99")
    );
    expect(
      evaluateGeneralMandate(
        mandate(),
        outsideTarget,
        "coding-agent",
        NOW
      ).valid
    ).toBe(false);
  });

  it("blocks before trusted evidence acquisition when authority is not delegated", async () => {
    let evaluateCalls = 0;
    const registry = new ActionAdapterRegistry();
    registry.register(adapter({
      onEvaluate: () => { evaluateCalls++; }
    }));

    const result = await authorizeRegisteredAction({
      registry,
      adapterType: "github.merge",
      policyId: "github.merge.v1",
      policyVersion: 1,
      proposal: proposal("github:other/repo#99"),
      mandate: mandate(),
      agentId: "coding-agent",
      signer: SIGNER,
      now: NOW
    });

    expect(result.decision.decision).toBe("BLOCK");
    expect(result.permit).toBeNull();
    expect(evaluateCalls).toBe(0);
  });

  it("holds when required Intent coverage or evidence commitment is incomplete", async () => {
    const missingCoverage = new ActionAdapterRegistry();
    missingCoverage.register(adapter({
      evaluation: {
        evidenceCommitmentHash: EVIDENCE_HASH,
        coveredIntents: ["CI_STATUS"],
        checks: [{
          name: "partial_evidence",
          status: "PASS",
          reason: "Only CI was checked."
        }]
      }
    }));

    const held = await authorizeRegisteredAction({
      registry: missingCoverage,
      adapterType: "github.merge",
      policyId: "github.merge.v1",
      policyVersion: 1,
      proposal: proposal(),
      mandate: mandate(),
      agentId: "coding-agent",
      signer: SIGNER,
      now: NOW
    });
    expect(held.decision.decision).toBe("HOLD");
    expect(held.permit).toBeNull();

    const missingCommitment = new ActionAdapterRegistry();
    missingCommitment.register(adapter({
      evaluation: {
        evidenceCommitmentHash: null,
        coveredIntents: ["CI_STATUS", "SECURITY_SCAN"],
        checks: [{
          name: "uncommitted_evidence",
          status: "PASS",
          reason: "Evidence was observed but not committed."
        }]
      }
    }));

    const uncommitted = await authorizeRegisteredAction({
      registry: missingCommitment,
      adapterType: "github.merge",
      policyId: "github.merge.v1",
      policyVersion: 1,
      proposal: proposal(),
      mandate: mandate(),
      agentId: "coding-agent",
      signer: SIGNER,
      now: NOW
    });
    expect(uncommitted.decision.decision).toBe("HOLD");
    expect(uncommitted.permit).toBeNull();
  });

  it("blocks adapters that claim evidence for unrequested Intents", async () => {
    const registry = new ActionAdapterRegistry();
    registry.register(adapter({
      evaluation: {
        evidenceCommitmentHash: EVIDENCE_HASH,
        coveredIntents: [
          "CI_STATUS",
          "SECURITY_SCAN",
          "UNREQUESTED_INTENT"
        ],
        checks: [{
          name: "evidence",
          status: "PASS",
          reason: "Synthetic trusted evidence."
        }]
      }
    }));

    const result = await authorizeRegisteredAction({
      registry,
      adapterType: "github.merge",
      policyId: "github.merge.v1",
      policyVersion: 1,
      proposal: proposal(),
      mandate: mandate(),
      agentId: "coding-agent",
      signer: SIGNER,
      now: NOW
    });

    expect(result.decision.decision).toBe("BLOCK");
    expect(result.permit).toBeNull();
  });

  it("authorizes and executes a registered action once, then blocks replay", async () => {
    let executions = 0;
    const registry = new ActionAdapterRegistry();
    registry.register(adapter({
      onExecute: async () => {
        executions++;
        return "merged";
      }
    }));

    const authorization = await authorizeRegisteredAction({
      registry,
      adapterType: "github.merge",
      policyId: "github.merge.v1",
      policyVersion: 1,
      proposal: proposal(),
      mandate: mandate(),
      agentId: "coding-agent",
      signer: SIGNER,
      now: NOW,
      ttlSeconds: 30
    });

    expect(authorization.decision.decision).toBe("ALLOW");
    expect(authorization.permit).not.toBeNull();

    const store = new MemoryPermitStore();
    const first = await executeRegisteredAction({
      registry,
      mandate: mandate(),
      authorization,
      verifier: SIGNER,
      store,
      killSwitch: enabledKillSwitch,
      executionId: "execution-1",
      now: NOW
    });
    expect(first.status).toBe("EXECUTED");
    expect(executions).toBe(1);

    const replay = await executeRegisteredAction({
      registry,
      mandate: mandate(),
      authorization,
      verifier: SIGNER,
      store,
      killSwitch: enabledKillSwitch,
      executionId: "execution-2",
      now: NOW
    });
    expect(replay.status).toBe("BLOCKED");
    expect(executions).toBe(1);
  });

  it("revalidates Mandate expiry at execution time even while the Permit is alive", async () => {
    const shortMandate = mandate({
      expiresAt: "2026-09-03T06:30:10.000Z"
    });
    const registry = new ActionAdapterRegistry();
    let executions = 0;
    registry.register(adapter({
      onExecute: async () => {
        executions++;
        return "merged";
      }
    }));

    const authorization = await authorizeRegisteredAction({
      registry,
      adapterType: "github.merge",
      policyId: "github.merge.v1",
      policyVersion: 1,
      proposal: proposal(),
      mandate: shortMandate,
      agentId: "coding-agent",
      signer: SIGNER,
      now: NOW,
      ttlSeconds: 30
    });
    expect(authorization.permit).not.toBeNull();

    const result = await executeRegisteredAction({
      registry,
      mandate: shortMandate,
      authorization,
      verifier: SIGNER,
      store: new MemoryPermitStore(),
      killSwitch: enabledKillSwitch,
      executionId: "expired-mandate-execution",
      now: new Date("2026-09-03T06:30:11.000Z")
    });

    expect(result).toMatchObject({
      status: "BLOCKED",
      code: "general_mandate_execution_invalid"
    });
    expect(executions).toBe(0);
  });

  it("fails closed on disabled or unavailable execution kill switch", async () => {
    let executions = 0;
    const registry = new ActionAdapterRegistry();
    registry.register(adapter({
      onExecute: async () => {
        executions++;
        return "merged";
      }
    }));

    const authorization = await authorizeRegisteredAction({
      registry,
      adapterType: "github.merge",
      policyId: "github.merge.v1",
      policyVersion: 1,
      proposal: proposal(),
      mandate: mandate(),
      agentId: "coding-agent",
      signer: SIGNER,
      now: NOW
    });

    const disabled = await executeRegisteredAction({
      registry,
      mandate: mandate(),
      authorization,
      verifier: SIGNER,
      store: new MemoryPermitStore(),
      killSwitch: {
        async isDisabled() { return true; }
      },
      executionId: "disabled",
      now: NOW
    });
    expect(disabled.code).toBe("general_execution_disabled");

    const unavailable = await executeRegisteredAction({
      registry,
      mandate: mandate(),
      authorization,
      verifier: SIGNER,
      store: new MemoryPermitStore(),
      killSwitch: {
        async isDisabled() {
          throw new Error("kill-switch-store-down");
        }
      },
      executionId: "unavailable",
      now: NOW
    });
    expect(unavailable.code).toBe(
      "general_execution_kill_switch_unavailable"
    );
    expect(executions).toBe(0);
  });

  it("consumes authority before an ambiguous external effect and never retries it", async () => {
    let executions = 0;
    const registry = new ActionAdapterRegistry();
    registry.register(adapter({
      onExecute: async () => {
        executions++;
        throw new Error("transport_lost_after_submit");
      }
    }));

    const authorization = await authorizeRegisteredAction({
      registry,
      adapterType: "github.merge",
      policyId: "github.merge.v1",
      policyVersion: 1,
      proposal: proposal(),
      mandate: mandate(),
      agentId: "coding-agent",
      signer: SIGNER,
      now: NOW
    });
    const store = new MemoryPermitStore();

    const ambiguous = await executeRegisteredAction({
      registry,
      mandate: mandate(),
      authorization,
      verifier: SIGNER,
      store,
      killSwitch: enabledKillSwitch,
      executionId: "ambiguous-1",
      now: NOW
    });
    expect(ambiguous.status).toBe("AMBIGUOUS");
    expect(executions).toBe(1);

    const retry = await executeRegisteredAction({
      registry,
      mandate: mandate(),
      authorization,
      verifier: SIGNER,
      store,
      killSwitch: enabledKillSwitch,
      executionId: "ambiguous-2",
      now: NOW
    });
    expect(retry.status).toBe("BLOCKED");
    expect(executions).toBe(1);
  });

  it("rejects a self-consistent ALLOW decision for the wrong agent", () => {
    const action: GeneralActionEnvelope = adapter().freeze(proposal());
    const delegated = mandate();
    const forged = createGeneralAuthorizationDecision({
      mandate: delegated,
      action,
      agentId: "attacker-agent",
      evidenceCommitmentHash: EVIDENCE_HASH,
      checks: [{
        name: "forged_check",
        status: "PASS",
        reason: "Attacker claims success."
      }],
      now: NOW
    });

    expect(
      verifyGeneralDecision(forged, delegated, action)
    ).toBe(false);
    expect(() =>
      mintGeneralPermit({
        mandate: delegated,
        action,
        decision: forged,
        signer: SIGNER,
        now: NOW
      })
    ).toThrow("general_decision_integrity_failed");
  });
});
