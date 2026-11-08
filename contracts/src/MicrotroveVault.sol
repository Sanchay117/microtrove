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
///      vault with FIFO async withdrawals. Queued requests are priced when filled,
///      keep earning until then, and reserve idle MUSD so it is neither lent out nor
///      withdrawn instantly. Instant withdrawals only use idle MUSD beyond that
///      reserve. Every loan matures within one term, so a queued request waits at
///      most that long. A payment MUSD refuses never stops the queue: it is kept for
///      the request owner to claim.
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
    // MUSD from filled requests whose transfer to the receiver failed, per request owner.
    // It belongs to those owners, so it is not part of the vault's assets.
    mapping(address => uint256) public claimable;
    uint256 public totalClaimable;

    event LoanBookSet(address loanBook);
    event Lent(address indexed to, uint256 amount);
    event RedeemRequested(
        uint256 indexed id, address indexed owner, address indexed receiver, uint256 shares
    );
    event RedeemRequestCancelled(uint256 indexed id, address indexed owner, uint256 shares);
    event RedeemRequestFilled(
        uint256 indexed id, address indexed receiver, uint256 shares, uint256 assets, bool complete
    );
    event RedeemPaymentDeferred(
        uint256 indexed id, address indexed owner, address indexed receiver, uint256 assets
    );
    event Claimed(address indexed owner, address indexed to, uint256 assets);

    error LoanBookAlreadySet();
    error OnlyLoanBook();
    error InsufficientLiquidity(uint256 requested, uint256 available);
    error ZeroShares();
    error ZeroAddress();
    error InvalidReceiver();
    error NotRequestOwner();
    error RequestClosed();
    error NothingToClaim();

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

    /// @notice MUSD held for lenders, excluding payments waiting to be claimed.
    function idleAssets() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) - totalClaimable;
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
    // Instant withdrawals only use idle MUSD that queued requests do not need,
    // so the queue keeps its priority and a tiny request cannot block them.
    // ---------------------------------------------------------------------

    function maxWithdraw(address owner) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(owner), lendableLiquidity());
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        return
            Math.min(balanceOf(owner), _convertToShares(lendableLiquidity(), Math.Rounding.Floor));
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
        // MUSD refuses transfers to itself, and paying the vault would hand the
        // MUSD to the other lenders. Both are caught early; `_fill` covers the rest.
        if (receiver == asset() || receiver == address(this)) revert InvalidReceiver();
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

    /// @notice Sends the caller's deferred redemption payments to `to`.
    function claim(address to) external nonReentrant returns (uint256 assets) {
        assets = claimable[msg.sender];
        if (assets == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        totalClaimable -= assets;
        emit Claimed(msg.sender, to, assets);
        IERC20(asset()).safeTransfer(to, assets);
    }

    function getRequest(uint256 id) external view returns (RedeemRequest memory) {
        return _requests[id];
    }

    function requestCount() external view returns (uint256) {
        return _requests.length;
    }

    /// @notice Requests `start` to `start + count`, for showing the queue in one call.
    function getRequests(uint256 start, uint256 count)
        external
        view
        returns (RedeemRequest[] memory page)
    {
        uint256 end = Math.min(start + count, _requests.length);
        if (start >= end) return page;
        page = new RedeemRequest[](end - start);
        for (uint256 i = start; i < end; ++i) {
            page[i - start] = _requests[i];
        }
    }

    /// @notice MUSD that must be paid to requests ahead of `id` before it is filled.
    function assetsAhead(uint256 id) external view returns (uint256) {
        uint256 shares;
        for (uint256 i = queueHead; i < id; ++i) {
            shares += _requests[i].shares;
        }
        return _convertToAssets(shares, Math.Rounding.Ceil);
    }

    function _fill(uint256 id, RedeemRequest storage r, uint256 shares, uint256 assets) internal {
        r.shares -= shares;
        pendingShares -= shares;
        _burn(address(this), shares);
        emit RedeemRequestFilled(id, r.receiver, shares, assets, r.shares == 0);
        // One receiver MUSD will not pay must not stop every withdrawal behind it,
        // so a failed payment is kept for the request owner to claim instead.
        if (!_tryTransfer(r.receiver, assets)) {
            claimable[r.owner] += assets;
            totalClaimable += assets;
            emit RedeemPaymentDeferred(id, r.owner, r.receiver, assets);
        }
    }

    /// @dev Like `safeTransfer`, but reports failure instead of reverting.
    function _tryTransfer(address to, uint256 amount) internal returns (bool) {
        (bool ok, bytes memory ret) = asset().call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (!ok) return false;
        if (ret.length == 0) return asset().code.length != 0;
        return ret.length == 32 && abi.decode(ret, (bool));
    }
}
