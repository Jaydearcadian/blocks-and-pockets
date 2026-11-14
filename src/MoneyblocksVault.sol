// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

// Mezo surface used by the vault. Signatures match solidity/contracts/interfaces at da7888a.
interface IBorrowerOperations {
    function openTrove(uint256 _debtAmount, address _upperHint, address _lowerHint) external payable;

    function addColl(address _upperHint, address _lowerHint) external payable;

    function withdrawMUSD(uint256 _amount, address _upperHint, address _lowerHint) external;

    function repayMUSD(uint256 _amount, address _upperHint, address _lowerHint) external;

    function closeTrove() external;

    function getBorrowingFee(uint256 _debt) external view returns (uint256);
}

interface ITroveManager {
    function getEntireDebtAndColl(
        address _borrower
    )
        external
        view
        returns (
            uint256 coll,
            uint256 principal,
            uint256 interest,
            uint256 pendingCollateral,
            uint256 pendingPrincipal,
            uint256 pendingInterest
        );

    // Status enum: 0 nonExistent, 1 active, 2 closedByOwner.
    function getTroveStatus(address _borrower) external view returns (uint8);
}

interface IPriceFeed {
    function fetchPrice() external view returns (uint256);
}

interface IMUSD {
    function balanceOf(address account) external view returns (uint256);

