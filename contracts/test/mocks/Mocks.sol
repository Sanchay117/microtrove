// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract MockMUSD is ERC20, ERC20Permit {
    constructor() ERC20("Mezo USD", "MUSD") ERC20Permit("Mezo USD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Mirrors MUSD's PriceFeed: 18-decimal BTC/USD price, reverts when stale.
contract MockPriceFeed {
    uint256 public price;
    bool public stale;

    constructor(uint256 _price) {
        price = _price;
    }

    function setPrice(uint256 _price) external {
        price = _price;
    }

    function setStale(bool _stale) external {
        stale = _stale;
    }

    function fetchPrice() external view returns (uint256) {
        require(!stale, "PriceFeed: Oracle is stale.");
        return price;
    }
}

/// @dev Reproduces the signature check of MUSD's BorrowerOperationsSignatures
///      (same EIP-712 domain, typehash and nonce handling) and a simplified
///      openTrove that mints the requested MUSD to the recipient.
contract MockBorrowerOperationsSignatures is EIP712 {
    bytes32 public constant OPEN_TROVE_TYPEHASH = keccak256(
        "OpenTrove(uint256 assetAmount,uint256 debtAmount,address borrower,address recipient,uint256 nonce,uint256 deadline)"
    );
    uint256 public constant MIN_NET_DEBT = 1_800e18;
    uint256 public constant GAS_COMPENSATION = 200e18;
    uint256 public constant MCR = 1.1e18;

    struct MusdTrove {
        uint256 collateral;
        uint256 debt;
    }

    MockMUSD public immutable musd;
    MockPriceFeed public immutable priceFeed;
    mapping(address => uint256) public nonces;
    mapping(address => MusdTrove) public troves;

    constructor(MockMUSD _musd, MockPriceFeed _priceFeed)
        EIP712("BorrowerOperationsSignatures", "1")
    {
        musd = _musd;
        priceFeed = _priceFeed;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function openTroveWithSignature(
        uint256 _debtAmount,
        address,
        address,
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external payable {
        require(block.timestamp <= _deadline, "Signature expired");
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encodePacked(
                    OPEN_TROVE_TYPEHASH,
                    abi.encode(msg.value, _debtAmount, _borrower, _recipient),
                    nonces[_borrower],
                    _deadline
                )
            )
        );
        require(
            ECDSA.recover(digest, _signature) == _borrower,
            "BorrowerOperationsSignatures: Invalid signature"
        );
        nonces[_borrower]++;

        require(troves[_borrower].collateral == 0, "BorrowerOps: Trove is active");
        require(
            _debtAmount >= MIN_NET_DEBT,
            "BorrowerOps: Trove's net debt must be greater than minimum"
        );
        uint256 totalDebt = _debtAmount + GAS_COMPENSATION;
        require(
            (msg.value * priceFeed.fetchPrice()) / totalDebt >= MCR,
            "BorrowerOps: An operation that would result in ICR < MCR is not permitted"
        );
        troves[_borrower] = MusdTrove(msg.value, totalDebt);
        musd.mint(_recipient, _debtAmount);
    }
}
