// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

library PriceConverter {
    struct PriceData {
        uint80 oracleRoundId;
        uint256 price; // Usd price in 18 decimals
        uint256 tokenDecimals;
    }

    // We could make this internal, but then we'd have to deploy it
    function getPrice(
        address token,
        address aggregatorV3
    ) internal view returns (PriceData memory) {
        //Get decimals of token
        uint8 tokenDecimals = 18;
        if (token != address(0)) {
            tokenDecimals = IERC20Metadata(token).decimals();
        }

        AggregatorV3Interface priceFeed = AggregatorV3Interface(aggregatorV3); //Polygon mainnet

        (uint80 roundId, int256 answer, , , ) = priceFeed.latestRoundData();
        uint8 priceDecimals = priceFeed.decimals();
        uint256 returnAnswer = uint256(answer);
        if (priceDecimals < tokenDecimals) {
            returnAnswer =
                returnAnswer *
                (10 ** (tokenDecimals - priceDecimals));
        } else if (priceDecimals > tokenDecimals) {
            returnAnswer =
                returnAnswer *
                (10 ** (priceDecimals - tokenDecimals));
        }
        //Chainlink USD datafeeds return price data with 8 decimals precision, not 18. convert the value to 18 decimals, you can add 10 zeros to the result:
        return PriceData(roundId, returnAnswer, uint256(tokenDecimals));
    }

    function getOrgUsdToken(
        uint256 amount,
        PriceData memory priceData
    ) internal pure returns (uint256) {
        uint256 adjustPrice = uint256(priceData.price) * 1e18;
        amount = matchDecimals(amount, priceData.tokenDecimals);
        uint256 usd = amount * 1e18;
        uint256 rate = (usd * (10 ** priceData.tokenDecimals)) / adjustPrice;
        return rate;
    }

    function getUsdToken(
        uint256 amount,
        PriceData memory priceData
    ) internal pure returns (uint256) {
        uint256 adjustPrice = uint256(priceData.price) * 1e18;
        amount = matchDecimals(amount, priceData.tokenDecimals);
        uint256 usd = amount * 1e18;
        uint256 rate = (usd * (10 ** priceData.tokenDecimals)) / adjustPrice;
        return (rate * 102) / 100;
    }

    // to match usd decimals with token decimals, usd decimals is fixed to 18
    function matchDecimals(
        uint256 amount,
        uint256 tokenDecimals
    ) internal pure returns (uint256) {
        if (tokenDecimals > 18) {
            amount = amount * (10 ** (tokenDecimals - 18));
        } else if (tokenDecimals < 18) {
            amount = amount / (10 ** (18 - tokenDecimals));
        }
        return amount;
    }
}
