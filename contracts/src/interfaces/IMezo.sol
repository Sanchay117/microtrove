// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice MUSD PriceFeed. Returns the BTC/USD price with 18 decimals and
///         reverts when the underlying oracle is stale.
interface IPriceFeed {
    function fetchPrice() external view returns (uint256);
}

/// @notice MUSD BorrowerOperationsSignatures. Lets a third party open an MUSD
///         trove for a borrower who signed an EIP-712 `OpenTrove` message.
interface IBorrowerOperationsSignatures {
    function openTroveWithSignature(
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint,
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external payable;

    function nonces(address _borrower) external view returns (uint256);
}
