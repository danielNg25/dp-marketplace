// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "../libraries/DPFeeManagerStruct.sol";

interface IDPFeeManager {
    function getFeeInformation(
        address paymentMethod
    ) external view returns (FeeManagerStruct.FeeInformation memory);

    function getCharityAddress() external view returns (address);

    function getWeb3reAddress() external view returns (address);

    function getPaymentMethods() external view returns (address[] memory);

    function getPaymentMethodDetail(
        address _token
    ) external view returns (bool, address);

    function getListingPrice() external view returns (uint256);

    function getListingPriceSecondary() external view returns (uint256);
}