    function transfer(address to, uint256 amount) external returns (bool);

    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Testnet spike. Pockets with local limits, operator mandates with owner approval, and one
///         Mezo Trove shared by CROSS blocks, with debt attributed per block.
/// @dev Not audited. Testnet only. Liquidation and redistribution are not modeled. If Mezo reports
///      pending rewards, or its totals stop matching the ledger, ledger actions revert.
contract MoneyblocksVault {
    uint256 public constant BPS = 10_000;
    // Mezo's gas deposit. Added to the Trove at open, burned at close, never repaid.
    uint256 public constant GAS_DEPOSIT = 200e18;
    uint8 internal constant TROVE_ACTIVE = 1;

    enum PaymentStatus {
        None,
        Pending,
        Executed,
        Cancelled
    }

    struct Moneyblock {
        string name;
        bool exists;
        bool cross; // CROSS draws on the group. ISOLATED is prefunded only.
        uint256 cash; // MUSD held for this block.
        uint256 reserved; // Cash promised to pending payments.
        uint256 debtCap; // Local limit on attributed debt (principal plus interest).
        uint256 principal; // Attributed principal, including borrow fees.
        uint256 interest; // Attributed interest not yet paid.
        address operator; // Mandate principal (agent).
        bool mandateActive;
        uint64 expiry;
        uint256 perTxCap;
        uint256 totalCap; // Cap on executed plus pending payments under the mandate.
        uint256 committed; // Executed plus pending payments.
        uint256 spent; // Executed payments.
    }

    struct Payment {
        uint256 blockId;
        address to;
        uint256 amount;
        bytes32 evidence;
        PaymentStatus status;
    }

    error NotOwner();
    error NotOperator(uint256 blockId);
    error ZeroAmount();
    error InvalidMandate();
    error BlockNotFound(uint256 blockId);
    error BlockNotCross(uint256 blockId);
    error MandateRevoked(uint256 blockId);
    error MandateExpired(uint256 blockId);
    error RecipientNotAllowed(uint256 blockId, address to);
    error PerTransactionCapExceeded(uint256 amount, uint256 cap);
    error MandateTotalCapExceeded(uint256 amount, uint256 remaining);
    error PocketInsufficient(uint256 blockId, uint256 available, uint256 requested);
    error BlockDebtCapExceeded(uint256 blockId, uint256 debtAfter, uint256 cap);
    error GroupCapacityExceeded(uint256 debtAfter, uint256 capacity);
    error GroupNotOpen();
    error GroupAlreadyOpen();
    error LedgerDirty();
    error InterestUnsettled(uint256 blockId, uint256 interestDue, uint256 available);
    error RepayExceedsPrincipal(uint256 blockId, uint256 amount, uint256 principal);
    error DebtNotCovered(uint256 blockId, uint256 debt, uint256 available);
    error PaymentNotPending(uint256 paymentId);
    error PendingRewards();
    error LedgerMismatch();
    error CashMismatch();
    error TransferFailed();
    error SendFailed();
    error GroupStillOpen();
    error NoGroupClosed();
    error CashReserved(uint256 blockId, uint256 reserved);
    error ZeroAddress();

    event MoneyblockCreated(uint256 indexed blockId, string name, bool cross, uint256 debtCap);
    event RecipientSet(uint256 indexed blockId, address indexed to, bool allowed);
    event MandateGranted(
        uint256 indexed blockId,
        address indexed operator,
        uint256 perTxCap,
        uint256 totalCap,
        uint64 expiry
    );
    event MandateStatusChanged(uint256 indexed blockId, bool active);
    event ApprovalThresholdSet(uint256 amount);
    event PocketFunded(uint256 indexed blockId, uint256 amount);
    event OverheadFunded(uint256 amount);
    event PaymentRequested(
        uint256 indexed paymentId,
        uint256 indexed blockId,
        address indexed to,
        uint256 amount,
        bytes32 evidence
    );
    event PaymentExecuted(
        uint256 indexed paymentId,
        uint256 indexed blockId,
        address indexed to,
        uint256 amount,
        bytes32 evidence
    );
    event PaymentCancelled(uint256 indexed paymentId);
    event GroupOpened(uint256 indexed blockId, uint256 amount, uint256 fee, uint256 groupDebt);
    event BlockDrawn(uint256 indexed blockId, uint256 amount, uint256 fee, uint256 groupDebt);
    event InterestAccrued(uint256 amount, uint256 groupInterest);
    event BlockRepaid(uint256 indexed blockId, uint256 principal, uint256 interestPaid);
    event CollateralAdded(uint256 amount);
    event GroupClosed(uint256 debtPaid);
    event ResidualSwept(address indexed to, uint256 amount);

    IBorrowerOperations public immutable borrowerOperations;
    ITroveManager public immutable troveManager;
    IPriceFeed public immutable priceFeed;
    IMUSD public immutable musd;
    address public immutable owner;
    // Group capacity ratio in basis points. 15000 means group debt may not exceed collateral value / 1.5.
    uint256 public immutable targetRatioBps;
    // Payments above this amount wait for owner approval.
    uint256 public approvalThreshold;

    uint256 public blockCount;
    uint256 public paymentCount;
    mapping(uint256 => Moneyblock) public moneyblocks;
    mapping(uint256 => mapping(address => bool)) public recipientAllowed;
    mapping(uint256 => Payment) public payments;
    uint256[] internal crossBlockIds;

    // Group ledger. Mirrors Mezo's principal and interest for the vault's Trove.
    uint256 public totalPrincipal;
    uint256 public totalInterest;
    uint256 public overheadPrincipal; // Gas deposit.
    uint256 public overheadInterest; // Interest on the overhead, including rounding residue.
    uint256 public overheadCash; // MUSD for overhead interest and the close.
    uint256 public groupsClosed; // Counts closes. Residual cash moves only after one.

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        address _borrowerOperations,
        address _troveManager,
        address _priceFeed,
        address _musd,
        uint256 _targetRatioBps,
        uint256 _approvalThreshold
    ) {
        borrowerOperations = IBorrowerOperations(_borrowerOperations);
        troveManager = ITroveManager(_troveManager);
        priceFeed = IPriceFeed(_priceFeed);
        musd = IMUSD(_musd);
        owner = msg.sender;
        targetRatioBps = _targetRatioBps;
        approvalThreshold = _approvalThreshold;
    }

    // Receives collateral returned by closeTrove.
    receive() external payable {}

    // ---------------------------------------------------------------------
    // Blocks, pockets, and mandates (owner)
    // ---------------------------------------------------------------------

    function createMoneyblock(
        string calldata name,
        bool cross,
        uint256 debtCap
    ) external onlyOwner returns (uint256 blockId) {
        blockId = ++blockCount;
        Moneyblock storage b = moneyblocks[blockId];
        b.name = name;
        b.exists = true;
        b.cross = cross;
        b.debtCap = debtCap;
        if (cross) crossBlockIds.push(blockId);
        emit MoneyblockCreated(blockId, name, cross, debtCap);
    }

    function setRecipient(uint256 blockId, address to, bool allowed) external onlyOwner {
        _requireBlock(blockId);
        recipientAllowed[blockId][to] = allowed;
        emit RecipientSet(blockId, to, allowed);
    }

