// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BaseTest} from "./BaseTest.sol";
import {Microtroves} from "../src/Microtroves.sol";

/// @dev Promotion turns a micro trove into a full MUSD trove through
///      BorrowerOperationsSignatures.openTroveWithSignature, as RFC-2 describes.
contract PromotionTest is BaseTest {
    uint256 internal constant MUSD_DEBT = 2_000e18;

    function _signOpenTrove(uint256 key, uint256 assetAmount, uint256 debt, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        address borrower = vm.addr(key);
        bytes32 structHash = keccak256(
            abi.encode(
                bos.OPEN_TROVE_TYPEHASH(),
                assetAmount,
                debt,
                borrower,
                address(loans),
                bos.nonces(borrower),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", bos.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_Promote_OpensMusdTroveAndSettlesMicroDebt() public {
        _open(bob, 100e18, 50e18);
        vm.warp(START + 45 days);
        uint256 owed = _debt(bob);
        uint256 microCollateral = _collateral(bob);
        uint256 topUp = btcFor(2_900e18);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signOpenTrove(bobKey, microCollateral + topUp, MUSD_DEBT, deadline);
        uint256 musdBefore = musd.balanceOf(bob);
        uint256 idleBefore = vault.idleAssets();

        vm.prank(bob);
        loans.promote{value: topUp}(MUSD_DEBT, address(0), address(0), sig, deadline);

        (bool active,,,,,,,) = loans.getTrove(bob);
        assertFalse(active, "micro trove is closed");
        (uint256 musdCollateral, uint256 musdDebt) = bos.troves(bob);
        assertEq(musdCollateral, microCollateral + topUp, "all BTC moved into the MUSD trove");
        assertEq(musdDebt, MUSD_DEBT + 200e18);
        assertEq(musd.balanceOf(bob) - musdBefore, MUSD_DEBT - owed, "borrower gets the rest");
        assertEq(vault.idleAssets() - idleBefore, owed, "lenders are repaid with interest");
        assertEq(address(loans).balance, 0);
        assertEq(musd.balanceOf(address(loans)), 0);
        assertEq(loans.totalPrincipal(), 0);
    }

    function test_Promote_WorksWithoutMicroDebt() public {
        _open(bob, 100e18, 0);
        uint256 microCollateral = _collateral(bob);
        uint256 topUp = btcFor(2_900e18);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signOpenTrove(bobKey, microCollateral + topUp, MUSD_DEBT, deadline);

        vm.prank(bob);
        loans.promote{value: topUp}(MUSD_DEBT, address(0), address(0), sig, deadline);
        assertEq(musd.balanceOf(bob), MUSD_DEBT);
    }

    function test_Promote_RevertsOnSignatureFromSomeoneElse() public {
        _open(bob, 100e18, 50e18);
        (, uint256 carolKey) = makeAddrAndKey("carol-signer");
        uint256 topUp = btcFor(2_900e18);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signOpenTrove(carolKey, _collateral(bob) + topUp, MUSD_DEBT, deadline);

        vm.prank(bob);
        vm.expectRevert("BorrowerOperationsSignatures: Invalid signature");
        loans.promote{value: topUp}(MUSD_DEBT, address(0), address(0), sig, deadline);

        (bool active,,,,,,,) = loans.getTrove(bob);
        assertTrue(active, "micro trove untouched after a failed promotion");
    }

    function test_Promote_RevertsWhenSignedAmountDiffers() public {
        _open(bob, 100e18, 50e18);
        uint256 topUp = btcFor(2_900e18);
        uint256 deadline = block.timestamp + 1 hours;
        // Signed without counting the micro trove's own collateral.
        bytes memory sig = _signOpenTrove(bobKey, topUp, MUSD_DEBT, deadline);

        vm.prank(bob);
        vm.expectRevert("BorrowerOperationsSignatures: Invalid signature");
        loans.promote{value: topUp}(MUSD_DEBT, address(0), address(0), sig, deadline);
    }

    function test_Promote_RevertsWhenMusdTroveWouldBeUndercollateralized() public {
        _open(bob, 100e18, 50e18);
        uint256 topUp = btcFor(1_000e18);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _signOpenTrove(bobKey, _collateral(bob) + topUp, MUSD_DEBT, deadline);

        vm.prank(bob);
        vm.expectRevert("BorrowerOps: An operation that would result in ICR < MCR is not permitted");
        loans.promote{value: topUp}(MUSD_DEBT, address(0), address(0), sig, deadline);
    }
}
