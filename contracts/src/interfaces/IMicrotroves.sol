// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice What the lender vault needs from the loan book.
interface ILoanBook {
    /// @notice MUSD the vault is owed by borrowers: outstanding principal plus
    ///         accrued interest, net of the protocol's share of that interest.
    function lenderAssets() external view returns (uint256);
}

/// @notice What the loan book needs from the lender vault.
interface IMicrotroveVault {
    function asset() external view returns (address);

    /// @notice MUSD that can be lent right now without touching liquidity
    ///         reserved for queued withdrawals.
    function lendableLiquidity() external view returns (uint256);

    /// @notice Sends `amount` MUSD to a borrower. Callable only by the loan book.
    function lend(address to, uint256 amount) external;
}
