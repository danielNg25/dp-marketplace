import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import { DPMarketplaceC1__factory } from "../typechain-types";
import { DPNFT__factory } from "../typechain-types";

import { DPMarketplaceC1 } from "../typechain-types";
import { DPNFT } from "../typechain-types";

import { parseEther } from "ethers/lib/utils";

describe("Marketplace", () => {
    const PERCENT_BASIS_POINT = BigNumber.from("10000");
    const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
    const MATIC_PRICE = 88942317;

    let listingPrice: BigNumber;
    let listingPriceSecondary: BigNumber;

    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let minter: SignerWithAddress;
    let charity: SignerWithAddress;
    let web3re: SignerWithAddress;
    let creator: SignerWithAddress;

    let marketplace: DPMarketplaceC1;
    let nft: DPNFT;

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
        const Marketplace: DPMarketplaceC1__factory = await ethers.getContractFactory("DPMarketplaceC1");

        nft = await DPNFT.deploy();
        marketplace = await Marketplace.deploy(owner.address, charity.address, web3re.address, nft.address);

        await nft.setAdministratorStatus(marketplace.address, true);

        listingPrice = await marketplace.getListingPrice();
        listingPriceSecondary = await marketplace.getListingPriceSecondary();
    });

    describe("createToken", () => {
        it("Should failed - Price must be >= reserve price", async () => {
            await expect(
                marketplace.createToken("google.com", creator.address, true, 5, true, 500, 1000, parseEther("0.0001"), {
                    value: listingPrice,
                })
            ).to.revertedWith("Price must be >= reserve price");
        });

        it("Should failed - Price must be at least 1 wei", async () => {
            await expect(
                marketplace.createToken("google.com", creator.address, true, 5, true, 1000, 500, parseEther("0"), {
                    value: listingPrice,
                })
            ).to.revertedWith("Price must be at least 1 wei");
        });

        it("Should failed - Price must be = listing price", async () => {
            await expect(
                marketplace.createToken("google.com", creator.address, true, 5, true, 1000, 500, parseEther("0.0001"), {
                    value: listingPrice.add(1),
                })
            ).to.revertedWith("Price must be = listing price");
        });

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
                1000,
                500,
                parseEther("0.0001"),
                { value: listingPrice }
            );
        });

        it("Should failed - Only item o", async () => {
            await expect(
                marketplace
                    .connect(user2)
                    .createExternalMintedItem(1, creator.address, true, 5, 1000, parseEther("0.0001"), {
                        value: listingPriceSecondary,
                    })
            ).to.revertedWith("Only item o");
        });

        it("Should failed - Price must be = Sec list price", async () => {
            await expect(
                marketplace
                    .connect(user1)
                    .createExternalMintedItem(1, creator.address, true, 5, 1000, parseEther("0.0001"), {
                        value: listingPriceSecondary.sub(1),
                    })
            ).to.revertedWith("Price must be = Sec list price");
        });

        it("Should create successfully", async () => {
            await marketplace
                .connect(user1)
                .createExternalMintedItem(1, creator.address, true, 5, 1000, parseEther("0.0001"), {
                    value: listingPriceSecondary,
                });

            let marketItem = await marketplace.getMarketItem(1);
            expect(marketItem.tokenId).to.equal(1);
            expect(marketItem.seller).to.equal(user1.address);
            expect(marketItem.c_Wallet).to.equal(creator.address);
            expect(marketItem.isCustodianWallet).to.be.true;
            expect(marketItem.royalty).to.equal(5);
            expect(marketItem.withPhysical).to.be.false;
            expect(marketItem.sellpriceUSD).to.equal(1000);
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.price).to.equal(parseEther("0.0001"));
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.false;
        });
    });

    describe("createMarketSale first time - initialList: true - withPhysical: true", () => {
        let marketItem;
        let sellpriceMatic: BigNumber;
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
                1000,
                500,
                parseEther("0.0001"),
                { value: listingPrice }
            );
            marketItem = await marketplace.getMarketItem(1);
            [sellpriceMatic, charityAmount, creatorAmount, web3reAmount] = getCommissionFirstTimeWithPhysical(
                marketItem.sellpriceUSD,
                marketItem.reservePriceUSD,
                MATIC_PRICE
            );
        });

        it("Should failed - missing asking price", async () => {
            await expect(
                marketplace.connect(user1).createMarketSale(1, { value: sellpriceMatic.sub(1) })
            ).to.revertedWith("missing asking price");
        });

        it("Should createMarketSale successfully", async () => {
            expect(await marketplace.getUsdMaticPrice(1)).to.equal(sellpriceMatic);
            await expect(() =>
                marketplace.connect(user1).createMarketSale(1, { value: sellpriceMatic })
            ).to.changeEtherBalances([charity, creator, web3re], [charityAmount, creatorAmount, web3reAmount]);

            marketItem = await marketplace.getMarketItem(1);
            expect(await nft.ownerOf(1)).to.equal(user1.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.sellpriceUSD).to.equal(1000);
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
                1000,
                1000,
                parseEther("0.0001"),
                { value: listingPrice }
            );
            marketItem = await marketplace.getMarketItem(2);
            [sellpriceMatic, charityAmount, creatorAmount, web3reAmount] = getCommissionFirstTimeWithPhysical(
                marketItem.sellpriceUSD,
                marketItem.reservePriceUSD,
                MATIC_PRICE
            );

            expect(await marketplace.getUsdMaticPrice(2)).to.equal(sellpriceMatic);
            await expect(() =>
                marketplace.connect(user1).createMarketSale(2, { value: sellpriceMatic })
            ).to.changeEtherBalances([charity, creator, web3re], [charityAmount, creatorAmount, web3reAmount]);

            marketItem = await marketplace.getMarketItem(2);
            expect(await nft.ownerOf(2)).to.equal(user1.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.sellpriceUSD).to.equal(1000);
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });
    });

    describe("createMarketSale first time - initialList: true - withPhysical: false", () => {
        let marketItem;
        let sellpriceMatic: BigNumber;
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
                1000,
                500,
                parseEther("0.0001"),
                { value: listingPrice }
            );
            marketItem = await marketplace.getMarketItem(1);
            [sellpriceMatic, charityAmount, creatorAmount, web3reAmount] = getCommissionFirstTimeWithPhysical(
                marketItem.sellpriceUSD,
                marketItem.reservePriceUSD,
                MATIC_PRICE
            );
        });

        it("Should failed - missing asking price", async () => {
            await expect(
                marketplace.connect(user1).createMarketSale(1, { value: sellpriceMatic.sub(1) })
            ).to.revertedWith("missing asking price");
        });

        it("Should createMarketSale successfully", async () => {
            marketItem = await marketplace.getMarketItem(1);
            [sellpriceMatic, charityAmount, creatorAmount, web3reAmount] = getCommissionFirstTimeWithoutPhysical(
                marketItem.sellpriceUSD,
                MATIC_PRICE
            );
            await expect(() =>
                marketplace.connect(user1).createMarketSale(1, { value: sellpriceMatic })
            ).to.changeEtherBalances([charity, creator, web3re], [charityAmount, creatorAmount, web3reAmount]);
            expect(await nft.ownerOf(1)).to.equal(user1.address);

            marketItem = await marketplace.getMarketItem(1);
            expect(await nft.ownerOf(1)).to.equal(user1.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.sellpriceUSD).to.equal(1000);
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });

        it("Should failed createExternalMintedItem - Item already listed", async () => {
            marketItem = await marketplace.getMarketItem(1);
            [sellpriceMatic, charityAmount, creatorAmount, web3reAmount] = getCommissionFirstTimeWithoutPhysical(
                marketItem.sellpriceUSD,
                MATIC_PRICE
            );
            await marketplace.connect(user1).createMarketSale(1, { value: sellpriceMatic });

            await expect(
                marketplace
                    .connect(user1)
                    .createExternalMintedItem(1, creator.address, true, 5, 1000, parseEther("0.0001"), {
                        value: listingPriceSecondary,
                    })
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
                1000,
                500,
                parseEther("0.0001"),
                { value: listingPrice }
            );
            let marketItem = await marketplace.getMarketItem(1);
            let sellpriceMatic = getUsdMatic(marketItem.sellpriceUSD, MATIC_PRICE);
            await marketplace.connect(user1).createMarketSale(1, { value: sellpriceMatic });
        });

        it("Should failed - Can not resell unsold item", async () => {
            await nft.setAdministratorStatus(minter.address, true);
            await nft.connect(minter).mint(user1.address, "");
            await expect(
                marketplace
                    .connect(user2)
                    .resellToken(2, 2000, parseEther("0.0011"), false, { value: listingPriceSecondary })
            ).to.revertedWith("Can not resell unsold item");
        });

        it("Should failed - Only item o", async () => {
            await expect(
                marketplace
                    .connect(user2)
                    .resellToken(1, 2000, parseEther("0.0011"), false, { value: listingPriceSecondary })
            ).to.revertedWith("Only item o");
        });

        it("Should failed - Price must be = Sec list price", async () => {
            await expect(
                marketplace
                    .connect(user1)
                    .resellToken(1, 2000, parseEther("0.0011"), false, { value: listingPriceSecondary.sub(1) })
            ).to.revertedWith("Price must be = Sec list price");
        });

        it("Should resellToken successfully", async () => {
            await marketplace
                .connect(user1)
                .resellToken(1, 2000, parseEther("0.0011"), false, { value: listingPriceSecondary });

            let marketItem = await marketplace.getMarketItem(1);
            expect(marketItem.seller).to.equal(user1.address);
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
    });

    describe("resellToken - unlist", () => {
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
            let sellpriceMatic = getUsdMatic(marketItem.sellpriceUSD, MATIC_PRICE);
            await marketplace.connect(user1).createMarketSale(1, { value: sellpriceMatic });
            await marketplace
                .connect(user1)
                .resellToken(1, 2000, parseEther("0.0011"), false, { value: listingPriceSecondary });
        });

        it("Should failed - Only s may unlist", async () => {
            await expect(marketplace.connect(user2).resellToken(1, 2000, parseEther("0.0011"), true)).to.revertedWith(
                "Only s may unlist"
            );
        });

        it("Should failed - Only s may unlist - initialist item", async () => {
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
            await expect(marketplace.connect(user2).resellToken(2, 2000, parseEther("0.0011"), true)).to.revertedWith(
                "Only s may unlist"
            );
            await expect(marketplace.resellToken(2, 2000, parseEther("0.0011"), true)).to.revertedWith(
                "Only s may unlist"
            );
        });

        it("Should resellToken - unlist successfully", async () => {
            await marketplace.connect(user1).resellToken(1, 2000, parseEther("0.0011"), true);

            let marketItem = await marketplace.getMarketItem(1);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
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
        let sellpriceMatic: BigNumber;
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
                1000,
                500,
                parseEther("0.0001"),
                { value: listingPrice }
            );
            let marketItem = await marketplace.getMarketItem(1);
            let sellpriceMatic = getUsdMatic(marketItem.sellpriceUSD, MATIC_PRICE);
            await marketplace.connect(user1).createMarketSale(1, { value: sellpriceMatic });
            await marketplace
                .connect(user1)
                .resellToken(1, 2000, parseEther("0.0011"), false, { value: listingPriceSecondary });
        });

        it("Should createMarketSale after resell successfully", async () => {
            let marketItem = await marketplace.getMarketItem(1);
            [sellpriceMatic, creatorAmount, charityAmount, sellerAmount, web3reAmount] =
                getCommissionResellCustodialWallet(marketItem.sellpriceUSD, 5, MATIC_PRICE);
            await expect(() =>
                marketplace.connect(user2).createMarketSale(1, { value: sellpriceMatic })
            ).to.changeEtherBalances(
                [user1, charity, creator, web3re],
                [sellerAmount, charityAmount, creatorAmount, web3reAmount]
            );

            expect(await nft.ownerOf(1)).to.equal(user2.address);

            marketItem = await marketplace.getMarketItem(1);
            expect(await nft.ownerOf(1)).to.equal(user2.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
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
            sellpriceMatic = getUsdMatic(marketItem.sellpriceUSD, MATIC_PRICE);
            await marketplace.connect(user1).createMarketSale(2, { value: sellpriceMatic });
            await marketplace
                .connect(user1)
                .resellToken(2, 2000, parseEther("0.0011"), false, { value: listingPriceSecondary });

            marketItem = await marketplace.getMarketItem(2);
            [sellpriceMatic, creatorAmount, charityAmount, sellerAmount, web3reAmount] =
                getCommissionResellCustodialWallet(marketItem.sellpriceUSD, 1, MATIC_PRICE);
            await expect(() =>
                marketplace.connect(user2).createMarketSale(2, { value: sellpriceMatic })
            ).to.changeEtherBalances(
                [user1, charity, creator, web3re],
                [sellerAmount, charityAmount, creatorAmount, web3reAmount]
            );

            expect(await nft.ownerOf(2)).to.equal(user2.address);

            marketItem = await marketplace.getMarketItem(2);
            expect(await nft.ownerOf(2)).to.equal(user2.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.sellpriceUSD).to.equal(2000);
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });
    });

    describe("createMarketSale after resell - initialList: false - isCustodianWallet: false", () => {
        let sellpriceMatic: BigNumber;
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
                1000,
                500,
                parseEther("0.0001"),
                { value: listingPrice }
            );
            let marketItem = await marketplace.getMarketItem(1);
            let sellpriceMatic = getUsdMatic(marketItem.sellpriceUSD, MATIC_PRICE);
            await marketplace.connect(user1).createMarketSale(1, { value: sellpriceMatic });
            await marketplace
                .connect(user1)
                .resellToken(1, 2000, parseEther("0.0011"), false, { value: listingPriceSecondary });
        });
        it("Should createMarketSale after resell successfully", async () => {
            let marketItem = await marketplace.getMarketItem(1);
            [sellpriceMatic, creatorAmount, charityAmount, sellerAmount, web3reAmount] =
                getCommissionResellNonCustodialWallet(marketItem.sellpriceUSD, MATIC_PRICE);
            await expect(() =>
                marketplace.connect(user2).createMarketSale(1, { value: sellpriceMatic })
            ).to.changeEtherBalances(
                [user1, charity, creator, web3re],
                [sellerAmount, charityAmount, creatorAmount, web3reAmount]
            );

            expect(await nft.ownerOf(1)).to.equal(user2.address);

            marketItem = await marketplace.getMarketItem(1);
            expect(await nft.ownerOf(1)).to.equal(user2.address);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.sellpriceUSD).to.equal(2000);
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });
    });

    describe("admin transfer", () => {
        let marketItem;
        let sellpriceMatic: BigNumber;
        let charityAmount: BigNumber;
        let creatorAmount: BigNumber;
        let web3reAmount: BigNumber;
        beforeEach(async () => {
            await nft.setAdministratorStatus(minter.address, true);
            await nft.connect(minter).mint(user1.address, "");
            await marketplace
                .connect(user1)
                .createToken("google.com", creator.address, true, 5, true, 1000, 500, parseEther("0.0001"), {
                    value: listingPrice,
                });
            marketItem = await marketplace.getMarketItem(2);
            [sellpriceMatic, charityAmount, creatorAmount, web3reAmount] = getCommissionFirstTimeWithPhysical(
                marketItem.sellpriceUSD,
                marketItem.reservePriceUSD,
                MATIC_PRICE
            );
        });
        it("approveAddress failed - Only mktplace owner can appoint approvers", async () => {
            await expect(marketplace.connect(user1).approveAddress(1)).to.revertedWith(
                "Only mktplace owner can appoint approvers"
            );
        });
        it("Should transfer external minted NFT successfully", async () => {
            await marketplace.approveAddress(1);
            await marketplace.transferNFTTo(user1.address, user2.address, 1);
            expect(await nft.ownerOf(1)).to.equal(user2.address);
        });
        it("Should transfer internal minted NFT successfully", async () => {
            await marketplace.approveAddress(2);
            await marketplace.transferNFTTo(marketplace.address, user2.address, 2);
            expect(await nft.ownerOf(2)).to.equal(user2.address);
            let marketItem = await marketplace.getMarketItem(2);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });
        it("Should transfer internal minted NFT successfully - from user", async () => {
            marketplace.connect(user1).createMarketSale(2, { value: sellpriceMatic });

            await marketplace.approveAddress(2);
            await marketplace.transferNFTTo(user1.address, user2.address, 2);
            expect(await nft.ownerOf(2)).to.equal(user2.address);
            let marketItem = await marketplace.getMarketItem(2);
            expect(marketItem.seller).to.equal(ADDRESS_ZERO);
            expect(marketItem.reservePriceUSD).to.equal(0);
            expect(marketItem.initialList).to.be.false;
            expect(marketItem.sold).to.be.true;
        });
    });

    describe("updateListingPriceSecondary", () => {
        it("Should failed - Only mktplace owner can upd Sec list price.", async () => {
            await expect(
                marketplace.connect(user1).updateListingPriceSecondary(listingPriceSecondary.sub(1))
            ).to.revertedWith("Only mktplace owner can upd Sec list price.");
        });

        it("Should update successfully.", async () => {
            await marketplace.updateListingPriceSecondary(listingPriceSecondary.sub(1));
        });
    });

    describe("getter functions", () => {
        let marketItem;
        let sellpriceMatic: BigNumber;
        let charityAmount: BigNumber;
        let creatorAmount: BigNumber;
        let web3reAmount: BigNumber;

        it("fetchMarketItems", async () => {
            await marketplace
                .connect(user1)
                .createToken("google.com", creator.address, true, 5, true, 1000, 500, parseEther("0.0001"), {
                    value: listingPrice,
                });

            await marketplace
                .connect(user1)
                .createToken("google.com", creator.address, true, 5, true, 1000, 500, parseEther("0.0001"), {
                    value: listingPrice,
                });

            await marketplace
                .connect(user1)
                .createToken("google.com", creator.address, true, 5, true, 1000, 500, parseEther("0.0001"), {
                    value: listingPrice,
                });
            let item = await marketplace.getMarketItem(1);
            [sellpriceMatic, charityAmount, creatorAmount, web3reAmount] = getCommissionFirstTimeWithPhysical(
                item.sellpriceUSD,
                item.reservePriceUSD,
                MATIC_PRICE
            );
            await marketplace.connect(user2).createMarketSale(1, { value: sellpriceMatic });

            const marketItem = await marketplace.fetchMarketItems();
            expect(marketItem.length).to.equal(2);
            expect(marketItem[0].tokenId).to.equal(2);
            expect(marketItem[1].tokenId).to.equal(3);
        });

        it("fetchMyNFTs", async () => {
            await marketplace
                .connect(user1)
                .createToken("google.com", creator.address, true, 5, true, 1000, 500, parseEther("0.0001"), {
                    value: listingPrice,
                });

            await marketplace
                .connect(user1)
                .createToken("google.com", creator.address, true, 5, true, 1000, 500, parseEther("0.0001"), {
                    value: listingPrice,
                });

            await marketplace
                .connect(user1)
                .createToken("google.com", creator.address, true, 5, true, 1000, 500, parseEther("0.0001"), {
                    value: listingPrice,
                });
            marketItem = await marketplace.getMarketItem(1);
            [sellpriceMatic, charityAmount, creatorAmount, web3reAmount] = getCommissionFirstTimeWithPhysical(
                marketItem.sellpriceUSD,
                marketItem.reservePriceUSD,
                MATIC_PRICE
            );
            await marketplace.connect(user2).createMarketSale(1, { value: sellpriceMatic });
            await marketplace.connect(user2).createMarketSale(2, { value: sellpriceMatic });
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
                .createToken("google.com", creator.address, true, 5, true, 1000, 500, parseEther("0.0001"), {
                    value: listingPrice,
                });

            await marketplace
                .connect(user1)
                .createToken("google.com", creator.address, true, 5, true, 1000, 500, parseEther("0.0001"), {
                    value: listingPrice,
                });

            await marketplace
                .connect(user2)
                .createToken("google.com", creator.address, true, 5, true, 1000, 500, parseEther("0.0001"), {
                    value: listingPrice,
                });

            const listItem = await marketplace.connect(user1).fetchItemsListed();
            expect(listItem.length).to.equal(2);
            expect(listItem[0].tokenId).to.equal(1);
            expect(listItem[1].tokenId).to.equal(2);
        });

        it("withdraw", async () => {
            await marketplace
                .connect(user1)
                .createToken("google.com", creator.address, true, 5, true, 1000, 500, parseEther("0.0001"), {
                    value: listingPrice,
                });
            await expect(marketplace.connect(user2).withdraw()).to.revertedWith("Only mktplace owner can withdraw");
            await expect(() => marketplace.withdraw()).to.changeEtherBalances(
                [marketplace, owner],
                [listingPrice.mul(-1), listingPrice]
            );
        });
    });
});

