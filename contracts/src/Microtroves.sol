// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IPriceFeed, IBorrowerOperationsSignatures} from "./interfaces/IMezo.sol";
import {ILoanBook, IMicrotroveVault} from "./interfaces/IMicrotroves.sol";

/// @title Microtroves
/// @notice Fixed-term MUSD microloans (25 to 200 MUSD) backed by BTC on Mezo.
/// @dev Implements Mezo's RFC-2 "Lending Arbitrage Microloans". BTC collateral is
///      held here; MUSD is lent out of a MicrotroveVault that anyone can fund.
///      Repaying and closing never read the oracle, so a borrower can always exit.
contract Microtroves is ILoanBook, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum LiquidationMode {
        None,
        Undercollateralized,
        Expired
    }

    struct Trove {
        uint256 collateral;
        // MUSD owed before interest, including issuance fees.
        uint256 principal;
        // Interest accrued up to `lastAccrual`.
        uint256 interest;
        uint64 lastAccrual;
        // End of the current debt term; zero while the trove has no debt.
        uint64 maturity;
        // Captured when a debt term starts so governance changes only affect new terms.
        uint16 interestRateBps;
        uint16 issuanceFeeBps;
        bool active;
    }

    struct Params {
        uint16 interestRateBps;
        uint16 issuanceFeeBps;
        uint32 term;
        uint128 minDebt;
        uint128 maxDebt;
        // Collateral ratios use 1e18 = 100%.
        uint64 mcr;
        uint64 maxCr;
        // Premium paid to the liquidator of a matured loan, as a share of its debt.
        uint16 expiryBonusBps;
        // Premium guaranteed to the liquidator of an underwater loan.
        uint16 underwaterBonusBps;
        // Share of interest routed to `feeRecipient` instead of lenders.
        uint16 protocolFeeBps;
    }

    struct LiquidationPreview {
        LiquidationMode mode;
        uint256 debt;
        uint256 repayAmount;
        uint256 collateralToLiquidator;
        uint256 surplus;
    }

    uint256 public constant BPS = 10_000;
    uint256 public constant YEAR = 365 days;
    uint256 internal constant ONE = 1e18;

    // Governance guardrails.
    uint256 public constant MAX_INTEREST_RATE_BPS = 3_000;
    uint256 public constant MAX_ISSUANCE_FEE_BPS = 500;
    uint256 public constant MIN_TERM = 1 hours;
    uint256 public constant MAX_TERM = 365 days;
    // Micro troves stay below MUSD's own minimum debt.
    uint256 public constant MAX_DEBT_CEILING = 1_800e18;
    uint256 public constant MIN_MCR = 1.05e18;
    uint256 public constant MAX_CR_CEILING = 20e18;
    uint256 public constant MAX_BONUS_BPS = 2_000;
    uint256 public constant MAX_PROTOCOL_FEE_BPS = 2_000;

    IERC20 public immutable musd;
    IMicrotroveVault public immutable vault;
    IPriceFeed public immutable priceFeed;
    IBorrowerOperationsSignatures public immutable borrowerOperationsSignatures;

    Params public params;
    address public feeRecipient;

    mapping(address => Trove) internal _troves;
    // BTC left over after a matured loan was liquidated, claimable by the borrower.
    mapping(address => uint256) public surplus;

    address[] internal _borrowers;
    // 1-based position in `_borrowers`; zero when absent.
    mapping(address => uint256) internal _borrowerIndex;

    uint256 public totalCollateral;
    uint256 public totalSurplus;
    uint256 public totalPrincipal;
    // Interest accrued across all troves up to `lastGlobalAccrual`.
    uint256 public totalInterest;
    // Sum of principal * interestRateBps over all troves, used to accrue `totalInterest`.
    uint256 public rateWeightedPrincipal;
    uint64 public lastGlobalAccrual;

    event TroveOpened(address indexed borrower, uint256 collateral, uint256 borrowed, uint256 debt);
    event CollateralAdded(address indexed borrower, uint256 amount);
    event CollateralWithdrawn(address indexed borrower, uint256 amount);
    event Borrowed(address indexed borrower, uint256 amount, uint256 fee, uint64 maturity);
    event Repaid(
        address indexed borrower, address indexed payer, uint256 interestPaid, uint256 principalPaid
    );
    event TroveClosed(address indexed borrower, uint256 collateralReturned);
    event Liquidated(
        address indexed borrower,
        address indexed liquidator,
        LiquidationMode mode,
        uint256 repaid,
        uint256 collateralToLiquidator,
        uint256 surplus,
        uint256 badDebt
    );
    event SurplusClaimed(address indexed borrower, uint256 amount);
    event Promoted(
        address indexed borrower, uint256 collateral, uint256 musdDebt, uint256 microDebtRepaid
    );
    event ParamsUpdated(Params params);
    event FeeRecipientUpdated(address feeRecipient);

    error TroveAlreadyActive();
    error TroveNotActive();
    error ZeroAmount();
    error AmountExceedsCollateral();
    error DebtBelowMinimum(uint256 debt, uint256 minDebt);
    error DebtAboveMaximum(uint256 debt, uint256 maxDebt);
    error CollateralBelowMinimum();
    error CollateralRatioBelowMinimum(uint256 icr);
    error CollateralRatioAboveMaximum(uint256 icr);
    error TermEnded();
    error DebtOutstanding();
    error NotLiquidatable();
    error NothingToClaim();
    error PromotionShortfall(uint256 received, uint256 owed);
    error BtcTransferFailed();
    error InvalidParams();
    error ZeroAddress();

    constructor(
        IMicrotroveVault _vault,
        IPriceFeed _priceFeed,
        IBorrowerOperationsSignatures _borrowerOperationsSignatures,
        address _owner,
        address _feeRecipient,
        Params memory _params
    ) Ownable(_owner) {
        if (
            address(_vault) == address(0) || address(_priceFeed) == address(0)
                || address(_borrowerOperationsSignatures) == address(0)
                || _feeRecipient == address(0)
        ) revert ZeroAddress();
        vault = _vault;
        musd = IERC20(_vault.asset());
        priceFeed = _priceFeed;
        borrowerOperationsSignatures = _borrowerOperationsSignatures;
        feeRecipient = _feeRecipient;
        _setParams(_params);
        lastGlobalAccrual = uint64(block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Borrower actions
    // ---------------------------------------------------------------------

    /// @notice Opens a micro trove with the BTC sent and optionally borrows MUSD.
    /// @param borrowAmount MUSD sent to the caller; zero opens a trove without debt.
    function open(uint256 borrowAmount) external payable nonReentrant {
        Trove storage t = _troves[msg.sender];
        if (t.active) revert TroveAlreadyActive();
        if (msg.value == 0) revert ZeroAmount();

        _accrueGlobal();
        t.active = true;
        t.collateral = msg.value;
        t.lastAccrual = uint64(block.timestamp);
        totalCollateral += msg.value;
        _addBorrower(msg.sender);

        if (borrowAmount != 0) {
            _requireNotPaused();
            _increaseDebt(t, msg.sender, borrowAmount);
        }
        _requireHealthy(t, priceFeed.fetchPrice(), true);

        emit TroveOpened(msg.sender, msg.value, borrowAmount, t.principal);
        if (borrowAmount != 0) vault.lend(msg.sender, borrowAmount);
    }

    /// @notice Adds the BTC sent to the caller's trove.
    function addCollateral() external payable nonReentrant {
        Trove storage t = _activeTrove(msg.sender);
        if (msg.value == 0) revert ZeroAmount();
        _accrue(t);
        t.collateral += msg.value;
        totalCollateral += msg.value;
        // Topping up is always allowed below the minimum ratio; only the cap applies.
        _requireBelowMaxCr(t, priceFeed.fetchPrice());
        emit CollateralAdded(msg.sender, msg.value);
    }

    /// @notice Withdraws BTC. Withdrawing everything from a trove without debt closes it.
    function withdrawCollateral(uint256 amount) external nonReentrant {
        Trove storage t = _activeTrove(msg.sender);
        if (amount == 0) revert ZeroAmount();
        if (amount > t.collateral) revert AmountExceedsCollateral();
        _accrue(t);
        if (amount == t.collateral) {
            if (t.principal != 0) revert DebtOutstanding();
            _removeTrove(msg.sender, t);
            emit TroveClosed(msg.sender, amount);
        } else {
            t.collateral -= amount;
            totalCollateral -= amount;
            _requireHealthy(t, priceFeed.fetchPrice(), false);
            emit CollateralWithdrawn(msg.sender, amount);
        }
        _sendBtc(msg.sender, amount);
    }

    /// @notice Borrows more MUSD. The first borrow on a trove without debt starts a new term.
    function borrow(uint256 amount) external nonReentrant whenNotPaused {
        Trove storage t = _activeTrove(msg.sender);
        if (amount == 0) revert ZeroAmount();
        _accrue(t);
        _increaseDebt(t, msg.sender, amount);
        _requireHealthy(t, priceFeed.fetchPrice(), false);
        vault.lend(msg.sender, amount);
    }

    /// @notice Repays up to `amount` MUSD, interest first. Overpayment is capped at the debt.
    function repay(uint256 amount) external nonReentrant {
        _repay(amount);
    }

    /// @notice `repay` with an EIP-2612 permit so no separate approval is needed.
    function repayWithPermit(uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
    {
        _permit(amount, deadline, v, r, s);
        _repay(amount);
    }

    /// @notice Repays all debt and returns all collateral.
    function close() external nonReentrant {
        _close();
    }

    /// @notice `close` with an EIP-2612 permit for up to `maxRepay` MUSD.
    function closeWithPermit(uint256 maxRepay, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
    {
        _permit(maxRepay, deadline, v, r, s);
        _close();
    }

    /// @notice Claims BTC left over after the caller's matured loan was liquidated.
    function claimSurplus() external nonReentrant {
        uint256 amount = surplus[msg.sender];
        if (amount == 0) revert NothingToClaim();
        surplus[msg.sender] = 0;
        totalSurplus -= amount;
        emit SurplusClaimed(msg.sender, amount);
        _sendBtc(msg.sender, amount);
    }

    /// @notice Upgrades the caller's micro trove into a full MUSD trove in one transaction.
    /// @dev The caller signs MUSD's EIP-712 `OpenTrove` message with this contract as
    ///      recipient and `assetAmount` = current collateral + msg.value. The new
    ///      trove's MUSD repays the micro debt and the rest goes to the caller.
    function promote(
        uint256 musdDebtAmount,
        address upperHint,
        address lowerHint,
        bytes calldata signature,
        uint256 deadline
    ) external payable nonReentrant {
        Trove storage t = _activeTrove(msg.sender);
        _accrue(t);
        uint256 interestOwed = t.interest;
        uint256 principalOwed = t.principal;
        uint256 collateral = t.collateral + msg.value;
        _removeTrove(msg.sender, t);

        uint256 received =
            _openMusdTrove(collateral, musdDebtAmount, upperHint, lowerHint, signature, deadline);
        uint256 owed = interestOwed + principalOwed;
        if (received < owed) revert PromotionShortfall(received, owed);

        if (owed != 0) {
            _collect(address(this), interestOwed, principalOwed);
            emit Repaid(msg.sender, address(this), interestOwed, principalOwed);
        }
        emit Promoted(msg.sender, collateral, musdDebtAmount, owed);
        musd.safeTransfer(msg.sender, received - owed);
    }

    // ---------------------------------------------------------------------
    // Liquidation
    // ---------------------------------------------------------------------

    /// @notice Liquidates a trove below the minimum collateral ratio or past its maturity.
    ///         The caller pays MUSD and receives BTC; see `previewLiquidation`.
    function liquidate(address borrower) external nonReentrant {
        Trove storage t = _activeTrove(borrower);
        _accrue(t);
        LiquidationPreview memory p = _previewLiquidation(t, priceFeed.fetchPrice());
        if (p.mode == LiquidationMode.None) revert NotLiquidatable();

        uint256 interestOwed = t.interest;
        uint256 principalOwed = t.principal;
        _removeTrove(borrower, t);
        if (p.surplus != 0) {
            surplus[borrower] += p.surplus;
            totalSurplus += p.surplus;
        }

        if (p.repayAmount == p.debt) {
            _collect(msg.sender, interestOwed, principalOwed);
        } else {
            // Underwater: lenders absorb the shortfall, and no protocol fee is taken.
            musd.safeTransferFrom(msg.sender, address(vault), p.repayAmount);
        }

        emit Liquidated(
            borrower,
            msg.sender,
            p.mode,
            p.repayAmount,
            p.collateralToLiquidator,
            p.surplus,
            p.debt - p.repayAmount
        );
        _sendBtc(msg.sender, p.collateralToLiquidator);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @inheritdoc ILoanBook
    function lenderAssets() external view returns (uint256) {
        uint256 interest = pendingTotalInterest();
        return totalPrincipal + interest - (interest * params.protocolFeeBps) / BPS;
    }

    function pendingTotalInterest() public view returns (uint256) {
        return totalInterest + (rateWeightedPrincipal * (block.timestamp - lastGlobalAccrual))
            / (YEAR * BPS);
    }

    function getTrove(address borrower)
        external
        view
        returns (
            bool active,
            uint256 collateral,
            uint256 principal,
            uint256 interest,
            uint256 debt,
            uint64 maturity,
            uint16 interestRateBps,
            uint16 issuanceFeeBps
        )
    {
        Trove storage t = _troves[borrower];
        interest = _pendingInterest(t);
        return (
            t.active,
            t.collateral,
            t.principal,
            interest,
            t.principal + interest,
            t.maturity,
            t.interestRateBps,
            t.issuanceFeeBps
        );
    }

    /// @notice Current collateral ratio (1e18 = 100%); max uint when the trove has no debt.
    function getIcr(address borrower) external view returns (uint256) {
        Trove storage t = _troves[borrower];
        return _icr(t.collateral, t.principal + _pendingInterest(t), priceFeed.fetchPrice());
    }

    function previewLiquidation(address borrower)
        external
        view
        returns (LiquidationPreview memory)
    {
        Trove storage t = _troves[borrower];
        if (!t.active) return LiquidationPreview(LiquidationMode.None, 0, 0, 0, 0);
        return _previewLiquidation(t, priceFeed.fetchPrice());
    }

    function borrowerCount() external view returns (uint256) {
        return _borrowers.length;
    }

    function getBorrowers(uint256 start, uint256 count)
        external
        view
        returns (address[] memory page)
    {
        uint256 end = Math.min(start + count, _borrowers.length);
        if (start >= end) return page;
        page = new address[](end - start);
        for (uint256 i = start; i < end; ++i) {
            page[i - start] = _borrowers[i];
        }
    }

    /// @notice Liquidatable borrowers within `_borrowers[start:start+count]`, for keepers.
    function getLiquidatable(uint256 start, uint256 count)
        external
        view
        returns (address[] memory found)
    {
        uint256 end = Math.min(start + count, _borrowers.length);
        if (start >= end) return found;
        uint256 price = priceFeed.fetchPrice();
        address[] memory scratch = new address[](end - start);
        uint256 n;
        for (uint256 i = start; i < end; ++i) {
            address b = _borrowers[i];
            if (_previewLiquidation(_troves[b], price).mode != LiquidationMode.None) {
                scratch[n++] = b;
            }
        }
        found = new address[](n);
        for (uint256 i; i < n; ++i) {
            found[i] = scratch[i];
        }
    }

    // ---------------------------------------------------------------------
    // Governance
    // ---------------------------------------------------------------------

    /// @notice Rate, fee and term apply to debt terms that start after the change.
    function setParams(Params calldata newParams) external onlyOwner {
        _accrueGlobal();
        _setParams(newParams);
    }

    function setFeeRecipient(address newFeeRecipient) external onlyOwner {
        if (newFeeRecipient == address(0)) revert ZeroAddress();
        feeRecipient = newFeeRecipient;
        emit FeeRecipientUpdated(newFeeRecipient);
    }

    /// @notice Pausing stops new debt only. Repaying, closing, withdrawing and
    ///         liquidating keep working.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _repay(uint256 amount) internal {
        Trove storage t = _activeTrove(msg.sender);
        if (amount == 0) revert ZeroAmount();
        _accrue(t);
        _decreaseDebt(t, msg.sender, msg.sender, amount);
    }

    function _close() internal {
        Trove storage t = _activeTrove(msg.sender);
        _accrue(t);
        uint256 debt = t.principal + t.interest;
        if (debt != 0) _decreaseDebt(t, msg.sender, msg.sender, debt);
        uint256 collateral = t.collateral;
        _removeTrove(msg.sender, t);
        emit TroveClosed(msg.sender, collateral);
        _sendBtc(msg.sender, collateral);
    }

    function _permit(uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) internal {
        // A front-run permit is harmless: the allowance is already in place.
        try IERC20Permit(address(musd))
            .permit(msg.sender, address(this), value, deadline, v, r, s) {}
            catch {}
    }

    /// @dev Opens the caller's MUSD trove with this contract as recipient and
    ///      returns the MUSD received.
    function _openMusdTrove(
        uint256 collateral,
        uint256 debtAmount,
        address upperHint,
        address lowerHint,
        bytes calldata signature,
        uint256 deadline
    ) internal returns (uint256) {
        uint256 balanceBefore = musd.balanceOf(address(this));
        borrowerOperationsSignatures.openTroveWithSignature{value: collateral}(
            debtAmount, upperHint, lowerHint, msg.sender, address(this), signature, deadline
        );
        return musd.balanceOf(address(this)) - balanceBefore;
    }

    function _increaseDebt(Trove storage t, address borrower, uint256 amount) internal {
        Params memory p = params;
        if (t.principal == 0) {
            t.interestRateBps = p.interestRateBps;
            t.issuanceFeeBps = p.issuanceFeeBps;
            t.maturity = uint64(block.timestamp + p.term);
        } else if (block.timestamp >= t.maturity) {
            revert TermEnded();
        }
        uint256 fee = Math.mulDiv(amount, t.issuanceFeeBps, BPS, Math.Rounding.Ceil);
        uint256 added = amount + fee;
        t.principal += added;
        if (t.principal < p.minDebt) revert DebtBelowMinimum(t.principal, p.minDebt);
        if (t.principal > p.maxDebt) revert DebtAboveMaximum(t.principal, p.maxDebt);
        totalPrincipal += added;
        rateWeightedPrincipal += added * t.interestRateBps;
        emit Borrowed(borrower, amount, fee, t.maturity);
    }

    function _decreaseDebt(Trove storage t, address borrower, address payer, uint256 amount)
        internal
    {
        uint256 pay = Math.min(amount, t.principal + t.interest);
        uint256 toInterest = Math.min(pay, t.interest);
        uint256 toPrincipal = pay - toInterest;

        t.interest -= toInterest;
        totalInterest = _subFloor(totalInterest, toInterest);
        t.principal -= toPrincipal;
        totalPrincipal -= toPrincipal;
        rateWeightedPrincipal -= toPrincipal * t.interestRateBps;

        if (t.principal == 0) {
            t.maturity = 0;
            if (totalPrincipal == 0) totalInterest = 0;
        } else if (t.principal < params.minDebt) {
            revert DebtBelowMinimum(t.principal, params.minDebt);
        }

        _collect(payer, toInterest, toPrincipal);
        emit Repaid(borrower, payer, toInterest, toPrincipal);
    }

    /// @dev Routes a payment to the vault, minus the protocol's share of the interest.
    function _collect(address payer, uint256 interestPart, uint256 principalPart) internal {
        uint256 protocolCut = (interestPart * params.protocolFeeBps) / BPS;
        uint256 toVault = interestPart + principalPart - protocolCut;
        if (payer == address(this)) {
            if (protocolCut != 0) musd.safeTransfer(feeRecipient, protocolCut);
            if (toVault != 0) musd.safeTransfer(address(vault), toVault);
        } else {
            if (protocolCut != 0) musd.safeTransferFrom(payer, feeRecipient, protocolCut);
            if (toVault != 0) musd.safeTransferFrom(payer, address(vault), toVault);
        }
    }

    function _previewLiquidation(Trove storage t, uint256 price)
        internal
        view
        returns (LiquidationPreview memory p)
    {
        p.debt = t.principal + _pendingInterest(t);
        if (p.debt == 0) return p;
        uint256 collateralValue = Math.mulDiv(t.collateral, price, ONE);

        if (collateralValue * ONE < uint256(params.mcr) * p.debt) {
            // Below the minimum ratio: the liquidator takes all collateral. If the
            // trove is underwater, the repayment is cut so the liquidator still
            // earns `underwaterBonusBps`, and lenders absorb the difference.
            p.mode = LiquidationMode.Undercollateralized;
            uint256 maxRepay = Math.mulDiv(collateralValue, BPS, BPS + params.underwaterBonusBps);
            p.repayAmount = Math.min(p.debt, maxRepay);
            p.collateralToLiquidator = t.collateral;
        } else if (block.timestamp >= t.maturity) {
            // Matured: the liquidator repays the debt and receives BTC worth the debt
            // plus `expiryBonusBps`. The borrower can claim the rest.
            //
            // RFC-2 gives the liquidator 10% of the collateral instead. With a 500%
            // cap that is worth at most 50% of the debt they repay, so no keeper
            // would ever run it. Pricing the reward off the debt keeps it profitable
            // at every allowed collateral ratio.
            p.mode = LiquidationMode.Expired;
            p.repayAmount = p.debt;
            uint256 rewardValue = Math.mulDiv(p.debt, BPS + params.expiryBonusBps, BPS);
            p.collateralToLiquidator = Math.min(t.collateral, Math.mulDiv(rewardValue, ONE, price));
            p.surplus = t.collateral - p.collateralToLiquidator;
        }
    }

    function _requireHealthy(Trove storage t, uint256 price, bool collateralIncreased)
        internal
        view
    {
        uint256 collateralValue = Math.mulDiv(t.collateral, price, ONE);
        // A live trove keeps at least MCR x minDebt of BTC so troves cannot be dust.
        if (collateralValue * ONE < uint256(params.mcr) * params.minDebt) {
            revert CollateralBelowMinimum();
        }
        uint256 debt = t.principal + t.interest;
        if (debt != 0 && collateralValue * ONE < uint256(params.mcr) * debt) {
            revert CollateralRatioBelowMinimum(_icr(t.collateral, debt, price));
        }
        if (collateralIncreased) _requireBelowMaxCr(t, price);
    }

    /// @dev The cap keeps micro troves clearly smaller than MUSD troves. A trove
    ///      without debt is measured against `minDebt`.
    function _requireBelowMaxCr(Trove storage t, uint256 price) internal view {
        uint256 reference_ = Math.max(t.principal + t.interest, params.minDebt);
        uint256 collateralValue = Math.mulDiv(t.collateral, price, ONE);
        if (collateralValue * ONE > uint256(params.maxCr) * reference_) {
            revert CollateralRatioAboveMaximum(_icr(t.collateral, reference_, price));
        }
    }

    function _icr(uint256 collateral, uint256 debt, uint256 price) internal pure returns (uint256) {
        if (debt == 0) return type(uint256).max;
        return Math.mulDiv(collateral, price, debt);
    }

    function _accrueGlobal() internal {
        uint256 elapsed = block.timestamp - lastGlobalAccrual;
        if (elapsed == 0) return;
        if (rateWeightedPrincipal != 0) {
            totalInterest += (rateWeightedPrincipal * elapsed) / (YEAR * BPS);
        }
        lastGlobalAccrual = uint64(block.timestamp);
    }

    function _accrue(Trove storage t) internal {
        _accrueGlobal();
        t.interest = _pendingInterest(t);
        t.lastAccrual = uint64(block.timestamp);
    }

    function _pendingInterest(Trove storage t) internal view returns (uint256) {
        return t.interest + (t.principal * t.interestRateBps * (block.timestamp - t.lastAccrual))
            / (YEAR * BPS);
    }

    function _removeTrove(address borrower, Trove storage t) internal {
        totalCollateral -= t.collateral;
        totalPrincipal -= t.principal;
        totalInterest = _subFloor(totalInterest, t.interest);
        rateWeightedPrincipal -= t.principal * t.interestRateBps;
        if (totalPrincipal == 0) totalInterest = 0;
        delete _troves[borrower];
        _removeBorrower(borrower);
    }

    function _activeTrove(address borrower) internal view returns (Trove storage t) {
        t = _troves[borrower];
        if (!t.active) revert TroveNotActive();
    }

    function _addBorrower(address borrower) internal {
        _borrowers.push(borrower);
        _borrowerIndex[borrower] = _borrowers.length;
    }

    function _removeBorrower(address borrower) internal {
        uint256 index = _borrowerIndex[borrower];
        uint256 last = _borrowers.length;
        if (index != last) {
            address moved = _borrowers[last - 1];
            _borrowers[index - 1] = moved;
            _borrowerIndex[moved] = index;
        }
        _borrowers.pop();
        delete _borrowerIndex[borrower];
    }

    function _sendBtc(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert BtcTransferFailed();
    }

    function _setParams(Params memory p) internal {
        if (
            p.interestRateBps > MAX_INTEREST_RATE_BPS || p.issuanceFeeBps > MAX_ISSUANCE_FEE_BPS
                || p.term < MIN_TERM || p.term > MAX_TERM || p.minDebt == 0 || p.minDebt > p.maxDebt
                || p.maxDebt > MAX_DEBT_CEILING || p.mcr < MIN_MCR || p.maxCr <= p.mcr
                || p.maxCr > MAX_CR_CEILING || p.expiryBonusBps > MAX_BONUS_BPS
                || p.underwaterBonusBps == 0 || p.underwaterBonusBps > MAX_BONUS_BPS
                || p.protocolFeeBps > MAX_PROTOCOL_FEE_BPS
        ) revert InvalidParams();
        params = p;
        emit ParamsUpdated(p);
    }

    function _subFloor(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : 0;
    }
}
