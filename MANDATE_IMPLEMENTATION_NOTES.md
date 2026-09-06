# Auctorail Mandate Binding Implementation

Prepared against main commit `d4cb3e6eb450b0792d5e65fdb034b7420ad9dc0c`.

## Security changes

- Adds canonical `MandateContract` with SHA-256 `mandateHash`.
- Normalizes and de-duplicates set-like mandate fields before hashing.
- Uses integer minor units only for spending limits.
- Adds mandate integrity verification so post-hash object mutation fails closed.
- Adds deterministic authority checks for active time, agent, action type, chain,
  asset, destination, amount, policy and required Telegraph intent.
- Makes mandate violations `BLOCK` with stable attack-specific codes.
- Binds `mandateHash` and mandate references into `decisionHash`.
- Makes permits require and authenticate `mandateHash`.
- Removes the permit-mint path that lacks mandate context.
- Makes permit verification and the Controlled Executor independently re-check
  mandate binding.
- Upgrades Proof Receipts to `proofgate.receipt.v2` and commits the canonical
  mandate into the receipt hash.
- Adds receipt-side mandate integrity checks.
- Adds terminal `BLOCKED` operation-journal state for deterministic security
  failures.
- Makes live Telegraph proof refuse to spend x402 funds when the action is
  already outside delegated authority.

## Test expansion

Adds mandate canonicalization, authority-escape, mandate-mutation, strong-
Telegraph-cannot-override-mandate, different-mandate permit, receipt mandate
Tamper, and updated end-to-end authorization tests.

Expected test count should increase materially above the current 39 tests.

## Required verification in the real repository

Run exactly:

```bash
npm run typecheck
npm test
git diff --check
```

Do not merge if any command fails.
