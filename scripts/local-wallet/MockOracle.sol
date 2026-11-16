// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

// Stand-in for Mezo's price oracle on a local fork, where the deployed oracle bytecode recurses.
// Used only by scripts/local-wallet/start.sh. Never deployed to a live network.
contract MockOracle {
    function decimals() external pure returns (uint8) {
        return 18;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, int256(67130358320000000000000), block.timestamp, block.timestamp, 1);
    }
}
