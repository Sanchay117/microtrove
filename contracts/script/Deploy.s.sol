// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Microtroves} from "../src/Microtroves.sol";
import {MicrotroveVault} from "../src/MicrotroveVault.sol";
import {IPriceFeed, IBorrowerOperationsSignatures} from "../src/interfaces/IMezo.sol";

/// @notice Deploys the vault and loan book against MUSD on Mezo testnet (chain 31611).
/// @dev Env: PRIVATE_KEY (required), TERM_SECONDS (default 90 days; use a short term
///      for a demo deployment where expiry can be shown live), SEED_MUSD (optional
///      MUSD the deployer deposits into the vault).
///
///      forge script script/Deploy.s.sol --rpc-url mezo_testnet --broadcast
contract Deploy is Script {
    // MUSD deployment on Mezo testnet (mezo-org/musd, artifacts/deployments/matsnet).
    address internal constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address internal constant PRICE_FEED = 0x86bCF0841622a5dAC14A313a15f96A95421b9366;
    address internal constant BORROWER_OPERATIONS_SIGNATURES =
        0xD757e3646AF370b15f32EB557F0F8380Df7D639e;

    function run() external returns (MicrotroveVault vault, Microtroves loans) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(key);
        uint256 term = vm.envOr("TERM_SECONDS", uint256(90 days));
        uint256 seed = vm.envOr("SEED_MUSD", uint256(0));

        // RFC-2 defaults: 25 to 200 MUSD, 5% APR, 110% to 500% collateral.
        Microtroves.Params memory params = Microtroves.Params({
            interestRateBps: 500,
            issuanceFeeBps: 50,
            term: uint32(term),
            minDebt: 25e18,
            maxDebt: 200e18,
            mcr: 1.1e18,
            maxCr: 5e18,
            expiryBonusBps: 1_000,
            underwaterBonusBps: 500,
            protocolFeeBps: 0
        });

        vm.startBroadcast(key);
        vault = new MicrotroveVault(IERC20(MUSD), deployer);
        loans = new Microtroves(
            vault,
            IPriceFeed(PRICE_FEED),
            IBorrowerOperationsSignatures(BORROWER_OPERATIONS_SIGNATURES),
            deployer,
            deployer,
            params
        );
        vault.setLoanBook(loans);
        if (seed != 0) {
            IERC20(MUSD).approve(address(vault), seed);
            vault.deposit(seed, deployer);
        }
        vm.stopBroadcast();

        console.log("MicrotroveVault", address(vault));
        console.log("Microtroves    ", address(loans));
        console.log("term (seconds) ", term);
        console.log("seeded MUSD    ", seed);
    }
}
