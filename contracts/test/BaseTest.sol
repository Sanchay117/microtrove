// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";

import {Microtroves} from "../src/Microtroves.sol";
import {MicrotroveVault} from "../src/MicrotroveVault.sol";
import {IPriceFeed, IBorrowerOperationsSignatures} from "../src/interfaces/IMezo.sol";
import {MockMUSD, MockPriceFeed, MockBorrowerOperationsSignatures} from "./mocks/Mocks.sol";

abstract contract BaseTest is Test {
    uint256 internal constant PRICE = 80_000e18;
    uint256 internal constant START = 1_800_000_000;

    MockMUSD internal musd;
    MockPriceFeed internal feed;
    MockBorrowerOperationsSignatures internal bos;
    MicrotroveVault internal vault;
    Microtroves internal loans;

    address internal gov = makeAddr("gov");
    address internal treasury = makeAddr("treasury");
    address internal lender = makeAddr("lender");
    address internal lender2 = makeAddr("lender2");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");
    address internal liquidator = makeAddr("liquidator");
    address internal bob;
    uint256 internal bobKey;

    function defaultParams() internal pure returns (Microtroves.Params memory) {
        return Microtroves.Params({
            interestRateBps: 500,
            issuanceFeeBps: 50,
            term: 90 days,
            minDebt: 25e18,
            maxDebt: 200e18,
            mcr: 1.1e18,
            maxCr: 5e18,
            expiryBonusBps: 1_000,
            underwaterBonusBps: 500,
            protocolFeeBps: 0
        });
    }

    function initialLiquidity() internal pure virtual returns (uint256) {
        return 10_000e18;
    }

    function setUp() public virtual {
        vm.warp(START);
        (bob, bobKey) = makeAddrAndKey("bob");

        musd = new MockMUSD();
        feed = new MockPriceFeed(PRICE);
        bos = new MockBorrowerOperationsSignatures(musd, feed);
        vault = new MicrotroveVault(musd, gov);
        loans = new Microtroves(
            vault,
            IPriceFeed(address(feed)),
            IBorrowerOperationsSignatures(address(bos)),
            gov,
            treasury,
            defaultParams()
        );
        vm.prank(gov);
        vault.setLoanBook(loans);

        _deposit(lender, initialLiquidity());

        address[4] memory borrowers = [bob, carol, dave, liquidator];
        for (uint256 i; i < borrowers.length; ++i) {
            vm.deal(borrowers[i], 100 ether);
            vm.prank(borrowers[i]);
            musd.approve(address(loans), type(uint256).max);
        }
        musd.mint(liquidator, 1_000_000e18);
    }

    function _deposit(address who, uint256 amount) internal returns (uint256 shares) {
        musd.mint(who, amount);
        vm.startPrank(who);
        musd.approve(address(vault), amount);
        shares = vault.deposit(amount, who);
        vm.stopPrank();
    }

    /// @dev BTC worth `usd` (18 decimals) at the current price.
    function btcFor(uint256 usd) internal view returns (uint256) {
        return (usd * 1e18) / feed.price();
    }

    function _open(address who, uint256 collateralUsd, uint256 borrowAmount) internal {
        uint256 collateral = btcFor(collateralUsd);
        vm.prank(who);
        loans.open{value: collateral}(borrowAmount);
    }

    function _debt(address who) internal view returns (uint256 debt) {
        (,,,, debt,,,) = loans.getTrove(who);
    }

    function _collateral(address who) internal view returns (uint256 collateral) {
        (, collateral,,,,,,) = loans.getTrove(who);
    }

    function _interestFor(uint256 principal, uint256 rateBps, uint256 elapsed)
        internal
        pure
        returns (uint256)
    {
        return (principal * rateBps * elapsed) / (365 days * 10_000);
    }

    /// @dev Pays a borrower enough MUSD to cover any debt plus interest.
    function _fund(address who, uint256 amount) internal {
        musd.mint(who, amount);
    }
}
