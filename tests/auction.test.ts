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
    const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
    const TOKEN_PRICE = 10942317;
    const TOKEN_PRICE_LOW = 88942317;
    const ROUND_ID = 25012000;
    const TOKEN_DECIMALS_24 = 24;
    const TOKEN_DECIMALS_18 = 18;
    const PRICE_FEED_DECIMALS_8 = 8;
    const TOKEN_DECIMALS_4 = 4;

    let listingPrice: BigNumber;
    let listingPriceSecondary: BigNumber;

    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let user3: SignerWithAddress;
    let user4: SignerWithAddress;
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
        user3 = accounts[7];
        user4 = accounts[8];

        const DPNFT: DPNFT__factory = await ethers.getContractFactory("DPNFT");
        const Auction: DPAuction__factory = await ethers.getContractFactory(
            "DPAuction",
        );
        const AggregatorV3Test: AggregatorV3Test__factory =
            await ethers.getContractFactory("AggregatorV3Test");
        const MockERC20Token: MockERC20Token__factory =
            await ethers.getContractFactory("MockERC20Token");
        const FeeManager: DPFeeManager__factory =
            await ethers.getContractFactory("DPFeeManager");

        feeManager = await FeeManager.deploy(charity.address, web3re.address);
        nft = await DPNFT.deploy();
        auction = await Auction.deploy(
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

        await nft.setAdministratorStatus(auction.address, true);

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
        await mockERC20Token_18Decimals.mint(user3.address, parseEther("10"));
        await mockERC20Token_18Decimals.mint(user4.address, parseEther("10"));
        await mockERC20Token_24Decimals.mint(
            user1.address,
            parseEther("1000000000"),
        );
        await mockERC20Token_24Decimals.mint(
            user2.address,
            parseEther("1000000000"),
        );
        await mockERC20Token_24Decimals.mint(
            user3.address,
            parseEther("1000000000"),
        );
        await mockERC20Token_24Decimals.mint(
            user4.address,
            parseEther("1000000000"),
        );

        await mockERC20Token_18Decimals
            .connect(user1)
            .approve(auction.address, parseEther("1000"));
        await mockERC20Token_18Decimals
            .connect(user2)
            .approve(auction.address, parseEther("1000"));
        await mockERC20Token_18Decimals
            .connect(user3)
            .approve(auction.address, parseEther("1000"));
        await mockERC20Token_18Decimals
            .connect(user4)
            .approve(auction.address, parseEther("1000"));
        await mockERC20Token_24Decimals
            .connect(user1)
            .approve(auction.address, parseEther("100000000000"));
        await mockERC20Token_24Decimals
            .connect(user2)
            .approve(auction.address, parseEther("100000000000"));
        await mockERC20Token_24Decimals
            .connect(user3)
            .approve(auction.address, parseEther("100000000000"));
        await mockERC20Token_24Decimals
            .connect(user4)
            .approve(auction.address, parseEther("100000000000"));
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
                    { value: listingPrice },
                ),
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
                    { value: listingPrice },
                ),
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
                    { value: listingPrice.sub(1) },
                ),
            ).to.revertedWith("Value must be = listing price");
        });

        it("Should failed - Invalid time", async () => {
            await expect(
                auction.createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.1"),
                    parseEther("0.05"),
                    timestamp + 86400,
                    timestamp,
                    parseEther("0.0001"),
                    { value: listingPrice },
                ),
            ).to.revertedWith("Invalid time");

            await expect(
                auction.createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    true,
                    parseEther("0.1"),
                    parseEther("0.05"),
                    timestamp - 1,
                    timestamp + 86400,
                    parseEther("0.0001"),
                    { value: listingPrice },
                ),
            ).to.revertedWith("Invalid time");
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
                timestamp + 1000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );

            const auctionItem = await auction.getAuctionById(1);

            expect(auctionItem.tokenId).to.equal(1);
            expect(auctionItem.seller).to.equal(owner.address);
            expect(auctionItem.creatorWallet).to.equal(creator.address);
            expect(auctionItem.isCustodianWallet).to.be.true;
            expect(auctionItem.royalty).to.equal(5);
            expect(auctionItem.withPhysical).to.be.true;
            expect(auctionItem.startPriceUSD).to.equal(parseEther("0.1"));
            expect(auctionItem.reservePriceUSD).to.equal(parseEther("0.05"));
            expect(auctionItem.price).to.equal(parseEther("0.0001"));
            expect(auctionItem.initialList).to.be.true;
            expect(auctionItem.sold).to.be.false;
            expect(auctionItem.startTime).to.equal(timestamp + 1000);
            expect(auctionItem.endTime).to.equal(timestamp + 86400);
            expect(auctionItem.listBidId.length).to.equal(0);
            expect(auctionItem.highestBidId).to.equal(0);

            expect(await auction.totalAuctions()).to.equal(1);
        });
    });

    describe("reAuctionToken", () => {
        let timestamp: number;
        beforeEach(async () => {
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            await auction.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp + 1000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );
            await auction.approveAddress(1);
            await auction
                .connect(owner)
                .transferNFTTo(auction.address, user1.address, 1);
        });

        it("Should failed - Can not reAuction unsold item", async () => {
            await auction.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp + 1000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );

            await expect(
                auction.reAuctionToken(
                    2,
                    parseEther("0.1"),
                    parseEther("0.0001"),
                    timestamp + 1000,
                    timestamp + 86400,
                    {
                        value: listingPriceSecondary,
                    },
                ),
            ).to.revertedWith("Can not reAuction unsold item");
        });

        it("Should failed - Only item owner", async () => {
            await expect(
                auction.reAuctionToken(
                    1,
                    parseEther("0.1"),
                    parseEther("0.0001"),
                    timestamp + 1000,
                    timestamp + 86400,
                    {
                        value: listingPriceSecondary,
                    },
                ),
            ).to.revertedWith("Only item owner");
        });

        it("Should failed - Price must be at least 1 wei", async () => {
            await expect(
                auction
                    .connect(user1)
                    .reAuctionToken(
                        1,
                        parseEther("0.1"),
                        0,
                        timestamp + 1000,
                        timestamp + 86400,
                        {
                            value: listingPriceSecondary,
                        },
                    ),
            ).to.revertedWith("Price must be at least 1 wei");
        });

        it("Should failed - Value must be = Secondary list price", async () => {
            await expect(
                auction
                    .connect(user1)
                    .reAuctionToken(
                        1,
                        parseEther("0.1"),
                        parseEther("0.0001"),
                        timestamp + 1000,
                        timestamp + 86400,
                        {
                            value: listingPriceSecondary.sub(1),
                        },
                    ),
            ).to.revertedWith("Value must be = Secondary list price");
        });

        it("Should reAuction successfully", async () => {
            await auction
                .connect(user1)
                .reAuctionToken(
                    1,
                    parseEther("0.1"),
                    parseEther("0.0001"),
                    timestamp + 1000,
                    timestamp + 86400,
                    {
                        value: listingPriceSecondary,
                    },
                );

            const auctionItem = await auction.getAuctionById(2);

            expect(auctionItem.tokenId).to.equal(1);
            expect(auctionItem.seller).to.equal(user1.address);
            expect(auctionItem.creatorWallet).to.equal(creator.address);
            expect(auctionItem.isCustodianWallet).to.be.true;
            expect(auctionItem.royalty).to.equal(5);
            expect(auctionItem.withPhysical).to.be.false;
            expect(auctionItem.startPriceUSD).to.equal(parseEther("0.1"));
            expect(auctionItem.reservePriceUSD).to.equal(0);
            expect(auctionItem.price).to.equal(parseEther("0.0001"));
            expect(auctionItem.initialList).to.be.false;
            expect(auctionItem.sold).to.be.false;
            expect(auctionItem.startTime).to.equal(timestamp + 1000);
            expect(auctionItem.endTime).to.equal(timestamp + 86400);
            expect(auctionItem.listBidId.length).to.equal(0);
            expect(auctionItem.highestBidId).to.equal(0);

            expect(await auction.totalAuctions()).to.equal(2);
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
                        { value: listingPriceSecondary },
                    ),
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
                        { value: listingPriceSecondary.sub(1) },
                    ),
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
                timestamp + 1000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );
            await auction.approveAddress(2);
            await auction
                .connect(owner)
                .transferNFTTo(auction.address, user1.address, 2);

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
                        { value: listingPriceSecondary },
                    ),
            ).to.revertedWith("Item already listed");
        });

        it("Should failed - Price must be at least 1 wei", async () => {
            await expect(
                auction
                    .connect(user1)
                    .createExternalMintedItem(
                        1,
                        creator.address,
                        true,
                        5,
                        parseEther("0.1"),
                        0,
                        timestamp,
                        timestamp + 86400,
                        { value: listingPriceSecondary },
                    ),
            ).to.revertedWith("Price must be at least 1 wei");
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
                    timestamp + 1000,
                    timestamp + 86400,
                    { value: listingPriceSecondary },
                );

            const auctionItem = await auction.getAuctionById(1);

            expect(auctionItem.tokenId).to.equal(1);
            expect(auctionItem.seller).to.equal(user1.address);
            expect(auctionItem.creatorWallet).to.equal(creator.address);
            expect(auctionItem.isCustodianWallet).to.be.true;
            expect(auctionItem.royalty).to.equal(5);
            expect(auctionItem.withPhysical).to.be.false;
            expect(auctionItem.startPriceUSD).to.equal(parseEther("0.1"));
            expect(auctionItem.reservePriceUSD).to.equal(0);
            expect(auctionItem.price).to.equal(parseEther("0.001"));
            expect(auctionItem.initialList).to.be.false;
            expect(auctionItem.sold).to.be.false;
            expect(auctionItem.startTime).to.equal(timestamp + 1000);
            expect(auctionItem.endTime).to.equal(timestamp + 86400);
            expect(auctionItem.listBidId.length).to.equal(0);
            expect(auctionItem.highestBidId).to.equal(0);

            expect(await auction.totalAuctions()).to.equal(1);
        });
    });

    describe("bidToken", () => {
        let timestamp: number;
        beforeEach(async () => {
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            await auction.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp + 1000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );
        });

        it("Should failed - Not in auction time", async () => {
            await auction.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp + 86400,
                timestamp + 86400 * 2,
                parseEther("0.0001"),
                { value: listingPrice },
            );
            await expect(
                auction
                    .connect(user1)
                    .bidToken(2, ADDRESS_ZERO, parseEther("1")),
            ).to.revertedWith("Not in auction time");
        });

        it("Should failed - Payment token not supported", async () => {
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            await expect(
                auction
                    .connect(user1)
                    .bidToken(
                        1,
                        mockERC20Token_18Decimals.address,
                        parseEther("1"),
                    ),
            ).to.revertedWith("Payment token not supported");
        });

        it("Should failed - Seller cannot bid", async () => {
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            await expect(
                auction.bidToken(1, ADDRESS_ZERO, parseEther("1")),
            ).to.revertedWith("Seller cannot bid");
        });

        it("Should failed - Price lower than start price", async () => {
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            await expect(
                auction
                    .connect(user1)
                    .bidToken(1, ADDRESS_ZERO, parseEther("0.09")),
            ).to.revertedWith("Price lower than start price");
        });

        it("Should failed - Mising asking price - native token", async () => {
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            const payAmount = getUsdToken(
                parseEther("0.1"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await expect(
                auction
                    .connect(user1)
                    .bidToken(1, ADDRESS_ZERO, parseEther("0.1"), {
                        value: payAmount.sub(1),
                    }),
            ).to.revertedWith("Mising asking price");
        });

        it("Should bidToken successfully - native token", async () => {
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            const payAmount = getUsdToken(
                parseEther("0.1"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await expect(() =>
                auction
                    .connect(user1)
                    .bidToken(1, ADDRESS_ZERO, parseEther("0.1"), {
                        value: payAmount.add(parseEther("0.01")),
                    }),
            ).to.changeEtherBalances(
                [user1, auction],
                [payAmount.mul(-1), payAmount],
            );

            const bidPriceToken = getUsdOrgToken(
                parseEther("0.1"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            const bidPriceWithFeeToken = getUsdToken(
                parseEther("0.1"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            const reservePriceToken = getUsdOrgToken(
                parseEther("0.05"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );

            const bidItem = await auction.getBidById(1);

            expect(bidItem.tokenId).to.equal(1);
            expect(bidItem.bidder).to.equal(user1.address);
            expect(bidItem.paymentToken).to.equal(ADDRESS_ZERO);
            expect(bidItem.bidPriceUSD).to.equal(parseEther("0.1"));
            expect(bidItem.bidPriceToken).to.equal(bidPriceToken.sub(1));
            expect(bidItem.bidPriceWithFeeToken).to.equal(bidPriceWithFeeToken);
            expect(bidItem.reservePriceToken).to.equal(reservePriceToken);
            expect(bidItem.oracleRoundId).to.equal(ROUND_ID);
            expect(bidItem.status).to.equal(0);

            expect(await auction.totalBids()).to.equal(1);
        });

        it("Should failed - Price less than min price", async () => {
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            const payAmount = getUsdToken(
                parseEther("0.1"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await auction
                .connect(user1)
                .bidToken(1, ADDRESS_ZERO, parseEther("0.1"), {
                    value: payAmount,
                });

            await expect(
                auction
                    .connect(user2)
                    .bidToken(1, ADDRESS_ZERO, parseEther("0.1"), {
                        value: payAmount,
                    }),
            ).to.revertedWith("Price less than min price");
        });

        it("Should bidToken successfully - 18 decimals token", async () => {
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            await feeManager.setPaymentMethod(
                mockERC20Token_18Decimals.address,
                aggregatorV3Test.address,
            );
            let payAmount = getUsdToken(
                parseEther("0.1"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await expect(() =>
                auction
                    .connect(user1)
                    .bidToken(
                        1,
                        mockERC20Token_18Decimals.address,
                        parseEther("0.1"),
                    ),
            ).to.changeTokenBalances(
                mockERC20Token_18Decimals,
                [user1, auction],
                [payAmount.mul(-1), payAmount],
            );

            payAmount = getUsdToken(
                parseEther("0.11"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await auction
                .connect(user2)
                .bidToken(1, ADDRESS_ZERO, parseEther("0.11"), {
                    value: payAmount,
                });

            payAmount = getUsdToken(
                parseEther("0.121"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await expect(() =>
                auction
                    .connect(user3)
                    .bidToken(
                        1,
                        mockERC20Token_18Decimals.address,
                        parseEther("0.121"),
                    ),
            ).to.changeTokenBalances(
                mockERC20Token_18Decimals,
                [user3, auction],
                [payAmount.mul(-1), payAmount],
            );

            expect(await auction.totalBids()).to.equal(3);
        });

        it("Should successfully after update minPriceIncreasePercent", async () => {
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            await feeManager.setPaymentMethod(
                mockERC20Token_18Decimals.address,
                aggregatorV3Test.address,
            );
            await auction
                .connect(user1)
                .bidToken(
                    1,
                    mockERC20Token_18Decimals.address,
                    parseEther("0.1"),
                );

            await auction.setMinPriceIncreasePercent(10000);

            await expect(
                auction
                    .connect(user2)
                    .bidToken(
                        1,
                        mockERC20Token_18Decimals.address,
                        parseEther("0.11"),
                    ),
            ).to.revertedWith("Price less than min price");

            const payAmount = getUsdToken(
                parseEther("0.3"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await expect(() =>
                auction
                    .connect(user3)
                    .bidToken(
                        1,
                        mockERC20Token_18Decimals.address,
                        parseEther("0.3"),
                    ),
            ).to.changeTokenBalances(
                mockERC20Token_18Decimals,
                [user3, auction],
                [payAmount.mul(-1), payAmount],
            );
        });

        it("Should bidToken successfully - 24 decimals token", async () => {
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            await feeManager.setPaymentMethod(
                mockERC20Token_18Decimals.address,
                aggregatorV3Test.address,
            );
            let payAmount = getUsdToken(
                parseEther("0.1"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_24,
            );
            await expect(() =>
                auction
                    .connect(user1)
                    .bidToken(
                        1,
                        mockERC20Token_24Decimals.address,
                        parseEther("0.1"),
                    ),
            ).to.changeTokenBalances(
                mockERC20Token_24Decimals,
                [user1, auction],
                [payAmount.mul(-1), payAmount],
            );

            payAmount = getUsdToken(
                parseEther("0.11"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await auction
                .connect(user2)
                .bidToken(1, ADDRESS_ZERO, parseEther("0.11"), {
                    value: payAmount,
                });

            payAmount = getUsdToken(
                parseEther("0.121"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await expect(() =>
                auction
                    .connect(user3)
                    .bidToken(
                        1,
                        mockERC20Token_18Decimals.address,
                        parseEther("0.121"),
                    ),
            ).to.changeTokenBalances(
                mockERC20Token_18Decimals,
                [user3, auction],
                [payAmount.mul(-1), payAmount],
            );

            payAmount = getUsdToken(
                parseEther("0.1331"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_24,
            );
            await expect(() =>
                auction
                    .connect(user4)
                    .bidToken(
                        1,
                        mockERC20Token_24Decimals.address,
                        parseEther("0.1331"),
                    ),
            ).to.changeTokenBalances(
                mockERC20Token_24Decimals,
                [user4, auction],
                [payAmount.mul(-1), payAmount],
            );

            expect(await auction.totalBids()).to.equal(4);
        });
    });

    describe("acceptBid - - initialList: true - withPhysical: true", () => {
        let timestamp: number;
        let bidItem;
        let sellpriceToken: BigNumber;
        let charityAmount: BigNumber;
        let creatorAmount: BigNumber;
        let web3reAmount: BigNumber;
        beforeEach(async () => {
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            await auction.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp + 1000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            await feeManager.setPaymentMethod(
                mockERC20Token_18Decimals.address,
                aggregatorV3Test.address,
            );
            let payAmount = getUsdToken(
                parseEther("0.1"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_24,
            );
            await auction
                .connect(user1)
                .bidToken(
                    1,
                    mockERC20Token_24Decimals.address,
                    parseEther("0.1"),
                );

            payAmount = getUsdToken(
                parseEther("0.11"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await auction
                .connect(user2)
                .bidToken(1, ADDRESS_ZERO, parseEther("0.11"), {
                    value: payAmount,
                });
        });

        it("Should failed - Auction not end", async () => {
            await expect(auction.acceptBid(1)).to.revertedWith(
                "Auction not end",
            );
        });

        it("Should failed - No bid created", async () => {
            await auction.createToken(
                "google.com",
                creator.address,
                true,
                5,
                true,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp + 2000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );

            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);

            await expect(auction.acceptBid(2)).to.revertedWith(
                "No bid created",
            );
        });

        it("Should acceptBid successfully - native token", async () => {
            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            bidItem = await auction.getBidById(2);
            [sellpriceToken, charityAmount, creatorAmount, web3reAmount] =
                getCommissionFirstTimeWithPhysical(
                    bidItem.bidPriceToken,
                    bidItem.reservePriceToken,
                );
            await expect(() => auction.acceptBid(1)).to.changeEtherBalances(
                [auction, charity, creator, web3re],
                [
                    sellpriceToken.mul(-1).sub(1),
                    charityAmount,
                    creatorAmount,
                    web3reAmount.add(1),
                ],
            );
            expect(await auction.getItemSold()).to.equal(1);
        });

        it("Should acceptBid successfully - 18 decimals token", async () => {
            await auction
                .connect(user3)
                .bidToken(
                    1,
                    mockERC20Token_18Decimals.address,
                    parseEther("0.121"),
                );

            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            bidItem = await auction.getBidById(3);
            [sellpriceToken, charityAmount, creatorAmount, web3reAmount] =
                getCommissionFirstTimeWithPhysical(
                    bidItem.bidPriceToken,
                    bidItem.reservePriceToken,
                );
            await expect(() => auction.acceptBid(1)).to.changeTokenBalances(
                mockERC20Token_18Decimals,
                [auction, charity, creator, web3re],
                [
                    sellpriceToken.mul(-1).sub(1),
                    charityAmount,
                    creatorAmount,
                    web3reAmount.add(1),
                ],
            );
            expect(await auction.getItemSold()).to.equal(1);
        });

        it("Should acceptBid successfully - 24 decimals token", async () => {
            await auction
                .connect(user3)
                .bidToken(
                    1,
                    mockERC20Token_18Decimals.address,
                    parseEther("0.121"),
                );

            await auction
                .connect(user4)
                .bidToken(
                    1,
                    mockERC20Token_24Decimals.address,
                    parseEther("0.1331"),
                );

            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            bidItem = await auction.getBidById(4);
            [sellpriceToken, charityAmount, creatorAmount, web3reAmount] =
                getCommissionFirstTimeWithPhysical(
                    bidItem.bidPriceToken,
                    bidItem.reservePriceToken,
                );
            await expect(() => auction.acceptBid(1)).to.changeTokenBalances(
                mockERC20Token_24Decimals,
                [auction, charity, creator, web3re],
                [
                    sellpriceToken.mul(-1).sub(1),
                    charityAmount,
                    creatorAmount,
                    web3reAmount.add(1),
                ],
            );
            expect(await auction.getItemSold()).to.equal(1);
        });
    });

    describe("acceptBid - initialList: true - withPhysical: false", () => {
        let timestamp: number;
        let bidItem;
        let sellpriceToken: BigNumber;
        let charityAmount: BigNumber;
        let creatorAmount: BigNumber;
        let web3reAmount: BigNumber;
        beforeEach(async () => {
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            await auction.createToken(
                "google.com",
                creator.address,
                true,
                5,
                false,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp + 1000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            await feeManager.setPaymentMethod(
                mockERC20Token_18Decimals.address,
                aggregatorV3Test.address,
            );
            let payAmount = getUsdToken(
                parseEther("0.1"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_24,
            );
            await auction
                .connect(user1)
                .bidToken(
                    1,
                    mockERC20Token_24Decimals.address,
                    parseEther("0.1"),
                );

            payAmount = getUsdToken(
                parseEther("0.11"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await auction
                .connect(user2)
                .bidToken(1, ADDRESS_ZERO, parseEther("0.11"), {
                    value: payAmount,
                });
        });

        it("Should acceptBid successfully - native token", async () => {
            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            bidItem = await auction.getBidById(2);
            [sellpriceToken, charityAmount, creatorAmount, web3reAmount] =
                getCommissionFirstTimeWithoutPhysical(bidItem.bidPriceToken);
            await expect(() => auction.acceptBid(1)).to.changeEtherBalances(
                [auction, charity, creator, web3re],
                [
                    sellpriceToken.mul(-1).sub(1),
                    charityAmount,
                    creatorAmount,
                    web3reAmount.add(1),
                ],
            );
        });

        it("Should acceptBid successfully - 18 decimals token", async () => {
            await auction
                .connect(user3)
                .bidToken(
                    1,
                    mockERC20Token_18Decimals.address,
                    parseEther("0.121"),
                );

            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            bidItem = await auction.getBidById(3);
            [sellpriceToken, charityAmount, creatorAmount, web3reAmount] =
                getCommissionFirstTimeWithoutPhysical(bidItem.bidPriceToken);
            await expect(() => auction.acceptBid(1)).to.changeTokenBalances(
                mockERC20Token_18Decimals,
                [auction, charity, creator, web3re],
                [
                    sellpriceToken.mul(-1).sub(1),
                    charityAmount,
                    creatorAmount,
                    web3reAmount.add(1),
                ],
            );
        });

        it("Should acceptBid successfully - 24 decimals token", async () => {
            await auction
                .connect(user3)
                .bidToken(
                    1,
                    mockERC20Token_18Decimals.address,
                    parseEther("0.121"),
                );

            await auction
                .connect(user4)
                .bidToken(
                    1,
                    mockERC20Token_24Decimals.address,
                    parseEther("0.1331"),
                );

            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            bidItem = await auction.getBidById(4);
            [sellpriceToken, charityAmount, creatorAmount, web3reAmount] =
                getCommissionFirstTimeWithoutPhysical(bidItem.bidPriceToken);
            await expect(() => auction.acceptBid(1)).to.changeTokenBalances(
                mockERC20Token_24Decimals,
                [auction, charity, creator, web3re],
                [
                    sellpriceToken.mul(-1).sub(1),
                    charityAmount,
                    creatorAmount,
                    web3reAmount.add(1),
                ],
            );
        });
    });

    describe("acceptBid - reAuction token - isCustodianWallet: true", () => {
        let timestamp: number;
        let payAmount: BigNumber;
        let bidItem;
        let sellpriceToken: BigNumber;
        let charityAmount: BigNumber;
        let creatorAmount: BigNumber;
        let sellerAmount: BigNumber;
        let web3reAmount: BigNumber;
        beforeEach(async () => {
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            await auction.createToken(
                "google.com",
                creator.address,
                true,
                5,
                false,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp + 1000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            await feeManager.setPaymentMethod(
                mockERC20Token_18Decimals.address,
                aggregatorV3Test.address,
            );

            await auction
                .connect(user1)
                .bidToken(
                    1,
                    mockERC20Token_24Decimals.address,
                    parseEther("0.1"),
                );

            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            await auction.acceptBid(1);

            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            await auction
                .connect(user1)
                .reAuctionToken(
                    1,
                    parseEther("0.1"),
                    parseEther("0.0001"),
                    timestamp + 1000,
                    timestamp + 86400,
                    {
                        value: listingPriceSecondary,
                    },
                );

            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            payAmount = getUsdToken(
                parseEther("0.11"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await auction
                .connect(user2)
                .bidToken(1, ADDRESS_ZERO, parseEther("0.11"), {
                    value: payAmount,
                });
        });

        it("Should acceptBid successfully - native token", async () => {
            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            bidItem = await auction.getBidById(2);
            [
                sellpriceToken,
                creatorAmount,
                charityAmount,
                sellerAmount,
                web3reAmount,
            ] = getCommissionReAuctionCustodialWallet(bidItem.bidPriceToken, 5);
            await expect(() => auction.acceptBid(1)).to.changeEtherBalances(
                [auction, charity, creator, web3re, user1],
                [
                    sellpriceToken.mul(-1).sub(1),
                    charityAmount,
                    creatorAmount,
                    web3reAmount.add(1),
                    sellerAmount,
                ],
            );
        });

        it("Should acceptBid successfully - 18 decimals token", async () => {
            await auction
                .connect(user3)
                .bidToken(
                    1,
                    mockERC20Token_18Decimals.address,
                    parseEther("0.121"),
                );

            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            bidItem = await auction.getBidById(3);
            [
                sellpriceToken,
                creatorAmount,
                charityAmount,
                sellerAmount,
                web3reAmount,
            ] = getCommissionReAuctionCustodialWallet(bidItem.bidPriceToken, 5);
            await expect(() => auction.acceptBid(1)).to.changeTokenBalances(
                mockERC20Token_18Decimals,
                [auction, charity, creator, web3re, user1],
                [
                    sellpriceToken.mul(-1).sub(1),
                    charityAmount,
                    creatorAmount,
                    web3reAmount.add(1),
                    sellerAmount,
                ],
            );
        });

        it("Should acceptBid successfully - 24 decimals token", async () => {
            await auction
                .connect(user3)
                .bidToken(
                    1,
                    mockERC20Token_18Decimals.address,
                    parseEther("0.121"),
                );
            await auction
                .connect(user4)
                .bidToken(
                    1,
                    mockERC20Token_24Decimals.address,
                    parseEther("0.1331"),
                );

            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            bidItem = await auction.getBidById(4);
            [
                sellpriceToken,
                creatorAmount,
                charityAmount,
                sellerAmount,
                web3reAmount,
            ] = getCommissionReAuctionCustodialWallet(bidItem.bidPriceToken, 5);
            await expect(() => auction.acceptBid(1)).to.changeTokenBalances(
                mockERC20Token_24Decimals,
                [auction, charity, creator, web3re, user1],
                [
                    sellpriceToken.mul(-1).sub(1),
                    charityAmount,
                    creatorAmount,
                    web3reAmount.add(1),
                    sellerAmount,
                ],
            );
        });

        it("Should acceptBid successfully - < 2 royaty", async () => {
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;

            await auction.createToken(
                "google.com",
                creator.address,
                true,
                1,
                true,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp + 1000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );
            await auction.approveAddress(2);
            await auction
                .connect(owner)
                .transferNFTTo(auction.address, user1.address, 2);

            await auction
                .connect(user1)
                .reAuctionToken(
                    2,
                    parseEther("0.1"),
                    parseEther("0.0001"),
                    timestamp + 1000,
                    timestamp + 86400,
                    {
                        value: listingPriceSecondary,
                    },
                );

            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            payAmount = getUsdToken(
                parseEther("0.11"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await auction
                .connect(user2)
                .bidToken(2, ADDRESS_ZERO, parseEther("0.11"), {
                    value: payAmount,
                });

            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            bidItem = await auction.getBidById(2);
            [
                sellpriceToken,
                creatorAmount,
                charityAmount,
                sellerAmount,
                web3reAmount,
            ] = getCommissionReAuctionCustodialWallet(bidItem.bidPriceToken, 1);
            await expect(() => auction.acceptBid(2)).to.changeEtherBalances(
                [auction, charity, creator, web3re, user1],
                [
                    sellpriceToken.mul(-1).sub(1),
                    charityAmount,
                    creatorAmount,
                    web3reAmount.add(1),
                    sellerAmount,
                ],
            );
        });
    });

    describe("acceptBid - reAuction token - isCustodianWallet: false", () => {
        let timestamp: number;
        let payAmount: BigNumber;
        let bidItem;
        let sellpriceToken: BigNumber;
        let charityAmount: BigNumber;
        let creatorAmount: BigNumber;
        let sellerAmount: BigNumber;
        let web3reAmount: BigNumber;
        beforeEach(async () => {
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            await auction.createToken(
                "google.com",
                creator.address,
                false,
                5,
                true,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp + 1000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            await feeManager.setPaymentMethod(
                mockERC20Token_18Decimals.address,
                aggregatorV3Test.address,
            );

            await auction
                .connect(user1)
                .bidToken(
                    1,
                    mockERC20Token_24Decimals.address,
                    parseEther("0.1"),
                );

            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            await auction.acceptBid(1);

            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            await auction
                .connect(user1)
                .reAuctionToken(
                    1,
                    parseEther("0.1"),
                    parseEther("0.0001"),
                    timestamp + 1000,
                    timestamp + 86400,
                    {
                        value: listingPriceSecondary,
                    },
                );

            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            payAmount = getUsdToken(
                parseEther("0.11"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await auction
                .connect(user2)
                .bidToken(1, ADDRESS_ZERO, parseEther("0.11"), {
                    value: payAmount,
                });
        });

        it("Should acceptBid successfully - native token", async () => {
            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            bidItem = await auction.getBidById(2);
            [
                sellpriceToken,
                creatorAmount,
                charityAmount,
                sellerAmount,
                web3reAmount,
            ] = getCommissionReAuctionNonCustodialWallet(
                bidItem.bidPriceToken,
                5,
            );
            await expect(() => auction.acceptBid(1)).to.changeEtherBalances(
                [auction, charity, creator, web3re, user1],
                [
                    sellpriceToken.mul(-1).sub(1),
                    charityAmount,
                    creatorAmount,
                    web3reAmount.add(1),
                    sellerAmount,
                ],
            );
        });

        it("Should acceptBid successfully - 18 decimals token", async () => {
            await auction
                .connect(user3)
                .bidToken(
                    1,
                    mockERC20Token_18Decimals.address,
                    parseEther("0.121"),
                );

            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            bidItem = await auction.getBidById(3);
            [
                sellpriceToken,
                creatorAmount,
                charityAmount,
                sellerAmount,
                web3reAmount,
            ] = getCommissionReAuctionNonCustodialWallet(
                bidItem.bidPriceToken,
                5,
            );
            await expect(() => auction.acceptBid(1)).to.changeTokenBalances(
                mockERC20Token_18Decimals,
                [auction, charity, creator, web3re, user1],
                [
                    sellpriceToken.mul(-1).sub(1),
                    charityAmount,
                    creatorAmount,
                    web3reAmount.add(1),
                    sellerAmount,
                ],
            );
        });

        it("Should acceptBid successfully - 24 decimals token", async () => {
            await auction
                .connect(user3)
                .bidToken(
                    1,
                    mockERC20Token_18Decimals.address,
                    parseEther("0.121"),
                );

            await auction
                .connect(user4)
                .bidToken(
                    1,
                    mockERC20Token_24Decimals.address,
                    parseEther("0.1331"),
                );

            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            bidItem = await auction.getBidById(4);
            [
                sellpriceToken,
                creatorAmount,
                charityAmount,
                sellerAmount,
                web3reAmount,
            ] = getCommissionReAuctionNonCustodialWallet(
                bidItem.bidPriceToken,
                5,
            );
            await expect(() => auction.acceptBid(1)).to.changeTokenBalances(
                mockERC20Token_24Decimals,
                [auction, charity, creator, web3re, user1],
                [
                    sellpriceToken.mul(-1).sub(1),
                    charityAmount,
                    creatorAmount,
                    web3reAmount.add(1),
                    sellerAmount,
                ],
            );
        });
    });

    describe("cancelBid", () => {
        let timestamp: number;
        beforeEach(async () => {
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            await auction.createToken(
                "google.com",
                creator.address,
                true,
                5,
                false,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp + 1000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            await feeManager.setPaymentMethod(
                mockERC20Token_18Decimals.address,
                aggregatorV3Test.address,
            );
            let payAmount = getUsdToken(
                parseEther("0.1"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_24,
            );
            await auction
                .connect(user1)
                .bidToken(
                    1,
                    mockERC20Token_24Decimals.address,
                    parseEther("0.1"),
                );

            payAmount = getUsdToken(
                parseEther("0.11"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await auction
                .connect(user2)
                .bidToken(1, ADDRESS_ZERO, parseEther("0.11"), {
                    value: payAmount,
                });
        });

        it("Should failed - Only bidder", async () => {
            await expect(auction.cancelBid(1)).to.revertedWith("Only bidder");
        });

        it("Should failed - Not bidder", async () => {
            await expect(auction.connect(user2).cancelBid(2)).to.revertedWith(
                "Can not cancel highest bid",
            );
        });

        it("Should cancelBid successfully", async () => {
            const payAmount = getUsdToken(
                parseEther("0.1"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_24,
            );
            await expect(() =>
                auction.connect(user1).cancelBid(1),
            ).to.changeTokenBalances(
                mockERC20Token_24Decimals,
                [auction, user1],
                [payAmount.mul(-1), payAmount],
            );

            const bidItem = await auction.getBidById(1);
            expect(bidItem.status).to.equal(1);
        });

        it("Should cancelBid successfully - after endtime", async () => {
            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            const payAmount = getUsdToken(
                parseEther("0.1"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_24,
            );
            await expect(() =>
                auction.connect(user1).cancelBid(1),
            ).to.changeTokenBalances(
                mockERC20Token_24Decimals,
                [auction, user1],
                [payAmount.mul(-1), payAmount],
            );

            const bidItem = await auction.getBidById(1);
            expect(bidItem.status).to.equal(1);
        });

        it("Should cancelBid successfully - highest bid", async () => {
            await auction.approveAddress(1);
            await auction
                .connect(owner)
                .transferNFTTo(auction.address, user1.address, 1);
            const payAmount = getUsdToken(
                parseEther("0.11"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await expect(() =>
                auction.connect(user2).cancelBid(2),
            ).to.changeEtherBalances(
                [auction, user2],
                [payAmount.mul(-1), payAmount],
            );

            const bidItem = await auction.getBidById(2);
            expect(bidItem.status).to.equal(1);
        });

        it("Should failed - Bid closed", async () => {
            await auction.connect(user1).cancelBid(1);
            await expect(auction.connect(user1).cancelBid(1)).to.revertedWith(
                "Bid closed",
            );
        });
    });

    describe("editBid", () => {
        let timestamp: number;
        let payAmount: BigNumber;
        beforeEach(async () => {
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            await auction.createToken(
                "google.com",
                creator.address,
                true,
                5,
                false,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp + 1000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            payAmount = getUsdToken(
                parseEther("0.1"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_24,
            );
            await auction
                .connect(user1)
                .bidToken(
                    1,
                    mockERC20Token_24Decimals.address,
                    parseEther("0.1"),
                );

            payAmount = getUsdToken(
                parseEther("0.11"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await auction
                .connect(user2)
                .bidToken(1, ADDRESS_ZERO, parseEther("0.11"), {
                    value: payAmount,
                });
        });

        it("Should failed - Only bidder", async () => {
            await expect(auction.editBid(2, parseEther("0.2"))).to.revertedWith(
                "Only bidder",
            );
        });

        it("Should failed - Not in auction time", async () => {
            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);

            await expect(
                auction.connect(user2).editBid(2, parseEther("0.2")),
            ).to.revertedWith("Not in auction time");
        });

        it("Should failed - Bid canceled", async () => {
            auction.connect(user1).cancelBid(1);
            await expect(
                auction.connect(user1).editBid(1, parseEther("0.2")),
            ).to.revertedWith("Bid canceled");
        });

        it("Should failed - Price less than min price", async () => {
            await expect(
                auction.connect(user1).editBid(1, parseEther("0.1")),
            ).to.revertedWith("Price less than min price");
        });

        it("Should failed - Payment token not supported", async () => {
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            await feeManager.removePaymentMethod(
                mockERC20Token_24Decimals.address,
            );
            await expect(
                auction.connect(user1).editBid(1, parseEther("0.2")),
            ).to.revertedWith("Payment token not supported");
        });

        it("Should failed - mising asking price", async () => {
            payAmount = getUsdToken(
                parseEther("0.01"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await expect(
                auction
                    .connect(user2)
                    .editBid(2, parseEther("0.2"), { value: payAmount }),
            ).to.revertedWith("mising asking price");
        });

        it("Should successfully - missing price - native token", async () => {
            payAmount = getUsdToken(
                parseEther("0.11"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            const refund = getUsdToken(
                parseEther("0.02"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await expect(() =>
                auction
                    .connect(user2)
                    .editBid(2, parseEther("0.2"), { value: payAmount }),
            ).to.changeEtherBalances(
                [auction, user2],
                [
                    payAmount.sub(refund).add(2),
                    payAmount.sub(refund).add(2).mul(-1),
                ],
            );
            const priceToken = getUsdToken(
                parseEther("0.2"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );

            const bidItem = await auction.getBidById(2);
            expect(bidItem.bidPriceUSD).to.equal(parseEther("0.2"));
            expect(bidItem.bidPriceWithFeeToken).to.equal(priceToken);
            const auctionItem = await auction.getLastestAuctionToken(1);
            expect(auctionItem.highestBidId).to.equal(2);
        });

        it("Should successfully - missing price - ERC20 token", async () => {
            payAmount = getUsdToken(
                parseEther("0.1"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_24,
            );
            await expect(() =>
                auction.connect(user1).editBid(1, parseEther("0.2")),
            ).to.changeTokenBalances(
                mockERC20Token_24Decimals,
                [auction, user1],
                [payAmount, payAmount.mul(-1)],
            );
        });

        it("Should successfully - exceed price - native token", async () => {
            const AggregatorV3Test: AggregatorV3Test__factory =
                await ethers.getContractFactory("AggregatorV3Test");
            const lowAggregatorV3Test = await AggregatorV3Test.deploy(
                TOKEN_PRICE_LOW,
                PRICE_FEED_DECIMALS_8,
            );

            await feeManager.changeAggregatorAddress(
                ADDRESS_ZERO,
                lowAggregatorV3Test.address,
            );
            const oldPayAmount = getUsdToken(
                parseEther("0.11"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            payAmount = getUsdToken(
                parseEther("0.2"),
                TOKEN_PRICE_LOW,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            const refund = oldPayAmount.sub(payAmount);
            await expect(() =>
                auction.connect(user2).editBid(2, parseEther("0.2")),
            ).to.changeEtherBalances(
                [auction, user2],
                [refund.mul(-1), refund],
            );
        });

        it("Should successfully - exceed price - ERC20 token", async () => {
            const AggregatorV3Test: AggregatorV3Test__factory =
                await ethers.getContractFactory("AggregatorV3Test");
            const lowAggregatorV3Test = await AggregatorV3Test.deploy(
                TOKEN_PRICE_LOW,
                PRICE_FEED_DECIMALS_8,
            );

            await feeManager.changeAggregatorAddress(
                mockERC20Token_24Decimals.address,
                lowAggregatorV3Test.address,
            );
            const oldPayAmount = getUsdToken(
                parseEther("0.1"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_24,
            );
            payAmount = getUsdToken(
                parseEther("0.2"),
                TOKEN_PRICE_LOW,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_24,
            );
            const refund = oldPayAmount.sub(payAmount);
            await expect(() =>
                auction.connect(user1).editBid(1, parseEther("0.2")),
            ).to.changeTokenBalances(
                mockERC20Token_24Decimals,
                [auction, user1],
                [refund.mul(-1), refund],
            );
        });

        it("Accept bid after edit", async () => {
            await auction.connect(user1).editBid(1, parseEther("0.2"));
            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            const bidItem = await auction.getBidById(1);

            const commission = getCommissionFirstTimeWithoutPhysical(
                bidItem.bidPriceToken,
            );

            const sellpriceToken: BigNumber = commission[0];
            const charityAmount: BigNumber = commission[1];
            const creatorAmount: BigNumber = commission[2];
            const web3reAmount: BigNumber = commission[3];
            await expect(() => auction.acceptBid(1)).to.changeTokenBalances(
                mockERC20Token_24Decimals,
                [auction, charity, creator, web3re],
                [
                    sellpriceToken.mul(-1).sub(1),
                    charityAmount,
                    creatorAmount,
                    web3reAmount.add(1),
                ],
            );
        });
    });

    describe("cancelAuction", () => {
        let timestamp: number;
        beforeEach(async () => {
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            await auction.createToken(
                "google.com",
                creator.address,
                true,
                5,
                false,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp + 1000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );
        });

        it("Should failed - Auction started", async () => {
            await auction.approveAddress(1);
            await auction
                .connect(owner)
                .transferNFTTo(auction.address, user1.address, 1);
            await auction
                .connect(user1)
                .reAuctionToken(
                    1,
                    parseEther("0.1"),
                    parseEther("0.0001"),
                    timestamp + 1000,
                    timestamp + 86400,
                    {
                        value: listingPriceSecondary,
                    },
                );
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);

            await expect(
                auction.connect(user1).cancelAuction(1),
            ).to.revertedWith("Auction started");
        });

        it("Should failed - Only item owner and not initialList", async () => {
            await expect(auction.cancelAuction(1)).to.revertedWith(
                "Only item owner and not initialList",
            );
            await auction.approveAddress(1);
            await auction
                .connect(owner)
                .transferNFTTo(auction.address, user1.address, 1);
            await auction
                .connect(user1)
                .reAuctionToken(
                    1,
                    parseEther("0.1"),
                    parseEther("0.0001"),
                    timestamp + 1000,
                    timestamp + 86400,
                    {
                        value: listingPriceSecondary,
                    },
                );

            await expect(auction.cancelAuction(1)).to.revertedWith(
                "Only item owner and not initialList",
            );
        });

        it("Should failed - Auction canceled", async () => {
            await auction.approveAddress(1);
            await auction
                .connect(owner)
                .transferNFTTo(auction.address, user1.address, 1);

            await expect(auction.cancelAuction(1)).to.revertedWith(
                "Auction canceled",
            );
        });

        it("Should cancel auction successfully", async () => {
            await auction.approveAddress(1);
            await auction
                .connect(owner)
                .transferNFTTo(auction.address, user1.address, 1);
            await auction
                .connect(user1)
                .reAuctionToken(
                    1,
                    parseEther("0.1"),
                    parseEther("0.0001"),
                    timestamp + 1000,
                    timestamp + 86400,
                    {
                        value: listingPriceSecondary,
                    },
                );

            await auction.connect(user1).cancelAuction(1);
            const auctionItem = await auction.getLastestAuctionToken(1);
            expect(auctionItem.sold).to.be.true;
        });

        it("Should cancel auction successfully - external minted token", async () => {
            await nft.setAdministratorStatus(minter.address, true);
            await nft.connect(minter).mint(user1.address, "");
            await auction
                .connect(user1)
                .createExternalMintedItem(
                    2,
                    creator.address,
                    true,
                    5,
                    parseEther("0.1"),
                    parseEther("0.001"),
                    timestamp + 1000,
                    timestamp + 86400,
                    { value: listingPriceSecondary },
                );
            await auction.connect(user1).cancelAuction(2);
            const auctionItem = await auction.getLastestAuctionToken(2);
            expect(auctionItem.sold).to.be.true;
        });
    });

    describe("reclaimAuction", () => {
        let timestamp: number;
        beforeEach(async () => {
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            await auction.createToken(
                "google.com",
                creator.address,
                true,
                5,
                false,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp + 1000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );
        });

        it("Should failed - Only auction owner", async () => {
            await ethers.provider.send("evm_increaseTime", [96400]);
            ethers.provider.send("evm_mine", []);

            await expect(
                auction.connect(user1).reclaimAuction(1),
            ).to.revertedWith("Only auction owner");
        });

        it("Should failed - Auction not end", async () => {
            await expect(
                auction.connect(owner).reclaimAuction(1),
            ).to.revertedWith("Auction not end");
        });

        it("Should failed - Auction already bidden", async () => {
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            await auction
                .connect(user1)
                .bidToken(
                    1,
                    mockERC20Token_24Decimals.address,
                    parseEther("0.121"),
                );
            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            await expect(
                auction.connect(owner).reclaimAuction(1),
            ).to.revertedWith("Auction already bidden");
        });

        it("Should failed - Auction canceled", async () => {
            await auction.approveAddress(1);
            await auction
                .connect(owner)
                .transferNFTTo(auction.address, user1.address, 1);

            await expect(auction.reclaimAuction(1)).to.revertedWith(
                "Auction canceled",
            );
        });

        it("Should successfully", async () => {
            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);

            await auction.reclaimAuction(1);
            const auctionItem = await auction.getLastestAuctionToken(1);
            expect(auctionItem.sold).to.be.true;
        });

        it("Should reclaim auction successfully - reAuction", async () => {
            await auction.approveAddress(1);
            await auction
                .connect(owner)
                .transferNFTTo(auction.address, user1.address, 1);
            await auction
                .connect(user1)
                .reAuctionToken(
                    1,
                    parseEther("0.1"),
                    parseEther("0.0001"),
                    timestamp + 1000,
                    timestamp + 86400,
                    {
                        value: listingPriceSecondary,
                    },
                );

            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);

            await auction.connect(user1).reclaimAuction(1);
            const auctionItem = await auction.getLastestAuctionToken(1);
            expect(auctionItem.sold).to.be.true;
        });

        it("Should reclaim auction successfully - external minted token", async () => {
            await nft.setAdministratorStatus(minter.address, true);
            await nft.connect(minter).mint(user1.address, "");
            await auction
                .connect(user1)
                .createExternalMintedItem(
                    2,
                    creator.address,
                    true,
                    5,
                    parseEther("0.1"),
                    parseEther("0.001"),
                    timestamp + 1000,
                    timestamp + 86400,
                    { value: listingPriceSecondary },
                );
            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            await auction.connect(user1).reclaimAuction(2);
            const auctionItem = await auction.getLastestAuctionToken(2);
            expect(auctionItem.sold).to.be.true;
        });
    });

    describe("withdraw", async () => {
        beforeEach(async () => {
            const timestamp = (await ethers.provider.getBlock("latest"))
                .timestamp;
            await auction.createToken(
                "google.com",
                creator.address,
                true,
                5,
                false,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp + 1000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );
        });

        it("Should failed - Ownable: caller is not the owner", async () => {
            await expect(
                auction
                    .connect(user2)
                    .withdrawFunds(owner.address, ADDRESS_ZERO),
            ).to.revertedWith("Ownable: caller is not the owner");
        });

        it("Should withdraw successfully - native token", async () => {
            await expect(() =>
                auction.withdrawFunds(owner.address, ADDRESS_ZERO),
            ).to.changeEtherBalances(
                [auction, owner],
                [listingPrice.mul(-1), listingPrice],
            );
        });

        it("Should failed - Nothing to withdraw - native token", async () => {
            await auction.withdrawFunds(owner.address, ADDRESS_ZERO);
            await expect(
                auction.withdrawFunds(owner.address, ADDRESS_ZERO),
            ).to.revertedWith("Nothing to withdraw");
        });

        it("Should failed - Nothing to withdraw - ERC20", async () => {
            await expect(
                auction.withdrawFunds(
                    owner.address,
                    mockERC20Token_18Decimals.address,
                ),
            ).to.revertedWith("Nothing to withdraw");
        });

        it("Should withdraw successfully - ERC20", async () => {
            await mockERC20Token_18Decimals
                .connect(user1)
                .transfer(auction.address, parseEther("0.01"));

            await expect(() =>
                auction.withdrawFunds(
                    owner.address,
                    mockERC20Token_18Decimals.address,
                ),
            ).to.changeTokenBalances(
                mockERC20Token_18Decimals,
                [auction, owner],
                [parseEther("0.01").mul(-1), parseEther("0.01")],
            );
        });
    });

    describe("admin transfer", () => {
        beforeEach(async () => {
            await nft.setAdministratorStatus(minter.address, true);
            await nft.connect(minter).mint(user1.address, "");
            const timestamp = (await ethers.provider.getBlock("latest"))
                .timestamp;
            await auction.createToken(
                "google.com",
                creator.address,
                true,
                5,
                false,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp + 1000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );
        });
        it("approveAddress failed - Ownable: caller is not the owner", async () => {
            await expect(
                auction.connect(user1).approveAddress(1),
            ).to.revertedWith("Ownable: caller is not the owner");
        });
        it("Should transfer external minted NFT successfully", async () => {
            await auction.approveAddress(1);
            await auction.transferNFTTo(user1.address, user2.address, 1);
            expect(await nft.ownerOf(1)).to.equal(user2.address);
        });
        it("Should transfer internal minted NFT successfully", async () => {
            await auction.approveAddress(2);
            await auction.transferNFTTo(auction.address, user2.address, 2);
            expect(await nft.ownerOf(2)).to.equal(user2.address);
            const auctionItem = await auction.getAuctionById(1);
            expect(auctionItem.sold).to.be.true;
        });
        it("Should transfer internal minted NFT successfully - from user", async () => {
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);

            await auction
                .connect(user1)
                .bidToken(
                    2,
                    mockERC20Token_24Decimals.address,
                    parseEther("0.1"),
                );

            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            await auction.acceptBid(2);

            await auction.approveAddress(2);
            await auction.transferNFTTo(user1.address, user2.address, 2);
            expect(await nft.ownerOf(2)).to.equal(user2.address);
            const auctionItem = await auction.getAuctionById(1);
            expect(auctionItem.sold).to.be.true;
        });
    });

    describe("getter functions", async () => {
        let timestamp: number;
        let payAmount: BigNumber;
        beforeEach(async () => {
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            await auction.createToken(
                "google.com",
                creator.address,
                true,
                5,
                false,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp + 1000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );
            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            await feeManager.setPaymentMethod(
                mockERC20Token_18Decimals.address,
                aggregatorV3Test.address,
            );

            await auction
                .connect(user1)
                .bidToken(
                    1,
                    mockERC20Token_24Decimals.address,
                    parseEther("0.1"),
                );

            await ethers.provider.send("evm_increaseTime", [86400]);
            ethers.provider.send("evm_mine", []);
            await auction.acceptBid(1);

            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            await auction
                .connect(user1)
                .reAuctionToken(
                    1,
                    parseEther("0.2"),
                    parseEther("0.0001"),
                    timestamp + 1000,
                    timestamp + 86400,
                    {
                        value: listingPriceSecondary,
                    },
                );

            await ethers.provider.send("evm_increaseTime", [1000]);
            ethers.provider.send("evm_mine", []);
            payAmount = getUsdToken(
                parseEther("0.21"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            await auction
                .connect(user2)
                .bidToken(1, ADDRESS_ZERO, parseEther("0.21"), {
                    value: payAmount,
                });
        });

        it("get highest bid", async () => {
            let bidItem = await auction.getHighestBidOfAuction(1);
            expect(bidItem.bidder).to.equal(user1.address);
            expect(bidItem.bidPriceUSD).to.equal(parseEther("0.1"));
            expect(bidItem.tokenId).to.equal(1);

            bidItem = await auction.getHighestBidOfLastestAuctionToken(1);
            expect(bidItem.bidder).to.equal(user2.address);
            expect(bidItem.bidPriceUSD).to.equal(parseEther("0.21"));
            expect(bidItem.tokenId).to.equal(1);
        });

        it("get price", async () => {
            const startPriceOfAuction =
                await auction.getUsdTokenStartPriceOfAuction(1, ADDRESS_ZERO);
            payAmount = getUsdToken(
                parseEther("0.1"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            expect(startPriceOfAuction[0]).to.be.true;
            expect(startPriceOfAuction[1]).to.equal(payAmount);

            const startPriceOfToken =
                await auction.getUsdTokenStartPriceOfToken(1, ADDRESS_ZERO);
            payAmount = getUsdToken(
                parseEther("0.2"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_18,
            );
            expect(startPriceOfToken[0]).to.be.true;
            expect(startPriceOfToken[1]).to.equal(payAmount);

            let tokenPrice = await auction.getUsdTokenPrice(
                parseEther("1"),
                mockERC20Token_24Decimals.address,
            );
            payAmount = getUsdToken(
                parseEther("1"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_24,
            );
            expect(tokenPrice[0]).to.be.true;
            expect(tokenPrice[1]).to.equal(payAmount);

            await feeManager.removePaymentMethod(
                mockERC20Token_18Decimals.address,
            );

            const result = await auction.getUsdTokenPrice(
                parseEther("1"),
                mockERC20Token_18Decimals.address,
            );
            expect(result[0]).to.be.false;

            const MockERC20Token: MockERC20Token__factory =
                await ethers.getContractFactory("MockERC20Token");
            const mockERC20Token_4Decimals = await MockERC20Token.deploy(
                TOKEN_DECIMALS_4,
            );
            await feeManager.setPaymentMethod(
                mockERC20Token_4Decimals.address,
                aggregatorV3Test.address,
            );

            tokenPrice = await auction.getUsdTokenPrice(
                parseEther("1"),
                mockERC20Token_4Decimals.address,
            );
            payAmount = getUsdToken(
                parseEther("1"),
                TOKEN_PRICE,
                PRICE_FEED_DECIMALS_8,
                TOKEN_DECIMALS_4,
            );
            expect(tokenPrice[0]).to.be.true;
            expect(tokenPrice[1]).to.equal(payAmount);
        });

        it("fetchItem", async () => {
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            await auction.createToken(
                "google.com",
                creator.address,
                true,
                5,
                false,
                parseEther("0.1"),
                parseEther("0.05"),
                timestamp + 1000,
                timestamp + 86400,
                parseEther("0.0001"),
                { value: listingPrice },
            );

            await auction
                .connect(user1)
                .createToken(
                    "google.com",
                    creator.address,
                    true,
                    5,
                    false,
                    parseEther("0.1"),
                    parseEther("0.05"),
                    timestamp + 1000,
                    timestamp + 86400,
                    parseEther("0.0001"),
                    { value: listingPrice },
                );

            let items = await auction.fetchAuctionItems();
            expect(items.length).to.equal(3);
            expect(items[0].tokenId).to.equal(1);
            expect(items[0].auctionId).to.equal(2);
            expect(items[1].tokenId).to.equal(2);
            expect(items[1].auctionId).to.equal(3);
            expect(items[2].tokenId).to.equal(3);
            expect(items[2].auctionId).to.equal(4);

            items = await auction.connect(user1).fetchMyNFTs();
            expect(items.length).to.equal(0);

            await auction.approveAddress(1);
            await auction
                .connect(owner)
                .transferNFTTo(auction.address, user1.address, 1);
            items = await auction.connect(user1).fetchMyNFTs();
            expect(items.length).to.equal(1);
            expect(items[0].tokenId).to.equal(1);
            expect(items[0].auctionId).to.equal(2);

            items = await auction.connect(user1).fetchItemsListed();
            expect(items.length).to.equal(2);
            expect(items[0].tokenId).to.equal(1);
            expect(items[0].auctionId).to.equal(2);
            expect(items[1].tokenId).to.equal(3);
            expect(items[1].auctionId).to.equal(4);
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
        amount = amount.div(BigNumber.from("10").pow(18 - decimals));
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
    bidPriceToken: BigNumber,
    reservePriceToken: BigNumber,
): [BigNumber, BigNumber, BigNumber, BigNumber] => {
    const sellpriceTokenWithFee = bidPriceToken.mul(102).div(100);
    const charityAmount = bidPriceToken
        .sub(reservePriceToken)
        .mul(80)
        .div(100)
        .add(reservePriceToken.mul(20).div(100));
    const creatorAmount = reservePriceToken.mul(65).div(100);
    const web3reAmount = sellpriceTokenWithFee
        .sub(charityAmount)
        .sub(creatorAmount);
    return [sellpriceTokenWithFee, charityAmount, creatorAmount, web3reAmount];
};

const getCommissionFirstTimeWithoutPhysical = (
    bidPriceToken: BigNumber,
): [BigNumber, BigNumber, BigNumber, BigNumber] => {
    const sellpriceTokenWithFee = bidPriceToken.mul(102).div(100);
    const charityAmount = bidPriceToken.mul(10).div(100);
    const creatorAmount = bidPriceToken.mul(85).div(100);
    const web3reAmount = sellpriceTokenWithFee
        .sub(charityAmount)
        .sub(creatorAmount);
    return [sellpriceTokenWithFee, charityAmount, creatorAmount, web3reAmount];
};

const getCommissionReAuctionCustodialWallet = (
    bidPriceToken: BigNumber,
    royaltyPercent: number,
): [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber] => {
    const sellpriceTokenWithFee = bidPriceToken.mul(102).div(100);
    let creatorAmount = BigNumber.from(0);
    if (royaltyPercent > 2) {
        creatorAmount = bidPriceToken.mul(2).div(100);
    }
    const charityAmount = bidPriceToken.mul(10).div(100);
    const sellerAmount = bidPriceToken.mul(80).div(100);
    const web3reAmount = sellpriceTokenWithFee
        .sub(charityAmount)
        .sub(creatorAmount)
        .sub(sellerAmount);
    return [
        sellpriceTokenWithFee,
        creatorAmount,
        charityAmount,
        sellerAmount,
        web3reAmount,
    ];
};

const getCommissionReAuctionNonCustodialWallet = (
    bidPriceToken: BigNumber,
    royaltyPercent: number,
): [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber] => {
    const sellpriceTokenWithFee = bidPriceToken.mul(102).div(100);
    const creatorAmount = bidPriceToken.mul(royaltyPercent).div(100);
    const charityAmount = bidPriceToken.mul(10).div(100);
    const sellerAmount = bidPriceToken.mul(80).div(100);
    const web3reAmount = sellpriceTokenWithFee
        .sub(charityAmount)
        .sub(creatorAmount)
        .sub(sellerAmount);
    return [
        sellpriceTokenWithFee,
        creatorAmount,
        charityAmount,
        sellerAmount,
        web3reAmount,
    ];
};