    function grantMandate(
        uint256 blockId,
        address operator,
        uint256 perTxCap,
        uint256 totalCap,
        uint64 expiry
    ) external onlyOwner {
        _requireBlock(blockId);
        if (operator == address(0) || expiry <= block.timestamp) revert InvalidMandate();
        Moneyblock storage b = moneyblocks[blockId];
        b.operator = operator;
        b.perTxCap = perTxCap;
        b.totalCap = totalCap;
        b.expiry = expiry;
        b.mandateActive = true;
        emit MandateGranted(blockId, operator, perTxCap, totalCap, expiry);
    }

    function revokeMandate(uint256 blockId) external onlyOwner {
        _requireBlock(blockId);
        moneyblocks[blockId].mandateActive = false;
        emit MandateStatusChanged(blockId, false);
    }

    function setApprovalThreshold(uint256 amount) external onlyOwner {
        approvalThreshold = amount;
        emit ApprovalThresholdSet(amount);
    }

    function fundPocket(uint256 blockId, uint256 amount) external onlyOwner {
        _requireBlock(blockId);
        if (amount == 0) revert ZeroAmount();
        if (!musd.transferFrom(owner, address(this), amount)) revert TransferFailed();
        moneyblocks[blockId].cash += amount;
        emit PocketFunded(blockId, amount);
    }

    function fundOverhead(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (!musd.transferFrom(owner, address(this), amount)) revert TransferFailed();
        overheadCash += amount;
        emit OverheadFunded(amount);
    }

    // Returns MUSD that arrived outside the ledger, such as a direct transfer. Moves no tracked cash.
    function recoverUnallocatedMUSD(address to) external onlyOwner {
        uint256 bal = musd.balanceOf(address(this));
        uint256 tracked = _trackedCash();
        if (bal > tracked && !musd.transfer(to, bal - tracked)) revert TransferFailed();
    }

    // Sends BTC held by the vault, such as collateral returned at close.
    function sweepBTC(address to) external onlyOwner {
        (bool ok, ) = to.call{value: address(this).balance}("");
        if (!ok) revert SendFailed();
    }

    // ---------------------------------------------------------------------
    // Payments (operator requests, owner approves above the threshold)
    // ---------------------------------------------------------------------

    /// @notice Operator requests a payment from a block's pocket. Under the threshold it executes
    ///         now. Above it, the amount is reserved and waits for owner approval.
    /// @dev Checks run in the order of whitepaper section 28: block, caller, mandate, recipient,
    ///      per-transaction cap, lifetime cap, pocket availability, then approval.
    function requestTransfer(
        uint256 blockId,
        address to,
        uint256 amount,
        bytes32 evidence
    ) external returns (uint256 paymentId) {
        _requireBlock(blockId);
        Moneyblock storage b = moneyblocks[blockId];
        if (msg.sender != b.operator) revert NotOperator(blockId);
        _checkMandate(blockId, to);
        if (amount == 0) revert ZeroAmount();
        if (amount > b.perTxCap) revert PerTransactionCapExceeded(amount, b.perTxCap);
        if (b.committed + amount > b.totalCap) {
            revert MandateTotalCapExceeded(amount, b.totalCap > b.committed ? b.totalCap - b.committed : 0);
        }
        uint256 available = b.cash - b.reserved;
        if (amount > available) revert PocketInsufficient(blockId, available, amount);

        b.committed += amount;
        paymentId = ++paymentCount;
        payments[paymentId] = Payment(blockId, to, amount, evidence, PaymentStatus.Pending);
        if (amount > approvalThreshold) {
            b.reserved += amount;
            emit PaymentRequested(paymentId, blockId, to, amount, evidence);
        } else {
            _pay(paymentId);
        }
    }

    /// @notice Owner approves a pending payment. Mandate and recipient are checked again, so a
    ///         revoked mandate cannot be used to release a payment that was already requested.
    function approvePayment(uint256 paymentId) external onlyOwner {
        Payment storage p = payments[paymentId];
        if (p.status != PaymentStatus.Pending) revert PaymentNotPending(paymentId);
        _checkMandate(p.blockId, p.to);
        moneyblocks[p.blockId].reserved -= p.amount;
        _pay(paymentId);
    }

    /// @notice Owner cancels a pending payment and releases its reservation.
    function cancelPayment(uint256 paymentId) external onlyOwner {
        Payment storage p = payments[paymentId];
        if (p.status != PaymentStatus.Pending) revert PaymentNotPending(paymentId);
        Moneyblock storage b = moneyblocks[p.blockId];
        b.reserved -= p.amount;
        b.committed -= p.amount;
        p.status = PaymentStatus.Cancelled;
        emit PaymentCancelled(paymentId);
    }

