// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import {MoneyblocksVault} from "../src/MoneyblocksVault.sol";

// Minimal cheatcode surface so the spike needs no forge-std dependency.
interface Vm {
    function prank(address msgSender) external;

    function warp(uint256 newTimestamp) external;

    function expectRevert(bytes calldata revertData) external;
}

/// @dev Plain ERC-20 stand-in for MUSD. The slice tests never reach Mezo, so no Mezo mock is needed.
contract MockMUSD {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @notice Prefunded pocket (slice) rules: local caps, recipient allowlist, mandate, revocation, approval.
contract MoneyblocksSliceTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant OPERATOR = address(0xA6E);
    address internal constant VENDOR = address(0xBEE);
    address internal constant OTHER = address(0xBAD);
    address internal constant STRANGER = address(0x5EE);

    MockMUSD internal musd;
    MoneyblocksVault internal vault;
    uint256 internal pocket;

    function setUp() public {
        musd = new MockMUSD();
        // The slice path never calls Mezo, so the Mezo addresses are zero here.
        vault = new MoneyblocksVault(address(0), address(0), address(0), address(musd), 15_000, 500e18);
        musd.mint(address(this), 10_000e18);
        musd.approve(address(vault), type(uint256).max);
        // Per-transaction cap 800, lifetime cap 2,000, approval above 500.
        pocket = vault.createMoneyblock("Vendor pocket", false, 0);
        vault.setRecipient(pocket, VENDOR, true);
        vault.grantMandate(pocket, OPERATOR, 800e18, 2_000e18, uint64(block.timestamp + 30 days));
        vault.fundPocket(pocket, 1_000e18);
    }

    function testUnderThresholdPaymentExecutesNow() public {
        vm.prank(OPERATOR);
        uint256 id = vault.requestTransfer(pocket, VENDOR, 100e18, bytes32("invoice-1"));
        require(musd.balanceOf(VENDOR) == 100e18, "vendor paid");
        (uint256 cash, uint256 reserved, , ) = vault.bucketOf(pocket);
        require(cash == 900e18 && reserved == 0, "pocket debited");
        (, , , , MoneyblocksVault.PaymentStatus status) = vault.payments(id);
        require(status == MoneyblocksVault.PaymentStatus.Executed, "executed");
        require(musd.balanceOf(address(vault)) == vault.totalCash(), "vault cash matches pockets");
    }

    function testAboveThresholdWaitsForOwnerApproval() public {
        vm.prank(OPERATOR);
        uint256 id = vault.requestTransfer(pocket, VENDOR, 600e18, bytes32("invoice-2"));
        require(musd.balanceOf(VENDOR) == 0, "not paid before approval");
        (, uint256 reserved, , ) = vault.bucketOf(pocket);
        require(reserved == 600e18, "reserved while pending");
        vault.approvePayment(id);
        require(musd.balanceOf(VENDOR) == 600e18, "paid after approval");
        (uint256 cash, uint256 reservedAfter, , ) = vault.bucketOf(pocket);
        require(cash == 400e18 && reservedAfter == 0, "pocket and reservation after approval");
    }

    function testReservationReducesAvailableCash() public {
        vm.prank(OPERATOR);
        vault.requestTransfer(pocket, VENDOR, 600e18, bytes32("invoice-3"));
        vm.prank(OPERATOR);
        // 1,000 in the pocket, 600 reserved, so 400 is available. Caps are not the binding limit here.
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.PocketInsufficient.selector, pocket, 400e18, 500e18));
        vault.requestTransfer(pocket, VENDOR, 500e18, bytes32("invoice-4"));
    }

    function testCancelReleasesReservation() public {
        vm.prank(OPERATOR);
        uint256 id = vault.requestTransfer(pocket, VENDOR, 600e18, bytes32("invoice-5"));
        vault.cancelPayment(id);
        (uint256 cash, uint256 reserved, , ) = vault.bucketOf(pocket);
        require(cash == 1_000e18 && reserved == 0, "cash untouched, reservation released");
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.PaymentNotPending.selector, id));
        vault.approvePayment(id);
    }

    function testPerTransactionCapRejects() public {
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.PerTransactionCapExceeded.selector, 801e18, 800e18));
        vault.requestTransfer(pocket, VENDOR, 801e18, bytes32("invoice-6"));
    }

    function testLifetimeCapRejects() public {
        // Pocket holds 2,000 after this, so only the lifetime cap can bind.
        vault.fundPocket(pocket, 1_000e18);
        vm.prank(OPERATOR);
        vault.requestTransfer(pocket, VENDOR, 800e18, bytes32("invoice-7"));
        vm.prank(OPERATOR);
        vault.requestTransfer(pocket, VENDOR, 800e18, bytes32("invoice-8"));
        // 1,600 committed. Another 800 would reach 2,400, above the 2,000 lifetime cap. 400 remains.
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.MandateTotalCapExceeded.selector, 800e18, 400e18));
        vault.requestTransfer(pocket, VENDOR, 800e18, bytes32("invoice-9"));
    }

    function testRecipientOutsideAllowlistRejects() public {
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.RecipientNotAllowed.selector, pocket, OTHER));
        vault.requestTransfer(pocket, OTHER, 10e18, bytes32("invoice-10"));
    }

    function testPocketInsufficientRejects() public {
        vm.prank(OPERATOR);
        vault.requestTransfer(pocket, VENDOR, 800e18, bytes32("invoice-11"));
        // 200 left. 300 is under the per-transaction and lifetime caps, so the pocket is what binds.
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.PocketInsufficient.selector, pocket, 200e18, 300e18));
        vault.requestTransfer(pocket, VENDOR, 300e18, bytes32("invoice-12"));
    }

    function testRevokedMandateRejectsNewRequests() public {
        vault.revokeMandate(pocket);
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.MandateRevoked.selector, pocket));
        vault.requestTransfer(pocket, VENDOR, 10e18, bytes32("invoice-13"));
    }

    function testRevocationStopsPendingPaymentAtApproval() public {
        vm.prank(OPERATOR);
        uint256 id = vault.requestTransfer(pocket, VENDOR, 600e18, bytes32("invoice-14"));
        vault.revokeMandate(pocket);
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.MandateRevoked.selector, pocket));
        vault.approvePayment(id);
        require(musd.balanceOf(VENDOR) == 0, "nothing paid");
    }

    function testExpiredMandateRejects() public {
        vm.warp(block.timestamp + 31 days);
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.MandateExpired.selector, pocket));
        vault.requestTransfer(pocket, VENDOR, 10e18, bytes32("invoice-15"));
    }

    function testStrangerCannotRequestPayment() public {
        vm.prank(STRANGER);
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.NotOperator.selector, pocket));
        vault.requestTransfer(pocket, VENDOR, 10e18, bytes32("invoice-16"));
    }

    function testOwnerCannotSpendPocketDirectly() public {
        // The owner funds and governs pockets but is not the operator, so it cannot spend from one.
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.NotOperator.selector, pocket));
        vault.requestTransfer(pocket, VENDOR, 10e18, bytes32("invoice-17"));
    }

    function testStrangerCannotChangeMandate() public {
        vm.prank(STRANGER);
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.NotOwner.selector));
        vault.grantMandate(pocket, STRANGER, 1_000e18, 1_000e18, uint64(block.timestamp + 1 days));
    }

    function testGrantMandateRejectsPastExpiryAndZeroOperator() public {
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.InvalidMandate.selector));
        vault.grantMandate(pocket, OPERATOR, 800e18, 2_000e18, uint64(block.timestamp));
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.InvalidMandate.selector));
        vault.grantMandate(pocket, address(0), 800e18, 2_000e18, uint64(block.timestamp + 1 days));
    }

    function testUnknownBlockRejects() public {
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.BlockNotFound.selector, 99));
        vault.setRecipient(99, VENDOR, true);
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.BlockNotFound.selector, 99));
        vault.fundPocket(99, 1e18);
    }

    function testZeroAmountRejects() public {
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.ZeroAmount.selector));
        vault.requestTransfer(pocket, VENDOR, 0, bytes32("invoice-18"));
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.ZeroAmount.selector));
        vault.fundPocket(pocket, 0);
    }

    function testRegrantKeepsWhatWasAlreadyCommitted() public {
        vm.prank(OPERATOR);
        vault.requestTransfer(pocket, VENDOR, 400e18, bytes32("invoice-19"));
        // A new grant sets new limits but does not reset what the block has already committed.
        vault.grantMandate(pocket, OPERATOR, 800e18, 500e18, uint64(block.timestamp + 30 days));
        vm.prank(OPERATOR);
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.MandateTotalCapExceeded.selector, 101e18, 100e18));
        vault.requestTransfer(pocket, VENDOR, 101e18, bytes32("invoice-20"));
    }

    function testPendingPaymentCannotBeApprovedAfterExpiry() public {
        vm.prank(OPERATOR);
        uint256 id = vault.requestTransfer(pocket, VENDOR, 600e18, bytes32("invoice-21"));
        vm.warp(block.timestamp + 31 days);
        vm.expectRevert(abi.encodeWithSelector(MoneyblocksVault.MandateExpired.selector, pocket));
        vault.approvePayment(id);
        // The owner can still cancel it and release the reservation.
        vault.cancelPayment(id);
        (, uint256 reserved, , ) = vault.bucketOf(pocket);
        require(reserved == 0, "reservation released");
    }
}
