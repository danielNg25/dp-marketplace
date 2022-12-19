// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

library FeeManagerStruct {
    struct FeeInformation {
        address charity;
        address web3re;
        address aggregatorV3;
        uint256 listingPrice;
        uint256 secondaryListingPrice;
    }
}