    // ---------------------------------------------------------------------
    // Margin group: one Mezo Trove shared by CROSS blocks (owner)
    // ---------------------------------------------------------------------

    /// @notice Opens the group Trove with msg.value BTC and borrows `amount` into `blockId`'s pocket.
    ///         The borrow fee is attributed to the block. The 200 gas deposit goes to overhead.
    function openGroup(uint256 blockId, uint256 amount) external payable onlyOwner {
        if (_troveActive()) revert GroupAlreadyOpen();
        if (totalPrincipal != 0 || totalInterest != 0 || overheadPrincipal != 0 || overheadInterest != 0) {
            revert LedgerDirty();
        }
        _requireCross(blockId);
        if (amount == 0 || msg.value == 0) revert ZeroAmount();

        borrowerOperations.openTrove{value: msg.value}(amount, address(0), address(0));

        (uint256 coll, uint256 principal, uint256 interest) = _position();
        // A new Trove holds the borrowed amount, the fee, and the gas deposit. Interest starts at zero.
        uint256 blockDebt = principal - GAS_DEPOSIT;
        Moneyblock storage b = moneyblocks[blockId];
        if (blockDebt > b.debtCap) revert BlockDebtCapExceeded(blockId, blockDebt, b.debtCap);
        uint256 capacity = _capacity(coll);
        if (principal > capacity) revert GroupCapacityExceeded(principal, capacity);

        b.principal = blockDebt;
        b.cash += amount;
        overheadPrincipal = GAS_DEPOSIT;
        totalPrincipal = principal;
        _checkLedger();
        _checkCash();
        emit GroupOpened(blockId, amount, blockDebt - amount, principal + interest);
    }

    /// @notice Adds BTC collateral to the group Trove. Raises group capacity.
    function addCollateral() external payable onlyOwner {
        _requireOpen();
        if (msg.value == 0) revert ZeroAmount();
        _settle();
        borrowerOperations.addColl{value: msg.value}(address(0), address(0));
        _checkLedger();
        emit CollateralAdded(msg.value);
    }

    /// @notice Borrows `amount` MUSD more for a CROSS block. Checks the block's local debt cap,
    ///         then the group capacity. Mezo's own collateral checks still apply.
    function borrow(uint256 blockId, uint256 amount) external onlyOwner {
        _requireOpen();
        _requireCross(blockId);
        if (amount == 0) revert ZeroAmount();
        _settle();

        Moneyblock storage b = moneyblocks[blockId];
        uint256 fee = borrowerOperations.getBorrowingFee(amount);
        uint256 blockDebtAfter = b.principal + b.interest + amount + fee;
        if (blockDebtAfter > b.debtCap) revert BlockDebtCapExceeded(blockId, blockDebtAfter, b.debtCap);

        (uint256 coll, uint256 principalBefore, uint256 interestBefore) = _position();
        uint256 groupDebtAfter = principalBefore + interestBefore + amount + fee;
        uint256 capacity = _capacity(coll);
        if (groupDebtAfter > capacity) revert GroupCapacityExceeded(groupDebtAfter, capacity);

        borrowerOperations.withdrawMUSD(amount, address(0), address(0));

        (, uint256 principalAfter, uint256 interestAfter) = _position();
        uint256 added = principalAfter - principalBefore; // amount plus fee
        b.principal += added;
        b.cash += amount;
        totalPrincipal = principalAfter;
        _checkLedger();
        _checkCash();
        emit BlockDrawn(blockId, amount, added - amount, principalAfter + interestAfter);
    }

