// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {BaseTest} from "./BaseTest.sol";
import {Microtroves} from "../src/Microtroves.sol";
import {TimelockHandover} from "../script/TimelockHandover.sol";

/// @notice The owner's powers sit behind a 24-hour timelock, so a change such as a higher
///         minimum ratio is public for a day before it can make any loan liquidatable.
contract TimelockTest is BaseTest {
    uint256 internal constant DELAY = 1 days;
    bytes32 internal constant SALT = keccak256("raise mcr");

    TimelockController internal timelock;

    function setUp() public override {
        super.setUp();
        vm.startPrank(gov);
        timelock = TimelockHandover.handOver(loans, vault, gov, DELAY);
        vm.stopPrank();
    }

    function _raisedMcr() internal pure returns (Microtroves.Params memory p) {
        p = defaultParams();
        p.mcr = 1.5e18;
    }

    function _scheduleRaise() internal {
        vm.prank(gov);
        timelock.schedule(
            address(loans),
            0,
            abi.encodeCall(Microtroves.setParams, (_raisedMcr())),
            bytes32(0),
            SALT,
            DELAY
        );
    }

    function _executeRaise() internal {
        timelock.execute(
            address(loans), 0, abi.encodeCall(Microtroves.setParams, (_raisedMcr())), bytes32(0), SALT
        );
    }

    function _mcr() internal view returns (uint256 mcr) {
        (,,,,, mcr,,,,) = loans.params();
    }

    function test_TimelockOwnsBothContracts() public view {
        assertEq(loans.owner(), address(timelock));
        assertEq(vault.owner(), address(timelock));
        assertEq(loans.pendingOwner(), address(0));
        assertEq(vault.pendingOwner(), address(0));
        assertEq(timelock.getMinDelay(), DELAY);
    }

    function test_FormerOwnerCannotActDirectly() public {
        vm.startPrank(gov);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, gov));
        loans.setParams(_raisedMcr());
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, gov));
        loans.pause();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, gov));
        loans.setFeeRecipient(gov);
        vm.stopPrank();
    }

    function test_ParamChangeWaitsForTheDelay() public {
        _scheduleRaise();

        vm.warp(block.timestamp + DELAY - 1);
        vm.expectRevert();
        _executeRaise();
        assertEq(_mcr(), 1.1e18);

        vm.warp(block.timestamp + 1);
        _executeRaise();
        assertEq(_mcr(), 1.5e18);
    }

    function test_CannotScheduleWithAShorterDelay() public {
        vm.prank(gov);
        vm.expectRevert(
            abi.encodeWithSelector(TimelockController.TimelockInsufficientDelay.selector, 1 hours, DELAY)
        );
        timelock.schedule(
            address(loans),
            0,
            abi.encodeCall(Microtroves.setParams, (_raisedMcr())),
            bytes32(0),
            SALT,
            1 hours
        );
    }

    function test_OnlyTheOperatorCanSchedule() public {
        bytes32 role = timelock.PROPOSER_ROLE();
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, bob, role)
        );
        timelock.schedule(
            address(loans),
            0,
            abi.encodeCall(Microtroves.setParams, (_raisedMcr())),
            bytes32(0),
            SALT,
            DELAY
        );
    }

    function test_OperatorCanCancelAScheduledChange() public {
        _scheduleRaise();
        bytes32 id = timelock.hashOperation(
            address(loans), 0, abi.encodeCall(Microtroves.setParams, (_raisedMcr())), bytes32(0), SALT
        );
        vm.prank(gov);
        timelock.cancel(id);

        vm.warp(block.timestamp + DELAY);
        vm.expectRevert();
        _executeRaise();
        assertEq(_mcr(), 1.1e18);
    }

    function test_DelayItselfCanOnlyChangeThroughTheTimelock() public {
        vm.prank(gov);
        vm.expectRevert(
            abi.encodeWithSelector(TimelockController.TimelockUnauthorizedCaller.selector, gov)
        );
        timelock.updateDelay(0);
    }

    /// @dev A borrower sees the scheduled change and has the whole delay to add BTC.
    function test_BorrowerHasTheDelayToReact() public {
        // 100 MUSD at about 130%: fine at 110%, below a 150% minimum.
        vm.prank(bob);
        loans.open{value: btcFor(130e18)}(100e18);
        _scheduleRaise();

        vm.warp(block.timestamp + 12 hours);
        vm.prank(bob);
        loans.addCollateral{value: btcFor(60e18)}();

        vm.warp(block.timestamp + 12 hours);
        _executeRaise();
        assertEq(loans.getLiquidatable(0, 10).length, 0);
    }
}
