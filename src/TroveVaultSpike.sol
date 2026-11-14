// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

// Minimal Mezo BorrowerOperations surface used by the spike.
// Signatures match solidity/contracts/interfaces/IBorrowerOperations.sol at da7888a.
interface IBorrowerOperations {
    function openTrove(
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external payable;

    function repayMUSD(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external;

    function closeTrove() external;
}

interface IMUSD {
    function transfer(address to, uint256 amount) external returns (bool);

    function balanceOf(address account) external view returns (uint256);
}

/// @notice Testnet spike: one contract owns one Mezo Trove and runs open, pay, repay, close.
/// @dev The owner is the only caller. Nothing here is audited. Do not use with mainnet funds.
contract TroveVaultSpike {
    IBorrowerOperations public immutable borrowerOperations;
    IMUSD public immutable musd;
    address public immutable owner;

    error NotOwner();
    error TransferFailed();
    error SendFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _borrowerOperations, address _musd) {
        borrowerOperations = IBorrowerOperations(_borrowerOperations);
        musd = IMUSD(_musd);
        owner = msg.sender;
    }

    // Receives BTC collateral returned by closeTrove.
    receive() external payable {}

    /// @notice Opens the Trove with msg.value BTC collateral and borrows _debtAmount MUSD to this contract.
    function open(
        uint256 _debtAmount,
        address _upperHint,
        address _lowerHint
    ) external payable onlyOwner {
        borrowerOperations.openTrove{value: msg.value}(
            _debtAmount,
            _upperHint,
            _lowerHint
        );
    }

    /// @notice Sends MUSD held by this contract to _to.
    function pay(address _to, uint256 _amount) external onlyOwner {
        if (!musd.transfer(_to, _amount)) revert TransferFailed();
    }

    /// @notice Repays _amount MUSD of debt from this contract's MUSD balance.
    function repay(
        uint256 _amount,
        address _upperHint,
        address _lowerHint
    ) external onlyOwner {
        borrowerOperations.repayMUSD(_amount, _upperHint, _lowerHint);
    }

    /// @notice Closes the Trove. Needs debt minus the 200 MUSD gas deposit in this contract's balance.
    function close() external onlyOwner {
        borrowerOperations.closeTrove();
    }

    /// @notice Sends all remaining MUSD and BTC held by this contract to _to.
    function sweep(address _to) external onlyOwner {
        uint256 tokenBalance = musd.balanceOf(address(this));
        if (tokenBalance > 0 && !musd.transfer(_to, tokenBalance)) {
            revert TransferFailed();
        }
        (bool ok, ) = _to.call{value: address(this).balance}("");
        if (!ok) revert SendFailed();
    }
}
