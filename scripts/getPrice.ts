import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";

const getTokenPrice = (
    tokenPrice: number,
    priceDecimals: number,
    tokenDecimals: number,
): BigNumber => {
    let maticPriceBig = BigNumber.from(tokenPrice);
    if (priceDecimals < tokenDecimals) {
        maticPriceBig = maticPriceBig.mul(
            BigNumber.from("10").pow(tokenDecimals - priceDecimals),
        );
    } else if (priceDecimals > tokenDecimals) {
        maticPriceBig = maticPriceBig.mul(
            BigNumber.from("10").pow(priceDecimals - tokenDecimals),
        );
    }
    return maticPriceBig;
};

const matchUsdWithTokenDecimals = (
    amount: BigNumber,
    decimals: number,
): BigNumber => {
    if (decimals > 18) {
        amount = amount.mul(BigNumber.from("10").pow(decimals - 18));
    } else if (decimals < 18) {
        amount = amount.div(BigNumber.from("10").pow(decimals - 18));
    }
    return amount;
};

const getUsdToken = (
    amount: BigNumber,
    tokenPrice: number,
    priceDecimals: number,
    tokenDecimals: number,
): BigNumber => {
    const e18 = BigNumber.from("1000000000000000000");
    const maticPriceBig = getTokenPrice(
        tokenPrice,
        priceDecimals,
        tokenDecimals,
    );
    amount = matchUsdWithTokenDecimals(amount, tokenDecimals);
    const rate = amount.mul(e18).div(maticPriceBig);
    return rate.mul(102).div(100);
};

const getUsdOrgToken = (
    amount: BigNumber,
    tokenPrice: number,
    priceDecimals: number,
    tokenDecimals: number,
): BigNumber => {
    const e18 = BigNumber.from("1000000000000000000");
    const maticPriceBig = getTokenPrice(
        tokenPrice,
        priceDecimals,
        tokenDecimals,
    );
    amount = matchUsdWithTokenDecimals(amount, tokenDecimals);
    const rate = amount.mul(e18).div(maticPriceBig);
    return rate;
};

export const getCommissionFirstTimeWithPhysical = (
    marketItemSellPriceUSD: BigNumber,
    marketItemReservePriceUSD: BigNumber,
    tokenPrice: number,
    priceDecimals: number,
    tokenDecimals: number,
): [BigNumber, BigNumber, BigNumber, BigNumber] => {
    const sellpriceToken = getUsdToken(
        marketItemSellPriceUSD,
        tokenPrice,
        priceDecimals,
        tokenDecimals,
    );
    const charityAmount = getUsdOrgToken(
        marketItemSellPriceUSD.sub(marketItemReservePriceUSD),
        tokenPrice,
        priceDecimals,
        tokenDecimals,
    )
        .mul(80)
        .div(100)
        .add(
            getUsdOrgToken(
                marketItemReservePriceUSD,
                tokenPrice,
                priceDecimals,
                tokenDecimals,
            )
                .mul(20)
                .div(100),
        );
    const creatorAmount = getUsdOrgToken(
        marketItemReservePriceUSD.mul(65).div(100),
        tokenPrice,
        priceDecimals,
        tokenDecimals,
    );
    const web3reAmount = sellpriceToken.sub(charityAmount).sub(creatorAmount);
    return [sellpriceToken, charityAmount, creatorAmount, web3reAmount];
};

export const getCommissionFirstTimeWithoutPhysical = (
    marketItemSellPriceUSD: BigNumber,
    tokenPrice: number,
    priceDecimals: number,
    tokenDecimals: number,
): [BigNumber, BigNumber, BigNumber, BigNumber] => {
    const sellpriceToken = getUsdToken(
        marketItemSellPriceUSD,
        tokenPrice,
        priceDecimals,
        tokenDecimals,
    );
    const charityAmount = getUsdOrgToken(
        marketItemSellPriceUSD.mul(10).div(100),
        tokenPrice,
        priceDecimals,
        tokenDecimals,
    );
    const creatorAmount = getUsdOrgToken(
        marketItemSellPriceUSD.mul(85).div(100),
        tokenPrice,
        priceDecimals,
        tokenDecimals,
    );
    const web3reAmount = sellpriceToken.sub(charityAmount).sub(creatorAmount);
    return [sellpriceToken, charityAmount, creatorAmount, web3reAmount];
};

export const getCommissionResellCustodialWallet = (
    marketItemSellPriceUSD: BigNumber,
    royaltyPercent: number,
    tokenPrice: number,
    priceDecimals: number,
    tokenDecimals: number,
): [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber] => {
    const sellpriceToken = getUsdToken(
        marketItemSellPriceUSD,
        tokenPrice,
        priceDecimals,
        tokenDecimals,
    );
    let creatorAmount = BigNumber.from(0);
    if (royaltyPercent > 2) {
        creatorAmount = getUsdOrgToken(
            marketItemSellPriceUSD.mul(2).div(100),
            tokenPrice,
            priceDecimals,
            tokenDecimals,
        );
    }
    const charityAmount = getUsdOrgToken(
        marketItemSellPriceUSD.mul(10).div(100),
        tokenPrice,
        priceDecimals,
        tokenDecimals,
    );
    const sellerAmount = getUsdOrgToken(
        marketItemSellPriceUSD.mul(80).div(100),
        tokenPrice,
        priceDecimals,
        tokenDecimals,
    );
    const web3reAmount = sellpriceToken
        .sub(charityAmount)
        .sub(creatorAmount)
        .sub(sellerAmount);
    return [
        sellpriceToken,
        creatorAmount,
        charityAmount,
        sellerAmount,
        web3reAmount,
    ];
};

export const getCommissionResellNonCustodialWallet = (
    marketItemSellPriceUSD: BigNumber,
    tokenPrice: number,
    priceDecimals: number,
    tokenDecimals: number,
): [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber] => {
    const sellpriceToken = getUsdToken(
        marketItemSellPriceUSD,
        tokenPrice,
        priceDecimals,
        tokenDecimals,
    );
    const creatorAmount = getUsdOrgToken(
        marketItemSellPriceUSD.mul(5).div(100),
        tokenPrice,
        priceDecimals,
        tokenDecimals,
    );
    const charityAmount = getUsdOrgToken(
        marketItemSellPriceUSD.mul(10).div(100),
        tokenPrice,
        priceDecimals,
        tokenDecimals,
    );
    const sellerAmount = getUsdOrgToken(
        marketItemSellPriceUSD.mul(80).div(100),
        tokenPrice,
        priceDecimals,
        tokenDecimals,
    );
    const web3reAmount = sellpriceToken
        .sub(charityAmount)
        .sub(creatorAmount)
        .sub(sellerAmount);
    return [
        sellpriceToken,
        creatorAmount,
        charityAmount,
        sellerAmount,
        web3reAmount,
    ];
};

getCommissionResellCustodialWallet(parseEther("0.2"), 5, 89805572, 8, 18);
