// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AuctorailPermitGate
/// @notice Base Sepolia USDC treasury that releases funds only for an
/// Auctorail-signed, exact-action, one-use EIP-712 execution permit.
///
/// Security properties:
/// - protected USDC is held by this contract, not by the agent;
/// - the permit signer is immutable;
/// - the Base Sepolia USDC token is immutable;
/// - signatures are bound to this chain and this exact contract via EIP-712;
/// - amount, destination, action hash, decision hash and upstream Auctorail
///   permit hash are signed together;
/// - a permit hash can be consumed exactly once;
/// - permit consumption happens before the external token call;
/// - no owner/admin/upgrade/bypass function exists.
contract AuctorailPermitGate {
    error WrongChain(uint256 chainId);
    error ZeroAddress();
    error InvalidAmount();
    error InvalidToken();
    error PermitExpired();
    error PermitAlreadyConsumed();
    error InvalidSignatureLength();
    error InvalidSignatureV();
    error InvalidSignatureS();
    error InvalidPermitSigner();
    error TokenTransferFailed();

    uint256 public constant BASE_SEPOLIA_CHAIN_ID = 84532;

    bytes32 private constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant NAME_HASH = keccak256("AuctorailPermitGate");
    bytes32 private constant VERSION_HASH = keccak256("1");
    bytes32 public constant EXECUTION_PERMIT_TYPEHASH = keccak256(
        "ExecutionPermit(bytes32 permitHash,bytes32 actionHash,bytes32 decisionHash,address token,address destination,uint256 amount,uint256 deadline)"
    );

    // secp256k1n / 2. Reject high-s signatures so one authorization cannot
    // have multiple valid signature encodings.
    uint256 private constant SECP256K1N_HALF =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    address public immutable token;
    address public immutable permitSigner;
    uint256 private immutable initialChainId;
    bytes32 private immutable initialDomainSeparator;

    mapping(bytes32 => bool) public consumed;

    struct ExecutionPermit {
        bytes32 permitHash;
        bytes32 actionHash;
        bytes32 decisionHash;
        address token;
        address destination;
        uint256 amount;
        uint256 deadline;
    }

    event PermitConsumed(
        bytes32 indexed permitHash,
        bytes32 indexed actionHash,
        bytes32 indexed decisionHash,
        address destination,
        uint256 amount,
        address caller
    );

    event PaymentExecuted(
        bytes32 indexed permitHash,
        address indexed token,
        address indexed destination,
        uint256 amount
    );

    constructor(address token_, address permitSigner_) {
        if (block.chainid != BASE_SEPOLIA_CHAIN_ID) {
            revert WrongChain(block.chainid);
        }
        if (token_ == address(0) || permitSigner_ == address(0)) {
            revert ZeroAddress();
        }

        token = token_;
        permitSigner = permitSigner_;
        initialChainId = block.chainid;
        initialDomainSeparator = _buildDomainSeparator();
    }

    /// @notice Execute one exact authorized USDC payment.
    /// @dev Anyone may relay a valid permit; relaying does not let the caller
    /// change the signed effect. The protected funds remain gated by signature
    /// validity and the one-use permit hash.
    function execute(
        ExecutionPermit calldata permit,
        bytes calldata signature
    ) external returns (bool) {
        if (permit.token != token) revert InvalidToken();
        if (permit.destination == address(0)) revert ZeroAddress();
        if (permit.amount == 0) revert InvalidAmount();
        if (block.timestamp >= permit.deadline) revert PermitExpired();
        if (consumed[permit.permitHash]) revert PermitAlreadyConsumed();

        bytes32 digest = hashTypedPermit(permit);
        if (_recover(digest, signature) != permitSigner) {
            revert InvalidPermitSigner();
        }

        // Checks-effects-interactions: replay is dead before the ERC-20 call.
        consumed[permit.permitHash] = true;

        emit PermitConsumed(
            permit.permitHash,
            permit.actionHash,
            permit.decisionHash,
            permit.destination,
            permit.amount,
            msg.sender
        );

        _safeTransfer(permit.token, permit.destination, permit.amount);

        emit PaymentExecuted(
            permit.permitHash,
            permit.token,
            permit.destination,
            permit.amount
        );

        return true;
    }

    function domainSeparator() public view returns (bytes32) {
        if (block.chainid == initialChainId) {
            return initialDomainSeparator;
        }
        return _buildDomainSeparator();
    }

    function hashTypedPermit(
        ExecutionPermit calldata permit
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                EXECUTION_PERMIT_TYPEHASH,
                permit.permitHash,
                permit.actionHash,
                permit.decisionHash,
                permit.token,
                permit.destination,
                permit.amount,
                permit.deadline
            )
        );

        return keccak256(
            abi.encodePacked("\x19\x01", domainSeparator(), structHash)
        );
    }

    function _buildDomainSeparator() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                NAME_HASH,
                VERSION_HASH,
                block.chainid,
                address(this)
            )
        );
    }

    function _recover(
        bytes32 digest,
        bytes calldata signature
    ) private pure returns (address recovered) {
        if (signature.length != 65) revert InvalidSignatureLength();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (v != 27 && v != 28) revert InvalidSignatureV();
        if (uint256(s) > SECP256K1N_HALF) revert InvalidSignatureS();

        recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert InvalidPermitSigner();
    }

    function _safeTransfer(
        address token_,
        address destination,
        uint256 amount
    ) private {
        (bool ok, bytes memory data) = token_.call(
            abi.encodeWithSelector(
                bytes4(keccak256("transfer(address,uint256)")),
                destination,
                amount
            )
        );

        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) {
            revert TokenTransferFailed();
        }
    }
}
