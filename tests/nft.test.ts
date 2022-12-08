import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import { DPNFT__factory } from "../typechain-types";

import { DPNFT } from "../typechain-types";

import { parseEther } from "ethers/lib/utils";

describe("DPNFT", () => {
    const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let minter: SignerWithAddress;
    let nft: DPNFT;

    beforeEach(async () => {
        const accounts: SignerWithAddress[] = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        minter = accounts[3];

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
            await expect(nft.connect(user1).setURIPrefix("alo.com")).to.revertedWith(
                "Ownable: caller is not the owner"
            );
        });

        it("Should set successfully", async () => {
            await nft.setURIPrefix("alo.com");
            expect(await nft.baseURI()).to.equal("alo.com");
        });
    });

    describe("Mint", () => {
        it("Should failed - Not administrator", async () => {
            await expect(nft.connect(user1).mint(user2.address, "123")).to.revertedWith("Not administrator");
        });
        it("Should mint successfully", async () => {
            await nft.connect(minter).mint(user2.address, "123");
            expect(await nft.ownerOf(1)).to.equal(user2.address);
            expect(await nft.tokenURI(1)).to.equal("123");
        });

        it("Should mint batch failed - Not administrator", async () => {
            await expect(nft.mintBatch([user2.address, user1.address], ["123", "456"])).to.revertedWith(
                "Not administrator"
            );
        });

        it("Should mint batch failed - Invalid input length", async () => {
            await expect(nft.connect(minter).mintBatch([user2.address], ["123", "456"])).to.revertedWith(
                "Invalid input length"
            );
            await expect(nft.connect(minter).mintBatch([], [])).to.revertedWith("Invalid input length");
        });

        it("Should mint batch successfully", async () => {
            await nft.connect(minter).mintBatch([user2.address, user1.address], ["123", "456"]);
            const tokens = await nft.tokensOfOwner(user2.address);
            expect(await nft.totalSupply()).to.equal(2);
            expect(tokens.length).to.equal(1);
            expect(tokens[0]).to.equal(1);
        });
    });

    describe("burn", () => {
        beforeEach(async () => {
            await nft.connect(minter).mint(user2.address, "123");
        });

        it("Should failed- caller is not owner nor approved", async () => {
            await expect(nft.connect(user1).burn(1)).to.revertedWith("ERC721: caller is not token owner nor approved");
        });

        it("Should burn successfully", async () => {
            await nft.connect(user2).burn(1);
            await expect(nft.ownerOf(1)).to.revertedWith("ERC721: invalid token ID");
        });
    });

    describe("getter functions", () => {
        it("Support interfaces", async () => {
            expect(await nft.supportsInterface("0x80ac58cd")).to.be.true; //ERC721
            expect(await nft.supportsInterface("0x80ac58c2")).to.be.false;
        });
    });
});
