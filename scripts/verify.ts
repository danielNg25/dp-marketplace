import * as hre from "hardhat";
import * as contracts from "../contracts.json";
import { Config } from "./config";

async function main() {
    try {
        await hre.run("verify:verify", {
            address: contracts.feeManager,
            constructorArguments: [Config.charityAddress, Config.web3reAddress],
            hre,
        });
    } catch (err) {
        console.log("err >>", err);
    }

    try {
        await hre.run("verify:verify", {
            address: contracts.marketplace,
            constructorArguments: [
                Config.owner,
                contracts.nft,
                contracts.feeManager,
            ],
            hre,
        });
    } catch (err) {
        console.log("err >>", err);
    }

    try {
        await hre.run("verify:verify", {
            address: contracts.auction,
            constructorArguments: [
                Config.owner,
                contracts.nft,
                contracts.feeManager,
                Config.verifierAddress,
            ],
            hre,
        });
    } catch (err) {
        console.log("err >>", err);
    }

    try {
        await hre.run("verify:verify", {
            address: contracts.nft,
            hre,
        });
    } catch (err) {
        console.log("err >>", err);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
