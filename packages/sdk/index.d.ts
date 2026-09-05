export type AuctorailDecision = "ALLOW" | "HOLD" | "BLOCK";

export interface AuctorailOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
}

export interface AuthorizeInput {
  agent?: string;
  amount: number | string;
  recipient: string;
  limit?: number | string;
  durationSeconds?: number;
  reason?: string;
  reference?: string;
  live?: boolean;
  idempotencyKey?: string;
}

export interface AuthorizationResult {
  id: string | null;
  decision: AuctorailDecision;
  allowed: boolean;
  reason: string | null;
  riskTier: string | null;
  action: unknown;
  evidence: unknown;
  permit: unknown;
  executionToken: string | null;
  raw: any;
}

export interface ExecuteOptions {
  idempotencyKey?: string;
}

export declare class Auctorail {
  constructor(options?: AuctorailOptions);
  authorize(input: AuthorizeInput): Promise<AuthorizationResult>;
  execute(authorization: AuthorizationResult, options?: ExecuteOptions): Promise<any>;
}

export default Auctorail;
