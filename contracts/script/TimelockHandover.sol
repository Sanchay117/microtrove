// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

import {Microtroves} from "../src/Microtroves.sol";
import {MicrotroveVault} from "../src/MicrotroveVault.sol";

/// @notice Moves ownership of the loan book and the vault to a TimelockController, so every
///         owner action (new parameters such as the minimum ratio, the fee recipient, pause)
///         is public on chain for `delay` before it can apply.
/// @dev The caller must own both contracts. The timelock starts with no delay so it can
///      accept ownership at once, then the same batch raises the delay. It administers
///      itself, so changing its roles or delay also has to wait out the delay.
///      `operator` proposes and can cancel; anyone can execute an operation that is ready.
library TimelockHandover {
    bytes32 internal constant SALT = keccak256("microtrove.timelock.handover");

    function handOver(Microtroves loans, MicrotroveVault vault, address operator, uint256 delay)
        internal
        returns (TimelockController timelock)
    {
        address[] memory proposers = new address[](1);
        proposers[0] = operator;
        address[] memory executors = new address[](1);
        executors[0] = address(0);
        timelock = new TimelockController(0, proposers, executors, address(0));

        loans.transferOwnership(address(timelock));
        vault.transferOwnership(address(timelock));

        (address[] memory targets, uint256[] memory values, bytes[] memory payloads) =
            acceptBatch(loans, vault, timelock, delay);
        timelock.scheduleBatch(targets, values, payloads, bytes32(0), SALT, 0);
        timelock.executeBatch(targets, values, payloads, bytes32(0), SALT);
    }

    function acceptBatch(
        Microtroves loans,
        MicrotroveVault vault,
        TimelockController timelock,
        uint256 delay
    ) internal pure returns (address[] memory targets, uint256[] memory values, bytes[] memory payloads) {
        targets = new address[](3);
        values = new uint256[](3);
        payloads = new bytes[](3);
        targets[0] = address(loans);
        payloads[0] = abi.encodeCall(Ownable2Step.acceptOwnership, ());
        targets[1] = address(vault);
        payloads[1] = abi.encodeCall(Ownable2Step.acceptOwnership, ());
        targets[2] = address(timelock);
        payloads[2] = abi.encodeCall(TimelockController.updateDelay, (delay));
    }
}
