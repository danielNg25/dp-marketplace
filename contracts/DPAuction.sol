// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./libraries/PriceConverter.sol";
import "./libraries/DPFeeManagerStruct.sol";
import "./DPNFT.sol";
import "./interface/IDPFeeManager.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract DPAuction is Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;
    using EnumerableSet for EnumerableSet.UintSet;
    using PriceConverter for uint256;

    EnumerableSet.UintSet private _listedTokenIds;
    Counters.Counter private _itemsSold;

    DPNFT public NFT;
    IDPFeeManager public FeeManager;

    mapping(uint256 => uint256) private tokenToAuctionId;
    mapping(uint256 => AuctionItem) private idToAuctionItem;
    mapping(uint256 => BidItem) private idToBidItem;
    mapping(address => uint256) public adminHoldPayment;

    uint256 public constant PERCENT_BASIS_POINT = 10000; // 100%
    uint256 public minPriceIncreasePercent = 100; // 1%
    uint256 public totalAuctions;
    uint256 public totalBids;

    enum BidStatus {
        Lived,
        Canceled,
        Accepted
    }

    struct AuctionItem {
        uint256 tokenId;
        address payable seller;
        address payable c_Wallet;
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
        uint256 tokenId;
        address bidder;
        address paymentToken;
        uint256 bidPriceUSD;
        uint256 bidPriceToken;
        uint256 bidPriceWithFeeToken;
        uint256 reservePriceToken;
        uint80 oracleRoundId;
        BidStatus status;
    }

    struct AuctionCreateParams {
        uint256 tokenId;
        address payable c_Wallet;
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
    /* ========== EVENTS ========== */

    event AuctionItemCreated(
        uint256 indexed tokenId,
        uint256 auctionId,
        address seller,
        address c_Wallet,
        bool isCustodianWallet,
        uint8 royalty,
        bool withPhysical,
        uint256 startPriceUSD,
        uint256 reservePriceUSD,
        uint256 price,
        bool initialList,
        uint256 startTime,
        uint256 endTime
    );

    event BidCreated(
        uint256 bidId,
        uint256 tokenId,
        address bidder,
        address paymentToken,
        uint256 bidPriceUSD,
        uint256 bidPriceToken,
        uint256 bidPriceWithFeeToken,
        uint256 reservePriceToken,
        BidStatus status
    );

    /* ========== MODIFIERS ========== */

    /* ========== GOVERNANCE ========== */

    constructor(
        address contractOwner_,
        address NFTAddress_,
        address DPFeeManager_
    ) {
        FeeManager = IDPFeeManager(DPFeeManager_);
        NFT = DPNFT(NFTAddress_);
        _transferOwnership(contractOwner_);
    }

    function withdraw() external payable nonReentrant onlyOwner {
        payable(msg.sender).transfer(address(this).balance);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    function createToken(
        string memory tokenURI,
        address payable c_Wallet,
        bool isCustodianWallet,
        uint8 royalty,
        bool withPhysical,
        uint256 startPriceUSD,
        uint256 reservePriceUSD,
        uint256 startTime,
        uint256 endTime,
        uint256 price
    ) external payable nonReentrant returns (uint) {
        require(
            startPriceUSD >= reservePriceUSD,
            "Start price must be >= reserve price"
        );

        require(
            msg.value == FeeManager.getListingPrice(),
            "Value must be = listing price"
        );

        uint256 newTokenId = NFT.mint(msg.sender, tokenURI);

        if (withPhysical != true) {
            reservePriceUSD = 0x0;
        }

        createAuctionItem(
            AuctionCreateParams(
                newTokenId,
                c_Wallet,
                isCustodianWallet,
                royalty,
                withPhysical,
                startPriceUSD,
                reservePriceUSD,
                startTime,
                endTime,
                price,
                true
            )
        );
        return newTokenId;
    }

    function createAuctionItem(AuctionCreateParams memory params) internal {
        require(params.price > 0, "Price must be at least 1 wei");

        _listedTokenIds.add(params.tokenId);

        totalAuctions++;
        uint256 auctionId = totalAuctions;
        AuctionItem storage newAuction = idToAuctionItem[auctionId];
        tokenToAuctionId[params.tokenId] = auctionId;

        newAuction.tokenId = params.tokenId;
        newAuction.seller = payable(msg.sender);
        newAuction.c_Wallet = payable(params.c_Wallet);
        newAuction.isCustodianWallet = params.isCustodianWallet;
        newAuction.royalty = params.royalty;
        newAuction.withPhysical = params.withPhysical;
        newAuction.startPriceUSD = params.startPriceUSD;
        newAuction.reservePriceUSD = params.reservePriceUSD;
        newAuction.price = params.price;
        newAuction.initialList = params.initialList;
        newAuction.sold = false;
        newAuction.startTime = params.startTime;
        newAuction.endTime = params.endTime;

        _approveAddress(params.tokenId);
        NFT.transferFrom(msg.sender, address(this), params.tokenId);

        emit AuctionItemCreated(
            params.tokenId,
            auctionId,
            msg.sender,
            params.c_Wallet,
            params.isCustodianWallet,
            params.royalty,
            params.withPhysical,
            params.startPriceUSD,
            params.reservePriceUSD,
            params.price,
            params.initialList,
            params.startTime,
            params.endTime
        );
    }

    function reAuctionToken(
        uint256 tokenId,
        uint256 startPriceUSD,
        uint256 price,
        uint256 startTime,
        uint256 endTime
    ) external payable nonReentrant {
        uint256 oldAuctionId = tokenToAuctionId[tokenId];
        AuctionItem memory oldAuctionItem = idToAuctionItem[oldAuctionId];
        require(
            oldAuctionId != 0 && oldAuctionItem.sold == true,
            "Can not reAuction unsold item"
        );
        require(NFT.ownerOf(tokenId) == msg.sender, "Only item owner");
        require(
            msg.value == FeeManager.getListingPriceSecondary(),
            "Value must be = Secondary list price"
        );

        createAuctionItem(
            AuctionCreateParams(
                tokenId,
                oldAuctionItem.c_Wallet,
                oldAuctionItem.isCustodianWallet,
                oldAuctionItem.royalty,
                false,
                startPriceUSD,
                0,
                startTime,
                endTime,
                price,
                false
            )
        );

        _itemsSold.decrement();
        _approveAddress(tokenId);
        NFT.transferFrom(msg.sender, address(this), tokenId);
    }

    function createExternalMintedItem(
        uint256 tokenId,
        address c_Wallet,
        bool isCustodianWallet,
        uint8 royalty,
        uint256 startPriceUSD,
        uint256 price,
        uint256 startTime,
        uint256 endTime
    ) external payable nonReentrant {
        require(NFT.ownerOf(tokenId) == msg.sender, "Only item owner");
        require(!_listedTokenIds.contains(tokenId), "Item already listed");
        require(
            msg.value == FeeManager.getListingPriceSecondary(),
            "Value must be = Secondary list price"
        );

        createAuctionItem(
            AuctionCreateParams(
                tokenId,
                payable(c_Wallet),
                isCustodianWallet,
                royalty,
                false,
                startPriceUSD,
                0,
                startTime,
                endTime,
                price,
                false
            )
        );
    }

    function bidToken(
        uint256 tokenId,
        address paymentToken,
        uint256 priceUSD
    ) external payable nonReentrant {
        uint256 auctionId = tokenToAuctionId[tokenId];
        AuctionItem memory auctionItem = idToAuctionItem[auctionId];
        require(
            block.timestamp >= auctionItem.startTime &&
                block.timestamp <= auctionItem.endTime,
            "Not in auction time"
        );

        FeeManagerStruct.FeeInformation memory feeInfo = FeeManager
            .getFeeInformation(paymentToken);
        require(
            feeInfo.aggregatorV3 != address(0),
            "Payment token not supported"
        );

        require(auctionItem.seller != msg.sender, "Seller cannot bid");

        require(
            priceUSD >= auctionItem.startPriceUSD,
            "Price lower than start price"
        );
        uint256 bidLength = auctionItem.listBidId.length;
        require(
            bidLength == 0 ||
                priceUSD >
                (idToBidItem[auctionItem.highestBidId].bidPriceUSD *
                    (PERCENT_BASIS_POINT + minPriceIncreasePercent)) /
                    PERCENT_BASIS_POINT,
            "Price less than min price"
        );

        PriceConverter.PriceData memory priceData = PriceConverter.getPrice(
            paymentToken,
            feeInfo.aggregatorV3
        );

        uint256 priceWithFeeToken = priceUSD.getUsdToken(priceData);

        uint256 priceToken = (priceWithFeeToken * 100) / 102;

        if (paymentToken == address(0)) {
            require(msg.value >= priceWithFeeToken, "mising asking price");
            if (msg.value > priceWithFeeToken) {
                payable(msg.sender).transfer(msg.value - priceWithFeeToken);
            }
        } else {
            IERC20(paymentToken).transferFrom(
                msg.sender,
                address(this),
                priceWithFeeToken
            );
        }
        uint256 reservePriceToken = auctionItem.reservePriceUSD.getOrgUsdToken(
            priceData
        );

        adminHoldPayment[paymentToken] += priceWithFeeToken;

        totalBids++;
        uint256 bidId = totalBids;
        BidItem memory newBidItem = BidItem(
            tokenId,
            msg.sender,
            paymentToken,
            priceUSD,
            priceToken,
            priceWithFeeToken,
            reservePriceToken,
            priceData.oracleRoundId,
            BidStatus.Lived
        );

        idToBidItem[bidId] = newBidItem;
        idToAuctionItem[auctionId].listBidId.push(bidId);
        idToAuctionItem[auctionId].highestBidId = bidId;

        emit BidCreated(
            bidId,
            tokenId,
            msg.sender,
            paymentToken,
            priceUSD,
            priceToken,
            priceWithFeeToken,
            reservePriceToken,
            BidStatus.Lived
        );
    }

    function acceptBid(uint256 tokenId) external nonReentrant {
        uint256 auctionId = tokenToAuctionId[tokenId];
        AuctionItem memory auctionItem = idToAuctionItem[auctionId];

        require(auctionItem.endTime < block.timestamp, "Auction not end");
        require(!auctionItem.sold, "Auction sold");

        uint256 bidLength = auctionItem.listBidId.length;
        require(bidLength > 0, "No bid created");
        BidItem memory bidItem = idToBidItem[auctionItem.highestBidId];

        require(bidItem.status == BidStatus.Lived, "Bid accepted");

        FeeManagerStruct.FeeInformation memory feeInfo = FeeManager
            .getFeeInformation(bidItem.paymentToken);

        uint creatorToken = 0x0;
        uint sellerToken = 0x0;
        uint charityTokenTotal = 0x0;
        uint web3reTokenTotal;

        adminHoldPayment[bidItem.paymentToken] -= bidItem.bidPriceWithFeeToken;
        if (auctionItem.initialList == true) {
            if (auctionItem.withPhysical == true) {
                if ((bidItem.bidPriceUSD) > (auctionItem.reservePriceUSD)) {
                    uint sr_Token = bidItem.bidPriceToken -
                        bidItem.reservePriceToken;
                    charityTokenTotal += (sr_Token * 80) / 100;
                }

                creatorToken = (bidItem.reservePriceToken * 65) / 100;
                charityTokenTotal += (bidItem.reservePriceToken * 20) / 100;

                web3reTokenTotal =
                    bidItem.bidPriceWithFeeToken -
                    creatorToken -
                    charityTokenTotal;
            } else {
                creatorToken = (bidItem.bidPriceToken * 85) / 100;
                charityTokenTotal = (bidItem.bidPriceToken * 10) / 100;
                web3reTokenTotal =
                    bidItem.bidPriceWithFeeToken -
                    creatorToken -
                    charityTokenTotal;
            }
            if (bidItem.paymentToken == address(0)) {
                payable(feeInfo.charity).transfer(charityTokenTotal);
                payable(auctionItem.c_Wallet).transfer(creatorToken);
                payable(feeInfo.web3re).transfer(web3reTokenTotal);
            } else {
                IERC20(bidItem.paymentToken).transfer(
                    feeInfo.charity,
                    charityTokenTotal
                );
                IERC20(bidItem.paymentToken).transfer(
                    auctionItem.c_Wallet,
                    creatorToken
                );
                IERC20(bidItem.paymentToken).transfer(
                    feeInfo.web3re,
                    web3reTokenTotal
                );
            }
        } else {
            if (auctionItem.isCustodianWallet == true) {
                if (auctionItem.royalty >= 2) {
                    creatorToken = (bidItem.bidPriceToken * 2) / 100;
                }
            } else {
                creatorToken =
                    (bidItem.bidPriceToken * auctionItem.royalty) /
                    100;
            }

            sellerToken = (bidItem.bidPriceToken * 80) / 100;
            charityTokenTotal = (bidItem.bidPriceToken * 10) / 100;
            web3reTokenTotal =
                bidItem.bidPriceWithFeeToken -
                creatorToken -
                sellerToken -
                charityTokenTotal;
            if (bidItem.paymentToken == address(0)) {
                payable(auctionItem.c_Wallet).transfer(creatorToken);
                payable(auctionItem.seller).transfer(sellerToken);
                payable(feeInfo.charity).transfer(charityTokenTotal);
                payable(feeInfo.web3re).transfer(web3reTokenTotal);
            } else {
                IERC20(bidItem.paymentToken).transfer(
                    auctionItem.c_Wallet,
                    creatorToken
                );
                IERC20(bidItem.paymentToken).transfer(
                    auctionItem.seller,
                    sellerToken
                );
                IERC20(bidItem.paymentToken).transfer(
                    feeInfo.charity,
                    charityTokenTotal
                );
                IERC20(bidItem.paymentToken).transfer(
                    feeInfo.web3re,
                    web3reTokenTotal
                );
            }
        }

        _itemsSold.increment();

        idToAuctionItem[auctionId].sold = true;

        idToBidItem[auctionItem.highestBidId].status = BidStatus.Accepted;

        NFT.transferFrom(address(this), bidItem.bidder, tokenId);
    }

    function editBid(
        uint256 bidId,
        uint256 priceUSD
    ) external payable nonReentrant {
        BidItem memory bidItem = idToBidItem[bidId];
        uint256 auctionId = tokenToAuctionId[bidItem.tokenId];
        AuctionItem memory auctionItem = idToAuctionItem[auctionId];

        require(bidItem.bidder == msg.sender, "Not bidder");

        require(
            block.timestamp >= auctionItem.startTime &&
                block.timestamp <= auctionItem.endTime,
            "Not in auction time"
        );

        require(bidItem.status == BidStatus.Lived, "Bid canceled");
        require(
            priceUSD >
                (idToBidItem[auctionItem.highestBidId].bidPriceUSD *
                    (PERCENT_BASIS_POINT + minPriceIncreasePercent)) /
                    PERCENT_BASIS_POINT,
            "Price less than min price"
        );

        FeeManagerStruct.FeeInformation memory feeInfo = FeeManager
            .getFeeInformation(bidItem.paymentToken);
        require(
            feeInfo.aggregatorV3 != address(0),
            "Payment token not supported"
        );

        PriceConverter.PriceData memory priceData = PriceConverter.getPrice(
            bidItem.paymentToken,
            feeInfo.aggregatorV3
        );

        uint256 priceWithFeeToken = priceUSD.getUsdToken(priceData);

        uint256 priceToken = (priceWithFeeToken * 100) / 102;

        if (priceWithFeeToken >= bidItem.bidPriceWithFeeToken) {
            uint256 additionPriceWithFeeToken = priceWithFeeToken -
                bidItem.bidPriceWithFeeToken;
            adminHoldPayment[bidItem.paymentToken] += additionPriceWithFeeToken;
            if (bidItem.paymentToken == address(0)) {
                require(
                    msg.value >= additionPriceWithFeeToken,
                    "mising asking price"
                );
                if (msg.value > additionPriceWithFeeToken) {
                    payable(msg.sender).transfer(
                        msg.value - additionPriceWithFeeToken
                    );
                }
            } else {
                IERC20(bidItem.paymentToken).transferFrom(
                    msg.sender,
                    address(this),
                    additionPriceWithFeeToken
                );
            }
        } else {
            uint256 subtractionPriceWithFeeToken = bidItem
                .bidPriceWithFeeToken - priceWithFeeToken;
            adminHoldPayment[
                bidItem.paymentToken
            ] -= subtractionPriceWithFeeToken;
            if (bidItem.paymentToken == address(0)) {
                payable(msg.sender).transfer(
                    msg.value + subtractionPriceWithFeeToken
                );
            } else {
                IERC20(bidItem.paymentToken).transfer(
                    msg.sender,
                    subtractionPriceWithFeeToken
                );
            }
        }

        uint256 reservePriceToken = auctionItem.reservePriceUSD.getOrgUsdToken(
            priceData
        );

        idToBidItem[bidId].oracleRoundId = priceData.oracleRoundId;
        idToBidItem[bidId].bidPriceToken = priceToken;
        idToBidItem[bidId].bidPriceUSD = priceUSD;
        idToBidItem[bidId].bidPriceWithFeeToken = priceWithFeeToken;
        idToBidItem[bidId].reservePriceToken = reservePriceToken;

        idToAuctionItem[auctionId].highestBidId = bidId;
    }

    function cancelAuction(uint256 tokenId) external nonReentrant {
        uint256 auctionId = tokenToAuctionId[tokenId];
        AuctionItem memory auctionItem = idToAuctionItem[auctionId];

        require(block.timestamp < auctionItem.startTime, "Auction started");
        require(
            auctionItem.seller == msg.sender && !auctionItem.initialList,
            "Only item owner and not initialList"
        );
        require(!auctionItem.sold, "Auction canceled");

        idToAuctionItem[tokenId].sold = true;
        _itemsSold.increment();
        NFT.transferFrom(address(this), msg.sender, tokenId);
    }

    function cancelBid(uint256 bidId) external nonReentrant {
        BidItem memory bidItem = idToBidItem[bidId];

        require(bidItem.status == BidStatus.Lived, "Bid closed");
        require(bidItem.bidder == msg.sender, "Only bidder");
        require(
            idToAuctionItem[tokenToAuctionId[bidItem.tokenId]].highestBidId !=
                bidId,
            "Can not cancel highest bid"
        );

        idToBidItem[bidId].status = BidStatus.Canceled;
        adminHoldPayment[bidItem.paymentToken] -= bidItem.bidPriceWithFeeToken;
        if (bidItem.paymentToken == address(0)) {
            payable(msg.sender).transfer(bidItem.bidPriceWithFeeToken);
        } else {
            IERC20(bidItem.paymentToken).transfer(
                msg.sender,
                bidItem.bidPriceWithFeeToken
            );
        }
    }

    function reClaimAuction(uint256 tokenId) external nonReentrant {
        uint256 auctionId = tokenToAuctionId[tokenId];
        AuctionItem memory auctionItem = idToAuctionItem[auctionId];

        require(auctionItem.seller == msg.sender, "Only auction owner");
        require(auctionItem.endTime < block.timestamp, "Auction not end");
        require(auctionItem.listBidId.length == 0, "Auction already bidden");
        require(!auctionItem.sold, "Auction canceled");

        _itemsSold.increment();

        idToAuctionItem[auctionId].sold = true;
        NFT.transferFrom(address(this), auctionItem.seller, tokenId);
    }

    function approveAddress(uint256 _tokenId) public onlyOwner nonReentrant {
        _approveAddress(_tokenId);
    }

    function transferNFTTo(
        address _from,
        address _to,
        uint256 tokenId
    ) external nonReentrant {
        if (_listedTokenIds.contains(tokenId)) {
            idToAuctionItem[tokenId].sold = true;
            if (_from == address(this)) {
                _itemsSold.increment();
            }
        }
        NFT.transferFrom(_from, _to, tokenId);
    }

    function _approveAddress(uint256 _tokenId) internal {
        NFT.administratorApprove(_tokenId);
    }

    /* ========== VIEW FUNCTIONS ========== */
    function getItemSold() external view returns (uint256) {
        return _itemsSold.current();
    }

    function getAuctionById(
        uint256 auctionItemId
    ) external view returns (AuctionItem memory) {
        return idToAuctionItem[auctionItemId];
    }

    function getLastestAuctionToken(
        uint256 tokenId
    ) external view returns (AuctionItem memory) {
        return idToAuctionItem[tokenToAuctionId[tokenId]];
    }

    function getBidById(
        uint256 bidItemId
    ) external view returns (BidItem memory) {
        return idToBidItem[bidItemId];
    }

    function getHighestBidOfAuction(
        uint256 auctionItemId
    ) external view returns (BidItem memory) {
        return idToBidItem[idToAuctionItem[auctionItemId].highestBidId];
    }

    function getHighestBidOfLastestAuctionToken(
        uint256 tokenId
    ) external view returns (BidItem memory) {
        return
            idToBidItem[
                idToAuctionItem[tokenToAuctionId[tokenId]].highestBidId
            ];
    }

    function getUsdTokenStartPriceOfAuction(
        uint256 auctionItemId,
        address paymentToken
    ) external view returns (bool, uint256) {
        (bool isSupported, address aggregatorV3) = FeeManager
            .getPaymentMethodDetail(paymentToken);
        uint256 priceR = 0;
        if (isSupported) {
            PriceConverter.PriceData memory priceData = PriceConverter.getPrice(
                paymentToken,
                aggregatorV3
            );
            priceR = idToAuctionItem[auctionItemId].startPriceUSD.getUsdToken(
                priceData
            );
        }
        return (isSupported, priceR);
    }

    function getUsdTokenStartPriceOfToken(
        uint256 tokenId,
        address paymentToken
    ) external view returns (bool, uint256) {
        (bool isSupported, address aggregatorV3) = FeeManager
            .getPaymentMethodDetail(paymentToken);
        uint256 priceR = 0;
        if (isSupported) {
            PriceConverter.PriceData memory priceData = PriceConverter.getPrice(
                paymentToken,
                aggregatorV3
            );
            priceR = idToAuctionItem[tokenToAuctionId[tokenId]]
                .startPriceUSD
                .getUsdToken(priceData);
        }
        return (isSupported, priceR);
    }

    function getUsdTokenPrice(
        uint256 amountUsd,
        address paymentToken
    ) external view returns (bool, uint256) {
        (bool isSupported, address aggregatorV3) = FeeManager
            .getPaymentMethodDetail(paymentToken);
        uint256 priceR = 0;
        if (isSupported) {
            PriceConverter.PriceData memory priceData = PriceConverter.getPrice(
                paymentToken,
                aggregatorV3
            );
            priceR = amountUsd.getUsdToken(priceData);
        }
        return (isSupported, priceR);
    }

    function fetchAuctionItems() public view returns (AuctionItem[] memory) {
        uint itemCount = _listedTokenIds.length();
        uint unsoldItemCount = itemCount - _itemsSold.current();
        uint currentIndex = 0;

        AuctionItem[] memory items = new AuctionItem[](unsoldItemCount);
        for (uint i = 0; i < itemCount; i++) {
            uint currentId = _listedTokenIds.at(i);
            if (NFT.ownerOf(currentId) == address(this)) {
                AuctionItem memory currentItem = idToAuctionItem[
                    tokenToAuctionId[currentId]
                ];
                items[currentIndex] = currentItem;
                currentIndex += 1;
            }
        }
        return items;
    }

    function fetchMyNFTs() public view returns (AuctionItem[] memory) {
        uint totalItemCount = _listedTokenIds.length();
        uint itemCount = 0;
        uint currentIndex = 0;

        for (uint i = 0; i < totalItemCount; i++) {
            uint currentId = _listedTokenIds.at(i);
            if (NFT.ownerOf(currentId) == msg.sender) {
                itemCount += 1;
            }
        }

        AuctionItem[] memory items = new AuctionItem[](itemCount);
        for (uint i = 0; i < totalItemCount; i++) {
            uint currentId = _listedTokenIds.at(i);
            if (NFT.ownerOf(currentId) == msg.sender) {
                AuctionItem memory currentItem = idToAuctionItem[
                    tokenToAuctionId[currentId]
                ];
                items[currentIndex] = currentItem;
                currentIndex += 1;
            }
        }
        return items;
    }

    function fetchItemsListed() public view returns (AuctionItem[] memory) {
        uint totalItemCount = _listedTokenIds.length();
        uint itemCount = 0;
        uint currentIndex = 0;

        for (uint i = 0; i < totalItemCount; i++) {
            if (
                idToAuctionItem[tokenToAuctionId[_listedTokenIds.at(i)]]
                    .seller == msg.sender
            ) {
                itemCount += 1;
            }
        }

        AuctionItem[] memory items = new AuctionItem[](itemCount);
        for (uint i = 0; i < totalItemCount; i++) {
            uint currentId = _listedTokenIds.at(i);
            if (
                idToAuctionItem[tokenToAuctionId[currentId]].seller ==
                msg.sender
            ) {
                AuctionItem storage currentItem = idToAuctionItem[
                    tokenToAuctionId[currentId]
                ];
                items[currentIndex] = currentItem;
                currentIndex += 1;
            }
        }
        return items;
    }
}
