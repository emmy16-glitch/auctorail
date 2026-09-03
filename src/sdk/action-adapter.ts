import type {
  GeneralActionEnvelope
} from "../core/general-action.js";
import {
  evaluateGeneralMandate,
  type GeneralMandate
} from "../core/general-mandate.js";
import {
  executeGeneralAction,
  type GeneralExecutionResult
} from "../executor/general-executor.js";
import type {
  PermitConsumptionStore
} from "../executor/permit-store.js";
import {
  createGeneralAuthorizationDecision,
  mintGeneralPermit,
  type GeneralAuthorizationCheck,
  type GeneralAuthorizationDecision,
  type GeneralPermit
} from "../permit/general-permit.js";
import type {
  PermitSigner,
  PermitVerifier
} from "../permit/signer.js";

export interface TrustedAdapterEvaluation {
  evidenceCommitmentHash: string | null;
  checks: GeneralAuthorizationCheck[];
}

export interface ProofGateActionAdapter<Proposal = unknown, Result = unknown> {
  readonly type: string;
  readonly policyId: string;
  readonly policyVersion: number;
  freeze(proposal: Proposal): GeneralActionEnvelope;
  requiredIntents(action: GeneralActionEnvelope): string[];
  evaluateTrusted(input: {
    action: GeneralActionEnvelope;
    requiredIntents: string[];
    now: Date;
  }): Promise<TrustedAdapterEvaluation>;
  execute(action: GeneralActionEnvelope): Promise<Result>;
}

export class ActionAdapterRegistry {
  private readonly adapters = new Map<
    string,
    ProofGateActionAdapter<unknown, unknown>
  >();

  private key(type: string, policyId: string, policyVersion: number): string {
    return `${type.trim().toLowerCase()}::${policyId.trim().toLowerCase()}::${policyVersion}`;
  }

  register<P, R>(adapter: ProofGateActionAdapter<P, R>): void {
    if (
      !adapter.type.trim() ||
      !adapter.policyId.trim() ||
      !Number.isInteger(adapter.policyVersion) ||
      adapter.policyVersion < 1
    ) {
      throw new Error("action_adapter_metadata_invalid");
    }

    const key = this.key(
      adapter.type,
      adapter.policyId,
      adapter.policyVersion
    );
    if (this.adapters.has(key)) {
      throw new Error("action_adapter_already_registered");
    }

    this.adapters.set(
      key,
      adapter as ProofGateActionAdapter<unknown, unknown>
    );
  }

  resolve<P = unknown, R = unknown>(
    type: string,
    policyId: string,
    policyVersion: number
  ): ProofGateActionAdapter<P, R> | null {
    return (
      this.adapters.get(
        this.key(type, policyId, policyVersion)
      ) as ProofGateActionAdapter<P, R> | undefined
    ) ?? null;
  }
}

export interface RegisteredAuthorizationResult {
  action: GeneralActionEnvelope;
  requiredIntents: string[];
  decision: GeneralAuthorizationDecision;
  permit: GeneralPermit | null;
}

function unique(values: string[]): string[] {
  return [...new Set(
    values.map((value) => value.trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

export async function authorizeRegisteredAction<P>(input: {
  registry: ActionAdapterRegistry;
  adapterType: string;
  policyId: string;
  policyVersion: number;
  proposal: P;
  mandate: GeneralMandate;
  agentId: string;
  signer: PermitSigner;
  now?: Date;
  ttlSeconds?: number;
}): Promise<RegisteredAuthorizationResult> {
  const adapter = input.registry.resolve<P>(
    input.adapterType,
    input.policyId,
    input.policyVersion
  );
  if (!adapter) {
    throw new Error("action_adapter_not_registered");
  }

  const action = adapter.freeze(input.proposal);
  const now = input.now ?? new Date();

  if (
    action.type !== adapter.type ||
    action.policyId !== adapter.policyId ||
    action.policyVersion !== adapter.policyVersion
  ) {
    throw new Error("action_adapter_freeze_contract_mismatch");
  }

  const mandateEvaluation = evaluateGeneralMandate(
    input.mandate,
    action,
    input.agentId,
    now
  );
  const requiredIntents = unique(
    adapter.requiredIntents(action)
  );

  const delegatedChecks: GeneralAuthorizationCheck[] =
    requiredIntents.map((intent) => {
      const delegated =
        input.mandate.requiredIntents.includes(intent);
      return delegated
        ? {
            name: `delegated_intent:${intent}`,
            status: "PASS" as const,
            reason: `Mandate delegates required Intent ${intent}.`
          }
        : {
            name: `delegated_intent:${intent}`,
            status: "BLOCK" as const,
            reason: `Mandate does not delegate required Intent ${intent}.`,
            code: "general_required_intent_not_delegated"
          };
    });

  const mandateChecks: GeneralAuthorizationCheck[] =
    mandateEvaluation.checks.map((check) => ({
      name: check.name,
      status: check.status,
      reason: check.reason,
      ...(check.code ? { code: check.code } : {})
    }));

  // Only the trusted adapter runs evidence acquisition/evaluation. The agent
  // supplies a proposal; it does not supply an ALLOW decision or permit.
  const trusted = await adapter.evaluateTrusted({
    action,
    requiredIntents,
    now
  });

  const decision = createGeneralAuthorizationDecision({
    mandate: input.mandate,
    action,
    agentId: input.agentId,
    evidenceCommitmentHash:
      trusted.evidenceCommitmentHash,
    checks: [
      ...mandateChecks,
      ...delegatedChecks,
      ...trusted.checks
    ],
    now
  });

  const permit =
    decision.decision === "ALLOW"
      ? mintGeneralPermit({
          mandate: input.mandate,
          action,
          decision,
          signer: input.signer,
          now,
          ttlSeconds: input.ttlSeconds
        })
      : null;

  return {
    action,
    requiredIntents,
    decision,
    permit
  };
}

export async function executeRegisteredAction<R>(input: {
  registry: ActionAdapterRegistry;
  mandate: GeneralMandate;
  authorization: RegisteredAuthorizationResult;
  verifier: PermitVerifier;
  store: PermitConsumptionStore;
  executionId: string;
  now?: Date;
}): Promise<GeneralExecutionResult<R>> {
  const permit = input.authorization.permit;
  if (!permit) {
    return {
      status: "BLOCKED",
      code: "general_executable_permit_missing",
      executionId: input.executionId
    };
  }

  const action = input.authorization.action;
  const adapter = input.registry.resolve<unknown, R>(
    action.type,
    action.policyId,
    action.policyVersion
  );
  if (!adapter) {
    return {
      status: "BLOCKED",
      code: "action_adapter_not_registered",
      executionId: input.executionId
    };
  }

  return executeGeneralAction({
    mandate: input.mandate,
    action,
    decision: input.authorization.decision,
    permit,
    verifier: input.verifier,
    store: input.store,
    executionId: input.executionId,
    execute: (candidate) => adapter.execute(candidate),
    now: input.now
  });
}
