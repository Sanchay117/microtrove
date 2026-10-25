// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {console} from "forge-std/console.sol";

import {BaseTest} from "../BaseTest.sol";
import {Handler} from "./Handler.sol";

contract InvariantsTest is BaseTest {
    Handler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new Handler(loans, vault, musd, feed);
        targetContract(address(handler));
    }

    /// @dev Every wei of BTC held is either a trove's collateral or a claimable surplus.
    function invariant_BtcIsFullyAccounted() public view {
        assertEq(address(loans).balance, loans.totalCollateral() + loans.totalSurplus());
    }

    /// @dev Global totals match the sum of individual troves.
    function invariant_TotalsMatchTroves() public view {
        uint256 collateral;
        uint256 principal;
        uint256 weighted;
        uint256 interest;
        for (uint256 i; i < handler.borrowerCount(); ++i) {
            (, uint256 c, uint256 p, uint256 pending,,, uint16 rate,) =
                loans.getTrove(handler.borrowers(i));
            collateral += c;
            principal += p;
            weighted += p * rate;
            interest += pending;
        }
        assertEq(collateral, loans.totalCollateral(), "collateral");
        assertEq(principal, loans.totalPrincipal(), "principal");
        assertEq(weighted, loans.rateWeightedPrincipal(), "rate weights");
        assertApproxEqAbs(interest, loans.pendingTotalInterest(), 1e6, "interest");
    }

    /// @dev The loan book never keeps MUSD; it moves straight to the vault or treasury.
    function invariant_LoanBookHoldsNoMusd() public view {
        assertEq(musd.balanceOf(address(loans)), 0);
    }

    /// @dev Vault assets are exactly idle MUSD plus what borrowers owe lenders.
    function invariant_VaultAssetsAreIdlePlusLoans() public view {
        assertEq(vault.totalAssets(), musd.balanceOf(address(vault)) + loans.lenderAssets());
    }

    /// @dev Queued shares are escrowed by the vault itself.
    function invariant_QueuedSharesAreEscrowed() public view {
        assertEq(vault.balanceOf(address(vault)), vault.pendingShares());
    }

    /// @dev Logs how often each path succeeded, so a run that only hit reverts is visible.
    function afterInvariant() public view {
        string[9] memory actions = [
            "open",
            "borrow",
            "repay",
            "close",
            "liquidate",
            "claimSurplus",
            "redeemNow",
            "requestRedeem",
            "filled"
        ];
        for (uint256 i; i < actions.length; ++i) {
            console.log(actions[i], handler.successes(actions[i]));
        }
    }

    /// @dev Nothing is lent out of MUSD reserved for queued withdrawals.
    function invariant_LendableNeverExceedsUnreservedIdle() public view {
        uint256 idle = musd.balanceOf(address(vault));
        uint256 reserved = vault.pendingAssets();
        assertEq(vault.lendableLiquidity(), idle > reserved ? idle - reserved : 0);
    }
}
