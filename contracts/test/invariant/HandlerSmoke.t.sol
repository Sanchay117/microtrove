// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BaseTest} from "../BaseTest.sol";
import {Handler} from "./Handler.sol";

/// @dev Guards the invariant suite: the handler's main paths must actually succeed.
contract HandlerSmokeTest is BaseTest {
    Handler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new Handler(loans, vault, musd, feed);
    }

    function test_HandlerPathsSucceed() public {
        handler.open(0, 200, 50e18);
        assertEq(handler.successes("open"), 1, "open");
        handler.borrow(0, 10e18);
        assertEq(handler.successes("borrow"), 1, "borrow");
        handler.repay(0, 1e18);
        assertEq(handler.successes("repay"), 1, "repay");
        handler.warp(20 days);
        handler.warp(20 days);
        handler.warp(20 days);
        handler.warp(20 days);
        handler.warp(20 days);
        handler.liquidate(0);
        assertEq(handler.successes("liquidate"), 1, "liquidate");
        handler.claimSurplus(0);
        assertEq(handler.successes("claimSurplus"), 1, "claimSurplus");
    }
}
