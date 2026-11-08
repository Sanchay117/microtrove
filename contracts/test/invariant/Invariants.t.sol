// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {console} from "forge-std/console.sol";

import {BaseTest} from "../BaseTest.sol";
import {Handler} from "./Handler.sol";
import {Microtroves} from "../../src/Microtroves.sol";

contract InvariantsTest is BaseTest {
    Handler internal handler;

    function setUp() public override {
        super.setUp();
        // Run with the deployed 10% protocol fee so fee accounting is exercised too.
        Microtroves.Params memory p = defaultParams();
        p.protocolFeeBps = 1_000;
        vm.prank(gov);
        loans.setParams(p);
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

    /// @dev The loan book keeps only the protocol's fees; repayments go straight to the vault.
    function invariant_LoanBookHoldsOnlyProtocolFees() public view {
        assertEq(musd.balanceOf(address(loans)), loans.protocolFees());
    }

    /// @dev Vault assets are exactly idle MUSD plus what borrowers owe lenders, and
    ///      MUSD set aside for refused payments is fully backed.
    function invariant_VaultAssetsAreIdlePlusLoans() public view {
        uint256 held = musd.balanceOf(address(vault));
        assertEq(vault.totalAssets(), held - vault.totalClaimable() + loans.lenderAssets());
    }

    /// @dev Queue progress: everything before the head is fully paid or cancelled.
    function invariant_QueueHeadOnlyPassesClosedRequests() public view {
        uint256 head = vault.queueHead();
        for (uint256 i; i < head; ++i) {
            assertEq(vault.getRequest(i).shares, 0);
        }
    }

    /// @dev Queued shares are escrowed by the vault itself.
    function invariant_QueuedSharesAreEscrowed() public view {
        assertEq(vault.balanceOf(address(vault)), vault.pendingShares());
    }

    /// @dev Logs how often each path succeeded, so a run that only hit reverts is visible.
    function afterInvariant() public view {
        string[10] memory actions = [
            "open",
            "borrow",
            "repay",
            "close",
            "liquidate",
            "claimSurplus",
            "redeemNow",
            "requestRedeem",
            "filled",
            "claim"
        ];
        for (uint256 i; i < actions.length; ++i) {
            console.log(actions[i], handler.successes(actions[i]));
        }
    }

    /// @dev Nothing is lent out of MUSD reserved for queued withdrawals.
    function invariant_LendableNeverExceedsUnreservedIdle() public view {
        uint256 idle = musd.balanceOf(address(vault)) - vault.totalClaimable();
        uint256 reserved = vault.pendingAssets();
        assertEq(vault.lendableLiquidity(), idle > reserved ? idle - reserved : 0);
    }
}
