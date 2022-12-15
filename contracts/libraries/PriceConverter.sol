// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

library PriceConverter {
    // We could make this public, but then we'd have to deploy it
    function getPrice(
        address token,
        address aggregatorV3
    ) internal view returns (uint256, uint256) {
        //Get decimals of token
        uint8 decimals = 18;
        if (token != address(0)) {
            decimals = IERC20Metadata(token).decimals();
        }

        AggregatorV3Interface priceFeed = AggregatorV3Interface(aggregatorV3); //Polygon mainnet

        (, int256 answer, , , ) = priceFeed.latestRoundData();
        uint8 priceDecimal = priceFeed.decimals();
        uint256 returnAnswer = uint256(answer);
        if (priceDecimal < decimals) {
            returnAnswer = returnAnswer * (10 ** (decimals - priceDecimal));
        } else if (priceDecimal > decimals) {
            returnAnswer = returnAnswer * (10 ** (priceDecimal - decimals));
        }
        //Chainlink USD datafeeds return price data with 8 decimals precision, not 18. convert the value to 18 decimals, you can add 10 zeros to the result:
        return (returnAnswer, uint256(decimals));
    }

    // 1000000000
    function getConversionRate(
        uint256 amount,
        address token,
        address aggregatorV3
    ) internal view returns (uint256) {
        (uint256 price, uint256 decimals) = getPrice(token, aggregatorV3);
        amount = matchDecimals(amount, decimals);
        uint256 tokenAmountInUsd = (price * amount) / (10 ** decimals);
        // the actual token/USD conversion rate, after adjusting the extra 0s.
        return tokenAmountInUsd;
    }

    function getOrgUsdToken(
        uint256 amount,
        address token,
        address aggregatorV3
    ) internal view returns (uint256) {
        (uint256 price, uint256 decimals) = getPrice(token, aggregatorV3);
        uint256 adjustPrice = uint256(price) * 1e18;
        amount = matchDecimals(amount, decimals);
        uint256 usd = amount * 1e18;
        uint256 rate = (usd * (10 ** decimals)) / adjustPrice;
        return rate;
    }

    function getUsdToken(
        uint256 amount,
        address token,
        address aggregatorV3
    ) internal view returns (uint256) {
        (uint256 price, uint256 decimals) = getPrice(token, aggregatorV3);
        uint256 adjustPrice = uint256(price) * 1e18;
        amount = matchDecimals(amount, decimals);
        uint256 usd = amount * 1e18;
        uint256 rate = (usd * (10 ** decimals)) / adjustPrice;
        return (rate * 102) / 100;
    }

    // to match usd decimals with token decimals, usd decimals is fixed to 18
    function matchDecimals(
        uint256 amount,
        uint256 decimals
    ) internal pure returns (uint256) {
        if (decimals > 18) {
            amount = amount * (10 ** (decimals - 18));
        } else if (decimals < 18) {
            amount = amount / (10 ** (18 - decimals));
        }
        return amount;
    }
}