    /// @notice Repays `amount` of a CROSS block's principal. First every block and the overhead pay
    ///         their own accrued interest from their own cash. Mezo then receives the interest and
    ///         the principal in one call, so the principal split stays exact.
    function repay(uint256 blockId, uint256 amount) external onlyOwner {
        _requireOpen();
        _requireCross(blockId);
        if (amount == 0) revert ZeroAmount();
        Moneyblock storage b = moneyblocks[blockId];
        if (amount > b.principal) revert RepayExceedsPrincipal(blockId, amount, b.principal);
        _settle();

        for (uint256 i; i < crossBlockIds.length; ++i) {
            uint256 id = crossBlockIds[i];
            Moneyblock storage c = moneyblocks[id];
            uint256 avail = c.cash - c.reserved;
            if (avail < c.interest) revert InterestUnsettled(id, c.interest, avail);
        }
        if (overheadCash < overheadInterest) revert InterestUnsettled(0, overheadInterest, overheadCash);

        uint256 interestPaid;
        for (uint256 i; i < crossBlockIds.length; ++i) {
            Moneyblock storage c = moneyblocks[crossBlockIds[i]];
            c.cash -= c.interest;
            interestPaid += c.interest;
            c.interest = 0;
        }
        overheadCash -= overheadInterest;
        interestPaid += overheadInterest;
        overheadInterest = 0;
        if (interestPaid != totalInterest) revert LedgerMismatch();

        uint256 avail = b.cash - b.reserved;
        if (avail < amount) revert PocketInsufficient(blockId, avail, amount);
        b.cash -= amount;
        b.principal -= amount;
        totalPrincipal -= amount;
        totalInterest = 0;

        borrowerOperations.repayMUSD(interestPaid + amount, address(0), address(0));
        _checkLedger();
        _checkCash();
        emit BlockRepaid(blockId, amount, interestPaid);
    }

    /// @notice Repays every block and the overhead interest from their own cash, then closes the
    ///         Trove. Mezo burns debt minus the gas deposit from the vault. Collateral returns to the
    ///         vault, and `sweepBTC` moves it out.
    function closeGroup() external onlyOwner {
        _requireOpen();
        _settle();

        uint256 paid;
        for (uint256 i; i < crossBlockIds.length; ++i) {
            uint256 id = crossBlockIds[i];
            Moneyblock storage c = moneyblocks[id];
            uint256 debt = c.principal + c.interest;
            uint256 avail = c.cash - c.reserved;
            if (avail < debt) revert DebtNotCovered(id, debt, avail);
            c.cash -= debt;
            paid += debt;
            c.principal = 0;
            c.interest = 0;
        }
        if (overheadCash < overheadInterest) revert DebtNotCovered(0, overheadInterest, overheadCash);
        overheadCash -= overheadInterest;
        paid += overheadInterest;
        overheadInterest = 0;
        overheadPrincipal = 0;
        totalPrincipal = 0;
        totalInterest = 0;

        borrowerOperations.closeTrove();
        _checkLedger();
        _checkCash();
        ++groupsClosed;
        emit GroupClosed(paid);
    }

    /// @notice After a close, sends the MUSD the ledger still tracks (block cash and overhead cash) to `to`.
    ///         Refused while a group is open, before any close, while a ledger total is nonzero, and while a
    ///         block holds cash reserved for a pending payment. Cancel those payments first. MUSD that arrived
    ///         outside the ledger blocks the sweep until `recoverUnallocatedMUSD` moves it.
    function sweepResidualMUSD(address to) external onlyOwner returns (uint256 amount) {
        if (to == address(0)) revert ZeroAddress();
        if (_troveActive()) revert GroupStillOpen();
        if (groupsClosed == 0) revert NoGroupClosed();
        if (totalPrincipal != 0 || totalInterest != 0 || overheadPrincipal != 0 || overheadInterest != 0) {
            revert LedgerDirty();
        }
        for (uint256 i = 1; i <= blockCount; ++i) {
            Moneyblock storage c = moneyblocks[i];
            if (c.reserved != 0) revert CashReserved(i, c.reserved);
            amount += c.cash;
            c.cash = 0;
        }
        amount += overheadCash;
        overheadCash = 0;
        if (amount == 0) revert ZeroAmount();
        if (!musd.transfer(to, amount)) revert TransferFailed();
        _checkCash();
        emit ResidualSwept(to, amount);
    }

