import * as hre from "hardhat";
import * as contracts from "../contracts.json";
const charityAddress = "0xAD34dcA26Bc2b92287b47c3255b4F8A45E56aF46";
const web3reAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const admin = "0x0bB31e84F420e7f33CEa3b4bA8e643163A3b4d18";
async function main() {
    try {
        await hre.run("verify:verify", {
            address: contracts.marketplace,
            constructorArguments: [
                admin,
                charityAddress,
                web3reAddress,
                contracts.nft,
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
