import { BigNumber } from "ethers";
import { formatEther, parseEther } from "ethers/lib/utils";
const getTokenPrice = (tokenPrice: number, priceDecimals: number, tokenDecimals: number): BigNumber => {
    let maticPriceBig = BigNumber.from(tokenPrice);
    if (priceDecimals < tokenDecimals) {
        maticPriceBig = maticPriceBig.mul(BigNumber.from("10").pow(tokenDecimals - priceDecimals));
    } else if (priceDecimals > tokenDecimals) {
        maticPriceBig = maticPriceBig.mul(BigNumber.from("10").pow(priceDecimals - tokenDecimals));
    }
    return maticPriceBig;
};

const matchUsdWithTokenDecimals = (amount: BigNumber, decimals: number): BigNumber => {
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
    tokenDecimals: number
): BigNumber => {
    let e18 = BigNumber.from("1000000000000000000");
    let maticPriceBig = getTokenPrice(tokenPrice, priceDecimals, tokenDecimals);
    amount = matchUsdWithTokenDecimals(amount, tokenDecimals);
    let rate = amount.mul(e18).div(maticPriceBig);
    return rate.mul(102).div(100);
};

const getUsdOrgToken = (
    amount: BigNumber,
    tokenPrice: number,
    priceDecimals: number,
    tokenDecimals: number
): BigNumber => {
    let e18 = BigNumber.from("1000000000000000000");
    let maticPriceBig = getTokenPrice(tokenPrice, priceDecimals, tokenDecimals);
    amount = matchUsdWithTokenDecimals(amount, tokenDecimals);
    let rate = amount.mul(e18).div(maticPriceBig);
    return rate;
};

const getCommissionFirstTimeWithPhysical = (
    marketItemSellPriceUSD: BigNumber,
    marketItemReservePriceUSD: BigNumber,
    tokenPrice: number,
    priceDecimals: number,
    tokenDecimals: number
): [BigNumber, BigNumber, BigNumber, BigNumber] => {
    let sellpriceToken = getUsdToken(marketItemSellPriceUSD, tokenPrice, priceDecimals, tokenDecimals);
    let charityAmount = getUsdOrgToken(
        marketItemSellPriceUSD.sub(marketItemReservePriceUSD),
        tokenPrice,
        priceDecimals,
        tokenDecimals
    )
        .mul(80)
        .div(100)
        .add(getUsdOrgToken(marketItemReservePriceUSD, tokenPrice, priceDecimals, tokenDecimals).mul(20).div(100));
    let creatorAmount = getUsdOrgToken(
        marketItemReservePriceUSD.mul(65).div(100),
        tokenPrice,
        priceDecimals,
        tokenDecimals
    );
    let web3reAmount = sellpriceToken.sub(charityAmount).sub(creatorAmount);
    return [sellpriceToken, charityAmount, creatorAmount, web3reAmount];
};

const getCommissionFirstTimeWithoutPhysical = (
    marketItemSellPriceUSD: BigNumber,
    tokenPrice: number,
    priceDecimals: number,
    tokenDecimals: number
): [BigNumber, BigNumber, BigNumber, BigNumber] => {
    let sellpriceToken = getUsdToken(marketItemSellPriceUSD, tokenPrice, priceDecimals, tokenDecimals);
    let charityAmount = getUsdOrgToken(
        marketItemSellPriceUSD.mul(10).div(100),
        tokenPrice,
        priceDecimals,
        tokenDecimals
    );
    let creatorAmount = getUsdOrgToken(
        marketItemSellPriceUSD.mul(85).div(100),
        tokenPrice,
        priceDecimals,
        tokenDecimals
    );
    let web3reAmount = sellpriceToken.sub(charityAmount).sub(creatorAmount);
    return [sellpriceToken, charityAmount, creatorAmount, web3reAmount];
};

const getCommissionResellCustodialWallet = (
    marketItemSellPriceUSD: BigNumber,
    royaltyPercent: number,
    tokenPrice: number,
    priceDecimals: number,
    tokenDecimals: number
): [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber] => {
    let sellpriceToken = getUsdToken(marketItemSellPriceUSD, tokenPrice, priceDecimals, tokenDecimals);
    let creatorAmount = BigNumber.from(0);
    if (royaltyPercent > 2) {
        creatorAmount = getUsdOrgToken(
            marketItemSellPriceUSD.mul(2).div(100),
            tokenPrice,
            priceDecimals,
            tokenDecimals
        );
    }
    let charityAmount = getUsdOrgToken(
        marketItemSellPriceUSD.mul(10).div(100),
        tokenPrice,
        priceDecimals,
        tokenDecimals
    );
    let sellerAmount = getUsdOrgToken(
        marketItemSellPriceUSD.mul(80).div(100),
        tokenPrice,
        priceDecimals,
        tokenDecimals
    );
    let web3reAmount = sellpriceToken.sub(charityAmount).sub(creatorAmount).sub(sellerAmount);
    return [sellpriceToken, creatorAmount, charityAmount, sellerAmount, web3reAmount];
};

const getCommissionResellNonCustodialWallet = (
    marketItemSellPriceUSD: BigNumber,
    tokenPrice: number,
    priceDecimals: number,
    tokenDecimals: number
): [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber] => {
    let sellpriceToken = getUsdToken(marketItemSellPriceUSD, tokenPrice, priceDecimals, tokenDecimals);
    let creatorAmount = getUsdOrgToken(
        marketItemSellPriceUSD.mul(5).div(100),
        tokenPrice,
        priceDecimals,
        tokenDecimals
    );
    let charityAmount = getUsdOrgToken(
        marketItemSellPriceUSD.mul(10).div(100),
        tokenPrice,
        priceDecimals,
        tokenDecimals
    );
    let sellerAmount = getUsdOrgToken(
        marketItemSellPriceUSD.mul(80).div(100),
        tokenPrice,
        priceDecimals,
        tokenDecimals
    );
    let web3reAmount = sellpriceToken.sub(charityAmount).sub(creatorAmount).sub(sellerAmount);
    return [sellpriceToken, creatorAmount, charityAmount, sellerAmount, web3reAmount];
};

console.log(formatEther(getUsdToken(BigNumber.from("200000000000000000"), 89805572, 8, 18)));
const result = getCommissionResellCustodialWallet(parseEther("0.2"), 5, 89805572, 8, 18);
console.log(formatEther(result[0]));
console.log(formatEther(result[1]));
console.log(formatEther(result[2]));
console.log(formatEther(result[3]));