const getMaticPrice = (maticPrice: number): BigNumber => {
    let e10 = BigNumber.from("10000000000");
    let maticPriceBig = BigNumber.from(maticPrice);
    return maticPriceBig.mul(e10);
};

const getUsdMatic = (amount: BigNumber, maticPrice: number): BigNumber => {
    let e18 = BigNumber.from("1000000000000000000");
    let maticPriceBig = getMaticPrice(maticPrice);
    let adjust_price = maticPriceBig.mul(e18);
    let usd = amount.mul(e18);
    let rate = usd.mul(e18).div(adjust_price);
    return rate.mul(102).div(100);
};

const getUsdOrgMatic = (amount: BigNumber, maticPrice: number): BigNumber => {
    let e18 = BigNumber.from("1000000000000000000");
    let maticPriceBig = getMaticPrice(maticPrice);
    let adjust_price = maticPriceBig.mul(e18);
    let usd = amount.mul(e18);
    let rate = usd.mul(e18).div(adjust_price);
    return rate;
};

const getCommissionFirstTimeWithPhysical = (
    marketItemSellPriceUSD: BigNumber,
    marketItemReservePriceUSD: BigNumber,
    maticPrice: number
): [BigNumber, BigNumber, BigNumber, BigNumber] => {
    let sellpriceMatic = getUsdMatic(marketItemSellPriceUSD, maticPrice);
    let charityAmount = getUsdOrgMatic(marketItemSellPriceUSD.sub(marketItemReservePriceUSD), maticPrice)
        .mul(80)
        .div(100)
        .add(getUsdOrgMatic(marketItemReservePriceUSD, maticPrice).mul(20).div(100));
    let creatorAmount = getUsdOrgMatic(marketItemReservePriceUSD.mul(65).div(100), maticPrice);
    let web3reAmount = sellpriceMatic.sub(charityAmount).sub(creatorAmount);
    return [sellpriceMatic, charityAmount, creatorAmount, web3reAmount];
};

