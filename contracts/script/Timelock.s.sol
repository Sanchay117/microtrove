// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {Microtroves} from "../src/Microtroves.sol";
import {MicrotroveVault} from "../src/MicrotroveVault.sol";
import {TimelockHandover} from "./TimelockHandover.sol";

/// @notice Puts the deployed loan book and vault behind a 24-hour TimelockController.
/// @dev Env: PRIVATE_KEY (the current owner), TIMELOCK_DELAY (seconds, default 1 day).
///      Addresses default to the Wave 2 deployment on Mezo Testnet.
///
///      forge script script/Timelock.s.sol --rpc-url mezo_testnet --broadcast --slow
contract Timelock is Script {
    address internal constant LOANS = 0xE0e2155f9C5a5B55eADf952d0a01d3E691092dcf;
    address internal constant VAULT = 0x11fc55CD01411bd1453EE62b40cB4e653f7726eA;

    function run() external returns (TimelockController timelock) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address operator = vm.addr(key);
        uint256 delay = vm.envOr("TIMELOCK_DELAY", uint256(1 days));
        Microtroves loans = Microtroves(payable(vm.envOr("LOANS", LOANS)));
        MicrotroveVault vault = MicrotroveVault(vm.envOr("VAULT", VAULT));

        require(loans.owner() == operator && vault.owner() == operator, "not the owner");

        vm.startBroadcast(key);
        timelock = TimelockHandover.handOver(loans, vault, operator, delay);
        vm.stopBroadcast();

        require(loans.owner() == address(timelock), "loan book not handed over");
        require(vault.owner() == address(timelock), "vault not handed over");
        require(timelock.getMinDelay() == delay, "delay not set");

        console.log("TimelockController", address(timelock));
        console.log("delay (seconds)   ", delay);
        console.log("proposer          ", operator);
    }
}
