// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

import {Microtroves} from "../../src/Microtroves.sol";
import {MicrotroveVault} from "../../src/MicrotroveVault.sol";
import {IPriceFeed, IBorrowerOperationsSignatures} from "../../src/interfaces/IMezo.sol";

interface IBorrowerOperations {
    function openTrove(uint256 debtAmount, address upperHint, address lowerHint) external payable;
}

interface ITroveManager {
    function getTroveStatus(address borrower) external view returns (uint256);
    function getTroveColl(address borrower) external view returns (uint256);
    function getTrovePrincipal(address borrower) external view returns (uint256);
}

interface IBorrowerOperationsSignaturesNonce {
    function getNonce(address user) external view returns (uint256);
}

interface IPriceFeedOracle {
    function oracle() external view returns (address);
}

/// @dev Stands in for Mezo's BTC/USD oracle precompile, which a local fork cannot
///      execute. It replays the live chain's latest answer and reports it as fresh,
///      so MUSD's real PriceFeed accepts it after the test moves time forward.
contract OracleReplay {
    int256 public answer;
    uint8 public decimals;

    function set(int256 _answer, uint8 _decimals) external {
        answer = _answer;
        decimals = _decimals;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, block.timestamp, block.timestamp, 1);
    }
}

/// @notice Runs Microtrove against the real MUSD system on a fork of Mezo Testnet:
///         MUSD, PriceFeed, BorrowerOperations, BorrowerOperationsSignatures and
///         TroveManager are the deployed contracts, not mocks. Only the oracle
///         precompile behind PriceFeed is replaced, with the live price.
/// @dev Needs network access, so it only runs when asked:
///      MEZO_FORK=1 forge test --match-path "test/fork/*" -vv
///      MEZO_RPC_URL overrides the RPC.
contract MezoForkTest is Test {
    address internal constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address internal constant PRICE_FEED = 0x86bCF0841622a5dAC14A313a15f96A95421b9366;
    address internal constant BORROWER_OPERATIONS = 0xCdF7028ceAB81fA0C6971208e83fa7872994beE5;
    address internal constant BORROWER_OPERATIONS_SIGNATURES =
        0xD757e3646AF370b15f32EB557F0F8380Df7D639e;
    address internal constant TROVE_MANAGER = 0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0;

    uint256 internal constant ACTIVE = 1;
    bytes32 internal constant OPEN_TROVE_TYPEHASH = keccak256(
        "OpenTrove(uint256 assetAmount,uint256 debtAmount,address borrower,address recipient,uint256 nonce,uint256 deadline)"
    );
    bytes32 internal constant PERMIT_TYPEHASH = keccak256(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );

    IERC20 internal musd = IERC20(MUSD);
    ITroveManager internal troveManager = ITroveManager(TROVE_MANAGER);
    MicrotroveVault internal vault;
    Microtroves internal loans;
    uint256 internal price;

    address internal lender = makeAddr("fork-lender");
    address internal borrower;
    uint256 internal borrowerKey;

    function setUp() public {
        if (!vm.envOr("MEZO_FORK", false)) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(vm.envOr("MEZO_RPC_URL", string("https://rpc.test.mezo.org")));
        (borrower, borrowerKey) = makeAddrAndKey("fork-borrower");
        _replayLiveOracle();
        price = IPriceFeed(PRICE_FEED).fetchPrice();

        // Same parameters as script/Deploy.s.sol.
        vault = new MicrotroveVault(musd, address(this));
        loans = new Microtroves(
            vault,
            IPriceFeed(PRICE_FEED),
            IBorrowerOperationsSignatures(BORROWER_OPERATIONS_SIGNATURES),
            address(this),
            address(this),
            Microtroves.Params({
                interestRateBps: 500,
                issuanceFeeBps: 50,
                term: 90 days,
                minDebt: 25e18,
                maxDebt: 200e18,
                mcr: 1.1e18,
                maxCr: 5e18,
                expiryBonusBps: 1_000,
                underwaterBonusBps: 500,
                protocolFeeBps: 1_000
            })
        );
        vault.setLoanBook(loans);

        // The lender gets real MUSD the only way there is: by opening an MUSD trove.
        vm.deal(lender, 1 ether);
        vm.startPrank(lender);
        IBorrowerOperations(BORROWER_OPERATIONS).openTrove{value: _btcFor(4_000e18)}(
            2_000e18, address(0), address(0)
        );
        musd.approve(address(vault), type(uint256).max);
        vault.deposit(1_500e18, lender);
        vm.stopPrank();

        vm.deal(borrower, 1 ether);
    }

    /// @dev Reads the oracle precompile on the live chain over RPC, then installs
    ///      `OracleReplay` with that answer at the precompile's address in the fork.
    function _replayLiveOracle() internal {
        address oracle = IPriceFeedOracle(PRICE_FEED).oracle();
        string memory to = vm.toString(oracle);
        bytes memory round =
            vm.rpc("eth_call", string.concat('[{"to":"', to, '","data":"0xfeaf968c"},"latest"]'));
        bytes memory dec =
            vm.rpc("eth_call", string.concat('[{"to":"', to, '","data":"0x313ce567"},"latest"]'));
        (, int256 answer,,,) = abi.decode(round, (uint80, int256, uint256, uint256, uint80));
        vm.etch(oracle, type(OracleReplay).runtimeCode);
        OracleReplay(oracle).set(answer, abi.decode(dec, (uint8)));
    }

    function _btcFor(uint256 usd) internal view returns (uint256) {
        return (usd * 1e18) / price;
    }

    function _openMicro(uint256 collateralUsd, uint256 borrowAmount) internal {
        vm.prank(borrower);
        loans.open{value: _btcFor(collateralUsd)}(borrowAmount);
    }

    function test_Fork_LenderMusdComesFromARealTrove() public view {
        assertEq(troveManager.getTroveStatus(lender), ACTIVE);
        assertEq(vault.totalAssets(), 1_500e18);
        assertEq(musd.balanceOf(lender), 500e18);
    }

    /// @dev The RFC-2 promotion, end to end against BorrowerOperationsSignatures.
    function test_Fork_PromoteIntoRealMusdTrove() public {
        _openMicro(300e18, 100e18);
        (, uint256 collateral, uint256 principal,, uint256 microDebt,,,) = loans.getTrove(borrower);
        assertEq(principal, 100.5e18);

        uint256 extra = _btcFor(2_900e18);
        uint256 assetAmount = collateral + extra;
        uint256 debtAmount = 1_800e18;
        uint256 deadline = block.timestamp + 30 minutes;
        bytes memory signature = _signOpenTrove(assetAmount, debtAmount, deadline);

        uint256 musdBefore = musd.balanceOf(borrower);
        uint256 idleBefore = vault.idleAssets();
        vm.prank(borrower);
        loans.promote{value: extra}(debtAmount, address(0), address(0), signature, deadline);

        // A real MUSD trove now holds all of the borrower's BTC.
        assertEq(troveManager.getTroveStatus(borrower), ACTIVE);
        assertEq(troveManager.getTroveColl(borrower), assetAmount);
        assertGe(troveManager.getTrovePrincipal(borrower), debtAmount + 200e18);
        // The micro trove is gone and its debt went to lenders and the protocol.
        (bool active,,,,,,,) = loans.getTrove(borrower);
        assertFalse(active);
        assertEq(loans.totalPrincipal(), 0);
        assertEq(address(loans).balance, 0);
        assertEq(vault.idleAssets() + loans.protocolFees(), idleBefore + microDebt);
        // The borrower keeps the rest of the new trove's MUSD.
        assertEq(musd.balanceOf(borrower) - musdBefore, debtAmount - microDebt);
    }

    function test_Fork_PromoteRejectsASignatureForOtherAmounts() public {
        _openMicro(300e18, 100e18);
        uint256 extra = _btcFor(2_900e18);
        uint256 deadline = block.timestamp + 30 minutes;
        // Signed for less BTC than the trove will actually hold.
        bytes memory signature = _signOpenTrove(extra, 1_800e18, deadline);

        vm.prank(borrower);
        vm.expectRevert();
        loans.promote{value: extra}(1_800e18, address(0), address(0), signature, deadline);
        assertEq(troveManager.getTroveStatus(borrower), 0);
    }

    /// @dev One-click close: MUSD's own EIP-2612 permit replaces the approval.
    function test_Fork_CloseWithRealMusdPermit() public {
        _openMicro(100e18, 40e18);
        // Top up the 0.5% issuance fee with lender MUSD.
        vm.prank(lender);
        musd.transfer(borrower, 1e18);
        assertEq(musd.allowance(borrower, address(loans)), 0);

        uint256 value = 40.2e18;
        uint256 deadline = block.timestamp + 10 minutes;
        bytes32 structHash = keccak256(
            abi.encode(
                PERMIT_TYPEHASH,
                borrower,
                address(loans),
                value,
                IERC20Permit(MUSD).nonces(borrower),
                deadline
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", IERC20Permit(MUSD).DOMAIN_SEPARATOR(), structHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(borrowerKey, digest);

        uint256 btcBefore = borrower.balance;
        vm.prank(borrower);
        loans.closeWithPermit(value, deadline, v, r, s);

        (bool active,,,,,,,) = loans.getTrove(borrower);
        assertFalse(active);
        assertEq(borrower.balance - btcBefore, _btcFor(100e18));
        assertEq(vault.totalAssets(), 1_500e18 + 0.2e18);
    }

    /// @dev Wave 1 review: MUSD itself as receiver used to freeze every withdrawal.
    function test_Fork_QueueCannotBeFrozenWithMusdAsReceiver() public {
        // Real MUSD refuses transfers to its own address...
        vm.prank(lender);
        vm.expectRevert("ERC20: transfer to the contract address");
        musd.transfer(MUSD, 1);

        // ...so the vault refuses that receiver before any shares are queued.
        uint256 shares = vault.balanceOf(lender);
        vm.prank(lender);
        vm.expectRevert(MicrotroveVault.InvalidReceiver.selector);
        vault.requestRedeem(shares, MUSD);

        // The queue still works normally for everyone.
        _openMicro(400e18, 150e18);
        vm.prank(lender);
        uint256 id = vault.requestRedeem(shares, lender);
        uint256 musdBefore = musd.balanceOf(lender);
        vault.processQueue(5);
        assertEq(musd.balanceOf(lender) - musdBefore, 1_350e18, "idle MUSD paid at once");
        assertGt(vault.getRequest(id).shares, 0, "the rest waits for repayment");

        vm.prank(lender);
        musd.transfer(borrower, 1e18);
        vm.startPrank(borrower);
        musd.approve(address(loans), type(uint256).max);
        loans.close();
        vm.stopPrank();
        vault.processQueue(5);
        assertEq(vault.getRequest(id).shares, 0);
        assertEq(vault.pendingShares(), 0);
    }

    /// @dev A keeper repays a matured loan in real MUSD and takes BTC worth debt + 10%.
    function test_Fork_KeeperLiquidatesMaturedLoan() public {
        _openMicro(200e18, 50e18);
        vm.warp(block.timestamp + 90 days + 1);
        (,,,, uint256 debt,,,) = loans.getTrove(borrower);

        address keeper = makeAddr("fork-keeper");
        vm.prank(lender);
        musd.transfer(keeper, 60e18);
        vm.startPrank(keeper);
        musd.approve(address(loans), type(uint256).max);
        Microtroves.LiquidationPreview memory p = loans.previewLiquidation(borrower);
        assertEq(uint8(p.mode), uint8(Microtroves.LiquidationMode.Expired));
        loans.liquidate(borrower);
        vm.stopPrank();

        assertEq(keeper.balance, p.collateralToLiquidator);
        assertApproxEqAbs(p.collateralToLiquidator * price / 1e18, debt * 11 / 10, 1e6);
        assertEq(loans.surplus(borrower), p.surplus);
        assertEq(musd.balanceOf(keeper), 60e18 - debt);
        assertGt(loans.protocolFees(), 0, "10% of the interest goes to the protocol");
    }

    function _signOpenTrove(uint256 assetAmount, uint256 debtAmount, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("BorrowerOperationsSignatures"),
                keccak256("1"),
                block.chainid,
                BORROWER_OPERATIONS_SIGNATURES
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                OPEN_TROVE_TYPEHASH,
                assetAmount,
                debtAmount,
                borrower,
                address(loans),
                IBorrowerOperationsSignaturesNonce(BORROWER_OPERATIONS_SIGNATURES)
                    .getNonce(borrower),
                deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            borrowerKey, keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash))
        );
        return abi.encodePacked(r, s, v);
    }
}
