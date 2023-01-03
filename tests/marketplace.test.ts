import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import { DPMarketplaceC1__factory } from "../typechain-types";
import { DPNFT__factory } from "../typechain-types";
import { AggregatorV3Test__factory } from "../typechain-types";
import { MockERC20Token__factory } from "../typechain-types";
import { DPFeeManager__factory } from "../typechain-types";

import { DPFeeManager } from "../typechain-types";
import { DPMarketplaceC1 } from "../typechain-types";
import { DPNFT } from "../typechain-types";
import { AggregatorV3Test } from "../typechain-types";
import { MockERC20Token } from "../typechain-types";

import { parseEther } from "ethers/lib/utils";

describe("Marketplace", () => {
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
    let marketplace: DPMarketplaceC1;
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
        const Marketplace: DPMarketplaceC1__factory =
            await ethers.getContractFactory("DPMarketplaceC1");
        const AggregatorV3Test: AggregatorV3Test__factory =
            await ethers.getContractFactory("AggregatorV3Test");
        const MockERC20Token: MockERC20Token__factory =
            await ethers.getContractFactory("MockERC20Token");
        const FeeManager: DPFeeManager__factory =
            await ethers.getContractFactory("DPFeeManager");

        feeManager = await FeeManager.deploy(charity.address, web3re.address);
        nft = await DPNFT.deploy();
        marketplace = await Marketplace.deploy(
            owner.address,
            nft.address,
            feeManager.address,
        );

        aggregatorV3Test = await AggregatorV3Test.deploy(
            TOKEN_PRICE,
            PRICE_FEED_DECIMALS_8,
        );
        mockERC20Token_24Decimals = await MockERC20Token.deploy(
            TOKEN_DECIMALS_24,
        );
        mockERC20Token_18Decimals = await MockERC20Token.deploy(
            TOKEN_DECIMALS_18,
        );

        await nft.setAdministratorStatus(marketplace.address, true);

        listingPrice = await feeManager.getListingPrice();
        listingPriceSecondary = await feeManager.getListingPriceSecondary();

        await feeManager.setPaymentMethod(
            ADDRESS_ZERO,
            aggregatorV3Test.address,
        );
        await feeManager.setPaymentMethod(
            mockERC20Token_24Decimals.address,
            aggregatorV3Test.address,
        );

        await mockERC20Token_18Decimals.mint(user1.address, parseEther("10"));
        await mockERC20Token_18Decimals.mint(user2.address, parseEther("10"));
        await mockERC20Token_24Decimals.mint(
            user1.address,
            parseEther("1000000000"),
        );
        await mockERC20Token_24Decimals.mint(
            user2.address,
            parseEther("1000000000"),
        );

        await mockERC20Token_18Decimals
            .connect(user1)
            .approve(marketplace.address, parseEther("1000"));
        await mockERC20Token_18Decimals
            .connect(user2)
            .approve(marketplace.address, parseEther("1000"));
        await mockERC20Token_24Decimals
            .connect(user1)
            .approve(marketplace.address, parseEther("100000000000"));
        await mockERC20Token_24Decimals
            .connect(user2)
            .approve(marketplace.address, parseEther("100000000000"));
    });

    describe("createToken", () => {
        it("Should failed - Price must be >= reserve price", async () => {
            await expect(
                marketplace.createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.05"),
                    parseEther("0.1"),
                    parseEther("0.0001"),
                    {
                        value: listingPrice,
                    },
                ),
            ).to.revertedWith("Price must be >= reserve price");
        });

        it("Should failed - Price must be at least 1 wei", async () => {
            await expect(
                marketplace.createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.1"),
                    parseEther("0.05"),
                    parseEther("0"),
                    {
                        value: listingPrice,
                    },
                ),
            ).to.revertedWith("Price must be at least 1 wei");
        });

        it("Should failed - Price must be = listing price", async () => {
            await expect(
                marketplace.createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.1"),
                    parseEther("0.05"),
                    parseEther("0.0001"),
                    {
                        value: listingPrice.add(1),
                    },
                ),
            ).to.revertedWith("Price must be = listing price");
        });

        it("Should createToken successfully", async () => {
            await marketplace.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                parseEther("0.1"),
                parseEther("0.05"),
                parseEther("0.0001"),
                { value: listingPrice },
            );

            const marketItem = await marketplace.getMarketItem(1);
            expect(marketItem.tokenId).to.equal(1);
            expect(marketItem.seller).to.equal(owner.address);
            expect(marketItem.creatorWallet).to.equal(creator.address);
            expect(marketItem.isCustodianWallet).to.be.true;
            expect(marketItem.royalty).to.equal(5);
            expect(marketItem.withPhysical).to.be.true;
            expect(marketItem.sellpriceUSD).to.equal(parseEther("0.1"));
            expect(marketItem.reservePriceUSD).to.equal(parseEther("0.05"));
            expect(marketItem.price).to.equal(parseEther("0.0001"));
            expect(marketItem.initialList).to.be.true;
            expect(marketItem.sold).to.be.false;
        });
    });

    describe("createMarketItem from external mint", () => {
        beforeEach(async () => {
            await nft.setAdministratorStatus(minter.address, true);
            await nft.connect(minter).mint(user1.address, "");
            await marketplace.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                parseEther("0.1"),
                parseEther("0.05"),
                parseEther("0.0001"),
                { value: listingPrice },
            );
        });

        it("Should failed - Only item o", async () => {
            await expect(
                marketplace
                    .connect(user2)
                    .createExternalMintedItem(
                        1,
                        creator.address,
                        true,
                        5,
                        1000,
                        parseEther("0.0001"),
                        {
                            value: listingPriceSecondary,
                        },
                    ),
            ).to.revertedWith("Only item o");
        });

        it("Should failed - Price must be = Sec list price", async () => {
            await expect(
                marketplace
                    .connect(user1)
                    .createExternalMintedItem(
                        1,
                        creator.address,
                        true,
                        5,
                        1000,
                        parseEther("0.0001"),
                        {
                            value: listingPriceSecondary.sub(1),
                        },
                    ),
            ).to.revertedWith("Price must be = Sec list price");
        });

        it("Should create successfully", async () => {
            await marketplace
                .connect(user1)
                .createExternalMintedItem(
                    1,
                    creator.address,
                    true,
                    5,
                    parseEther("0.1"),
                    parseEther("0.0001"),
                    {
                        value: listingPriceSecondary,
                    },
                );

            const marketItem = await marketplace.getMarketItem(1);
            expect(marketItem.tokenId).to.equal(1);
            expect(marketItem.seller).to.equal(user1.address);
            expect(marketItem.creatorWallet).to.equal(creator.address);
            expect(marketItem.isCustodianWallet).to.be.true;
            expect(marketItem.royalty).to.equal(5);
            expect(marketItem.withPhysical).to.be.false;
            expect(marketItem.sellpriceUSD).to.equal(parseEther("0.1"));
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.price).to.equal(parseEther("0.0001"));
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.false;
        });
    });

    describe("createMarketSale first time - initialList: true - withPhysical: true", () => {
        let marketItem: DPMarketplaceC1.MarketItemStructOutput;
        let sellpriceToken: BigNumber;
        let charityAmount: BigNumber;
        let creatorAmount: BigNumber;
        let web3reAmount: BigNumber;
        beforeEach(async () => {
            await marketplace.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                parseEther("0.1"),
                parseEther("0.05"),
                parseEther("0.0001"),
                { value: listingPrice },
            );
            marketItem = await marketplace.getMarketItem(1);
            [sellpriceToken, charityAmount, creatorAmount, web3reAmount] =
                getCommissionFirstTimeWithPhysical(
                    marketItem.sellpriceUSD,
                    marketItem.reservePriceUSD,
                    TOKEN_PRICE,
                    PRICE_FEED_DECIMALS_8,
                    TOKEN_DECIMALS_18,
                );
        });

        it("Should failed - missing asking price", async () => {
            await expect(
                marketplace.connect(user1).createMarketSale(1, ADDRESS_ZERO, {
                    value: sellpriceToken.sub(1),
                }),
            ).to.revertedWith("missing asking price");
        });

        it("Should failed - Payment token not supported", async () => {
            await expect(
                marketplace
                    .connect(user1)
                    .createMarketSale(1, mockERC20Token_18Decimals.address, {
                        value: sellpriceToken.sub(1),
                    }),
            ).to.revertedWith("Payment token not supported");
        });

        it("Should createMarketSale successfully", async () => {
            expect(
                (await marketplace.getUsdTokenPrice(1, ADDRESS_ZERO))[1],
            ).to.equal(sellpriceToken);
            await expect(() =>
                marketplace.connect(user1).createMarketSale(1, ADDRESS_ZERO, {
                    value: sellpriceToken,
                }),
            ).to.changeEtherBalances(
                [charity, creator, web3re],
                [charityAmount, creatorAmount, web3reAmount],
            );

            marketItem = await marketplace.getMarketItem(1);
            expect(await nft.ownerOf(1)).to.equal(user1.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.sellpriceUSD).to.equal(parseEther("0.1"));
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });

        it("Should createMarketSale successfully - paymentMethod: ERC20Token - decimals 18", async () => {
            await feeManager.setPaymentMethod(
                mockERC20Token_18Decimals.address,
                aggregatorV3Test.address,
            );
            await expect(() =>
                marketplace
                    .connect(user1)
                    .createMarketSale(1, mockERC20Token_18Decimals.address),
            ).to.changeTokenBalances(
                mockERC20Token_18Decimals,
                [user1, charity, creator, web3re],
                [
                    sellpriceToken.mul(-1),
                    charityAmount,
                    creatorAmount,
                    web3reAmount,
                ],
            );

            marketItem = await marketplace.getMarketItem(1);
            expect(await nft.ownerOf(1)).to.equal(user1.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.sellpriceUSD).to.equal(parseEther("0.1"));
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });

        it("Should createMarketSale successfully - paymentMethod: ERC20Token - decimals 24", async () => {
            [sellpriceToken, charityAmount, creatorAmount, web3reAmount] =
                getCommissionFirstTimeWithPhysical(
                    marketItem.sellpriceUSD,
                    marketItem.reservePriceUSD,
                    TOKEN_PRICE,
                    PRICE_FEED_DECIMALS_8,
                    TOKEN_DECIMALS_24,
                );
            await expect(() =>
                marketplace
                    .connect(user1)
                    .createMarketSale(1, mockERC20Token_24Decimals.address),
            ).to.changeTokenBalances(
                mockERC20Token_24Decimals,
                [user1, charity, creator, web3re],
                [
                    sellpriceToken.mul(-1),
                    charityAmount,
                    creatorAmount,
                    web3reAmount,
                ],
            );

            marketItem = await marketplace.getMarketItem(1);
            expect(await nft.ownerOf(1)).to.equal(user1.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.sellpriceUSD).to.equal(parseEther("0.1"));
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });

        it("Should createMarketSale successfully - reserve = sell price", async () => {
            await marketplace.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                parseEther("0.1"),
                parseEther("0.1"),
                parseEther("0.0001"),
                { value: listingPrice },
            );
            marketItem = await marketplace.getMarketItem(2);
            [sellpriceToken, charityAmount, creatorAmount, web3reAmount] =
                getCommissionFirstTimeWithPhysical(
                    marketItem.sellpriceUSD,
                    marketItem.reservePriceUSD,
                    TOKEN_PRICE,
                    PRICE_FEED_DECIMALS_8,
                    TOKEN_DECIMALS_18,
                );

            expect(
                (await marketplace.getUsdTokenPrice(2, ADDRESS_ZERO))[1],
            ).to.equal(sellpriceToken);
            await expect(() =>
                marketplace.connect(user1).createMarketSale(2, ADDRESS_ZERO, {
                    value: sellpriceToken.add(parseEther("0.01")),
                }),
            ).to.changeEtherBalances(
                [user1, charity, creator, web3re],
                [
                    sellpriceToken.mul(-1),
                    charityAmount,
                    creatorAmount,
                    web3reAmount,
                ],
            );

            marketItem = await marketplace.getMarketItem(2);
            expect(await nft.ownerOf(2)).to.equal(user1.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.sellpriceUSD).to.equal(parseEther("0.1"));
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });
    });

    describe("createMarketSale first time - initialList: true - withPhysical: false", () => {
        let marketItem;
        let sellpriceToken: BigNumber;
        let charityAmount: BigNumber;
        let creatorAmount: BigNumber;
        let web3reAmount: BigNumber;
        beforeEach(async () => {
            await marketplace.createToken(
                "google.com",
                creator.address,
                true,
                5,
                false,
                parseEther("0.1"),
                parseEther("0.05"),
                parseEther("0.0001"),
                { value: listingPrice },
            );
            marketItem = await marketplace.getMarketItem(1);
            [sellpriceToken, charityAmount, creatorAmount, web3reAmount] =
                getCommissionFirstTimeWithPhysical(
                    marketItem.sellpriceUSD,
                    marketItem.reservePriceUSD,
                    TOKEN_PRICE,
                    PRICE_FEED_DECIMALS_8,
                    TOKEN_DECIMALS_18,
                );
        });

        it("Should failed - missing asking price", async () => {
            await expect(
                marketplace.connect(user1).createMarketSale(1, ADDRESS_ZERO, {
                    value: sellpriceToken.sub(1),
                }),
            ).to.revertedWith("missing asking price");
        });

        it("Should createMarketSale successfully", async () => {
            marketItem = await marketplace.getMarketItem(1);
            [sellpriceToken, charityAmount, creatorAmount, web3reAmount] =
                getCommissionFirstTimeWithoutPhysical(
                    marketItem.sellpriceUSD,
                    TOKEN_PRICE,
                    PRICE_FEED_DECIMALS_8,
                    TOKEN_DECIMALS_18,
                );
            await expect(() =>
                marketplace.connect(user1).createMarketSale(1, ADDRESS_ZERO, {
                    value: sellpriceToken,
                }),
            ).to.changeEtherBalances(
                [charity, creator, web3re],
                [charityAmount, creatorAmount, web3reAmount],
            );
            expect(await nft.ownerOf(1)).to.equal(user1.address);

            marketItem = await marketplace.getMarketItem(1);
            expect(await nft.ownerOf(1)).to.equal(user1.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.sellpriceUSD).to.equal(parseEther("0.1"));
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });

        it("Should failed createExternalMintedItem - Item already listed", async () => {
            marketItem = await marketplace.getMarketItem(1);
            [sellpriceToken, charityAmount, creatorAmount, web3reAmount] =
                getCommissionFirstTimeWithoutPhysical(
                    marketItem.sellpriceUSD,
                    TOKEN_PRICE,
                    PRICE_FEED_DECIMALS_8,
                    TOKEN_DECIMALS_18,
                );
            await marketplace
                .connect(user1)
                .createMarketSale(1, ADDRESS_ZERO, { value: sellpriceToken });

            await expect(
                marketplace
                    .connect(user1)
                    .createExternalMintedItem(
                        1,
                        creator.address,
                        true,
                        5,
                        1000,
                        parseEther("0.0001"),
                        {
                            value: listingPriceSecondary,
                        },
                    ),
            ).to.revertedWith("Item already listed");
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
                parseEther("0.1"),
                parseEther("0.05"),
                parseEther("0.0001"),
                { value: listingPrice },
            );
            const marketItem = await marketplace.getMarketItem(1);
            const sellpriceToken = getUsdToken(
                marketItem.sellpriceUSD,
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await marketplace
                .connect(user1)
                .createMarketSale(1, ADDRESS_ZERO, { value: sellpriceToken });
        });

        it("Should failed - Can not resell unsold item", async () => {
            await nft.setAdministratorStatus(minter.address, true);
            await nft.connect(minter).mint(user1.address, "");
            await expect(
                marketplace
                    .connect(user2)
                    .resellToken(
                        2,
                        parseEther("0.2"),
                        parseEther("0.0011"),
                        false,
                        { value: listingPriceSecondary },
                    ),
            ).to.revertedWith("Can not resell unsold item");
        });

        it("Should failed - Only item o", async () => {
            await expect(
                marketplace
                    .connect(user2)
                    .resellToken(
                        1,
                        parseEther("0.2"),
                        parseEther("0.0011"),
                        false,
                        { value: listingPriceSecondary },
                    ),
            ).to.revertedWith("Only item o");
        });

        it("Should failed - Price must be = Sec list price", async () => {
            await expect(
                marketplace
                    .connect(user1)
                    .resellToken(
                        1,
                        parseEther("0.2"),
                        parseEther("0.0011"),
                        false,
                        {
                            value: listingPriceSecondary.sub(1),
                        },
                    ),
            ).to.revertedWith("Price must be = Sec list price");
        });

        it("Should resellToken successfully", async () => {
            await marketplace
                .connect(user1)
                .resellToken(
                    1,
                    parseEther("0.2"),
                    parseEther("0.0011"),
                    false,
                    { value: listingPriceSecondary },
                );

            const marketItem = await marketplace.getMarketItem(1);
            expect(marketItem.seller).to.equal(user1.address);
            expect(marketItem.creatorWallet).to.equal(creator.address);
            expect(marketItem.isCustodianWallet).to.be.true;
            expect(marketItem.royalty).to.equal(5);
            expect(marketItem.withPhysical).to.be.true;
            expect(marketItem.sellpriceUSD).to.equal(parseEther("0.2"));
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.price).to.equal(parseEther("0.0011"));
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.false;
        });
    });

    describe("resellToken - unlist", () => {
        beforeEach(async () => {
            await marketplace.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                parseEther("0.1"),
                parseEther("0.05"),
                parseEther("0.0001"),
                { value: listingPrice },
            );
            const marketItem = await marketplace.getMarketItem(1);
            const sellpriceToken = getUsdToken(
                marketItem.sellpriceUSD,
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await marketplace
                .connect(user1)
                .createMarketSale(1, ADDRESS_ZERO, { value: sellpriceToken });
            await marketplace
                .connect(user1)
                .resellToken(
                    1,
                    parseEther("0.2"),
                    parseEther("0.0011"),
                    false,
                    { value: listingPriceSecondary },
                );
        });

        it("Should failed - Only s may unlist", async () => {
            await expect(
                marketplace
                    .connect(user2)
                    .resellToken(
                        1,
                        parseEther("0.2"),
                        parseEther("0.0011"),
                        true,
                    ),
            ).to.revertedWith("Only s may unlist");
        });

        it("Should failed - Only s may unlist - initialist item", async () => {
            await marketplace.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                parseEther("0.1"),
                parseEther("0.05"),
                parseEther("0.0001"),
                { value: listingPrice },
            );
            await expect(
                marketplace
                    .connect(user2)
                    .resellToken(
                        2,
                        parseEther("0.2"),
                        parseEther("0.0011"),
                        true,
                    ),
            ).to.revertedWith("Only s may unlist");
            await expect(
                marketplace.resellToken(
                    2,
                    parseEther("0.2"),
                    parseEther("0.0011"),
                    true,
                ),
            ).to.revertedWith("Only s may unlist");
        });

        it("Should resellToken - unlist successfully", async () => {
            await marketplace
                .connect(user1)
                .resellToken(1, parseEther("0.2"), parseEther("0.0011"), true);

            const marketItem = await marketplace.getMarketItem(1);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.creatorWallet).to.equal(creator.address);
            expect(marketItem.isCustodianWallet).to.be.true;
            expect(marketItem.royalty).to.equal(5);
            expect(marketItem.withPhysical).to.be.true;
            expect(marketItem.sellpriceUSD).to.equal(parseEther("0.2"));
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.price).to.equal(parseEther("0.0011"));
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });
    });

    describe("createMarketSale after resell - initialList: false - isCustodianWallet: true", () => {
        let sellpriceToken: BigNumber;
        let sellerAmount: BigNumber;
        let charityAmount: BigNumber;
        let creatorAmount: BigNumber;
        let web3reAmount: BigNumber;
        beforeEach(async () => {
            await marketplace.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                parseEther("0.1"),
                parseEther("0.05"),
                parseEther("0.0001"),
                { value: listingPrice },
            );
            const marketItem = await marketplace.getMarketItem(1);
            const sellpriceToken = getUsdToken(
                marketItem.sellpriceUSD,
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await marketplace
                .connect(user1)
                .createMarketSale(1, ADDRESS_ZERO, { value: sellpriceToken });
            await marketplace
                .connect(user1)
                .resellToken(
                    1,
                    parseEther("0.2"),
                    parseEther("0.0011"),
                    false,
                    { value: listingPriceSecondary },
                );
        });

        it("Should createMarketSale after resell successfully", async () => {
            let marketItem = await marketplace.getMarketItem(1);
            [
                sellpriceToken,
                creatorAmount,
                charityAmount,
                sellerAmount,
                web3reAmount,
            ] = getCommissionResellCustodialWallet(
                marketItem.sellpriceUSD,
                5,
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await expect(() =>
                marketplace.connect(user2).createMarketSale(1, ADDRESS_ZERO, {
                    value: sellpriceToken,
                }),
            ).to.changeEtherBalances(
                [user1, charity, creator, web3re],
                [sellerAmount, charityAmount, creatorAmount, web3reAmount],
            );

            expect(await nft.ownerOf(1)).to.equal(user2.address);

            marketItem = await marketplace.getMarketItem(1);
            expect(await nft.ownerOf(1)).to.equal(user2.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.sellpriceUSD).to.equal(parseEther("0.2"));
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });

        it("Should createMarketSale after resell successfully - paymentMethod: ERC20Token - decimals 24", async () => {
            let marketItem = await marketplace.getMarketItem(1);
            [
                sellpriceToken,
                creatorAmount,
                charityAmount,
                sellerAmount,
                web3reAmount,
            ] = getCommissionResellCustodialWallet(
                marketItem.sellpriceUSD,
                5,
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_24,
            );
            await expect(() =>
                marketplace
                    .connect(user2)
                    .createMarketSale(1, mockERC20Token_24Decimals.address),
            ).to.changeTokenBalances(
                mockERC20Token_24Decimals,
                [user1, charity, creator, web3re],
                [sellerAmount, charityAmount, creatorAmount, web3reAmount],
            );

            expect(await nft.ownerOf(1)).to.equal(user2.address);

            marketItem = await marketplace.getMarketItem(1);
            expect(await nft.ownerOf(1)).to.equal(user2.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.sellpriceUSD).to.equal(parseEther("0.2"));
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
                parseEther("0.1"),
                parseEther("0.05"),
                parseEther("0.0001"),
                { value: listingPrice },
            );
            let marketItem = await marketplace.getMarketItem(2);
            sellpriceToken = getUsdToken(
                marketItem.sellpriceUSD,
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await marketplace
                .connect(user1)
                .createMarketSale(2, ADDRESS_ZERO, { value: sellpriceToken });
            await marketplace
                .connect(user1)
                .resellToken(
                    2,
                    parseEther("0.2"),
                    parseEther("0.0011"),
                    false,
                    { value: listingPriceSecondary },
                );

            marketItem = await marketplace.getMarketItem(2);
            [
                sellpriceToken,
                creatorAmount,
                charityAmount,
                sellerAmount,
                web3reAmount,
            ] = getCommissionResellCustodialWallet(
                marketItem.sellpriceUSD,
                1,
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await expect(() =>
                marketplace.connect(user2).createMarketSale(2, ADDRESS_ZERO, {
                    value: sellpriceToken,
                }),
            ).to.changeEtherBalances(
                [user1, charity, creator, web3re],
                [sellerAmount, charityAmount, creatorAmount, web3reAmount],
            );

            expect(await nft.ownerOf(2)).to.equal(user2.address);

            marketItem = await marketplace.getMarketItem(2);
            expect(await nft.ownerOf(2)).to.equal(user2.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.sellpriceUSD).to.equal(parseEther("0.2"));
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });
    });

    describe("createMarketSale after resell - initialList: false - isCustodianWallet: false", () => {
        let sellpriceToken: BigNumber;
        let sellerAmount: BigNumber;
        let charityAmount: BigNumber;
        let creatorAmount: BigNumber;
        let web3reAmount: BigNumber;
        beforeEach(async () => {
            await marketplace.createToken(
                "google.com",
                creator.address,
                false,
                5,
                true,
                parseEther("0.1"),
                parseEther("0.05"),
                parseEther("0.0001"),
                { value: listingPrice },
            );
            const marketItem = await marketplace.getMarketItem(1);
            const sellpriceToken = getUsdToken(
                marketItem.sellpriceUSD,
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await marketplace
                .connect(user1)
                .createMarketSale(1, ADDRESS_ZERO, { value: sellpriceToken });
            await marketplace
                .connect(user1)
                .resellToken(
                    1,
                    parseEther("0.2"),
                    parseEther("0.0011"),
                    false,
                    { value: listingPriceSecondary },
                );
        });
        it("Should createMarketSale after resell successfully", async () => {
            let marketItem = await marketplace.getMarketItem(1);
            [
                sellpriceToken,
                creatorAmount,
                charityAmount,
                sellerAmount,
                web3reAmount,
            ] = getCommissionResellNonCustodialWallet(
                marketItem.sellpriceUSD,
                5,
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await expect(() =>
                marketplace.connect(user2).createMarketSale(1, ADDRESS_ZERO, {
                    value: sellpriceToken,
                }),
            ).to.changeEtherBalances(
                [user1, charity, creator, web3re],
                [sellerAmount, charityAmount, creatorAmount, web3reAmount],
            );

            expect(await nft.ownerOf(1)).to.equal(user2.address);

            marketItem = await marketplace.getMarketItem(1);
            expect(await nft.ownerOf(1)).to.equal(user2.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.sellpriceUSD).to.equal(parseEther("0.2"));
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });
    });

    describe("admin transfer", () => {
        let marketItem;
        let sellpriceToken: BigNumber;

        beforeEach(async () => {
            await nft.setAdministratorStatus(minter.address, true);
            await nft.connect(minter).mint(user1.address, "");
            await marketplace
                .connect(user1)
                .createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.1"),
                    parseEther("0.05"),
                    parseEther("0.0001"),
                    {
                        value: listingPrice,
                    },
                );
            marketItem = await marketplace.getMarketItem(2);
            [sellpriceToken, , ,] = getCommissionFirstTimeWithPhysical(
                marketItem.sellpriceUSD,
                marketItem.reservePriceUSD,
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
        });
        it("approveAddress failed - Ownable: caller is not the owner", async () => {
            await expect(
                marketplace.connect(user1).approveAddress(1),
            ).to.revertedWith("Ownable: caller is not the owner");
        });
        it("Should transfer external minted NFT successfully", async () => {
            await marketplace.approveAddress(1);
            await marketplace.transferNFTTo(user1.address, user2.address, 1);
            expect(await nft.ownerOf(1)).to.equal(user2.address);
        });
        it("Should transfer internal minted NFT successfully", async () => {
            await marketplace.approveAddress(2);
            await marketplace.transferNFTTo(
                marketplace.address,
                user2.address,
                2,
            );
            expect(await nft.ownerOf(2)).to.equal(user2.address);
            const marketItem = await marketplace.getMarketItem(2);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });
        it("Should transfer internal minted NFT successfully - from user", async () => {
            await marketplace
                .connect(user1)
                .createMarketSale(2, ADDRESS_ZERO, { value: sellpriceToken });

            await marketplace.approveAddress(2);
            await marketplace.transferNFTTo(user1.address, user2.address, 2);
            expect(await nft.ownerOf(2)).to.equal(user2.address);
            const marketItem = await marketplace.getMarketItem(2);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });
    });

    describe("getter functions", () => {
        let marketItem;
        let sellpriceToken: BigNumber;

        it("fetchMarketItems", async () => {
            await marketplace
                .connect(user1)
                .createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.1"),
                    parseEther("0.05"),
                    parseEther("0.0001"),
                    {
                        value: listingPrice,
                    },
                );

            await marketplace
                .connect(user1)
                .createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.1"),
                    parseEther("0.05"),
                    parseEther("0.0001"),
                    {
                        value: listingPrice,
                    },
                );

            await marketplace
                .connect(user1)
                .createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.1"),
                    parseEther("0.05"),
                    parseEther("0.0001"),
                    {
                        value: listingPrice,
                    },
                );
            const item = await marketplace.getMarketItem(1);
            [sellpriceToken, , ,] = getCommissionFirstTimeWithPhysical(
                item.sellpriceUSD,
                item.reservePriceUSD,
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await marketplace
                .connect(user2)
                .createMarketSale(1, ADDRESS_ZERO, { value: sellpriceToken });

            const marketItem = await marketplace.fetchMarketItems();
            expect(marketItem.length).to.equal(2);
            expect(marketItem[0].tokenId).to.equal(2);
            expect(marketItem[1].tokenId).to.equal(3);
        });

        it("fetchMyNFTs", async () => {
            await marketplace
                .connect(user1)
                .createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.1"),
                    parseEther("0.05"),
                    parseEther("0.0001"),
                    {
                        value: listingPrice,
                    },
                );

            await marketplace
                .connect(user1)
                .createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.1"),
                    parseEther("0.05"),
                    parseEther("0.0001"),
                    {
                        value: listingPrice,
                    },
                );

            await marketplace
                .connect(user1)
                .createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.1"),
                    parseEther("0.05"),
                    parseEther("0.0001"),
                    {
                        value: listingPrice,
                    },
                );
            marketItem = await marketplace.getMarketItem(1);
            [sellpriceToken, , ,] = getCommissionFirstTimeWithPhysical(
                marketItem.sellpriceUSD,
                marketItem.reservePriceUSD,
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await marketplace
                .connect(user2)
                .createMarketSale(1, ADDRESS_ZERO, { value: sellpriceToken });
            await marketplace
                .connect(user2)
                .createMarketSale(2, ADDRESS_ZERO, { value: sellpriceToken });
            expect(await marketplace.getItemSold()).to.equal(2);
            const myNFT = await marketplace.connect(user2).fetchMyNFTs();
            expect(myNFT.length).to.equal(2);
            expect(myNFT[0].tokenId).to.equal(1);
            expect(myNFT[1].tokenId).to.equal(2);
            expect(await marketplace.getItemSold()).to.equal(2);
        });

        it("fetchItemsListed", async () => {
            await marketplace
                .connect(user1)
                .createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.1"),
                    parseEther("0.05"),
                    parseEther("0.0001"),
                    {
                        value: listingPrice,
                    },
                );

            await marketplace
                .connect(user1)
                .createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.1"),
                    parseEther("0.05"),
                    parseEther("0.0001"),
                    {
                        value: listingPrice,
                    },
                );

            await marketplace
                .connect(user2)
                .createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.1"),
                    parseEther("0.05"),
                    parseEther("0.0001"),
                    {
                        value: listingPrice,
                    },
                );

            const listItem = await marketplace
                .connect(user1)
                .fetchItemsListed();
            expect(listItem.length).to.equal(2);
            expect(listItem[0].tokenId).to.equal(1);
            expect(listItem[1].tokenId).to.equal(2);
        });

        it("withdraw", async () => {
            await marketplace
                .connect(user1)
                .createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.1"),
                    parseEther("0.05"),
                    parseEther("0.0001"),
                    {
                        value: listingPrice,
                    },
                );
            await expect(
                marketplace
                    .connect(user2)
                    .withdrawFunds(owner.address, ADDRESS_ZERO),
            ).to.revertedWith("Ownable: caller is not the owner");
            await expect(() =>
                marketplace.withdrawFunds(owner.address, ADDRESS_ZERO),
            ).to.changeEtherBalances(
                [marketplace, owner],
                [listingPrice.mul(-1), listingPrice],
            );

            await expect(
                marketplace.withdrawFunds(
                    owner.address,
                    mockERC20Token_18Decimals.address,
                ),
            ).to.revertedWith("Nothing to withdraw");

            await mockERC20Token_18Decimals
                .connect(user1)
                .transfer(marketplace.address, parseEther("0.01"));

            await expect(() =>
                marketplace.withdrawFunds(
                    owner.address,
                    mockERC20Token_18Decimals.address,
                ),
            ).to.changeTokenBalances(
                mockERC20Token_18Decimals,
                [marketplace, owner],
                [parseEther("0.01").mul(-1), parseEther("0.01")],
            );
        });
    });
});

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
    const maticPriceBig = getTokenPrice(
        tokenPrice,
        priceDecimals,
        tokenDecimals,
    );
    amount = matchUsdWithTokenDecimals(amount, tokenDecimals);
    const rate = amount
        .mul(BigNumber.from("10").pow(tokenDecimals))
        .div(maticPriceBig);
    return rate.mul(102).div(100);
};

const getUsdOrgToken = (
    amount: BigNumber,
    tokenPrice: number,
    priceDecimals: number,
    tokenDecimals: number,
): BigNumber => {
    const maticPriceBig = getTokenPrice(
        tokenPrice,
        priceDecimals,
        tokenDecimals,
    );
    amount = matchUsdWithTokenDecimals(amount, tokenDecimals);
    const rate = amount
        .mul(BigNumber.from("10").pow(tokenDecimals))
        .div(maticPriceBig);
    return rate;
};

const getCommissionFirstTimeWithPhysical = (
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

const getCommissionFirstTimeWithoutPhysical = (
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

const getCommissionResellCustodialWallet = (
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

const getCommissionResellNonCustodialWallet = (
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
    const creatorAmount = getUsdOrgToken(
        marketItemSellPriceUSD.mul(royaltyPercent).div(100),
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