const getCommissionFirstTimeWithoutPhysical = (
    marketItemSellPriceUSD: BigNumber,
    maticPrice: number
): [BigNumber, BigNumber, BigNumber, BigNumber] => {
    let sellpriceMatic = getUsdMatic(marketItemSellPriceUSD, maticPrice);
    let charityAmount = getUsdOrgMatic(marketItemSellPriceUSD.mul(10).div(100), maticPrice);
    let creatorAmount = getUsdOrgMatic(marketItemSellPriceUSD.mul(85).div(100), maticPrice);
    let web3reAmount = sellpriceMatic.sub(charityAmount).sub(creatorAmount);
    return [sellpriceMatic, charityAmount, creatorAmount, web3reAmount];
};

const getCommissionResellCustodialWallet = (
    marketItemSellPriceUSD: BigNumber,
    royaltyPercent: number,
    maticPrice: number
): [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber] => {
    let sellpriceMatic = getUsdMatic(marketItemSellPriceUSD, maticPrice);
    let creatorAmount = BigNumber.from(0);
    if (royaltyPercent > 2) {
        creatorAmount = getUsdOrgMatic(marketItemSellPriceUSD.mul(2).div(100), maticPrice);
    }
    let charityAmount = getUsdOrgMatic(marketItemSellPriceUSD.mul(10).div(100), maticPrice);
    let sellerAmount = getUsdOrgMatic(marketItemSellPriceUSD.mul(80).div(100), maticPrice);
    let web3reAmount = sellpriceMatic.sub(charityAmount).sub(creatorAmount).sub(sellerAmount);
    return [sellpriceMatic, creatorAmount, charityAmount, sellerAmount, web3reAmount];
};

const getCommissionResellNonCustodialWallet = (
    marketItemSellPriceUSD: BigNumber,
    maticPrice: number
): [BigNumber, BigNumber, BigNumber, BigNumber, BigNumber] => {
    let sellpriceMatic = getUsdMatic(marketItemSellPriceUSD, maticPrice);
    let creatorAmount = getUsdOrgMatic(marketItemSellPriceUSD.mul(5).div(100), maticPrice);
    let charityAmount = getUsdOrgMatic(marketItemSellPriceUSD.mul(10).div(100), maticPrice);
    let sellerAmount = getUsdOrgMatic(marketItemSellPriceUSD.mul(80).div(100), maticPrice);
    let web3reAmount = sellpriceMatic.sub(charityAmount).sub(creatorAmount).sub(sellerAmount);
    return [sellpriceMatic, creatorAmount, charityAmount, sellerAmount, web3reAmount];
};
