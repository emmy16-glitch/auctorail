// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ProofGateVendor
/// @notice Minimal vendor destination used for the ProofGate
/// autonomous treasury demonstration.
///
/// Security design:
/// - no owner
/// - no admin
/// - no upgrade mechanism
/// - no pause mechanism
/// - no privileged withdrawal
/// - no mutable configuration
///
/// ERC-20 tokens such as USDC can still be transferred
/// directly to this contract address.
contract ProofGateVendor {
    bytes32 public immutable vendorId;

    constructor(bytes32 _vendorId) {
        vendorId = _vendorId;
    }

    function proofGateVendorVersion()
        external
        pure
        returns (uint256)
    {
        return 1;
    }
}
