import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { parseEther } from "ethers/lib/utils";

import { ethers } from "hardhat";

import {
    DPNFTVault__factory,
    DPNFT__factory,
    InitializedProxy__factory,
    DPNFT,
    DPNFTVault,
    InitializedProxy,
} from "../typechain-types";

describe("DPNFT", () => {
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let minter: SignerWithAddress;
    let creator: SignerWithAddress;
    let nft: DPNFT;
    let vault: DPNFTVault;

    beforeEach(async () => {
        const accounts: SignerWithAddress[] = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        minter = accounts[3];
        creator = accounts[3];

        const DPNFT: DPNFT__factory = await ethers.getContractFactory("DPNFT");
        const DPNFTVAULT: DPNFTVault__factory = await ethers.getContractFactory(
            "DPNFTVault",
        );

        nft = await DPNFT.deploy();

        await nft.setAdministratorStatus(minter.address, true);
        await nft
            .connect(minter)
            .mint(user1.address, "123", creator.address, 3);
        vault = DPNFTVAULT.attach(await nft.vaults(1));
        await nft.connect(user1).approve(vault.address, 1);
    });

    describe("Deployment", () => {
        it("Should deploy successfully", async () => {
            const PROXY: InitializedProxy__factory =
                await ethers.getContractFactory("InitializedProxy");
            const proxy: InitializedProxy = PROXY.attach(await nft.vaults(1));
            expect(await proxy.logic()).to.equal(await nft.tokenVaultLogic());
            expect(await vault.token()).to.equal(nft.address);
            expect(await vault.id()).to.equal(1);
        });
    });

    describe("Mint", () => {
        it("Should failed - not token owner", async () => {
            await expect(vault.connect(owner).mint(user2.address, 100)).to
                .reverted;
        });

        it("Should mint successfully", async () => {
            await vault.connect(user1).mint(user2.address, 100);
            expect(await vault.balanceOf(user2.address)).to.equal(100);
            expect(await vault.totalSupply()).to.equal(100);
            expect(await nft.ownerOf(1)).to.equal(vault.address);
        });
    });

    describe("Redeem", () => {
        beforeEach(async () => {
            await vault.connect(user1).mint(user2.address, parseEther("1"));
        });

        it("Should failed - not enough token", async () => {
            await expect(vault.connect(owner).redeem()).to.reverted;

            await vault
                .connect(user2)
                .transfer(user1.address, parseEther("0.1"));

            await expect(vault.connect(user2).redeem()).to.reverted;
            await expect(vault.connect(user1).redeem()).to.reverted;
        });

        it("Should redeem successfully", async () => {
            await expect(() =>
                vault.connect(user2).redeem(),
            ).to.changeTokenBalance(
                vault,
                user2.address,
                parseEther("1").mul(-1),
            );
        });
    });
});
