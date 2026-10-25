// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {ILoanBook, IMicrotroveVault} from "./interfaces/IMicrotroves.sol";

/// @title MicrotroveVault
/// @notice ERC-4626 vault that funds Microtroves loans with MUSD. Lenders earn the
///         loans' fixed interest and issuance fees through a rising share price.
/// @dev This is the "anyone can fund it" extension RFC-2 lists as future work: a
///      vault with FIFO async withdrawals. Instant withdrawals use idle MUSD while
///      no request is queued. Queued requests are priced when filled, keep earning
///      until then, and reserve idle MUSD so no new loans are made from it. Every
///      loan matures within one term, so a queued request waits at most that long.
contract MicrotroveVault is ERC4626, Ownable2Step, ReentrancyGuard, IMicrotroveVault {
    using SafeERC20 for IERC20;

    struct RedeemRequest {
        address owner;
        address receiver;
        uint256 shares;
    }

    ILoanBook public loanBook;

    RedeemRequest[] internal _requests;
    uint256 public queueHead;
    // Shares escrowed in this vault by unfilled requests.
    uint256 public pendingShares;

    event LoanBookSet(address loanBook);
    event Lent(address indexed to, uint256 amount);
    event RedeemRequested(
        uint256 indexed id, address indexed owner, address indexed receiver, uint256 shares
    );
    event RedeemRequestCancelled(uint256 indexed id, address indexed owner, uint256 shares);
    event RedeemRequestFilled(
        uint256 indexed id, address indexed receiver, uint256 shares, uint256 assets, bool complete
    );

    error LoanBookAlreadySet();
    error OnlyLoanBook();
    error InsufficientLiquidity(uint256 requested, uint256 available);
    error ZeroShares();
    error ZeroAddress();
    error NotRequestOwner();
    error RequestClosed();

    constructor(IERC20 musd, address initialOwner)
        ERC20("Microtrove Lender MUSD", "mtMUSD")
        ERC4626(musd)
        Ownable(initialOwner)
    {}

    /// @notice Connects the loan book once. The owner has no other powers.
    function setLoanBook(ILoanBook book) external onlyOwner {
        if (address(loanBook) != address(0)) revert LoanBookAlreadySet();
        if (address(book) == address(0)) revert ZeroAddress();
        loanBook = book;
        emit LoanBookSet(address(book));
    }

    // ---------------------------------------------------------------------
    // Accounting
    // ---------------------------------------------------------------------

    /// @notice Idle MUSD plus what borrowers owe the vault, including accrued interest.
    function totalAssets() public view override returns (uint256) {
        uint256 owed = address(loanBook) == address(0) ? 0 : loanBook.lenderAssets();
        return idleAssets() + owed;
    }

    function asset() public view override(ERC4626, IMicrotroveVault) returns (address) {
        return super.asset();
    }

    function idleAssets() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    /// @notice Current value of all queued redemption requests.
    function pendingAssets() public view returns (uint256) {
        return _convertToAssets(pendingShares, Math.Rounding.Ceil);
    }

    /// @inheritdoc IMicrotroveVault
    function lendableLiquidity() public view returns (uint256) {
        uint256 idle = idleAssets();
        uint256 reserved = pendingAssets();
        return idle > reserved ? idle - reserved : 0;
    }

    /// @notice Share of lender capital currently out on loan, in basis points.
    function utilizationBps() external view returns (uint256) {
        uint256 total = totalAssets();
        if (total == 0) return 0;
        return Math.mulDiv(total - idleAssets(), 10_000, total);
    }

    // ---------------------------------------------------------------------
    // Instant withdrawals are limited to idle MUSD and pause while requests queue.
    // ---------------------------------------------------------------------

    function maxWithdraw(address owner) public view override returns (uint256) {
        if (pendingShares != 0) return 0;
        return Math.min(super.maxWithdraw(owner), idleAssets());
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        if (pendingShares != 0) return 0;
        return Math.min(balanceOf(owner), _convertToShares(idleAssets(), Math.Rounding.Floor));
    }

    // ---------------------------------------------------------------------
    // Lending
    // ---------------------------------------------------------------------

    /// @inheritdoc IMicrotroveVault
    function lend(address to, uint256 amount) external {
        if (msg.sender != address(loanBook)) revert OnlyLoanBook();
        uint256 available = lendableLiquidity();
        if (amount > available) revert InsufficientLiquidity(amount, available);
        IERC20(asset()).safeTransfer(to, amount);
        emit Lent(to, amount);
    }

    // ---------------------------------------------------------------------
    // Queued withdrawals
    // ---------------------------------------------------------------------

    /// @notice Queues `shares` for redemption. They stay in the vault, keep earning,
    ///         and are paid out in order as loans are repaid.
    function requestRedeem(uint256 shares, address receiver)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (shares == 0) revert ZeroShares();
        if (receiver == address(0)) revert ZeroAddress();
        _transfer(msg.sender, address(this), shares);
        pendingShares += shares;
        id = _requests.length;
        _requests.push(RedeemRequest(msg.sender, receiver, shares));
        emit RedeemRequested(id, msg.sender, receiver, shares);
    }

    /// @notice Withdraws an unfilled request and returns its remaining shares.
    function cancelRedeemRequest(uint256 id) external nonReentrant {
        RedeemRequest storage r = _requests[id];
        if (r.owner != msg.sender) revert NotRequestOwner();
        uint256 shares = r.shares;
        if (shares == 0) revert RequestClosed();
        r.shares = 0;
        pendingShares -= shares;
        _transfer(address(this), msg.sender, shares);
        emit RedeemRequestCancelled(id, msg.sender, shares);
    }

    /// @notice Pays queued requests in order from idle MUSD. Anyone can call it.
    /// @return filled Number of requests paid fully or partially.
    function processQueue(uint256 maxRequests) external nonReentrant returns (uint256 filled) {
        uint256 head = queueHead;
        uint256 end = _requests.length;
        while (head < end && filled < maxRequests) {
            RedeemRequest storage r = _requests[head];
            uint256 shares = r.shares;
            if (shares == 0) {
                ++head;
                continue;
            }
            uint256 idle = idleAssets();
            if (idle == 0) break;

            uint256 assets = previewRedeem(shares);
            if (assets <= idle) {
                _fill(head, r, shares, assets);
                ++head;
                ++filled;
                continue;
            }
            // Partial fill with everything that is idle, then stop.
            uint256 partialShares = previewWithdraw(idle);
            if (partialShares != 0 && partialShares < shares) {
                _fill(head, r, partialShares, idle);
                ++filled;
            }
            break;
        }
        queueHead = head;
    }

    function getRequest(uint256 id) external view returns (RedeemRequest memory) {
        return _requests[id];
    }

    function requestCount() external view returns (uint256) {
        return _requests.length;
    }

    function _fill(uint256 id, RedeemRequest storage r, uint256 shares, uint256 assets) internal {
        r.shares -= shares;
        pendingShares -= shares;
        _burn(address(this), shares);
        IERC20(asset()).safeTransfer(r.receiver, assets);
        emit RedeemRequestFilled(id, r.receiver, shares, assets, r.shares == 0);
    }
}
