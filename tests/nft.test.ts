import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";

import { ethers } from "hardhat";

import { DPNFT__factory } from "../typechain-types";

import { DPNFT } from "../typechain-types";

describe("DPNFT", () => {
    const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let minter: SignerWithAddress;
    let creator: SignerWithAddress;
    let nft: DPNFT;

    beforeEach(async () => {
        const accounts: SignerWithAddress[] = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        minter = accounts[3];
        creator = accounts[3];

        const DPNFT: DPNFT__factory = await ethers.getContractFactory("DPNFT");

        nft = await DPNFT.deploy();

        await nft.setAdministratorStatus(minter.address, true);
    });

    describe("Deployment", () => {
        it("Should deploy successfully", async () => {
            expect(await nft.administrators(minter.address)).to.be.true;
        });
    });

    describe("setURIPrefic", () => {
        it("Should failed - Ownable: caller is not the owner", async () => {
            await expect(
                nft.connect(user1).setURIPrefix("alo.com"),
            ).to.revertedWith("Ownable: caller is not the owner");
        });

        it("Should set successfully", async () => {
            await nft.connect(owner).setURIPrefix("alo.com");
            expect(await nft.baseURI()).to.equal("alo.com");
        });
    });

    describe("Mint", () => {
        it("Should failed - Not administrator", async () => {
            await expect(
                nft
                    .connect(user1)
                    .mint(user2.address, "123", creator.address, 0),
            ).to.revertedWith("DPNFT: Not administrator");
        });

        it("Should mint basic token successfully", async () => {
            await nft
                .connect(minter)
                .mint(user2.address, "123", creator.address, 0);
            expect(await nft.ownerOf(1)).to.equal(user2.address);
            expect(await nft.tokenURI(1)).to.equal("123");
            expect(await nft.creators(1)).to.equal(creator.address);
            expect(await nft.tokenType(1)).to.equal(0);
        });

        it("Should mint HasPhysical token successfully", async () => {
            await nft
                .connect(minter)
                .mint(user2.address, "123", creator.address, 1);
            expect(await nft.ownerOf(1)).to.equal(user2.address);
            expect(await nft.tokenURI(1)).to.equal("123");
            expect(await nft.creators(1)).to.equal(creator.address);
            expect(await nft.tokenType(1)).to.equal(1);
        });

        it("Should mint Fragment token successfully", async () => {
            await nft
                .connect(minter)
                .mint(user2.address, "123", creator.address, 3);
            expect(await nft.ownerOf(1)).to.equal(user2.address);
            expect(await nft.tokenURI(1)).to.equal("123");
            expect(await nft.creators(1)).to.equal(creator.address);
            expect(await nft.tokenType(1)).to.equal(3);
            expect(await nft.vaults(1)).to.not.equal(ADDRESS_ZERO);
        });

        it("Should mint series token failed - use mintSeriesToken instead", async () => {
            await expect(
                nft
                    .connect(minter)
                    .mint(user2.address, "123", creator.address, 2),
            ).to.revertedWith("DPNFT: use mintSeriesToken instead");
        });

        it("Should mint Series failed - Invalid series id", async () => {
            await expect(
                nft
                    .connect(minter)
                    .mintSeriesToken(
                        user2.address,
                        "123",
                        creator.address,
                        1,
                        minter.address,
                    ),
            ).to.revertedWith("DPNFT: Invalid series id");
        });

        it("Should mint Series token successfully", async () => {
            await nft
                .connect(minter)
                .mintSeriesToken(
                    user2.address,
                    "123",
                    creator.address,
                    0,
                    minter.address,
                );
            expect(await nft.ownerOf(1)).to.equal(user2.address);
            expect(await nft.tokenURI(1)).to.equal("123");
            expect(await nft.creators(1)).to.equal(creator.address);
            expect(await nft.tokenType(1)).to.equal(2);
            expect(await nft.seriesLength(1)).to.equal(1);
            expect(await nft.totalSeries()).to.equal(1);
            expect(await nft.ownerOfSeries(1)).to.equal(minter.address);
            expect(await nft.tokenIdToSeries(1)).to.equal(1);

            let serie = await nft.series(1);
            expect(serie.length).to.equal(1);
            expect(serie[0]).to.equal(1);

            await nft
                .connect(minter)
                .mintSeriesToken(
                    user2.address,
                    "123",
                    creator.address,
                    0,
                    minter.address,
                );

            expect(await nft.seriesLength(2)).to.equal(1);
            expect(await nft.totalSeries()).to.equal(2);

            await nft
                .connect(minter)
                .mintSeriesToken(
                    user2.address,
                    "123",
                    creator.address,
                    1,
                    minter.address,
                );

            expect(await nft.seriesLength(1)).to.equal(2);
            expect(await nft.totalSeries()).to.equal(2);
            serie = await nft.series(1);
            expect(serie.length).to.equal(2);
            expect(serie[1]).to.equal(3);
        });

        it("Should mint Series failed - Only series owner", async () => {
            await nft
                .connect(minter)
                .mintSeriesToken(
                    user2.address,
                    "123",
                    creator.address,
                    0,
                    minter.address,
                );

            await expect(
                nft
                    .connect(minter)
                    .mintSeriesToken(
                        user2.address,
                        "123",
                        creator.address,
                        1,
                        user1.address,
                    ),
            ).to.revertedWith("DPNFT: Only series owner");
        });

        it("Should mint batch failed - Not administrator", async () => {
            await expect(
                nft.mintBatch(
                    [user2.address, user1.address],
                    ["123", "456"],
                    [creator.address, creator.address],
                    [0, 0],
                ),
            ).to.revertedWith("DPNFT: Not administrator");
        });

        it("Should mint batch failed - Invalid input length", async () => {
            await expect(
                nft
                    .connect(minter)
                    .mintBatch(
                        [user2.address],
                        ["123", "456"],
                        [creator.address, creator.address],
                        [0, 0],
                    ),
            ).to.revertedWith("DPNFT: Invalid input length");
            await expect(
                nft.connect(minter).mintBatch([], [], [], []),
            ).to.revertedWith("DPNFT: Invalid input length");
        });

        it("Should mint batch successfully", async () => {
            await nft
                .connect(minter)
                .mintBatch(
                    [user2.address, user1.address],
                    ["123", "456"],
                    [creator.address, creator.address],
                    [0, 3],
                );
            const tokens = await nft.tokensOfOwner(user2.address);
            expect(await nft.totalSupply()).to.equal(2);
            expect(tokens.length).to.equal(1);
            expect(tokens[0]).to.equal(1);
            expect(await nft.tokenType(1)).to.equal(0);
            expect(await nft.vaults(1)).to.equal(ADDRESS_ZERO);
            expect(await nft.tokenType(2)).to.equal(3);
            expect(await nft.vaults(2)).to.not.equal(ADDRESS_ZERO);
        });

        it("Should mint batch series failed - Not administrator", async () => {
            await expect(
                nft.mintBatchSeries(
                    [user2.address, user1.address],
                    ["123", "456"],
                    [creator.address, creator.address],
                    [0, 0],
                    minter.address,
                ),
            ).to.revertedWith("DPNFT: Not administrator");
        });

        it("Should mint batch series failed - Invalid input length", async () => {
            await expect(
                nft
                    .connect(minter)
                    .mintBatchSeries(
                        [user2.address],
                        ["123", "456"],
                        [creator.address, creator.address],
                        [0, 0],
                        minter.address,
                    ),
            ).to.revertedWith("DPNFT: Invalid input length");
            await expect(
                nft
                    .connect(minter)
                    .mintBatchSeries([], [], [], [], minter.address),
            ).to.revertedWith("DPNFT: Invalid input length");
        });

        it("Should mint batch series successfully", async () => {
            await nft
                .connect(minter)
                .mintBatchSeries(
                    [user2.address, user1.address],
                    ["123", "456"],
                    [creator.address, creator.address],
                    [0, 0],
                    minter.address,
                );
            const tokens = await nft.tokensOfOwner(user2.address);
            expect(await nft.totalSupply()).to.equal(2);
            expect(tokens.length).to.equal(1);
            expect(tokens[0]).to.equal(1);
            expect(await nft.ownerOf(2)).to.equal(user1.address);
            expect(await nft.tokenURI(2)).to.equal("456");
            expect(await nft.creators(2)).to.equal(creator.address);
            expect(await nft.tokenType(2)).to.equal(2);
            expect(await nft.seriesLength(1)).to.equal(1);
            expect(await nft.totalSeries()).to.equal(2);
            expect(await nft.ownerOfSeries(1)).to.equal(minter.address);
            expect(await nft.tokenIdToSeries(2)).to.equal(2);

            await nft
                .connect(minter)
                .mintBatchSeries(
                    [user2.address, user1.address],
                    ["123", "456"],
                    [creator.address, creator.address],
                    [1, 2],
                    minter.address,
                );
            expect(await nft.seriesLength(1)).to.equal(2);
            expect(await nft.seriesLength(2)).to.equal(2);
        });
    });

    describe("burn", () => {
        beforeEach(async () => {
            await nft
                .connect(minter)
                .mint(user2.address, "123", creator.address, 0);
        });

        it("Should failed- caller is not owner nor approved", async () => {
            await expect(nft.connect(user1).burn(1)).to.revertedWith(
                "ERC721: caller is not token owner nor approved",
            );
        });

        it("Should burn successfully", async () => {
            await nft.connect(user2).burn(1);
            await expect(nft.ownerOf(1)).to.revertedWith(
                "ERC721: invalid token ID",
            );
        });
    });

    describe("getter functions", () => {
        it("Support interfaces", async () => {
            expect(await nft.supportsInterface("0x80ac58cd")).to.be.true; //ERC721
            expect(await nft.supportsInterface("0x80ac58c2")).to.be.false;
        });
    });
});
