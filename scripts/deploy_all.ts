import * as hre from "hardhat";
import * as fs from "fs";
import { Signer } from "ethers";
const ethers = hre.ethers;
import { Config } from "./config";

import {
    DPAuction__factory,
    DPNFT__factory,
    DPFeeManager__factory,
    DPFeeManager,
    DPAuction,
    DPNFT,
    DPMarketplaceC1__factory,
    DPMarketplaceC1,
} from "../typechain-types";

async function main() {
    //Loading accounts
    const accounts: Signer[] = await ethers.getSigners();
    const admin = await accounts[0].getAddress();
    //Loading contracts' factory

    const FeeManager: DPFeeManager__factory = await ethers.getContractFactory(
        "DPFeeManager",
    );
    const DPNFT: DPNFT__factory = await ethers.getContractFactory("DPNFT");
    const Auction: DPAuction__factory = await ethers.getContractFactory(
        "DPAuction",
    );
    const Marketplace: DPMarketplaceC1__factory =
        await ethers.getContractFactory("DPMarketplaceC1");

    // Deploy contracts
    console.log(
        "==================================================================",
    );
    console.log("DEPLOY CONTRACTS");
    console.log(
        "==================================================================",
    );

    console.log("ACCOUNT: " + admin);

    // const mockToken: ERC20Token = <ERC20Token>await ERC20Token.deploy();
    // await mockToken.deployed();
    // console.log("Mock Token deployed at: ", mockToken.address);

    // await mockToken.mint(admin, parseEther("10"));

    const feeManager: DPFeeManager = await FeeManager.deploy(
        Config.charityAddress,
        Config.web3reAddress,
    );
    await feeManager.deployed();

    const nft: DPNFT = await DPNFT.deploy();
    await nft.deployed();

    const marketplace: DPMarketplaceC1 = await Marketplace.deploy(
        Config.owner,
        nft.address,
        feeManager.address,
    );
    await marketplace.deployed();

    const auction: DPAuction = await Auction.deploy(
        Config.owner,
        nft.address,
        feeManager.address,
        Config.verifierAddress,
    );
    await auction.deployed();

    console.log("Marketplace deployed at: ", auction.address);
    console.log("NFT deployed at: ", nft.address);

    const contractAddress = {
        // mockToken: mockToken.address,
        feeManager: feeManager.address,
        marketplace: marketplace.address,
        auction: auction.address,
        nft: nft.address,
    };

    fs.writeFileSync("contracts.json", JSON.stringify(contractAddress));

    // await marketplace.setPaymentMethod(
    //     ADDRESS_ZERO,
    //     "0xd0D5e3DB44DE05E9F294BB0a3bEEaF030DE24Ada",
    // );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
