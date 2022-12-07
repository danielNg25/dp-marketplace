// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

library PriceConverter {
    // We could make this public, but then we'd have to deploy it
    function getPrice() internal view returns (uint256) {
        int answer = 88942317;
        // MATIC/USD rate in 18 digit
        return uint256(answer * 1e10); //Chainlink USD datafeeds return price data with 8 decimals precision, not 18. convert the value to 18 decimals, you can add 10 zeros to the result:
    }

    // 1000000000
    function getConversionRate(
        uint256 ethAmount
    ) internal view returns (uint256) {
        uint256 ethPrice = getPrice();
        uint256 ethAmountInUsd = (ethPrice * ethAmount) / 1e18;
        // the actual MATIC/USD conversion rate, after adjusting the extra 0s.
        return ethAmountInUsd;
    }

    function getOrgUsdMatic(uint256 _amount) internal view returns (uint256) {
        uint256 ethPrice = getPrice();
        uint256 adjust_price = uint256(ethPrice) * 1e18;
        uint256 usd = _amount * 1e18;
        uint256 rate = (usd * 1e18) / adjust_price;
        return rate;
    }

    function getUsdMatic(uint256 _amount) internal view returns (uint256) {
        uint256 ethPrice = getPrice();
        uint256 adjust_price = uint256(ethPrice) * 1e18;
        uint256 usd = _amount * 1e18;
        uint256 rate = (usd * 1e18) / adjust_price;
        return (rate * 102) / 100;
    }
}
