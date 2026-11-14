// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import {MoneyblocksVault} from "../src/MoneyblocksVault.sol";

// Minimal cheatcode surface so the spike needs no forge-std dependency.
interface Vm {
    function createSelectFork(string calldata urlOrAlias) external returns (uint256);

    function deal(address account, uint256 newBalance) external;

    function deal(address token, address to, uint256 give) external;

    function warp(uint256 newTimestamp) external;

    function prank(address msgSender) external;

    function expectRevert(bytes calldata revertData) external;

    function mockCall(address callee, bytes calldata data, bytes calldata returnData) external;
}

interface IBorrowerOpsView {
    function openTrove(uint256 _debtAmount, address _upperHint, address _lowerHint) external payable;

    function getBorrowingFee(uint256 _debt) external view returns (uint256);
}

interface IMUSDView {
    function balanceOf(address account) external view returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);

    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Shared-Trove rules against a fork of Mezo testnet, using the real BorrowerOperations and
///         TroveManager. Only the price oracle is mocked. vm.warp moves time so interest accrues.
///         Nothing is broadcast.
contract MoneyblocksGroupForkTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant BO = 0xCdF7028ceAB81fA0C6971208e83fa7872994beE5;
    address internal constant TM = 0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0;
    address internal constant PF = 0x86bCF0841622a5dAC14A313a15f96A95421b9366;
    address internal constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    // Mezo's price oracle. The deployed bytecode recurses under a local fork, so the test mocks it.
    address internal constant ORACLE = 0x7b7c000000000000000000000000000000000015;
    address internal constant OPERATOR = address(0xA6E);
    address internal constant PAYEE = address(0xBEE);

    // 0.046 BTC at 67,130.36 USD is about 3,088 USD. At the 150% policy ratio, group debt caps near 2,059.
    uint256 internal constant COLL = 0.046 ether;

    MoneyblocksVault internal vault;
    uint256 internal a; // Procurement, CROSS, block cap 2,500
    uint256 internal b; // Operations, CROSS, block cap 500

    receive() external payable {}

    function setUp() public {
        vm.createSelectFork("https://rpc.test.mezo.org");
        _refreshOracle();
        vault = new MoneyblocksVault(BO, TM, PF, MUSD, 15_000, 500e18);
        a = vault.createMoneyblock("Procurement", true, 2_500e18);
        b = vault.createMoneyblock("Operations", true, 500e18);
        vm.deal(address(this), 5 ether);
    }

    // ---------------------------------------------------------------------
    // Opening, draws, and rejections
    // ---------------------------------------------------------------------

    function testOpenTiesToMezo() public {
        _open();
        (uint256 coll, uint256 principal, uint256 interest) = vault.groupPosition();
        require(coll == COLL, "coll");
        // 1,800 borrowed, plus the 0.1% fee of 1.8, plus the 200 gas deposit.
        require(principal == 2_001.8e18, "principal");
        require(interest == 0, "no interest at open");
        require(vault.totalPrincipal() == principal, "ledger principal");
        require(vault.overheadPrincipal() == 200e18, "overhead holds the gas deposit");
        (uint256 cashA, , uint256 prinA, ) = vault.bucketOf(a);
        require(cashA == 1_800e18 && prinA == 1_801.8e18, "block A holds the draw and the fee");
        require(IMUSDView(MUSD).balanceOf(address(vault)) == 1_800e18, "vault MUSD");
        require(vault.troveActive(), "trove active");
        _tieOut();
    }

    function testBlockLimitRejectsDraw() public {
        _open();
        uint256 amount = 600e18;
        uint256 fee = IBorrowerOpsView(BO).getBorrowingFee(amount);
        // Block B's local limit is 500. Its debt after this draw would be the amount plus the fee.
        vm.expectRevert(
            abi.encodeWithSelector(MoneyblocksVault.BlockDebtCapExceeded.selector, b, amount + fee, 500e18)
        );
        vault.borrow(b, amount);
    }

    function testGroupCapacityRejectsDraw() public {
        _open();
        uint256 capacity = vault.groupCapacity();
        uint256 amount = 100e18;
        uint256 debtAfter = 2_001.8e18 + amount + IBorrowerOpsView(BO).getBorrowingFee(amount);
        // Block A is under its own limit. The group, at the 150% policy ratio, is not.
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.GroupCapacityExceeded.selector, debtAfter, capacity));
        vault.borrow(a, amount);
        require(vault.totalPrincipal() == 2_001.8e18, "rejected draw changes nothing");
    }

    function testAddCollateralMakesRoomForDraw() public {
        _open();
        vault.addCollateral{value: 0.02 ether}();
        require(vault.groupCapacity() > 2_101.9e18, "capacity rose above the draw");
        vault.borrow(b, 100e18);
        _tieOut();
    }

    function testSecondMemberDrawTiesOut() public {
        _open();
        vault.borrow(b, 50e18);
        (uint256 cashB, , uint256 prinB, ) = vault.bucketOf(b);
        require(cashB == 50e18 && prinB == 50.05e18, "block B holds the draw and the fee");
        _tieOut();
    }

    function testOpenTwiceRejected() public {
        _open();
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.GroupAlreadyOpen.selector));
        vault.openGroup{value: COLL}(a, 1_800e18);
    }

    function testIsolatedBlockCannotDraw() public {
        _open();
        uint256 s = vault.createMoneyblock("Strategic reserve", false, 0);
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.BlockNotCross.selector, s));
        vault.borrow(s, 10e18);
    }

    // ---------------------------------------------------------------------
    // Interest, repayment, shortfall, and close
    // ---------------------------------------------------------------------

    function testInterestSplitsAndRepayPaysInterestFirst() public {
        _fundMUSD();
        _open();
        vault.borrow(b, 50e18);
        vault.fundOverhead(10e18); // Treasury pays the overhead's interest share.
        _warpDays(30);
        _tieOut();
        (, uint256 principalBefore, uint256 interestBefore) = vault.groupPosition();
        require(interestBefore > 0, "interest accrued over 30 days");
        (, , uint256 prinA, uint256 intA) = vault.bucketOf(a);
        require(intA > 0, "block A owes its share");

        vault.repay(a, 50e18);
        _tieOut();
        (, uint256 principalAfter, uint256 interestAfter) = vault.groupPosition();
        require(principalAfter == principalBefore - 50e18, "group principal down by exactly the repayment");
        require(interestAfter == 0, "all interest paid on chain");
        (, , uint256 prinA2, uint256 intA2) = vault.bucketOf(a);
        require(prinA2 == prinA - 50e18 && intA2 == 0, "block A settled");
    }

    function testBlockShortfallBlocksGroupRepay() public {
        _open();
        vault.borrow(b, 50e18);
        vault.grantMandate(b, OPERATOR, 1_000e18, 1_000e18, uint64(block.timestamp + 30 days));
        vault.setRecipient(b, PAYEE, true);
        // Block B spends its whole cash. It then owes interest it cannot pay.
        vm.prank(OPERATOR);
        vault.requestTransfer(b, PAYEE, 50e18, bytes32("spend-all"));
        _warpDays(10);
        vault.accrue();
        (, , , uint256 intB) = vault.bucketOf(b);
        require(intB > 0, "block B owes interest");
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.InterestUnsettled.selector, b, intB, 0));
        vault.repay(a, 50e18);
    }

    function testCloseReturnsCollateralAndClearsDebt() public {
        _fundMUSD();
        _open();
        vault.borrow(b, 50e18);
        // Each block covers its own borrow fee and interest at close. The treasury covers the overhead.
        vault.fundPocket(a, 5e18);
        vault.fundPocket(b, 2e18);
        vault.fundOverhead(1e18);
        _warpDays(30);
        vault.closeGroup();
        require(!vault.troveActive(), "trove closed");
        require(vault.totalPrincipal() == 0 && vault.totalInterest() == 0, "ledger cleared");
        require(address(vault).balance == COLL, "collateral back in the vault");
        vault.sweepBTC(address(this));
        require(address(vault).balance == 0, "collateral swept");
        _tieOut();
        require(IMUSDView(MUSD).balanceOf(address(vault)) == vault.totalCash(), "vault cash matches buckets");
    }

    // ---------------------------------------------------------------------
    // Repeated operations and reopening
    // ---------------------------------------------------------------------

    function testRepeatedOperationsKeepLedgerTied() public {
        _fundMUSD();
        _open();
        vault.borrow(b, 20e18);
        vault.fundOverhead(5e18);
        vault.fundPocket(a, 5e18);
        vault.fundPocket(b, 2e18);
        for (uint256 day; day < 5; ++day) {
            _warpDays(1);
            vault.accrue();
            _tieOut();
            vault.repay(a, 2e18);
            _tieOut();
            vault.repay(b, 1e18);
            _tieOut();
            vault.borrow(b, 1e18);
            _tieOut();
        }
        // Each day A repays 2 and the group borrows 1 more fee-bearing MUSD for B, so principal falls by 1.999.
        (, uint256 principal, ) = vault.groupPosition();
        require(principal == 2_011.825e18, "principal after five days");
    }

    function testGroupCanReopenAfterClose() public {
        _fundMUSD();
        _open();
        vault.fundPocket(a, 5e18);
        vault.fundOverhead(1e18);
        _warpDays(1);
        vault.closeGroup();
        vault.sweepBTC(address(this));
        require(!vault.troveActive(), "closed");
        // A second open reuses the vault and its blocks. Its ledger starts from zero.
        vault.openGroup{value: COLL}(a, 1_800e18);
        require(vault.troveActive(), "reopened");
        _tieOut();
        (, uint256 principal, ) = vault.groupPosition();
        require(principal == 2_001.8e18, "fresh principal after reopen");
    }

    // ---------------------------------------------------------------------
    // Residual cash after close
    // ---------------------------------------------------------------------

    function testResidualSweepAfterClose() public {
        _fundMUSD();
        _open();
        vault.borrow(b, 50e18);
        vault.fundPocket(a, 5e18);
        vault.fundPocket(b, 2e18);
        vault.fundOverhead(1e18);
        _warpDays(30);
        vault.closeGroup();
        vault.sweepBTC(address(this));

        uint256 residual = vault.totalCash();
        require(residual > 0, "close leaves residual cash");
        require(IMUSDView(MUSD).balanceOf(address(vault)) == residual, "vault holds exactly the residual");

        address stranger = address(0xBAD);
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.NotOwner.selector));
        vm.prank(stranger);
        vault.sweepResidualMUSD(stranger);

        uint256 paidBefore = IMUSDView(MUSD).balanceOf(PAYEE);
        uint256 swept = vault.sweepResidualMUSD(PAYEE);
        require(swept == residual, "sweep returns every tracked MUSD");
        require(IMUSDView(MUSD).balanceOf(PAYEE) == paidBefore + residual, "payee received the residual");
        require(IMUSDView(MUSD).balanceOf(address(vault)) == 0, "vault holds no MUSD");
        require(vault.totalCash() == 0 && vault.overheadCash() == 0, "nothing left tracked");
        (uint256 cashA, , , ) = vault.bucketOf(a);
        (uint256 cashB, , , ) = vault.bucketOf(b);
        require(cashA == 0 && cashB == 0, "block cash cleared");
        _tieOut();
    }

    function testResidualSweepRefusedWhileOpen() public {
        _open();
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.GroupStillOpen.selector));
        vault.sweepResidualMUSD(PAYEE);
    }

    function testResidualSweepRefusedBeforeAnyClose() public {
        _fundMUSD();
        vault.fundPocket(a, 5e18);
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.NoGroupClosed.selector));
        vault.sweepResidualMUSD(PAYEE);
    }

    function testResidualSweepWaitsForReservations() public {
        _fundMUSD();
        _open();
        vault.grantMandate(a, OPERATOR, 1_000e18, 1_000e18, uint64(block.timestamp + 30 days));
        vault.setRecipient(a, PAYEE, true);
        // 600 is above the 500 approval threshold, so the payment waits and its cash stays reserved.
        vm.prank(OPERATOR);
        uint256 id = vault.requestTransfer(a, PAYEE, 600e18, bytes32("pending"));
        vault.fundPocket(a, 700e18);
        vault.closeGroup();
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.CashReserved.selector, a, 600e18));
        vault.sweepResidualMUSD(PAYEE);
        vault.cancelPayment(id);
        uint256 swept = vault.sweepResidualMUSD(PAYEE);
        require(swept > 0, "residual after the cancel");
        require(vault.totalCash() == 0, "nothing tracked after the sweep");
        _tieOut();
    }

    function testGroupCanReopenAfterSweep() public {
        _fundMUSD();
        _open();
        vault.fundPocket(a, 5e18);
        vault.fundOverhead(1e18);
        _warpDays(1);
        vault.closeGroup();
        vault.sweepBTC(address(this));
        vault.sweepResidualMUSD(PAYEE);
        vault.openGroup{value: COLL}(a, 1_800e18);
        require(vault.troveActive(), "reopened after the sweep");
        _tieOut();
        require(IMUSDView(MUSD).balanceOf(address(vault)) == vault.totalCash(), "vault cash matches buckets");
    }

    function testStrayMUSDBlocksSweepUntilRecovered() public {
        _fundMUSD();
        _open();
        vault.fundPocket(a, 5e18);
        vault.fundOverhead(1e18);
        _warpDays(1);
        vault.closeGroup();
        vault.sweepBTC(address(this));
        uint256 residual = vault.totalCash();
        // A direct transfer puts 1 MUSD outside the ledger. The sweep refuses until it is recovered.
        require(IMUSDView(MUSD).transfer(address(vault), 1e18), "direct transfer");
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.CashMismatch.selector));
        vault.sweepResidualMUSD(PAYEE);
        vault.recoverUnallocatedMUSD(address(this));
        require(vault.sweepResidualMUSD(PAYEE) == residual, "sweep moves tracked cash only");
        require(IMUSDView(MUSD).balanceOf(address(vault)) == 0, "vault empty");
    }

    function testResidualSweepRejectsZeroAddress() public {
        _fundMUSD();
        _open();
        vault.fundPocket(a, 5e18);
        vault.fundOverhead(1e18);
        _warpDays(1);
        vault.closeGroup();
        vault.sweepBTC(address(this));
        // The group is closed and cash remains, so the zero address is the only reason to refuse.
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.ZeroAddress.selector));
        vault.sweepResidualMUSD(address(0));
    }

    function testSecondSweepHasNothingToMove() public {
        _fundMUSD();
        _open();
        vault.fundPocket(a, 5e18);
        vault.fundOverhead(1e18);
        _warpDays(1);
        vault.closeGroup();
        vault.sweepBTC(address(this));
        vault.sweepResidualMUSD(PAYEE);
        // The first sweep emptied every tracked total, so a second sweep moves nothing and reverts.
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.ZeroAmount.selector));
        vault.sweepResidualMUSD(PAYEE);
    }

    function testResidualSweepRefusedAfterReopen() public {
        _fundMUSD();
        _open();
        vault.fundPocket(a, 5e18);
        vault.fundOverhead(1e18);
        _warpDays(1);
        vault.closeGroup();
        vault.sweepBTC(address(this));
        vault.openGroup{value: COLL}(a, 1_800e18);
        require(vault.troveActive(), "reopened");
        // The group closed once before, but it is open again, so the sweep stays refused.
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.GroupStillOpen.selector));
        vault.sweepResidualMUSD(PAYEE);
    }

    // ---------------------------------------------------------------------
    // A slice pocket and the shared Trove in one vault
    // ---------------------------------------------------------------------

    function testSliceSpendLeavesGroupLedgerAlone() public {
        _fundMUSD();
        _open();
        uint256 s = vault.createMoneyblock("Vendor pocket", false, 0);
        vault.setRecipient(s, PAYEE, true);
        vault.grantMandate(s, OPERATOR, 300e18, 1_000e18, uint64(block.timestamp + 30 days));
        vault.fundPocket(s, 200e18);
        _warpDays(3);
        (, , uint256 prinBefore, ) = vault.bucketOf(a);
        uint256 paidBefore = IMUSDView(MUSD).balanceOf(PAYEE);

        vm.prank(OPERATOR);
        vault.requestTransfer(s, PAYEE, 150e18, bytes32("invoice-7"));

        require(IMUSDView(MUSD).balanceOf(PAYEE) == paidBefore + 150e18, "payee paid from the pocket");
        (, , uint256 prinAfter, ) = vault.bucketOf(a);
        require(prinAfter == prinBefore, "group bucket unchanged");
        _tieOut();
        require(IMUSDView(MUSD).balanceOf(address(vault)) == vault.totalCash(), "vault cash matches buckets");
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _open() internal {
        vault.openGroup{value: COLL}(a, 1_800e18);
    }

    function _refreshOracle() internal {
        // 67,130.35832 USD with 18 decimals, stamped with the current block time so the 60-second check passes.
        vm.mockCall(
            ORACLE,
            abi.encodeWithSignature("latestRoundData()"),
            abi.encode(uint80(1), int256(67130358320000000000000), block.timestamp, block.timestamp, uint80(1))
        );
        vm.mockCall(ORACLE, abi.encodeWithSignature("decimals()"), abi.encode(uint8(18)));
    }

    function _warpDays(uint256 daysAhead) internal {
        vm.warp(block.timestamp + daysAhead * 1 days);
        _refreshOracle();
    }

    // Opens a second trove owned by this test and borrows 1,800 MUSD to it. The test then holds MUSD
    // for fundPocket and fundOverhead, and approves the vault to pull it.
    function _fundMUSD() internal {
        IBorrowerOpsView(BO).openTrove{value: COLL}(1_800e18, address(0), address(0));
        IMUSDView(MUSD).approve(address(vault), type(uint256).max);
    }

    // Settles interest to now, then checks that buckets plus overhead equal Mezo's totals exactly.
    function _tieOut() internal {
        vault.accrue();
        (, uint256 mezoPrincipal, uint256 mezoInterest) = vault.groupPosition();
        uint256 principal = vault.overheadPrincipal();
        uint256 interest = vault.overheadInterest();
        uint256[] memory ids = vault.crossBlockIdList();
        for (uint256 i; i < ids.length; ++i) {
            (, , uint256 p, uint256 it) = vault.bucketOf(ids[i]);
            principal += p;
            interest += it;
        }
        require(principal == mezoPrincipal, "tie: principal");
        require(interest == mezoInterest, "tie: interest");
        require(vault.totalPrincipal() == mezoPrincipal, "tie: ledger principal");
        require(vault.totalInterest() == mezoInterest, "tie: ledger interest");
    }
}
