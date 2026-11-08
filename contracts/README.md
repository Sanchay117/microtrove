# Microtrove contracts

Fixed-term MUSD microloans of 25 to 200 MUSD backed by BTC on Mezo. This implements
Mezo's own design, [RFC-2: Lending Arbitrage Microloans](https://github.com/mezo-org/musd/blob/rfc-2/docs/rfc/rfc-2.md),
plus the open lender funding that RFC-2 lists as future work.

MUSD troves need at least 1,800 MUSD of debt. Microtrove lets someone borrow $25
against about $50 of BTC, learn how a collateralized loan behaves, and later promote
the position into a full MUSD trove in one transaction.

## Live on Mezo testnet (chain 31611)

| Contract | Address |
| --- | --- |
| `MicrotroveVault` | [`0x11fc55CD01411bd1453EE62b40cB4e653f7726eA`](https://explorer.test.mezo.org/address/0x11fc55CD01411bd1453EE62b40cB4e653f7726eA) |
| `Microtroves` | [`0xE0e2155f9C5a5B55eADf952d0a01d3E691092dcf`](https://explorer.test.mezo.org/address/0xE0e2155f9C5a5B55eADf952d0a01d3E691092dcf) |
| `TimelockController` (owner of both, 24-hour delay) | [`0xD3B072154FE07F302Ec173C7D9d0cAB6089d764a`](https://explorer.test.mezo.org/address/0xD3B072154FE07F302Ec173C7D9d0cAB6089d764a) |

All three are verified on Sourcify with an exact match
([vault](https://repo.sourcify.dev/31611/0x11fc55CD01411bd1453EE62b40cB4e653f7726eA),
[loan book](https://repo.sourcify.dev/31611/0xE0e2155f9C5a5B55eADf952d0a01d3E691092dcf),
[timelock](https://repo.sourcify.dev/31611/0xD3B072154FE07F302Ec173C7D9d0cAB6089d764a)).
The loan book and vault were deployed against the live MUSD contracts with a 10% protocol share of interest, and seeded
with 1,500 MUSD borrowed from a real MUSD trove
([deposit](https://explorer.test.mezo.org/tx/0x187fee61529432e793c42d773931f3a02e04ed77e5449e6cc5f6e82d3afe6765)).

These ran on the Wave 2 contracts from the web app:

| Step | Transaction |
| --- | --- |
| Lender deposits 100 MUSD | [`0x4f90...a3f2`](https://explorer.test.mezo.org/tx/0x4f9038ccdf6f281ac245a1c5cb713b53812a0e5b6127ed3109ffee15beeaa3f2) |
| Borrow 50 MUSD | [`0xb983...d837`](https://explorer.test.mezo.org/tx/0xb983fd89ef28f81064028503094d1f938c2110f1fd40f9132aafc8901ce3d837) |
| Repay 20 MUSD with an MUSD permit, no approval | [`0x6643...a6ff`](https://explorer.test.mezo.org/tx/0x6643a86edcb3b750a7590a077988b3395bac8393b7babb5f1aacba0e1ad8a6ff) |
| Close with an MUSD permit | [`0x1099...8ba2`](https://explorer.test.mezo.org/tx/0x109940c37e7003c5ed32c6b73d922c2364bb4f5054aa002820073c99cc858ba2) |
| Lender withdraws 20 MUSD | [`0x011e...f3ca`](https://explorer.test.mezo.org/tx/0x011ec18af364a174fc32872f09c4dd947d36f04894ab644ba0b9ee700181f3ca) |
| Borrow 100 MUSD | [`0xac41...b08a`](https://explorer.test.mezo.org/tx/0xac41edbd5183b92e1cf9f631d608712b08f1729a959f5460dcc0a5df79f4b08a) |
| Promote it: a signed `OpenTrove` opens a full MUSD trove with 1,800 MUSD of debt and 0.0423 BTC, repays the 100.50 MUSD micro loan and sends the borrower 1,699.50 MUSD | [`0x9f1a...9642`](https://explorer.test.mezo.org/tx/0x9f1a1aae9d3d0106e48dddae8ef4bf22c4e48cebad975a48c9f05dae139b9642) |
| Hand both contracts to the timelock and set its delay to 24 hours, in one scheduled batch | [`0x21d5...4c93`](https://explorer.test.mezo.org/tx/0x21d507e6be67e8f9d3c7cfb8d97414209f43794e47e213345655691bd1224c93) |

A Bitcoin wallet ran a loan through Mezo Passport. It signs Bitcoin messages; a Safe smart
account on Mezo acts for it, and Mezo's relayer sends each transaction:

| Step | Transaction |
| --- | --- |
| Relayer creates the wallet's smart account | [`0xf29b...29b2`](https://explorer.test.mezo.org/tx/0xf29b4c0cbc347a5009d3fcac10f198ea92d38c1cdc5af37e95f36768aae129b2) |
| Borrow 50 MUSD | [`0x400e...d769`](https://explorer.test.mezo.org/tx/0x400e6369519f04f7b696642d8d18a62cdd328be1f06566651f2d929d4b06d769) |
| Approve MUSD (smart accounts cannot sign MUSD permits) | [`0x3dae...1945`](https://explorer.test.mezo.org/tx/0x3daeb01a65950b08b00fa65325cdb68d842b2566a19714659eb7afed79fd1945) |
| Repay and close, BTC returned to the smart account | [`0xa4c4...b57c`](https://explorer.test.mezo.org/tx/0xa4c467ba1e44e318565de808929ca6631b92614be1b7ec3712a77ab11bc1b57c) |

This is the Wave 2 deployment. The Wave 1 contracts
([vault](https://explorer.test.mezo.org/address/0xE128f5F21Adac4a11A22B55Da77bfdb6ab1304e2),
[loan book](https://explorer.test.mezo.org/address/0x6Af91a391C31e85479bd324698c30697EbEC8C77))
had the withdrawal-queue issue described under [Lender vault](#lender-vault). They were
emptied and paused, and the transactions below ran on them. A full loan lifecycle:

| Step | Transaction |
| --- | --- |
| Open with 0.0025 BTC and borrow 100 MUSD | [`0x6269...7ecd`](https://explorer.test.mezo.org/tx/0x62698fb4161b379a1ddc1c88819fda142242fec31ea3333a4f7d5011a9fa7ecd) |
| Repay 50 MUSD | [`0x8ecf...6c26`](https://explorer.test.mezo.org/tx/0x8ecfcc6e439c557b146dfa19f013eb206860997234b7ddd8ae062351fa976c26) |
| Close: repay the rest with interest, BTC returned | [`0xb823...66b1`](https://explorer.test.mezo.org/tx/0xb82399bfeb6a13e5dde6cdb823c318f5f9a09f5e64c28c5df2b3ac0d33da66b1) |

An expiry liquidation has also run live. The term was set to 1 hour for one 40 MUSD
borrow and then restored to 90 days. The [keeper bot](../keeper) liquidated the loan 48
seconds after it matured (block time), and the borrower claimed the rest of their BTC from the web app:

| Step | Transaction |
| --- | --- |
| Term set to 1 hour (contract minimum) | [`0xc782...8a5d`](https://explorer.test.mezo.org/tx/0xc78229b93c72d21d8b30f772fa7eebdf7e59a47f8da58283cef98b3ac8fc8a5d) |
| Borrower starts a 40 MUSD term | [`0xacd3...5609`](https://explorer.test.mezo.org/tx/0xacd3596ace2616460c1ed0350030f5be3525eae54d264979c923b305aea85609) |
| Term restored to 90 days | [`0xeac8...d033`](https://explorer.test.mezo.org/tx/0xeac8e308003d197df223c101e0c5bf597a9b9d26e21e890fa5a091634b81d033) |
| Keeper repays 40.20 MUSD, receives BTC worth the debt plus 10% | [`0xfe7a...cd51`](https://explorer.test.mezo.org/tx/0xfe7a0c608465370d633178d33ef1d7696ad057026eb36172b0f28c32a48dcd51) |
| Borrower claims the remaining 0.00045335 BTC | [`0xc3a1...568a`](https://explorer.test.mezo.org/tx/0xc3a17a4a897a2284c6d53a65e6dcb524019358363927c54a8b6d67db5d4e568a) |

Addresses, parameters and every transaction are in
[`deployments/mezo-testnet.json`](../deployments/mezo-testnet.json).

## Contracts

| Contract | Role |
| --- | --- |
| `Microtroves` | Loan book. Holds BTC collateral, tracks each micro trove, accrues fixed simple interest, runs liquidations and promotions. |
| `MicrotroveVault` | ERC-4626 vault (`mtMUSD`) that anyone can fund with MUSD. Lends to `Microtroves` and earns its interest and issuance fees. |

### Mezo integrations

- **MUSD** is the loan currency and the vault asset (EIP-2612 permits for one-step repay and close).
- **MUSD `PriceFeed`** prices BTC for every collateral check and liquidation.
- **MUSD `BorrowerOperationsSignatures.openTroveWithSignature`** powers promotion: the borrower signs MUSD's EIP-712 `OpenTrove` message with `Microtroves` as recipient, the new trove's MUSD repays the micro loan, and the rest goes to the borrower.

## Loan rules (RFC-2 defaults, governable)

| Parameter | Default |
| --- | --- |
| Debt per trove (including issuance fee) | 25 to 200 MUSD |
| Interest | 5% APR, simple, fixed for the term |
| Issuance fee | 0.5%, added to debt |
| Term | 90 days from the first borrow |
| Collateral ratio | 110% minimum, 500% maximum |
| Matured-loan liquidator premium | 10% of the debt, paid in BTC |
| Underwater liquidator premium | 5% |
| Protocol share of interest | 10%, capped at 20% |

Rate, fee and term are captured when a debt term starts, so governance changes only
affect new terms. Borrowing more never extends the maturity.

The protocol share accrues in the loan book as `protocolFees`, and anyone can send it to
the fee recipient with `withdrawProtocolFees`. Repayment never transfers to the fee
recipient directly, so a recipient that rejects MUSD cannot block a borrower.

### Liquidations

- **Below 110%:** the liquidator repays the debt and takes all collateral. If the trove
  is underwater, the repayment is reduced so the liquidator still earns 5%, and lenders
  absorb the shortfall through the vault's share price.
- **At maturity:** the liquidator repays the debt and receives BTC worth the debt plus
  10%. The borrower claims the remaining BTC with `claimSurplus`.

**Deviation from RFC-2.** RFC-2 pays the liquidator of a matured loan 10% of the
collateral. With collateral capped at 500% of debt, that reward is worth at most half of
the debt the liquidator must repay, so no keeper would ever run it.
`testFuzz_ExpiredLiquidationIsAlwaysProfitable` checks both rules across every allowed
collateral ratio.

### Lender vault

- Deposits and instant withdrawals work against idle MUSD.
- `requestRedeem` queues shares first-in, first-out. Queued shares keep earning until
  `processQueue` pays them, and their value is reserved so no new loans are made from it.
  Every loan matures within one term, so a request waits at most that long.
- **No request can block the queue.** MUSD reverts on a transfer to itself, so in Wave 1 a
  lender could queue a withdrawal with MUSD as the receiver and make every later
  `processQueue` revert. `requestRedeem` now rejects MUSD and the vault as receivers,
  and if a payment is still refused (a blocklisted receiver, say), the request is closed
  anyway: its shares are burned, the MUSD is set aside in `claimable[owner]`, and the owner
  takes it with `claim(to)`. Set-aside MUSD is excluded from lending and from the share price.
- `getRequests` and `assetsAhead` let the app show each lender's place in the queue.
- The vault owner can only connect the loan book once. Nobody can move lender funds.

### Safety properties

- Repaying and closing never read the oracle, so a borrower can always exit.
- Pausing stops new debt only; repay, close, withdraw and liquidate keep working.
- Every external entry point is `nonReentrant`; BTC is sent last.

### Governance

Both contracts are `Ownable2Step`, and their owner is an OpenZeppelin `TimelockController`
with a 24-hour delay. `script/Timelock.s.sol` deployed it and handed over ownership in one
scheduled batch (accept ownership of the loan book, accept ownership of the vault, set the
delay), so the timelock administers itself and no admin account can skip the delay.

- The operator can only propose or cancel. A proposal can run once its 24 hours have
  passed, and anyone can run it then.
- `setParams`, `setFeeRecipient`, `pause` and ownership changes all wait the full delay, and
  so does a change to the delay itself.
- The web app reads the timelock's scheduled operations, decodes them ("minimum collateral
  from 110% to 150%") and shows each one on the Borrow and Lend pages with a countdown, so a
  borrower has a day to add collateral or repay.
- The trade-off: an emergency pause also waits 24 hours. Repay, close, withdraw and
  liquidate never depended on the owner, so borrowers and lenders can always leave.

## Tests

```bash
git submodule update --init --recursive   # once, from the repository root
forge test
```

67 tests: unit tests for every borrower, lender, keeper and governance path, eight timelock
tests (the delay holds, only the operator proposes, a borrower can add collateral before a
stricter ratio takes effect), fuzz tests, promotion tests that sign real EIP-712 messages against a mock that reproduces
`BorrowerOperationsSignatures`, and a stateful invariant suite (64 runs x 400 calls)
checking that BTC, principal, interest, protocol fees and vault assets always reconcile
and that the queue only ever moves past closed requests. The invariant handler sends one
request in four to a receiver that refuses MUSD.

### Fork tests against Mezo Testnet

```bash
MEZO_FORK=1 forge test --match-path "test/fork/*" -vv
```

`test/fork/MezoFork.t.sol` forks Mezo Testnet and deploys Microtrove next to the real MUSD
contracts. A lender opens a real MUSD trove through `BorrowerOperations` and deposits its
MUSD, then six tests run:

| Test | What it proves on real contracts |
| --- | --- |
| `test_Fork_LenderMusdComesFromARealTrove` | The vault holds MUSD minted by a real trove |
| `test_Fork_PromoteIntoRealMusdTrove` | A signed `OpenTrove` message opens a full MUSD trove through `BorrowerOperationsSignatures` and repays the micro loan |
| `test_Fork_PromoteRejectsASignatureForOtherAmounts` | A signature made for other amounts is rejected and no trove opens |
| `test_Fork_CloseWithRealMusdPermit` | A real EIP-2612 permit on MUSD closes a loan in one call |
| `test_Fork_QueueCannotBeFrozenWithMusdAsReceiver` | Real MUSD refuses transfers to itself, the vault refuses it as a receiver, and the queue keeps paying |
| `test_Fork_KeeperLiquidatesMaturedLoan` | A keeper liquidates a matured loan at the live price |

Forge cannot run Mezo's oracle precompile, so the tests replay its latest answer at the same
address, read live with `vm.rpc`. Without `MEZO_FORK=1` the suite is skipped. Set
`MEZO_RPC_URL` to use another endpoint.

```bash
forge coverage --no-match-coverage "test|script"
```

## Deploy to Mezo testnet

```bash
cp .env.example .env   # or use the generated .env with PRIVATE_KEY
source .env
forge script script/Deploy.s.sol --rpc-url mezo_testnet --broadcast
```

Set `TERM_SECONDS` for a short-term demo deployment and `SEED_MUSD` to fund the vault
from the deployer.

Then hand both contracts to a timelock. `TIMELOCK_DELAY` defaults to one day, and `LOANS`
and `VAULT` default to the live addresses:

```bash
forge script script/Timelock.s.sol --rpc-url mezo_testnet --broadcast --slow
```

The testnet RPC sometimes returns a null receipt right after a send even though the
transaction lands. Check with `cast receipt <hash>` before resending. The explorer's own
Blockscout verifier answers "Unable to verify" even for byte-identical builds, so verify on
Sourcify instead:

```bash
forge verify-contract <address> src/Microtroves.sol:Microtroves --chain-id 31611 \
  --verifier sourcify --constructor-args <abi-encoded args>
```
