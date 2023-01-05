// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import "../interface/IDPNFT.sol";

library AuctionStruct {
    enum BidStatus {
        Lived,
        Canceled,
        Accepted
    }

    struct AuctionItem {
        uint256 auctionId;
        uint256 tokenId;
        address payable seller;
        address payable creatorWallet;
        bool isCustodianWallet;
        uint8 royalty;
        bool withPhysical;
        uint256 startPriceUSD;
        uint256 reservePriceUSD;
        uint256 price;
        bool initialList;
        bool sold;
        uint256 startTime;
        uint256 endTime;
        uint256[] listBidId;
        uint256 highestBidId;
    }

    struct BidItem {
        uint256 bidId;
        uint256 tokenId;
        uint256 auctionId;
        address bidder;
        address paymentToken;
        uint256 bidPriceUSD;
        uint256 bidPriceToken;
        uint256 bidPriceWithFeeToken;
        uint256 reservePriceToken;
        uint80 oracleRoundId;
        bool isFiat;
        BidStatus status;
    }

    struct TokenCreateParams {
        string tokenURI;
        IDPNFT.Type tokenType;
        uint256 seriesId;
        address payable creatorWallet;
        bool isCustodianWallet;
        uint8 royalty;
        uint256 startPriceUSD;
        uint256 reservePriceUSD;
        uint256 startTime;
        uint256 endTime;
        uint256 price;
    }

    struct AuctionCreateParams {
        uint256 tokenId;
        address payable creatorWallet;
        bool isCustodianWallet;
        uint8 royalty;
        bool withPhysical;
        uint256 startPriceUSD;
        uint256 reservePriceUSD;
        uint256 startTime;
        uint256 endTime;
        uint256 price;
        bool initialList;
    }

    struct BidCreateParams {
        uint256 tokenId;
        uint256 auctionId;
        address bidder;
        address paymentToken;
        uint256 priceUSD;
        uint256 priceToken;
        uint256 priceWithFeeToken;
        uint256 reservePriceToken;
        uint80 oracleRoundId;
        bool isFiat;
    }
}
