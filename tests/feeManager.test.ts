import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import { DPFeeManager__factory } from "../typechain-types";
import { MockERC20Token__factory } from "../typechain-types";
import { AggregatorV3Test__factory } from "../typechain-types";

import { DPFeeManager } from "../typechain-types";
import { MockERC20Token } from "../typechain-types";
import { AggregatorV3Test } from "../typechain-types";

describe("FeeManager", () => {
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let charity: SignerWithAddress;
    let web3re: SignerWithAddress;

    let feeManager: DPFeeManager;
    let mockERC20Token: MockERC20Token;
    let aggregatorV3Test: AggregatorV3Test;

    let listingPrice: BigNumber;
    let listingPriceSecondary: BigNumber;

    const TOKEN_PRICE = 88942317;
    const TOKEN_DECIMALS_24 = 24;
    const TOKEN_DECIMALS_18 = 18;
    const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

    beforeEach(async () => {
        const accounts: SignerWithAddress[] = await ethers.getSigners();
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        charity = accounts[3];
        web3re = accounts[4];

        const FeeManager: DPFeeManager__factory =
            await ethers.getContractFactory("DPFeeManager");
        const MockERC20Token: MockERC20Token__factory =
            await ethers.getContractFactory("MockERC20Token");
        const AggregatorV3Test: AggregatorV3Test__factory =
            await ethers.getContractFactory("AggregatorV3Test");

        feeManager = await FeeManager.deploy(charity.address, web3re.address);
        mockERC20Token = await MockERC20Token.deploy(TOKEN_DECIMALS_18);
        aggregatorV3Test = await AggregatorV3Test.deploy(
            TOKEN_PRICE,
            TOKEN_DECIMALS_18,
        );

        await feeManager.setPaymentMethod(
            ADDRESS_ZERO,
            aggregatorV3Test.address,
        );

        listingPrice = await feeManager.getListingPrice();
        listingPriceSecondary = await feeManager.getListingPriceSecondary();
    });

    describe("Deployment", () => {
        it("Should deploy successfully", async () => {
            expect(await feeManager.getCharityAddress()).to.equal(
                charity.address,
            );
            expect(await feeManager.getWeb3reAddress()).to.equal(
                web3re.address,
            );
        });
    });

    describe("setPaymentMethod", () => {
        it("Should failed - Ownable: caller is not the owner", async () => {
            await expect(
                feeManager
                    .connect(user1)
                    .setPaymentMethod(
                        mockERC20Token.address,
                        aggregatorV3Test.address,
                    ),
            ).to.revertedWith("Ownable: caller is not the owner");
        });

        it("Should failed - Payment method already set", async () => {
            await expect(
                feeManager.setPaymentMethod(
                    ADDRESS_ZERO,
                    aggregatorV3Test.address,
                ),
            ).to.revertedWith("Payment method already set");
        });

        it("Should setPaymentMethod successfully", async () => {
            await feeManager.setPaymentMethod(
                mockERC20Token.address,
                aggregatorV3Test.address,
            );

            const paymentMethods = await feeManager.getPaymentMethods();
            expect(paymentMethods.length).to.equal(2);
            expect(paymentMethods[1]).to.equal(mockERC20Token.address);

            const paymentMethod = await feeManager.getPaymentMethodDetail(
                mockERC20Token.address,
            );
            expect(paymentMethod[0]).to.be.true;
            expect(paymentMethod[1]).to.equal(aggregatorV3Test.address);
        });

        it("Should removePaymentMethod failed - Payment method not set", async () => {
            await expect(
                feeManager.removePaymentMethod(mockERC20Token.address),
            ).to.revertedWith("Payment method not set");
        });

        it("Should removePaymentMethod successfully", async () => {
            await feeManager.setPaymentMethod(
                mockERC20Token.address,
                aggregatorV3Test.address,
            );

            await feeManager.removePaymentMethod(mockERC20Token.address);

            const paymentMethods = await feeManager.getPaymentMethods();
            expect(paymentMethods.length).to.equal(1);

            const paymentMethod = await feeManager.getPaymentMethodDetail(
                mockERC20Token.address,
            );
            expect(paymentMethod[0]).to.be.false;
            expect(paymentMethod[1]).to.equal(ADDRESS_ZERO);
        });
    });

    describe("updateListingPriceSecondary", () => {
        it("Should failed - Ownable: caller is not the owner.", async () => {
            await expect(
                feeManager
                    .connect(user1)
                    .updateListingPriceSecondary(listingPriceSecondary.sub(1)),
            ).to.revertedWith("Ownable: caller is not the owner");
        });

        it("Should update successfully.", async () => {
            await feeManager.updateListingPriceSecondary(
                listingPriceSecondary.sub(1),
            );
        });
    });
});
