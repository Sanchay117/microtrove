// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";

import {Microtroves} from "../../src/Microtroves.sol";
import {MicrotroveVault} from "../../src/MicrotroveVault.sol";
import {MockMUSD, MockPriceFeed} from "../mocks/Mocks.sol";

/// @dev Drives random borrower, lender, keeper and market actions. Every call is
///      wrapped so reverts are expected outcomes, not failures.
contract Handler is Test {
    Microtroves public loans;
    MicrotroveVault public vault;
    MockMUSD public musd;
    MockPriceFeed public feed;

    address[] public borrowers;
    address[] public lenders;
    address public keeper = makeAddr("keeper");
    mapping(string => uint256) public successes;

    constructor(Microtroves _loans, MicrotroveVault _vault, MockMUSD _musd, MockPriceFeed _feed) {
        loans = _loans;
        vault = _vault;
        musd = _musd;
        feed = _feed;
        for (uint256 i; i < 6; ++i) {
            address b = makeAddr(string.concat("borrower", vm.toString(i)));
            borrowers.push(b);
            vm.deal(b, 1_000 ether);
            vm.prank(b);
            musd.approve(address(loans), type(uint256).max);
        }
        for (uint256 i; i < 3; ++i) {
            address l = makeAddr(string.concat("lender", vm.toString(i)));
            lenders.push(l);
            vm.prank(l);
            musd.approve(address(vault), type(uint256).max);
        }
        vm.deal(keeper, 1 ether);
        vm.prank(keeper);
        musd.approve(address(loans), type(uint256).max);
    }

    function borrowerCount() external view returns (uint256) {
        return borrowers.length;
    }

    function _borrower(uint256 seed) internal view returns (address) {
        return borrowers[seed % borrowers.length];
    }

    function _lender(uint256 seed) internal view returns (address) {
        return lenders[seed % lenders.length];
    }

    function _btcFor(uint256 usd) internal view returns (uint256) {
        return (usd * 1e18) / feed.price();
    }

    // ----- borrowers -----

    /// @dev Collateral is drawn as a ratio of the debt (100% to 550%) so most opens
    ///      are valid while the edges still get exercised.
    function open(uint256 seed, uint256 ratioPct, uint256 borrowAmount) external {
        address b = _borrower(seed);
        borrowAmount = bound(borrowAmount, 0, 205e18);
        if (borrowAmount < 20e18) borrowAmount = 0;
        uint256 reference_ = borrowAmount == 0 ? 25e18 : borrowAmount;
        uint256 collateralUsd = (reference_ * bound(ratioPct, 100, 550)) / 100;
        uint256 collateral = _btcFor(collateralUsd);
        vm.prank(b);
        try loans.open{value: collateral}(borrowAmount) {
            successes["open"]++;
        } catch {}
    }

    function borrow(uint256 seed, uint256 amount) external {
        amount = bound(amount, 1e18, 60e18);
        vm.prank(_borrower(seed));
        try loans.borrow(amount) {
            successes["borrow"]++;
        } catch {}
    }

    function repay(uint256 seed, uint256 amount) external {
        address b = _borrower(seed);
        amount = bound(amount, 1, 250e18);
        musd.mint(b, amount);
        vm.prank(b);
        try loans.repay(amount) {
            successes["repay"]++;
        } catch {}
    }

    function addCollateral(uint256 seed, uint256 usd) external {
        uint256 collateral = _btcFor(bound(usd, 1e18, 300e18));
        vm.prank(_borrower(seed));
        try loans.addCollateral{value: collateral}() {} catch {}
    }

    function withdrawCollateral(uint256 seed, uint256 fraction) external {
        address b = _borrower(seed);
        (, uint256 collateral,,,,,,) = loans.getTrove(b);
        uint256 amount = (collateral * bound(fraction, 1, 100)) / 100;
        vm.prank(b);
        try loans.withdrawCollateral(amount) {} catch {}
    }

    function close(uint256 seed) external {
        address b = _borrower(seed);
        musd.mint(b, 260e18);
        vm.prank(b);
        try loans.close() {
            successes["close"]++;
        } catch {}
    }

    /// @dev Prefers a borrower who actually has surplus to claim.
    function claimSurplus(uint256 seed) external {
        address claimant = _borrower(seed);
        for (uint256 i; i < borrowers.length; ++i) {
            if (loans.surplus(borrowers[i]) != 0) {
                claimant = borrowers[i];
                break;
            }
        }
        vm.prank(claimant);
        try loans.claimSurplus() {
            successes["claimSurplus"]++;
        } catch {}
    }

    // ----- keepers and market -----

    /// @dev Acts like a keeper: liquidates the first eligible trove, if any.
    function liquidate(uint256 seed) external {
        address target = _borrower(seed);
        try loans.getLiquidatable(0, borrowers.length) returns (address[] memory found) {
            if (found.length != 0) target = found[seed % found.length];
        } catch {}
        musd.mint(keeper, 300e18);
        vm.prank(keeper);
        try loans.liquidate(target) {
            successes["liquidate"]++;
        } catch {}
    }

    function warp(uint256 elapsed) external {
        vm.warp(block.timestamp + bound(elapsed, 1, 20 days));
    }

    function movePrice(uint256 newPrice) external {
        feed.setPrice(bound(newPrice, 30_000e18, 150_000e18));
    }

    // ----- lenders -----

    function deposit(uint256 seed, uint256 amount) external {
        address l = _lender(seed);
        amount = bound(amount, 1e18, 5_000e18);
        musd.mint(l, amount);
        vm.prank(l);
        try vault.deposit(amount, l) {} catch {}
    }

    function redeemNow(uint256 seed, uint256 fraction) external {
        address l = _lender(seed);
        uint256 shares = (vault.maxRedeem(l) * bound(fraction, 1, 100)) / 100;
        if (shares == 0) return;
        vm.prank(l);
        try vault.redeem(shares, l, l) {
            successes["redeemNow"]++;
        } catch {}
    }

    function requestRedeem(uint256 seed, uint256 fraction) external {
        address l = _lender(seed);
        uint256 shares = (vault.balanceOf(l) * bound(fraction, 1, 100)) / 100;
        if (shares == 0) return;
        vm.prank(l);
        try vault.requestRedeem(shares, l) {
            successes["requestRedeem"]++;
        } catch {}
    }

    function cancelRequest(uint256 seed) external {
        uint256 count = vault.requestCount();
        if (count == 0) return;
        uint256 id = seed % count;
        vm.prank(vault.getRequest(id).owner);
        try vault.cancelRedeemRequest(id) {} catch {}
    }

    function processQueue(uint256 maxRequests) external {
        try vault.processQueue(bound(maxRequests, 1, 10)) returns (uint256 filled) {
            successes["filled"] += filled;
        } catch {}
    }
}
