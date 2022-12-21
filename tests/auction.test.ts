import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import { DPAuction__factory } from "../typechain-types";
import { DPNFT__factory } from "../typechain-types";
import { AggregatorV3Test__factory } from "../typechain-types";
import { MockERC20Token__factory } from "../typechain-types";
import { DPFeeManager__factory } from "../typechain-types";

import { DPFeeManager } from "../typechain-types";
import { DPAuction } from "../typechain-types";
import { DPNFT } from "../typechain-types";
import { AggregatorV3Test } from "../typechain-types";
import { MockERC20Token } from "../typechain-types";

import { parseEther } from "ethers/lib/utils";

describe("Auction", () => {
    const PERCENT_BASIS_POINT = BigNumber.from("10000");
    const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
    const TOKEN_PRICE = 88942317;
    const TOKEN_DECIMALS_24 = 24;
    const TOKEN_DECIMALS_18 = 18;
    const PRICE_FEED_DECIMALS_8 = 8;

    let listingPrice: BigNumber;
    let listingPriceSecondary: BigNumber;

    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let minter: SignerWithAddress;
    let charity: SignerWithAddress;
    let web3re: SignerWithAddress;
    let creator: SignerWithAddress;

    let feeManager: DPFeeManager;
    let auction: DPAuction;
    let nft: DPNFT;
    let aggregatorV3Test: AggregatorV3Test;
    let mockERC20Token_24Decimals: MockERC20Token;
    let mockERC20Token_18Decimals: MockERC20Token;

    beforeEach(async () => {
        const accounts: SignerWithAddress[] = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        charity = accounts[3];
        web3re = accounts[4];
        creator = accounts[5];
        minter = accounts[6];

        const DPNFT: DPNFT__factory = await ethers.getContractFactory("DPNFT");
        const Auction: DPAuction__factory = await ethers.getContractFactory("DPAuction");
        const AggregatorV3Test: AggregatorV3Test__factory = await ethers.getContractFactory("AggregatorV3Test");
        const MockERC20Token: MockERC20Token__factory = await ethers.getContractFactory("MockERC20Token");
        const FeeManager: DPFeeManager__factory = await ethers.getContractFactory("DPFeeManager");

        feeManager = await FeeManager.deploy(charity.address, web3re.address);
        nft = await DPNFT.deploy();
        auction = await Auction.deploy(owner.address, nft.address, feeManager.address);

        aggregatorV3Test = await AggregatorV3Test.deploy(TOKEN_PRICE, PRICE_FEED_DECIMALS_8);
        mockERC20Token_24Decimals = await MockERC20Token.deploy(TOKEN_DECIMALS_24);
        mockERC20Token_18Decimals = await MockERC20Token.deploy(TOKEN_DECIMALS_18);

        await nft.setAdministratorStatus(auction.address, true);

        listingPrice = await feeManager.getListingPrice();
        listingPriceSecondary = await feeManager.getListingPriceSecondary();

        await feeManager.setPaymentMethod(ADDRESS_ZERO, aggregatorV3Test.address);
        await feeManager.setPaymentMethod(mockERC20Token_24Decimals.address, aggregatorV3Test.address);

        await mockERC20Token_18Decimals.mint(user1.address, parseEther("10"));
        await mockERC20Token_18Decimals.mint(user2.address, parseEther("10"));
        await mockERC20Token_24Decimals.mint(user1.address, parseEther("1000000000"));
        await mockERC20Token_24Decimals.mint(user2.address, parseEther("1000000000"));

        await mockERC20Token_18Decimals.connect(user1).approve(auction.address, parseEther("1000"));
        await mockERC20Token_18Decimals.connect(user2).approve(auction.address, parseEther("1000"));
        await mockERC20Token_24Decimals.connect(user1).approve(auction.address, parseEther("100000000000"));
        await mockERC20Token_24Decimals.connect(user2).approve(auction.address, parseEther("100000000000"));
    });

    describe("Deployment", () => {
        it("Should deploy successfully", async () => {
            expect(await auction.NFT()).to.equal(nft.address);
            expect(await auction.FeeManager()).to.equal(feeManager.address);
        });
    });

    describe("createToken", () => {
        let timestamp: number;
        beforeEach(async () => {
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
        });
        it("Should failed - Start price must be >= reserve price", async () => {
            await expect(
                auction.createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.05"),
                    parseEther("0.1"),
                    timestamp,
                    timestamp + 86400,
                    parseEther("0.0001"),
                    { value: listingPrice }
                )
            ).to.revertedWith("Start price must be >= reserve price");
        });

        it("Should failed - Price must be at least 1 wei", async () => {
            await expect(
                auction.createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.1"),
                    parseEther("0.05"),
                    timestamp,
                    timestamp + 86400,
                    0,
                    { value: listingPrice }
                )
            ).to.revertedWith("Price must be at least 1 wei");
        });

        it("Should failed - Value must be = listing price", async () => {
            await expect(
                auction.createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.1"),
                    parseEther("0.05"),
                    timestamp,
                    timestamp + 86400,
                    parseEther("0.0001"),
                    { value: listingPrice.sub(1) }
                )
            ).to.revertedWith("Value must be = listing price");
        });

        it("Should createToken successfully", async () => {
            await auction.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice }
            );
        });
    });

    describe("createExternalMintedItem", () => {
        let timestamp: number;
        beforeEach(async () => {
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            await nft.setAdministratorStatus(minter.address, true);
            await nft.connect(minter).mint(user1.address, "");
        });

        it("Should failed - Only item owner", async () => {
            await expect(
                auction
                    .connect(user2)
                    .createExternalMintedItem(
                        1,
                        creator.address,
                        true,
                        5,
                        parseEther("0.1"),
                        parseEther("0.001"),
                        timestamp,
                        timestamp + 86400,
                        { value: listingPriceSecondary }
                    )
            ).to.revertedWith("Only item owner");
        });

        it("Should failed - Value must be = Secondary list price", async () => {
            await expect(
                auction
                    .connect(user1)
                    .createExternalMintedItem(
                        1,
                        creator.address,
                        true,
                        5,
                        parseEther("0.1"),
                        parseEther("0.001"),
                        timestamp,
                        timestamp + 86400,
                        { value: listingPriceSecondary.sub(1) }
                    )
            ).to.revertedWith("Value must be = Secondary list price");
        });

        it("Should failed - Item already listed", async () => {
            await auction.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice }
            );

            await auction.connect(owner).transferNFTTo(auction.address, user1.address, 2);

            await expect(
                auction
                    .connect(user1)
                    .createExternalMintedItem(
                        2,
                        creator.address,
                        true,
                        5,
                        parseEther("0.1"),
                        parseEther("0.001"),
                        timestamp,
                        timestamp + 86400,
                        { value: listingPriceSecondary }
                    )
            ).to.revertedWith("Item already listed");
        });

        it("Should createExternalMintedAuctionToken successfully", async () => {
            await auction
                .connect(user1)
                .createExternalMintedItem(
                    1,
                    creator.address,
                    true,
                    5,
                    parseEther("0.1"),
                    parseEther("0.001"),
                    timestamp,
                    timestamp + 86400,
                    { value: listingPriceSecondary }
                );
        });
    });
});

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
    let maticPriceBig = getTokenPrice(tokenPrice, priceDecimals, tokenDecimals);
    amount = matchUsdWithTokenDecimals(amount, tokenDecimals);
    let rate = amount.mul(BigNumber.from("10").pow(tokenDecimals)).div(maticPriceBig);
    return rate.mul(102).div(100);
};

const getUsdOrgToken = (
    amount: BigNumber,
    tokenPrice: number,
    priceDecimals: number,
    tokenDecimals: number
): BigNumber => {
    let maticPriceBig = getTokenPrice(tokenPrice, priceDecimals, tokenDecimals);
    amount = matchUsdWithTokenDecimals(amount, tokenDecimals);
    let rate = amount.mul(BigNumber.from("10").pow(tokenDecimals)).div(maticPriceBig);
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