    /// @notice Accrues interest to now and splits it across buckets. Anyone may call it. Moves no MUSD.
    function accrue() external {
        _settle();
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Live Mezo position for the group Trove, with interest accrued to now.
    function groupPosition() external view returns (uint256 coll, uint256 principal, uint256 interest) {
        return _position();
    }

    /// @notice Group debt capacity at the policy ratio: collateral value divided by targetRatioBps.
    function groupCapacity() external view returns (uint256) {
        (uint256 coll, , ) = _position();
        return _capacity(coll);
    }

    function troveActive() external view returns (bool) {
        return _troveActive();
    }

    function bucketOf(
        uint256 blockId
    ) external view returns (uint256 cash, uint256 reserved, uint256 principal, uint256 interest) {
        Moneyblock storage b = moneyblocks[blockId];
        return (b.cash, b.reserved, b.principal, b.interest);
    }

    /// @notice A block's attributed debt now, including interest accrued since the last settlement.
    function blockDebtNow(uint256 blockId) external view returns (uint256) {
        Moneyblock storage b = moneyblocks[blockId];
        (, , uint256 interest) = _position();
        uint256 share;
        if (totalPrincipal != 0) {
            share = ((interest - totalInterest) * b.principal) / totalPrincipal;
        }
        return b.principal + b.interest + share;
    }

    function crossBlockIdList() external view returns (uint256[] memory) {
        return crossBlockIds;
    }

    /// @notice MUSD the vault tracks for blocks and overhead. Equals the vault's MUSD balance.
    function totalCash() external view returns (uint256) {
        return _trackedCash();
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _pay(uint256 paymentId) internal {
        Payment storage p = payments[paymentId];
        Moneyblock storage b = moneyblocks[p.blockId];
        b.cash -= p.amount;
        b.spent += p.amount;
        p.status = PaymentStatus.Executed;
        if (!musd.transfer(p.to, p.amount)) revert TransferFailed();
        emit PaymentExecuted(paymentId, p.blockId, p.to, p.amount, p.evidence);
    }

    function _checkMandate(uint256 blockId, address to) internal view {
        Moneyblock storage b = moneyblocks[blockId];
        if (!b.mandateActive) revert MandateRevoked(blockId);
        if (block.timestamp > b.expiry) revert MandateExpired(blockId);
        if (!recipientAllowed[blockId][to]) revert RecipientNotAllowed(blockId, to);
    }

    function _requireBlock(uint256 blockId) internal view {
        if (!moneyblocks[blockId].exists) revert BlockNotFound(blockId);
    }

    function _requireCross(uint256 blockId) internal view {
        _requireBlock(blockId);
        if (!moneyblocks[blockId].cross) revert BlockNotCross(blockId);
    }

    function _requireOpen() internal view {
        if (!_troveActive()) revert GroupNotOpen();
    }

    function _troveActive() internal view returns (bool) {
        return troveManager.getTroveStatus(address(this)) == TROVE_ACTIVE;
    }

    // Reads Mezo's totals for the group Trove. Reverts if rewards are pending, because the
    // ledger cannot attribute them yet.
    function _position() internal view returns (uint256 coll, uint256 principal, uint256 interest) {
        uint256 pColl;
        uint256 pPrin;
        uint256 pInt;
        (coll, principal, interest, pColl, pPrin, pInt) = troveManager.getEntireDebtAndColl(address(this));
        if (pColl != 0 || pPrin != 0 || pInt != 0) revert PendingRewards();
    }

    // Group capacity in MUSD: collateral value at the oracle price, divided by the policy ratio.
    function _capacity(uint256 coll) internal view returns (uint256) {
        uint256 price = priceFeed.fetchPrice();
        return ((coll * price) / 1e18) * BPS / targetRatioBps;
    }

    // Accrues Mezo interest since the last settlement and splits it across buckets by principal.
    // The overhead takes its own share plus the rounding residue, so buckets sum to Mezo exactly.
    function _settle() internal {
        (, uint256 principal, uint256 interest) = _position();
        if (principal != totalPrincipal || interest < totalInterest) revert LedgerMismatch();
        uint256 accrued = interest - totalInterest;
        if (accrued == 0) return;
        if (totalPrincipal == 0) revert LedgerMismatch();

        uint256 allocated;
        for (uint256 i; i < crossBlockIds.length; ++i) {
            Moneyblock storage c = moneyblocks[crossBlockIds[i]];
            uint256 share = (accrued * c.principal) / totalPrincipal;
            c.interest += share;
            allocated += share;
        }
        overheadInterest += accrued - allocated;
        totalInterest = interest;
        emit InterestAccrued(accrued, interest);
    }

    // The ledger must equal Mezo's totals. Any gap reverts, so a mismatch never persists.
    function _checkLedger() internal view {
        (, uint256 principal, uint256 interest) = _position();
        if (principal != totalPrincipal || interest != totalInterest) revert LedgerMismatch();
    }

    // The vault's MUSD must equal the cash the ledger tracks.
    function _checkCash() internal view {
        if (musd.balanceOf(address(this)) != _trackedCash()) revert CashMismatch();
    }

    function _trackedCash() internal view returns (uint256 sum) {
        sum = overheadCash;
        for (uint256 i = 1; i <= blockCount; ++i) {
            sum += moneyblocks[i].cash;
        }
    }
}
