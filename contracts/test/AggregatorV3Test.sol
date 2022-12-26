// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract AggregatorV3Test {
    int public _answer;
    uint8 private _decimals = 8;

    constructor(int answer_, uint8 decimals_) {
        _answer = answer_;
        _decimals = decimals_;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        roundId = 25012000;
        answer = _answer;
        startedAt = 0;
        updatedAt = 0;
        answeredInRound = 0;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }
}
