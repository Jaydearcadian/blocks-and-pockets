// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import {TroveVaultSpike} from "../src/TroveVaultSpike.sol";

// Minimal cheatcode surface so the spike needs no forge-std dependency.
interface Vm {
    function createSelectFork(string calldata urlOrAlias) external returns (uint256);

    function deal(address account, uint256 newBalance) external;

    function expectRevert() external;

    function expectRevert(bytes calldata revertData) external;

    function mockCall(address callee, bytes calldata data, bytes calldata returnData) external;
}

interface IBorrowerOperationsTest {
    function openTrove(
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external payable;
}

interface ITroveManagerTest {
    function getTroveDebt(address _borrower) external view returns (uint256);

    function getTroveColl(address _borrower) external view returns (uint256);

    // Status enum: 0 nonExistent, 1 active, 2 closedByOwner.
    function getTroveStatus(address _borrower) external view returns (uint8);
}

interface IMUSDTest {
    function balanceOf(address _account) external view returns (uint256);

    function transfer(address _to, uint256 _amount) external returns (bool);
}

/// @notice Runs the vault against a fork of Mezo testnet. Nothing here is broadcast.
contract TroveVaultForkTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant BO = 0xCdF7028ceAB81fA0C6971208e83fa7872994beE5;
    address internal constant TM = 0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0;
    address internal constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address internal constant PAYEE = address(0xBEEF);
    // Mezo's price oracle. The deployed bytecode recurses under a local fork, so the test mocks it.
    address internal constant ORACLE = 0x7b7c000000000000000000000000000000000015;
    string internal constant MIN_DEBT_REVERT =
        "BorrowerOps: Trove's net debt must be greater than minimum";
    string internal constant SHORT_MUSD_REVERT =
        "BorrowerOps: Caller doesnt have enough mUSD to make repayment";

    event log_named_uint(string key, uint256 val);

    TroveVaultSpike internal vault;

    receive() external payable {}

    function setUp() public {
        vm.createSelectFork("https://rpc.test.mezo.org");
        // Price the chain returned at timestamp 1794659318: 67,130.35832 USD, 18 decimals.
        // Stamped with the fork block time so the 60-second staleness check passes.
        vm.mockCall(
            ORACLE,
            abi.encodeWithSignature("latestRoundData()"),
            abi.encode(uint80(15680206), int256(67130358320000000000000), block.timestamp, block.timestamp, uint80(0))
        );
        // The price wrapper also reads decimals() from the same oracle address: 18 on testnet.
        vm.mockCall(ORACLE, abi.encodeWithSignature("decimals()"), abi.encode(uint8(18)));
        vault = new TroveVaultSpike(BO, MUSD);
    }

    function testFullCycle() public {
        vm.deal(address(this), 1 ether);

        // 1. Open with 0.06 BTC and borrow 1,800 MUSD into the vault.
        vault.open{value: 0.06 ether}(1_800e18, address(0), address(0));
        require(IMUSDTest(MUSD).balanceOf(address(vault)) == 1_800e18, "open: vault MUSD");
        require(ITroveManagerTest(TM).getTroveStatus(address(vault)) == 1, "open: status");
        require(ITroveManagerTest(TM).getTroveColl(address(vault)) == 0.06 ether, "open: coll");
        uint256 debtAfterOpen = ITroveManagerTest(TM).getTroveDebt(address(vault));
        emit log_named_uint("debt after open", debtAfterOpen);
        // 1,800 borrowed + 0.1% fee (1.8) + 200 gas deposit.
        require(debtAfterOpen == 2_001.8e18, "open: debt");

        // 2. Send 1 MUSD out of the vault. The payee already holds some testnet MUSD, so check the delta.
        uint256 payeeBefore = IMUSDTest(MUSD).balanceOf(PAYEE);
        vault.pay(PAYEE, 1e18);
        require(IMUSDTest(MUSD).balanceOf(PAYEE) == payeeBefore + 1e18, "pay: payee");
        require(IMUSDTest(MUSD).balanceOf(address(vault)) == 1_799e18, "pay: vault");

        // 3. Repay 1 MUSD of debt.
        vault.repay(1e18, address(0), address(0));
        require(IMUSDTest(MUSD).balanceOf(address(vault)) == 1_798e18, "repay: vault");
        uint256 debtAfterRepay = ITroveManagerTest(TM).getTroveDebt(address(vault));
        emit log_named_uint("debt after repay", debtAfterRepay);
        require(debtAfterRepay == 2_000.8e18, "repay: debt");

        // 4. Close without the top-up must fail: vault holds 1,798, needs 1,800.8.
        vm.expectRevert(abi.encodeWithSignature("Error(string)", SHORT_MUSD_REVERT));
        vault.close();

        // 5. Top up 5 MUSD. Borrow it from a second trove owned by this test contract, then transfer.
        IBorrowerOperationsTest(BO).openTrove{value: 0.06 ether}(1_800e18, address(0), address(0));
        require(IMUSDTest(MUSD).balanceOf(address(this)) == 1_800e18, "topup: source MUSD");
        require(IMUSDTest(MUSD).transfer(address(vault), 5e18), "topup: transfer");
        require(IMUSDTest(MUSD).balanceOf(address(vault)) == 1_803e18, "topup: vault");

        // 6. Close. Needs debt minus 200 = 1,800.8 MUSD. The 200 gas deposit is burned, not returned.
        vault.close();
        require(ITroveManagerTest(TM).getTroveStatus(address(vault)) == 2, "close: status");
        require(ITroveManagerTest(TM).getTroveDebt(address(vault)) == 0, "close: debt");
        require(IMUSDTest(MUSD).balanceOf(address(vault)) == 2.2e18, "close: leftover MUSD");
        require(address(vault).balance == 0.06 ether, "close: BTC returned");

        // 7. Sweep leftovers back to this test contract.
        uint256 btcBefore = address(this).balance;
        vault.sweep(address(this));
        require(IMUSDTest(MUSD).balanceOf(address(vault)) == 0, "sweep: MUSD");
        require(address(vault).balance == 0, "sweep: BTC");
        require(address(this).balance == btcBefore + 0.06 ether, "sweep: BTC to owner");
        // 1,800 borrowed in the second trove, 5 sent to the vault, 2.2 swept back.
        require(IMUSDTest(MUSD).balanceOf(address(this)) == 1_797.2e18, "sweep: owner MUSD");
    }

    function testOpenBelowMinimumReverts() public {
        vm.deal(address(this), 1 ether);
        // The 0.1% fee counts toward net debt: 1,798 + 1.798 = 1,799.798, below the minimum.
        vm.expectRevert(abi.encodeWithSignature("Error(string)", MIN_DEBT_REVERT));
        vault.open{value: 0.06 ether}(1_798e18, address(0), address(0));
    }

    function testOpenJustAboveMinimumPasses() public {
        vm.deal(address(this), 1 ether);
        vault.open{value: 0.06 ether}(1_799e18, address(0), address(0));
        // Net debt 1,799 + 1.799 fee = 1,800.799, plus the 200 gas deposit.
        require(ITroveManagerTest(TM).getTroveDebt(address(vault)) == 2_000.799e18, "boundary: debt");
    }

    function testRepayBelowMinimumReverts() public {
        vm.deal(address(this), 1 ether);
        vault.open{value: 0.06 ether}(1_800e18, address(0), address(0));
        // Net debt after open is 1,801.8. Repaying 2 would leave 1,799.8, below the 1,800 minimum.
        vm.expectRevert(abi.encodeWithSignature("Error(string)", MIN_DEBT_REVERT));
        vault.repay(2e18, address(0), address(0));
    }
}
