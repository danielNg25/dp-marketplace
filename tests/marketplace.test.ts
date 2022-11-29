import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import { DPMarketplaceC1__factory } from "../typechain-types";

import { DPMarketplaceC1 } from "../typechain-types";

import { parseEther } from "ethers/lib/utils";

describe("Marketplace", () => {
    const PERCENT_BASIS_POINT = BigNumber.from("10000");
    const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
    const MATIC_PRICE = 83880585;

    let listingPrice: BigNumber;
    let listingPriceSecondary: BigNumber;

    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let charity: SignerWithAddress;
    let web3re: SignerWithAddress;
    let creator: SignerWithAddress;

    let marketplace: DPMarketplaceC1;

    beforeEach(async () => {
        const accounts: SignerWithAddress[] = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        charity = accounts[3];
        web3re = accounts[4];
        creator = accounts[5];

        const Marketplace: DPMarketplaceC1__factory = await ethers.getContractFactory("DPMarketplaceC1");

        marketplace = await Marketplace.deploy(owner.address, charity.address, web3re.address);

        listingPrice = await marketplace.getListingPrice();
        listingPriceSecondary = await marketplace.getListingPriceSecondary();
    });

    describe("createToken", () => {
        it("Should createToken successfully", async () => {
            await marketplace.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                1000,
                500,
                parseEther("0.0001"),
                { value: listingPrice }
            );

            let marketItem = await marketplace.getMarketItem(1);
            expect(marketItem.tokenId).to.equal(1);
            expect(marketItem.seller).to.equal(owner.address);
            expect(marketItem.owner).to.equal(marketplace.address);
            expect(marketItem.c_Wallet).to.equal(creator.address);
            expect(marketItem.isCustodianWallet).to.be.true;
            expect(marketItem.royalty).to.equal(5);
            expect(marketItem.withPhysical).to.be.true;
            expect(marketItem.sellpriceUSD).to.equal(1000);
            expect(marketItem.reservePriceUSD).to.equal(500);
            expect(marketItem.price).to.equal(parseEther("0.0001"));
            expect(marketItem.initialList).to.be.true;
            expect(marketItem.sold).to.be.false;
        });
    });

    describe("createMarketSale first time - initialList: true", () => {
        it("Should createMarketSale first time successfully - withPhysical: true", async () => {
            await marketplace.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                1000,
                500,
                parseEther("0.0001"),
                { value: listingPrice }
            );
            let marketItem = await marketplace.getMarketItem(1);
            let sellpriceUSD = getUsdMatic(marketItem.sellpriceUSD, MATIC_PRICE);
            let charityAmount = getUsdOrgMatic(marketItem.sellpriceUSD.sub(marketItem.reservePriceUSD), MATIC_PRICE)
                .mul(80)
                .div(100)
                .add(getUsdOrgMatic(marketItem.reservePriceUSD, MATIC_PRICE).mul(20).div(100));
            let creatorAmount = getUsdOrgMatic(marketItem.reservePriceUSD.mul(65).div(100), MATIC_PRICE);
            let web3reAmount = sellpriceUSD.sub(charityAmount).sub(charityAmount);
            expect(
                await marketplace.connect(user1).createMarketSale(1, { value: sellpriceUSD.add(1) })
            ).to.changeEtherBalances([charity, creator, web3re], [charityAmount, creatorAmount, web3reAmount]);

            marketItem = await marketplace.getMarketItem(1);
            expect(await marketplace.ownerOf(1)).to.equal(user1.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.owner).to.equal(user1.address);
            expect(marketItem.sellpriceUSD).to.equal(1000);
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });

        it("Should createMarketSale first time successfully - withPhysical: false", async () => {
            await marketplace.createToken(
                "google.com",
                creator.address,
                true,
                5,
                false,
                1000,
                500,
                parseEther("0.0001"),
                { value: listingPrice }
            );
            let marketItem = await marketplace.getMarketItem(1);
            let sellpriceUSD = getUsdMatic(marketItem.sellpriceUSD, MATIC_PRICE);
            let charityAmount = getUsdOrgMatic(marketItem.sellpriceUSD.mul(10).div(100), MATIC_PRICE);
            let creatorAmount = getUsdOrgMatic(marketItem.reservePriceUSD.mul(85).div(100), MATIC_PRICE);
            let web3reAmount = sellpriceUSD.sub(charityAmount).sub(charityAmount);
            expect(
                await marketplace.connect(user1).createMarketSale(1, { value: sellpriceUSD.add(1) })
            ).to.changeEtherBalances([charity, creator, web3re], [charityAmount, creatorAmount, web3reAmount]);
            expect(await marketplace.ownerOf(1)).to.equal(user1.address);

            marketItem = await marketplace.getMarketItem(1);
            expect(await marketplace.ownerOf(1)).to.equal(user1.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.owner).to.equal(user1.address);
            expect(marketItem.sellpriceUSD).to.equal(1000);
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });
    });

    describe("resellToken", () => {
        beforeEach(async () => {
            await marketplace.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                1000,
                500,
                parseEther("0.0001"),
                { value: listingPrice }
            );
            let marketItem = await marketplace.getMarketItem(1);
            let sellpriceUSD = getUsdMatic(marketItem.sellpriceUSD, MATIC_PRICE);
            await marketplace.connect(user1).createMarketSale(1, { value: sellpriceUSD.add(1) });
        });

        it("Should resellToken successfully", async () => {
            await marketplace
                .connect(user1)
                .resellToken(1, 2000, parseEther("0.0011"), false, { value: listingPriceSecondary });

            let marketItem = await marketplace.getMarketItem(1);
            expect(marketItem.seller).to.equal(user1.address);
            expect(marketItem.owner).to.equal(marketplace.address);
            expect(marketItem.c_Wallet).to.equal(creator.address);
            expect(marketItem.isCustodianWallet).to.be.true;
            expect(marketItem.royalty).to.equal(5);
            expect(marketItem.withPhysical).to.be.true;
            expect(marketItem.sellpriceUSD).to.equal(2000);
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.price).to.equal(parseEther("0.0011"));
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.false;
        });

        it("Should resellToken - unlist successfully", async () => {
            await marketplace
                .connect(user1)
                .resellToken(1, 2000, parseEther("0.0011"), false, { value: listingPriceSecondary });

            await marketplace.connect(user1).resellToken(1, 2000, parseEther("0.0011"), true);

            let marketItem = await marketplace.getMarketItem(1);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.owner).to.equal(user1.address);
            expect(marketItem.c_Wallet).to.equal(creator.address);
            expect(marketItem.isCustodianWallet).to.be.true;
            expect(marketItem.royalty).to.equal(5);
            expect(marketItem.withPhysical).to.be.true;
            expect(marketItem.sellpriceUSD).to.equal(2000);
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.price).to.equal(parseEther("0.0011"));
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });
    });

    describe("createMarketSale after resell - initialList: false - isCustodianWallet: true", () => {
        beforeEach(async () => {
            await marketplace.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                1000,
                500,
                parseEther("0.0001"),
                { value: listingPrice }
            );
            let marketItem = await marketplace.getMarketItem(1);
            let sellpriceUSD = getUsdMatic(marketItem.sellpriceUSD, MATIC_PRICE);
            await marketplace.connect(user1).createMarketSale(1, { value: sellpriceUSD.add(1) });
            await marketplace
                .connect(user1)
                .resellToken(1, 2000, parseEther("0.0011"), false, { value: listingPriceSecondary });
        });

        it("Should createMarketSale after resell successfully", async () => {
            let marketItem = await marketplace.getMarketItem(1);
            let sellpriceUSD = getUsdMatic(marketItem.sellpriceUSD, MATIC_PRICE);
            let creatorAmount = getUsdOrgMatic(marketItem.sellpriceUSD.mul(2).div(100), MATIC_PRICE);
            let charityAmount = getUsdOrgMatic(marketItem.sellpriceUSD.mul(10).div(100), MATIC_PRICE);
            let sellerAmount = getUsdOrgMatic(marketItem.sellpriceUSD.mul(80).div(100), MATIC_PRICE);
            let web3reAmount = sellpriceUSD.sub(charityAmount).sub(charityAmount).sub(sellerAmount);
            expect(
                await marketplace.connect(user2).createMarketSale(1, { value: sellpriceUSD.add(1) })
            ).to.changeEtherBalances(
                [user1, charity, creator, web3re],
                [sellerAmount, charityAmount, creatorAmount, web3reAmount]
            );

            expect(await marketplace.ownerOf(1)).to.equal(user2.address);

            marketItem = await marketplace.getMarketItem(1);
            expect(await marketplace.ownerOf(1)).to.equal(user2.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.owner).to.equal(user2.address);
            expect(marketItem.sellpriceUSD).to.equal(2000);
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });

        it("Should createMarketSale after resell successfully - royalty percent < 2", async () => {
            await marketplace.createToken(
                "google.com",
                creator.address,
                true,
                1,
                true,
                1000,
                500,
                parseEther("0.0001"),
                { value: listingPrice }
            );
            let marketItem = await marketplace.getMarketItem(2);
            let sellpriceUSD = getUsdMatic(marketItem.sellpriceUSD, MATIC_PRICE);
            await marketplace.connect(user1).createMarketSale(2, { value: sellpriceUSD.add(1) });
            await marketplace
                .connect(user1)
                .resellToken(2, 2000, parseEther("0.0011"), false, { value: listingPriceSecondary });

            marketItem = await marketplace.getMarketItem(2);
            sellpriceUSD = getUsdMatic(marketItem.sellpriceUSD, MATIC_PRICE);
            let creatorAmount = 0;
            let charityAmount = getUsdOrgMatic(marketItem.sellpriceUSD.mul(10).div(100), MATIC_PRICE);
            let sellerAmount = getUsdOrgMatic(marketItem.sellpriceUSD.mul(80).div(100), MATIC_PRICE);
            let web3reAmount = sellpriceUSD.sub(charityAmount).sub(charityAmount).sub(sellerAmount);
            expect(
                await marketplace.connect(user2).createMarketSale(2, { value: sellpriceUSD.add(1) })
            ).to.changeEtherBalances(
                [user1, charity, creator, web3re],
                [sellerAmount, charityAmount, creatorAmount, web3reAmount]
            );

            expect(await marketplace.ownerOf(2)).to.equal(user2.address);

            marketItem = await marketplace.getMarketItem(2);
            expect(await marketplace.ownerOf(2)).to.equal(user2.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.owner).to.equal(user2.address);
            expect(marketItem.sellpriceUSD).to.equal(2000);
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });
    });

    describe("createMarketSale after resell - initialList: false - isCustodianWallet: false", () => {
        beforeEach(async () => {
            await marketplace.createToken(
                "google.com",
                creator.address,
                false,
                5,
                true,
                1000,
                500,
                parseEther("0.0001"),
                { value: listingPrice }
            );
            let marketItem = await marketplace.getMarketItem(1);
            let sellpriceUSD = getUsdMatic(marketItem.sellpriceUSD, MATIC_PRICE);
            await marketplace.connect(user1).createMarketSale(1, { value: sellpriceUSD.add(1) });
            await marketplace
                .connect(user1)
                .resellToken(1, 2000, parseEther("0.0011"), false, { value: listingPriceSecondary });
        });
        it("Should createMarketSale after resell successfully", async () => {
            let marketItem = await marketplace.getMarketItem(1);
            let sellpriceUSD = getUsdMatic(marketItem.sellpriceUSD, MATIC_PRICE);
            let creatorAmount = getUsdOrgMatic(marketItem.sellpriceUSD.mul(5).div(100), MATIC_PRICE);
            let charityAmount = getUsdOrgMatic(marketItem.sellpriceUSD.mul(10).div(100), MATIC_PRICE);
            let sellerAmount = getUsdOrgMatic(marketItem.sellpriceUSD.mul(80).div(100), MATIC_PRICE);
            let web3reAmount = sellpriceUSD.sub(charityAmount).sub(charityAmount).sub(sellerAmount);
            expect(
                await marketplace.connect(user2).createMarketSale(1, { value: sellpriceUSD.add(1) })
            ).to.changeEtherBalances(
                [user1, charity, creator, web3re],
                [sellerAmount, charityAmount, creatorAmount, web3reAmount]
            );

            expect(await marketplace.ownerOf(1)).to.equal(user2.address);

            marketItem = await marketplace.getMarketItem(1);
            expect(await marketplace.ownerOf(1)).to.equal(user2.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.owner).to.equal(user2.address);
            expect(marketItem.sellpriceUSD).to.equal(2000);
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });
    });
});

const getUsdMatic = (amount: BigNumber, maticPrice: number): BigNumber => {
    let e18 = BigNumber.from("1000000000000000000");
    let maticPriceBig = BigNumber.from(maticPrice);
    let adjust_price = maticPriceBig.mul(e18);
    let usd = amount.mul(e18);
    let rate = usd.mul(e18).div(adjust_price);
    return rate.mul(102).div(100);
};

const getUsdOrgMatic = (amount: BigNumber, maticPrice: number): BigNumber => {
    let e18 = BigNumber.from("1000000000000000000");
    let maticPriceBig = BigNumber.from(maticPrice);
    let adjust_price = maticPriceBig.mul(e18);
    let usd = amount.mul(e18);
    let rate = usd.mul(e18).div(adjust_price);
    return rate;
};
