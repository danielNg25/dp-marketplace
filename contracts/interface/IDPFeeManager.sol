// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IDPFeeManager {
    struct FeeInformation {
        address charity;
        address web3re;
        address aggregatorV3;
        uint256 listingPrice;
        uint256 secondaryListingPrice;
    }

    function getFeeInformation(
        address paymentMethod
    ) external view returns (FeeInformation memory);

    function getCharityAddress() external view returns (address);

    function getWeb3reAddress() external view returns (address);

    function getPaymentMethods() external view returns (address[] memory);

    function getPaymentMethodDetail(
        address _token
    ) external view returns (bool, address);

    function getListingPrice() external view returns (uint256);

    function getListingPriceSecondary() external view returns (uint256);
}
