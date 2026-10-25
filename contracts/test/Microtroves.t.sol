// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {BaseTest} from "./BaseTest.sol";
import {Microtroves} from "../src/Microtroves.sol";
import {MicrotroveVault} from "../src/MicrotroveVault.sol";

contract MicrotrovesTest is BaseTest {
    // ---------------------------------------------------------------------
    // Opening
    // ---------------------------------------------------------------------

    function test_Open_LendsMusdAndChargesIssuanceFee() public {
        _open(bob, 50e18, 25e18);

        (
            bool active,
            uint256 collateral,
            uint256 principal,
            uint256 interest,
            uint256 debt,
            uint64 maturity,
            uint16 rate,
            uint16 fee
        ) = loans.getTrove(bob);
        assertTrue(active);
        assertEq(collateral, btcFor(50e18));
        assertEq(principal, 25.125e18, "principal includes the 0.5% issuance fee");
        assertEq(interest, 0);
        assertEq(debt, 25.125e18);
        assertEq(maturity, START + 90 days);
        assertEq(rate, 500);
        assertEq(fee, 50);

        assertEq(musd.balanceOf(bob), 25e18);
        assertEq(vault.idleAssets(), 9_975e18);
        assertEq(loans.totalPrincipal(), 25.125e18);
        assertEq(vault.totalAssets(), 10_000.125e18, "issuance fee accrues to lenders");
        assertEq(loans.borrowerCount(), 1);
        uint256 collateralValue = 50e18;
        assertEq(loans.getIcr(bob), (collateralValue * 1e18) / 25.125e18);
    }

    function test_Open_WithoutDebtThenBorrowStartsTerm() public {
        _open(bob, 100e18, 0);
        (,,,,, uint64 maturity,,) = loans.getTrove(bob);
        assertEq(maturity, 0);

        vm.warp(START + 3 days);
        vm.prank(bob);
        loans.borrow(30e18);
        (,,,,, maturity,,) = loans.getTrove(bob);
        assertEq(maturity, START + 3 days + 90 days);
        assertEq(musd.balanceOf(bob), 30e18);
    }

    function test_Open_RevertsBelowMinDebt() public {
        uint256 collateral = btcFor(50e18);
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(Microtroves.DebtBelowMinimum.selector, 20.1e18, 25e18)
        );
        loans.open{value: collateral}(20e18);
    }

    function test_Open_RevertsAboveMaxDebt() public {
        uint256 collateral = btcFor(400e18);
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(Microtroves.DebtAboveMaximum.selector, 201e18, 200e18)
        );
        loans.open{value: collateral}(200e18);
    }

    function test_Open_AllowsMaxDebtIncludingFee() public {
        _open(bob, 400e18, 199e18);
        assertEq(_debt(bob), 199.995e18);
    }

    function test_Open_RevertsBelowMcr() public {
        // 27.6 USD clears the anti-dust floor (27.5) but not 110% of 25.125.
        uint256 collateral = btcFor(27.6e18);
        vm.prank(bob);
        vm.expectPartialRevert(Microtroves.CollateralRatioBelowMinimum.selector);
        loans.open{value: collateral}(25e18);
    }

    function test_Open_RevertsDustCollateral() public {
        uint256 collateral = btcFor(20e18);
        vm.prank(bob);
        vm.expectRevert(Microtroves.CollateralBelowMinimum.selector);
        loans.open{value: collateral}(0);
    }

    function test_Open_RevertsAboveMaxCr() public {
        uint256 collateral = btcFor(200e18);
        vm.prank(bob);
        vm.expectPartialRevert(Microtroves.CollateralRatioAboveMaximum.selector);
        loans.open{value: collateral}(25e18);
    }

    function test_Open_RevertsWhenAlreadyActive() public {
        _open(bob, 50e18, 25e18);
        uint256 collateral = btcFor(50e18);
        vm.prank(bob);
        vm.expectRevert(Microtroves.TroveAlreadyActive.selector);
        loans.open{value: collateral}(25e18);
    }

    function test_Open_RevertsWithoutCollateral() public {
        vm.prank(bob);
        vm.expectRevert(Microtroves.ZeroAmount.selector);
        loans.open(25e18);
    }

    // ---------------------------------------------------------------------
    // Interest, repaying and closing
    // ---------------------------------------------------------------------

    function test_Interest_AccruesSimpleAtCapturedRate() public {
        _open(bob, 50e18, 25e18);
        vm.warp(START + 30 days);
        uint256 expected = _interestFor(25.125e18, 500, 30 days);
        (,,, uint256 interest,,,,) = loans.getTrove(bob);
        assertEq(interest, expected);
        assertEq(loans.pendingTotalInterest(), expected);
        assertEq(vault.totalAssets(), 10_000.125e18 + expected);
    }

    function test_Repay_PaysInterestFirst() public {
        _open(bob, 50e18, 25e18);
        vm.warp(START + 30 days);
        uint256 interest = _interestFor(25.125e18, 500, 30 days);
        _fund(bob, 1e18);

        vm.prank(bob);
        loans.repay(interest);
        (,, uint256 principal, uint256 interestLeft,,,,) = loans.getTrove(bob);
        assertEq(interestLeft, 0);
        assertEq(principal, 25.125e18);
        assertEq(vault.idleAssets(), 9_975e18 + interest);
    }

    function test_Repay_RevertsWhenPrincipalWouldDropBelowMinimum() public {
        _open(bob, 50e18, 25e18);
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(Microtroves.DebtBelowMinimum.selector, 24.125e18, 25e18)
        );
        loans.repay(1e18);
    }

    function test_Repay_FullClearsTermAndOverpaymentIsCapped() public {
        _open(bob, 50e18, 25e18);
        vm.warp(START + 10 days);
        _fund(bob, 10e18);
        uint256 debt = _debt(bob);
        uint256 before = musd.balanceOf(bob);

        vm.prank(bob);
        loans.repay(type(uint256).max);

        assertEq(before - musd.balanceOf(bob), debt);
        (bool active,, uint256 principal,,, uint64 maturity,,) = loans.getTrove(bob);
        assertTrue(active, "trove stays open without debt");
        assertEq(principal, 0);
        assertEq(maturity, 0);
        assertEq(loans.totalInterest(), 0);
    }

    function test_Close_ReturnsCollateralAndPaysLenders() public {
        _open(bob, 50e18, 25e18);
        vm.warp(START + 60 days);
        _fund(bob, 1e18);
        uint256 debt = _debt(bob);
        uint256 btcBefore = bob.balance;

        vm.prank(bob);
        loans.close();

        assertEq(bob.balance - btcBefore, btcFor(50e18));
        assertEq(vault.idleAssets(), 9_975e18 + debt);
        assertEq(vault.totalAssets(), 10_000e18 + (debt - 25e18));
        assertEq(loans.totalPrincipal(), 0);
        assertEq(loans.totalCollateral(), 0);
        assertEq(loans.borrowerCount(), 0);
        (bool active,,,,,,,) = loans.getTrove(bob);
        assertFalse(active);
        assertGt(vault.convertToAssets(vault.balanceOf(lender)), 10_000e18);
    }

    function test_CloseWithPermit_NeedsNoApproval() public {
        vm.prank(bob);
        musd.approve(address(loans), 0);
        _open(bob, 50e18, 25e18);
        _fund(bob, 1e18);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 value = 26e18;

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                bob,
                address(loans),
                value,
                musd.nonces(bob),
                deadline
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", musd.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(bobKey, digest);

        vm.prank(bob);
        loans.closeWithPermit(value, deadline, v, r, s);
        (bool active,,,,,,,) = loans.getTrove(bob);
        assertFalse(active);
    }

    // ---------------------------------------------------------------------
    // Collateral and borrowing adjustments
    // ---------------------------------------------------------------------

    function test_WithdrawCollateral_RespectsMcr() public {
        _open(bob, 50e18, 25e18);
        uint256 tooMuch = btcFor(22.5e18); // leaves 27.5 USD: above the dust floor, below 110%
        vm.prank(bob);
        vm.expectPartialRevert(Microtroves.CollateralRatioBelowMinimum.selector);
        loans.withdrawCollateral(tooMuch);

        uint256 ok = btcFor(10e18);
        vm.prank(bob);
        loans.withdrawCollateral(ok);
        assertEq(_collateral(bob), btcFor(50e18) - ok);
    }

    function test_WithdrawCollateral_AllWithoutDebtClosesTrove() public {
        _open(bob, 100e18, 0);
        uint256 collateral = _collateral(bob);
        vm.prank(bob);
        loans.withdrawCollateral(collateral);
        (bool active,,,,,,,) = loans.getTrove(bob);
        assertFalse(active);
        assertEq(loans.borrowerCount(), 0);
    }

    function test_WithdrawCollateral_AllWithDebtReverts() public {
        _open(bob, 50e18, 25e18);
        uint256 collateral = _collateral(bob);
        vm.prank(bob);
        vm.expectRevert(Microtroves.DebtOutstanding.selector);
        loans.withdrawCollateral(collateral);
    }

    function test_AddCollateral_AllowedWhileBelowMcr() public {
        _open(bob, 50e18, 25e18);
        feed.setPrice((PRICE * 27) / 50);
        // A small top-up that still leaves the trove below 110% must not revert.
        vm.prank(bob);
        loans.addCollateral{value: 1e12}();
    }

    function test_Borrow_DoesNotExtendMaturity() public {
        _open(bob, 120e18, 25e18);
        vm.warp(START + 20 days);
        vm.prank(bob);
        loans.borrow(25e18);
        (,,,,, uint64 maturity,,) = loans.getTrove(bob);
        assertEq(maturity, START + 90 days);
    }

    function test_Borrow_RevertsAfterMaturity() public {
        _open(bob, 120e18, 25e18);
        vm.warp(START + 90 days);
        vm.prank(bob);
        vm.expectRevert(Microtroves.TermEnded.selector);
        loans.borrow(25e18);
    }

    function test_Borrow_RevertsWithoutLiquidity() public {
        // The lender queues everything, so no idle MUSD may be lent.
        uint256 shares = vault.balanceOf(lender);
        vm.prank(lender);
        vault.requestRedeem(shares, lender);

        uint256 collateral = btcFor(50e18);
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(MicrotroveVault.InsufficientLiquidity.selector, 25e18, 0)
        );
        loans.open{value: collateral}(25e18);
    }

    // ---------------------------------------------------------------------
    // Liquidations
    // ---------------------------------------------------------------------

    function test_Liquidate_UndercollateralizedTakesAllCollateral() public {
        _open(bob, 50e18, 25e18);
        feed.setPrice((PRICE * 27) / 50); // collateral now worth 27 USD, ICR ~107%
        uint256 debt = _debt(bob);
        uint256 collateral = _collateral(bob);
        uint256 musdBefore = musd.balanceOf(liquidator);
        uint256 btcBefore = liquidator.balance;

        vm.prank(liquidator);
        loans.liquidate(bob);

        assertEq(musdBefore - musd.balanceOf(liquidator), debt);
        assertEq(liquidator.balance - btcBefore, collateral);
        assertEq(loans.surplus(bob), 0);
        assertEq(vault.idleAssets(), 9_975e18 + debt);
        assertEq(loans.borrowerCount(), 0);
    }

    function test_Liquidate_UnderwaterSocializesShortfall() public {
        _open(bob, 50e18, 25e18);
        uint256 collateral = _collateral(bob);
        uint256 assetsBefore = vault.totalAssets();
        feed.setPrice((PRICE * 20) / 50); // collateral now worth 20 USD

        Microtroves.LiquidationPreview memory p = loans.previewLiquidation(bob);
        uint256 collateralValue = (collateral * feed.price()) / 1e18;
        assertEq(uint8(p.mode), uint8(Microtroves.LiquidationMode.Undercollateralized));
        assertEq(p.repayAmount, (collateralValue * 10_000) / 10_500, "liquidator keeps a 5% edge");

        vm.prank(liquidator);
        loans.liquidate(bob);

        uint256 badDebt = 25.125e18 - p.repayAmount;
        assertEq(vault.totalAssets(), assetsBefore - badDebt);
        assertEq(loans.lenderAssets(), 0);
    }

    function test_Liquidate_ExpiredPaysDebtPlusBonusAndLeavesSurplus() public {
        _open(bob, 50e18, 25e18);
        vm.warp(START + 90 days);
        uint256 debt = _debt(bob);
        uint256 collateral = _collateral(bob);
        uint256 expectedReward = (((debt * 11_000) / 10_000) * 1e18) / PRICE;

        uint256 btcBefore = liquidator.balance;
        vm.prank(liquidator);
        loans.liquidate(bob);

        assertEq(liquidator.balance - btcBefore, expectedReward);
        assertEq(loans.surplus(bob), collateral - expectedReward);
        assertEq(loans.totalSurplus(), collateral - expectedReward);

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        loans.claimSurplus();
        assertEq(bob.balance - bobBefore, collateral - expectedReward);
        assertEq(loans.totalSurplus(), 0);
    }

    function test_Liquidate_HealthyBeforeMaturityReverts() public {
        _open(bob, 50e18, 25e18);
        vm.prank(liquidator);
        vm.expectRevert(Microtroves.NotLiquidatable.selector);
        loans.liquidate(bob);
    }

    function test_Liquidate_TroveWithoutDebtReverts() public {
        _open(bob, 100e18, 0);
        vm.warp(START + 365 days);
        vm.prank(liquidator);
        vm.expectRevert(Microtroves.NotLiquidatable.selector);
        loans.liquidate(bob);
    }

    function test_Repay_StillAllowedAfterMaturity() public {
        _open(bob, 50e18, 25e18);
        vm.warp(START + 100 days);
        _fund(bob, 1e18);
        vm.prank(bob);
        loans.close();
        (bool active,,,,,,,) = loans.getTrove(bob);
        assertFalse(active);
    }

    /// @dev At every allowed collateral ratio and any point after maturity, the
    ///      matured-loan reward is worth exactly debt + 10% at the oracle price,
    ///      while RFC-2's literal "10% of collateral" would lose the keeper money.
    function testFuzz_ExpiredLiquidationIsAlwaysProfitable(uint256 collateralUsd, uint256 lateBy)
        public
    {
        collateralUsd = bound(collateralUsd, 28e18, 125e18);
        lateBy = bound(lateBy, 0, 30 days);
        _open(bob, collateralUsd, 25e18);
        vm.warp(START + 90 days + lateBy);

        uint256 debt = _debt(bob);
        Microtroves.LiquidationPreview memory p = loans.previewLiquidation(bob);
        if (p.mode != Microtroves.LiquidationMode.Expired) return; // fell below MCR from interest
        uint256 rewardValue = (p.collateralToLiquidator * PRICE) / 1e18;

        assertApproxEqAbs(rewardValue, (debt * 11_000) / 10_000, 1e5, "keeper earns debt + 10%");
        uint256 rfcLiteralValue = (_collateral(bob) * PRICE * 1_000) / 10_000 / 1e18;
        assertLt(rfcLiteralValue, debt, "RFC-2 literal reward is below the debt repaid");
    }

    function test_GetLiquidatable_FindsOnlyEligibleTroves() public {
        _open(bob, 30e18, 25e18);
        _open(carol, 100e18, 25e18);
        feed.setPrice((PRICE * 27) / 30);

        address[] memory found = loans.getLiquidatable(0, 10);
        assertEq(found.length, 1);
        assertEq(found[0], bob);
    }

    // ---------------------------------------------------------------------
    // Oracle outage, pause and governance
    // ---------------------------------------------------------------------

    function test_StaleOracle_BlocksNewDebtButNotExits() public {
        _open(bob, 50e18, 25e18);
        feed.setStale(true);

        uint256 collateral = btcFor(50e18);
        vm.prank(carol);
        vm.expectRevert("PriceFeed: Oracle is stale.");
        loans.open{value: collateral}(25e18);

        _fund(bob, 1e18);
        vm.prank(bob);
        loans.close();
        (bool active,,,,,,,) = loans.getTrove(bob);
        assertFalse(active);
    }

    function test_Pause_StopsNewDebtOnly() public {
        _open(bob, 120e18, 25e18);
        vm.prank(gov);
        loans.pause();

        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        loans.borrow(10e18);

        uint256 collateral = btcFor(50e18);
        vm.prank(carol);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        loans.open{value: collateral}(25e18);

        _open(carol, 50e18, 0); // opening without debt is still allowed

        _fund(bob, 1e18);
        vm.prank(bob);
        loans.close();
    }

    function test_SetParams_OnlyAffectsNewTerms() public {
        _open(bob, 50e18, 25e18);
        Microtroves.Params memory p = defaultParams();
        p.interestRateBps = 1_000;
        p.issuanceFeeBps = 100;
        vm.prank(gov);
        loans.setParams(p);

        _open(carol, 50e18, 25e18);
        (,,,,,, uint16 bobRate, uint16 bobFee) = loans.getTrove(bob);
        (,,,,,, uint16 carolRate, uint16 carolFee) = loans.getTrove(carol);
        assertEq(bobRate, 500);
        assertEq(bobFee, 50);
        assertEq(carolRate, 1_000);
        assertEq(carolFee, 100);

        vm.warp(START + 30 days);
        uint256 expected =
            _interestFor(25.125e18, 500, 30 days) + _interestFor(25.25e18, 1_000, 30 days);
        assertApproxEqAbs(loans.pendingTotalInterest(), expected, 2);
    }

    function test_SetParams_OnlyOwnerAndValidated() public {
        Microtroves.Params memory p = defaultParams();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        loans.setParams(p);

        p.maxDebt = 2_000e18; // at or above MUSD's own minimum is not a micro trove
        vm.prank(gov);
        vm.expectRevert(Microtroves.InvalidParams.selector);
        loans.setParams(p);
    }

    function test_ProtocolFee_TakesShareOfInterestOnly() public {
        Microtroves.Params memory p = defaultParams();
        p.protocolFeeBps = 1_000;
        vm.prank(gov);
        loans.setParams(p);

        _open(bob, 50e18, 25e18);
        vm.warp(START + 60 days);
        uint256 interest = _interestFor(25.125e18, 500, 60 days);
        assertEq(loans.lenderAssets(), 25.125e18 + interest - interest / 10);

        _fund(bob, 1e18);
        vm.prank(bob);
        loans.close();
        assertEq(musd.balanceOf(treasury), interest / 10);
        assertEq(vault.idleAssets(), 9_975e18 + 25.125e18 + interest - interest / 10);
    }
}
