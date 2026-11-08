// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {BaseTest} from "./BaseTest.sol";
import {MicrotroveVault} from "../src/MicrotroveVault.sol";
import {ILoanBook} from "../src/interfaces/IMicrotroves.sol";

contract MicrotroveVaultTest is BaseTest {
    /// @dev A small vault so two loans use most of the liquidity.
    function initialLiquidity() internal pure override returns (uint256) {
        return 500e18;
    }

    /// @dev Bob and Carol each borrow 199 MUSD, leaving 102 idle.
    function _lendMost() internal {
        _open(bob, 400e18, 199e18);
        _open(carol, 400e18, 199e18);
    }

    function test_DepositAndRedeemInstantlyWhenIdle() public {
        uint256 shares = _deposit(lender2, 1_000e18);
        vm.prank(lender2);
        uint256 assets = vault.redeem(shares, lender2, lender2);
        assertEq(assets, 1_000e18);
        assertEq(musd.balanceOf(lender2), 1_000e18);
    }

    function test_InstantWithdrawalsAreCappedByIdleMusd() public {
        _lendMost();
        assertEq(vault.idleAssets(), 102e18);
        assertEq(vault.maxWithdraw(lender), 102e18);
        // 399.99 owed (with fees) out of 501.99 total assets.
        assertEq(vault.utilizationBps(), 7_968);

        vm.prank(lender);
        vm.expectRevert();
        vault.withdraw(103e18, lender, lender);
    }

    function test_QueuedRedemptionIsFilledInOrderAsLoansRepay() public {
        _lendMost();
        uint256 lenderShares = vault.balanceOf(lender);
        uint256 lender2Shares = _deposit(lender2, 100e18);

        vm.prank(lender);
        uint256 firstId = vault.requestRedeem(lenderShares, lender);
        vm.prank(lender2);
        uint256 secondId = vault.requestRedeem(lender2Shares, lender2);

        // Queued requests reserve the idle MUSD and block instant exits.
        assertEq(vault.lendableLiquidity(), 0);
        assertEq(vault.maxWithdraw(lender2), 0);

        // First pass: 202 idle goes to the head of the queue, partially.
        vault.processQueue(10);
        assertEq(musd.balanceOf(lender), 202e18);
        assertGt(vault.getRequest(firstId).shares, 0);
        assertEq(vault.getRequest(secondId).shares, lender2Shares);

        // Bob repays: still all to the first request, the second keeps waiting.
        vm.warp(START + 30 days);
        _fund(bob, 5e18);
        vm.prank(bob);
        loans.close();
        vault.processQueue(10);
        assertGt(musd.balanceOf(lender), 202e18);
        assertGt(vault.getRequest(firstId).shares, 0);
        assertEq(musd.balanceOf(lender2), 0, "FIFO: second request waits");

        // Carol repays: everyone is out, with interest.
        _fund(carol, 5e18);
        vm.prank(carol);
        loans.close();
        vault.processQueue(10);
        assertEq(vault.getRequest(firstId).shares, 0);
        assertEq(vault.getRequest(secondId).shares, 0);
        assertEq(vault.pendingShares(), 0);
        assertGt(musd.balanceOf(lender), 500e18, "first lender earned fees and interest");
        assertGt(musd.balanceOf(lender2), 100e18, "second lender earned too");
        assertLe(vault.totalAssets(), 10, "only rounding dust remains");
    }

    function test_QueuedSharesKeepEarningUntilFilled() public {
        _lendMost();
        uint256 shares = vault.balanceOf(lender);
        vm.prank(lender);
        vault.requestRedeem(shares, lender);
        uint256 valueAtRequest = vault.convertToAssets(shares);

        vm.warp(START + 60 days);
        assertGt(vault.convertToAssets(shares), valueAtRequest);
    }

    function test_CancelReturnsShares() public {
        uint256 shares = vault.balanceOf(lender);
        vm.prank(lender);
        uint256 id = vault.requestRedeem(shares, lender);

        vm.prank(bob);
        vm.expectRevert(MicrotroveVault.NotRequestOwner.selector);
        vault.cancelRedeemRequest(id);

        vm.prank(lender);
        vault.cancelRedeemRequest(id);
        assertEq(vault.balanceOf(lender), shares);
        assertEq(vault.pendingShares(), 0);

        vm.prank(lender);
        vm.expectRevert(MicrotroveVault.RequestClosed.selector);
        vault.cancelRedeemRequest(id);
    }

    function test_ProcessQueueSkipsCancelledRequests() public {
        uint256 lender2Shares = _deposit(lender2, 100e18);
        uint256 shares = vault.balanceOf(lender);
        vm.prank(lender);
        uint256 id = vault.requestRedeem(shares, lender);
        vm.prank(lender2);
        vault.requestRedeem(lender2Shares, lender2);
        vm.prank(lender);
        vault.cancelRedeemRequest(id);

        vault.processQueue(10);
        assertEq(musd.balanceOf(lender2), 100e18);
        assertEq(vault.queueHead(), 2);
    }

    /// @dev Wave 1 review: a request paying MUSD itself made processQueue revert forever.
    function test_RequestRedeem_RejectsMusdAndVaultAsReceiver() public {
        uint256 shares = vault.balanceOf(lender);
        vm.startPrank(lender);
        vm.expectRevert(MicrotroveVault.InvalidReceiver.selector);
        vault.requestRedeem(shares, address(musd));
        vm.expectRevert(MicrotroveVault.InvalidReceiver.selector);
        vault.requestRedeem(shares, address(vault));
        vm.expectRevert(MicrotroveVault.ZeroAddress.selector);
        vault.requestRedeem(shares, address(0));
        vm.stopPrank();
    }

    /// @dev Any receiver MUSD refuses is set aside for its owner and the queue moves on.
    function test_ProcessQueue_RefusedPaymentDoesNotBlockLaterRequests() public {
        address refused = makeAddr("refused");
        address rescue = makeAddr("rescue");
        uint256 lender2Shares = _deposit(lender2, 100e18);
        uint256 shares = vault.balanceOf(lender);

        vm.prank(lender);
        uint256 firstId = vault.requestRedeem(shares, refused);
        vm.prank(lender2);
        vault.requestRedeem(lender2Shares, lender2);
        musd.setBlocked(refused, true);

        vm.expectEmit(address(vault));
        emit MicrotroveVault.RedeemPaymentDeferred(firstId, lender, refused, 500e18);
        assertEq(vault.processQueue(10), 2);

        assertEq(musd.balanceOf(lender2), 100e18, "the request behind it is paid");
        assertEq(vault.queueHead(), 2);
        assertEq(vault.pendingShares(), 0);
        assertEq(vault.claimable(lender), 500e18);
        assertEq(vault.totalClaimable(), 500e18);
        // The set-aside MUSD belongs to the lender, not to the vault.
        assertEq(vault.idleAssets(), 0);
        assertEq(vault.totalAssets(), 0);

        vm.prank(bob);
        vm.expectRevert(MicrotroveVault.NothingToClaim.selector);
        vault.claim(bob);

        vm.prank(lender);
        assertEq(vault.claim(rescue), 500e18);
        assertEq(musd.balanceOf(rescue), 500e18);
        assertEq(vault.totalClaimable(), 0);
    }

    /// @dev Deferred MUSD is never lent out or counted in the share price.
    function test_DeferredPaymentIsNotLentOrPriced() public {
        address refused = makeAddr("refused");
        musd.setBlocked(refused, true);
        uint256 half = vault.balanceOf(lender) / 2;
        vm.prank(lender);
        vault.requestRedeem(half, refused);
        vault.processQueue(1);

        assertEq(vault.claimable(lender), 250e18);
        assertEq(vault.totalAssets(), 250e18);
        assertEq(vault.lendableLiquidity(), 250e18);
        assertEq(vault.convertToAssets(vault.balanceOf(lender)), 250e18);

        _open(bob, 400e18, 190e18);
        uint256 collateral = btcFor(200e18);
        vm.prank(carol);
        vm.expectRevert(
            abi.encodeWithSelector(MicrotroveVault.InsufficientLiquidity.selector, 61e18, 60e18)
        );
        loans.open{value: collateral}(61e18);
    }

    /// @dev A one-wei request cannot shut instant withdrawals off for everyone.
    function test_InstantWithdrawalsUseIdleTheQueueDoesNotNeed() public {
        _deposit(lender2, 100e18);
        vm.prank(lender2);
        vault.requestRedeem(1, lender2);

        assertEq(vault.maxWithdraw(lender), 500e18);
        vm.prank(lender);
        vault.withdraw(500e18, lender, lender);
        assertEq(musd.balanceOf(lender), 500e18);

        // The queued wei is still covered.
        vault.processQueue(1);
        assertEq(vault.pendingShares(), 0);
    }

    function test_QueueViewsShowEachLendersPlace() public {
        _lendMost();
        uint256 lender2Shares = _deposit(lender2, 100e18);
        uint256 lenderShares = vault.balanceOf(lender);
        vm.prank(lender);
        vault.requestRedeem(lenderShares, lender);
        vm.prank(lender2);
        uint256 second = vault.requestRedeem(lender2Shares, lender2);

        MicrotroveVault.RedeemRequest[] memory page = vault.getRequests(0, 10);
        assertEq(page.length, 2);
        assertEq(page[1].owner, lender2);
        assertEq(vault.assetsAhead(0), 0);
        assertApproxEqAbs(vault.assetsAhead(second), vault.convertToAssets(lenderShares), 1);
        assertEq(vault.getRequests(5, 10).length, 0);
    }

    function test_LateDepositorDoesNotCaptureEarlierInterest() public {
        _lendMost();
        vm.warp(START + 60 days);
        uint256 shares = _deposit(lender2, 100e18);
        assertApproxEqAbs(vault.convertToAssets(shares), 100e18, 1);
        assertGt(vault.convertToAssets(vault.balanceOf(lender)), 500e18);
    }

    function test_UnderwaterLiquidationLowersSharePrice() public {
        _lendMost();
        feed.setPrice(PRICE / 4); // 400 USD of BTC becomes 100 USD against 199.995 debt
        uint256 before = vault.convertToAssets(vault.balanceOf(lender));
        vm.prank(liquidator);
        loans.liquidate(bob);
        assertLt(vault.convertToAssets(vault.balanceOf(lender)), before);
    }

    function test_OnlyLoanBookCanLend() public {
        vm.prank(bob);
        vm.expectRevert(MicrotroveVault.OnlyLoanBook.selector);
        vault.lend(bob, 1e18);
    }

    function test_LoanBookCanBeSetOnlyOnceByOwner() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        vault.setLoanBook(ILoanBook(address(1)));

        vm.prank(gov);
        vm.expectRevert(MicrotroveVault.LoanBookAlreadySet.selector);
        vault.setLoanBook(ILoanBook(address(1)));
    }
}
