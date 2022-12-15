import * as hre from "hardhat";
import * as fs from "fs";
import { Signer } from "ethers";
const ethers = hre.ethers;
const upgrades = hre.upgrades;
import { DPMarketplaceC1__factory } from "../typechain-types";
import { DPNFT__factory } from "../typechain-types";

import { DPMarketplaceC1 } from "../typechain-types";
import { DPNFT } from "../typechain-types";
import { parseEther } from "ethers/lib/utils";

async function main() {
    //Loading accounts
    const accounts: Signer[] = await ethers.getSigners();
    const admin = await accounts[0].getAddress();
    const charityAddress = "0xAD34dcA26Bc2b92287b47c3255b4F8A45E56aF46";
    const web3reAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
    //Loading contracts' factory
    const DPNFT: DPNFT__factory = await ethers.getContractFactory("DPNFT");
    const Marketplace: DPMarketplaceC1__factory = await ethers.getContractFactory("DPMarketplaceC1");

    // Deploy contracts
    console.log("==================================================================");
    console.log("DEPLOY CONTRACTS");
    console.log("==================================================================");

    console.log("ACCOUNT: " + admin);

    // const mockToken: ERC20Token = <ERC20Token>await ERC20Token.deploy();
    // await mockToken.deployed();
    // console.log("Mock Token deployed at: ", mockToken.address);

    // await mockToken.mint(admin, parseEther("10"));

    const nft = await DPNFT.deploy();
    await nft.deployed();

    const marketplace = await Marketplace.deploy(admin, charityAddress, web3reAddress, nft.address);
    await marketplace.deployed();

    console.log("Marketplace deployed at: ", marketplace.address);
    console.log("Controller verify: ", nft.address);

    const contractAddress = {
        // mockToken: mockToken.address,
        marketplace: marketplace.address,
        nft: nft.address,
    };

    fs.writeFileSync("contracts.json", JSON.stringify(contractAddress));

    await marketplace.setPaymentMethod(ADDRESS_ZERO, "0xd0D5e3DB44DE05E9F294BB0a3bEEaF030DE24Ada");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
