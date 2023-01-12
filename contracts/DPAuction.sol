// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./libraries/PriceConverter.sol";
import "./libraries/BidFiatSignature.sol";

import "./interface/IDPNFT.sol";
import "./interface/IDPFeeManager.sol";

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract DPAuction is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using Address for address payable;
    using Counters for Counters.Counter;
    using EnumerableSet for EnumerableSet.UintSet;
    using PriceConverter for uint256;
    using BidFiatSignature for bytes;

    enum BidStatus {
        Lived,
        Canceled,
        Accepted
    }

    struct AuctionItem {
        uint256 auctionId;
        uint256 tokenId;
        address payable seller;
        bool isCustodianWallet;
        uint8 royalty;
        uint256 startPriceUSD;
        uint256 reservePriceUSD;
        bool initialList;
        bool sold;
        uint256 startTime;
        uint256 endTime;
        uint256[] listBidId;
        uint256 highestBidId;
        address[] beneficiaries;
        uint256[] percents;
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

    // function params
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
    }

    struct AuctionCreateParams {
        uint256 tokenId;
        bool isCustodianWallet;
        uint8 royalty;
        uint256 startPriceUSD;
        uint256 reservePriceUSD;
        uint256 startTime;
        uint256 endTime;
        bool initialList;
        address[] beneficiaries;
        uint256[] percents;
    }

    EnumerableSet.UintSet private _listedTokenIds;
    Counters.Counter private _itemsSold;

    IDPNFT public NFT;
    IDPFeeManager public FeeManager;

    address public verifier;

    mapping(uint256 => uint256) private tokenToAuctionId;
    mapping(uint256 => AuctionItem) private idToAuctionItem;
    mapping(uint256 => BidItem) private idToBidItem;
    mapping(address => uint256) public adminHoldPayment;

    uint256 private constant PERCENT_BASIS_POINT = 10000; // 100%
    uint256 public minPriceIncreasePercent = 100; // 1%
    uint256 public totalAuctions;
    uint256 public totalBids;

    /* ========== EVENTS ========== */

    event AuctionItemCreated(
        uint256 indexed auctionId,
        uint256 indexed tokenId,
        address seller,
        bool isCustodianWallet,
        uint8 royalty,
        uint256 startPriceUSD,
        uint256 reservePriceUSD,
        bool initialList,
        uint256 startTime,
        uint256 endTime,
        address[] beneficiaries,
        uint256[] percents
    );
    event AuctionCanceled(uint256 indexed auctionId);
    event AuctionAccepted(uint256 indexed auctionId, uint256 indexed bidId);
    event AuctionReclaimed(uint256 indexed auctionId);

    event BidCreated(
        uint256 indexed bidId,
        uint256 indexed tokenId,
        uint256 indexed auctionId,
        address bidder,
        address paymentToken,
        uint256 bidPriceUSD,
        uint256 bidPriceToken,
        uint256 bidPriceWithFeeToken,
        uint256 reservePriceToken,
        uint80 oracleRoundId,
        bool isFiat,
        BidStatus status
    );
    event BidEdited(
        uint256 indexed bidId,
        uint256 bidPriceUSD,
        uint256 bidPriceToken,
        uint256 bidPriceWithFeeToken,
        uint256 reservePriceToken,
        uint80 oracleRoundId
    );
    event BidCanceled(uint256 indexed bidId);
    event FundsWithdrawed(address receiver, address token, uint256 amount);

    event MinPriceIncreasePercentUpdated(
        uint256 oldMinPriceIncreasePercent,
        uint256 newMinPriceIncreasePercent
    );

    /* ========== MODIFIERS ========== */

    /* ========== GOVERNANCE ========== */
    constructor(
        address contractOwner_,
        address nFTAddress_,
        address dPFeeManager_,
        address verifier_
    ) {
        FeeManager = IDPFeeManager(dPFeeManager_);
        NFT = IDPNFT(nFTAddress_);
        _transferOwnership(contractOwner_);
        verifier = verifier_;
    }

    function withdrawFunds(
        address payable receiver,
        address token
    ) external payable nonReentrant onlyOwner {
        uint256 withdrawAmount;
        if (token == address(0)) {
            withdrawAmount = address(this).balance - adminHoldPayment[token];
            require(withdrawAmount > 0, "Zero balance");
            receiver.sendValue(withdrawAmount);
        } else {
            withdrawAmount =
                IERC20(token).balanceOf(address(this)) -
                adminHoldPayment[token];
            require(withdrawAmount > 0, "Zero balance");
            IERC20(token).safeTransfer(receiver, withdrawAmount);
        }
        emit FundsWithdrawed(receiver, token, withdrawAmount);
    }

    function setMinPriceIncreasePercent(
        uint256 newMinPriceIncreasePercent
    ) external onlyOwner {
        require(
            minPriceIncreasePercent != newMinPriceIncreasePercent,
            "Already set"
        );
        emit MinPriceIncreasePercentUpdated(
            minPriceIncreasePercent,
            newMinPriceIncreasePercent
        );
        minPriceIncreasePercent = newMinPriceIncreasePercent;
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    function createToken(
        TokenCreateParams memory params
    ) external payable nonReentrant whenNotPaused returns (uint) {
        require(
            params.startPriceUSD >= params.reservePriceUSD,
            "Invalid start price"
        );

        require(
            msg.value == FeeManager.getListingPrice(),
            "Missing listing value"
        );

        uint256 newTokenId;

        if (params.tokenType != IDPNFT.Type.HasPhysical) {
            params.reservePriceUSD = 0x0;
        }

        if (params.tokenType != IDPNFT.Type.Series) {
            newTokenId = NFT.mint(
                msg.sender,
                params.tokenURI,
                params.creatorWallet,
                params.tokenType
            );
        } else {
            newTokenId = NFT.mintSeriesToken(
                msg.sender,
                params.tokenURI,
                params.creatorWallet,
                params.seriesId,
                msg.sender
            );
        }

        _createAuctionItem(
            AuctionCreateParams(
                newTokenId,
                params.isCustodianWallet,
                params.royalty,
                params.startPriceUSD,
                params.reservePriceUSD,
                params.startTime,
                params.endTime,
                true,
            new address[](0),
            new uint256[](0)
            )
        );
        return newTokenId;
    }

    function reAuctionToken(
        uint256 tokenId,
        uint256 startPriceUSD,
        uint256 startTime,
        uint256 endTime,
        address[] memory beneficiaries,
        uint256[] memory percents
    ) external payable nonReentrant whenNotPaused {
        uint256 oldAuctionId = tokenToAuctionId[tokenId];
        AuctionItem memory oldAuctionItem = idToAuctionItem[oldAuctionId];
        require(
            oldAuctionId != 0 && oldAuctionItem.sold == true,
            "Item unsold"
        );
        require(NFT.ownerOf(tokenId) == msg.sender, "Only item owner");
        require(
            msg.value == FeeManager.getListingPriceSecondary(),
            "Missing listing price"
        );

        _createAuctionItem(
            AuctionCreateParams(
                tokenId,
                oldAuctionItem.isCustodianWallet,
                oldAuctionItem.royalty,
                startPriceUSD,
                0,
                startTime,
                endTime,
                false,
                beneficiaries,
                percents
            )
        );

        _itemsSold.decrement();
    }

    function createExternalMintedItem(
        uint256 tokenId,
        bool isCustodianWallet,
        uint8 royalty,
        uint256 startPriceUSD,
        uint256 startTime,
        uint256 endTime,
        address[] memory beneficiaries,
        uint256[] memory percents
    ) external payable nonReentrant whenNotPaused {
        require(NFT.ownerOf(tokenId) == msg.sender, "Only item owner");
        require(!_listedTokenIds.contains(tokenId), "Item listed");
        require(
            msg.value == FeeManager.getListingPriceSecondary(),
            "Missing listing price"
        );

        _createAuctionItem(
            AuctionCreateParams(
                tokenId,
                isCustodianWallet,
                royalty,
                startPriceUSD,
                0,
                startTime,
                endTime,
                false,
                beneficiaries,
                percents
            )
        );
    }

    function bidToken(
        uint256 auctionId,
        address paymentToken,
        uint256 priceUSD
    ) external payable nonReentrant whenNotPaused {
        AuctionItem memory auctionItem = idToAuctionItem[auctionId];
        _checkValidBid(auctionItem, priceUSD);

        IDPFeeManager.FeeInformation memory feeInfo = FeeManager
            .getFeeInformation(paymentToken);
        require(feeInfo.aggregatorV3 != address(0), "Token not supported");

        PriceConverter.PriceData memory priceData = PriceConverter.getPrice(
            paymentToken,
            feeInfo.aggregatorV3
        );

        uint256 priceWithFeeToken = priceUSD.getUsdToken(priceData);

        uint256 priceToken = (priceWithFeeToken * 100) / 102;

        if (paymentToken == address(0)) {
            require(msg.value >= priceWithFeeToken, "Mising asking price");
            if (msg.value > priceWithFeeToken) {
                payable(msg.sender).sendValue(msg.value - priceWithFeeToken);
            }
        } else {
            IERC20(paymentToken).safeTransferFrom(
                msg.sender,
                address(this),
                priceWithFeeToken
            );
        }
        uint256 reservePriceToken = auctionItem.reservePriceUSD.getOrgUsdToken(
            priceData
        );

        adminHoldPayment[paymentToken] += priceWithFeeToken;

        _createBidToken(
            auctionItem.tokenId,
            auctionId,
            msg.sender,
            paymentToken,
            priceUSD,
            priceToken,
            priceWithFeeToken,
            reservePriceToken,
            priceData.oracleRoundId,
            false
        );
    }

    function bidTokenFiat(
        uint256 auctionId,
        uint256 priceUSD,
        bytes memory signature
    ) external payable nonReentrant whenNotPaused {
        AuctionItem memory auctionItem = idToAuctionItem[auctionId];
        _checkValidBid(auctionItem, priceUSD);

        require(
            signature.verifyBidFiatMessage(
                msg.sender,
                auctionId,
                auctionItem.tokenId,
                priceUSD,
                address(this),
                address(NFT),
                verifier
            ),
            "Invalid signature"
        );

        _createBidToken(
            auctionItem.tokenId,
            auctionId,
            msg.sender,
            address(0),
            priceUSD,
            0,
            0,
            0,
            0,
            true
        );
    }

    function acceptBid(
        uint256 auctionId,
        uint256 bidId
    ) external nonReentrant whenNotPaused {
        AuctionItem memory auctionItem = idToAuctionItem[auctionId];

        require(auctionItem.seller == msg.sender, "Only seller");
        require(auctionItem.endTime < block.timestamp, "Auction not end");
        require(!auctionItem.sold, "Auction sold");

        BidItem memory bidItem = idToBidItem[bidId];
        require(bidItem.auctionId == auctionId, "Bid not in auction");
        require(bidItem.status == BidStatus.Lived, "Bid accepted/cancelled");

        if (!bidItem.isFiat) {
            IDPFeeManager.FeeInformation memory feeInfo = FeeManager
                .getFeeInformation(bidItem.paymentToken);

            address creatorWallet = NFT.creators(auctionItem.tokenId);
            uint creatorToken = 0x0;
            uint sellerToken = 0x0;
            uint charityTokenTotal = 0x0;
            uint web3reTokenTotal;

            adminHoldPayment[bidItem.paymentToken] -= bidItem
                .bidPriceWithFeeToken;
            if (auctionItem.initialList == true) {
                if (auctionItem.reservePriceUSD > 0) {
                    if ((bidItem.bidPriceUSD) > (auctionItem.reservePriceUSD)) {
                        uint srToken = bidItem.bidPriceToken -
                            bidItem.reservePriceToken;
                        charityTokenTotal += (srToken * 80) / 100;
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
                    payable(feeInfo.charity).sendValue(charityTokenTotal);
                    payable(creatorWallet).sendValue(creatorToken);
                    payable(feeInfo.web3re).sendValue(web3reTokenTotal);
                } else {
                    IERC20(bidItem.paymentToken).safeTransfer(
                        feeInfo.charity,
                        charityTokenTotal
                    );
                    IERC20(bidItem.paymentToken).safeTransfer(
                        creatorWallet,
                        creatorToken
                    );
                    IERC20(bidItem.paymentToken).safeTransfer(
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
                    payable(creatorWallet).sendValue(creatorToken);
                    payable(feeInfo.charity).sendValue(charityTokenTotal);
                    payable(feeInfo.web3re).sendValue(web3reTokenTotal);

                    uint256 sellerAmount = sellerToken;
                    for (
                        uint256 i = 0;
                        i < auctionItem.beneficiaries.length;
                        i++
                    ) {
                        uint256 beneficiaryAmount = (sellerToken *
                            auctionItem.percents[i]) / PERCENT_BASIS_POINT;
                        payable(auctionItem.beneficiaries[i]).sendValue(
                            beneficiaryAmount
                        );
                        sellerAmount -= beneficiaryAmount;
                    }

                    payable(auctionItem.seller).sendValue(sellerAmount);
                } else {
                    IERC20(bidItem.paymentToken).safeTransfer(
                        creatorWallet,
                        creatorToken
                    );
                    IERC20(bidItem.paymentToken).safeTransfer(
                        feeInfo.charity,
                        charityTokenTotal
                    );
                    IERC20(bidItem.paymentToken).safeTransfer(
                        feeInfo.web3re,
                        web3reTokenTotal
                    );

                    uint256 sellerAmount = sellerToken;
                    for (
                        uint256 i = 0;
                        i < auctionItem.beneficiaries.length;
                        i++
                    ) {
                        uint256 beneficiaryAmount = (sellerToken *
                            auctionItem.percents[i]) / PERCENT_BASIS_POINT;
                        IERC20(bidItem.paymentToken).safeTransfer(
                            auctionItem.beneficiaries[i],
                            beneficiaryAmount
                        );
                        sellerAmount -= beneficiaryAmount;
                    }

                    IERC20(bidItem.paymentToken).safeTransfer(
                        auctionItem.seller,
                        sellerAmount
                    );
                }
            }
        }

        _itemsSold.increment();

        idToAuctionItem[auctionId].sold = true;

        idToBidItem[auctionItem.highestBidId].status = BidStatus.Accepted;

        NFT.transferFrom(address(this), bidItem.bidder, auctionItem.tokenId);
        emit AuctionAccepted(auctionId, auctionItem.highestBidId);
    }

    function editBid(
        uint256 bidId,
        uint256 priceUSD,
        bytes memory signature
    ) external payable nonReentrant whenNotPaused {
        BidItem memory bidItem = idToBidItem[bidId];
        AuctionItem memory auctionItem = idToAuctionItem[bidItem.auctionId];

        require(bidItem.bidder == msg.sender, "Only bidder");

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

        if (bidItem.isFiat) {
            require(
                signature.verifyEditBidFiatMessage(
                    msg.sender,
                    bidId,
                    bidItem.auctionId,
                    bidItem.tokenId,
                    priceUSD,
                    address(this),
                    address(NFT),
                    verifier
                ),
                "Invalid signature"
            );
            emit BidEdited(bidId, priceUSD, 0, 0, 0, 0);
        } else {
            IDPFeeManager.FeeInformation memory feeInfo = FeeManager
                .getFeeInformation(bidItem.paymentToken);
            require(feeInfo.aggregatorV3 != address(0), "Token not supported");

            PriceConverter.PriceData memory priceData = PriceConverter.getPrice(
                bidItem.paymentToken,
                feeInfo.aggregatorV3
            );

            uint256 priceWithFeeToken = priceUSD.getUsdToken(priceData);

            uint256 priceToken = (priceWithFeeToken * 100) / 102;

            if (priceWithFeeToken >= bidItem.bidPriceWithFeeToken) {
                uint256 additionPriceWithFeeToken = priceWithFeeToken -
                    bidItem.bidPriceWithFeeToken;
                adminHoldPayment[
                    bidItem.paymentToken
                ] += additionPriceWithFeeToken;
                if (bidItem.paymentToken == address(0)) {
                    require(
                        msg.value >= additionPriceWithFeeToken,
                        "Mising asking price"
                    );
                    if (msg.value > additionPriceWithFeeToken) {
                        payable(msg.sender).sendValue(
                            msg.value - additionPriceWithFeeToken
                        );
                    }
                } else {
                    IERC20(bidItem.paymentToken).safeTransferFrom(
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
                    payable(msg.sender).sendValue(
                        msg.value + subtractionPriceWithFeeToken
                    );
                } else {
                    IERC20(bidItem.paymentToken).safeTransfer(
                        msg.sender,
                        subtractionPriceWithFeeToken
                    );
                }
            }

            uint256 reservePriceToken = auctionItem
                .reservePriceUSD
                .getOrgUsdToken(priceData);

            idToBidItem[bidId].oracleRoundId = priceData.oracleRoundId;
            idToBidItem[bidId].bidPriceToken = priceToken;
            idToBidItem[bidId].bidPriceWithFeeToken = priceWithFeeToken;
            idToBidItem[bidId].reservePriceToken = reservePriceToken;

            emit BidEdited(
                bidId,
                priceUSD,
                priceToken,
                priceWithFeeToken,
                reservePriceToken,
                priceData.oracleRoundId
            );
        }

        idToBidItem[bidId].bidPriceUSD = priceUSD;
        idToAuctionItem[bidItem.auctionId].highestBidId = bidId;
    }

    function cancelAuction(
        uint256 tokenId
    ) external nonReentrant whenNotPaused {
        uint256 auctionId = tokenToAuctionId[tokenId];
        AuctionItem memory auctionItem = idToAuctionItem[auctionId];

        require(block.timestamp < auctionItem.startTime, "Auction started");
        require(!auctionItem.sold, "Auction canceled");
        require(
            auctionItem.seller == msg.sender && !auctionItem.initialList,
            "Only item owner and not initialList"
        );

        idToAuctionItem[auctionId].sold = true;
        _itemsSold.increment();
        NFT.transferFrom(address(this), msg.sender, tokenId);
        emit AuctionCanceled(tokenId);
    }

    function cancelBid(
        uint256 bidId,
        bytes memory signature
    ) external nonReentrant whenNotPaused {
        BidItem memory bidItem = idToBidItem[bidId];
        require(bidItem.status == BidStatus.Lived, "Bid closed");
        require(bidItem.bidder == msg.sender, "Only bidder");

        AuctionItem memory auctionItem = idToAuctionItem[bidItem.auctionId];
        require(
            auctionItem.sold || auctionItem.highestBidId != bidId,
            "Can not cancel highest bid"
        );

        if (bidItem.isFiat) {
            require(
                signature.verifyCancelBidFiatMessage(
                    msg.sender,
                    bidId,
                    bidItem.auctionId,
                    bidItem.tokenId,
                    address(this),
                    address(NFT),
                    verifier
                ),
                "Invalid signature"
            );
        } else {
            adminHoldPayment[bidItem.paymentToken] -= bidItem
                .bidPriceWithFeeToken;
            if (bidItem.paymentToken == address(0)) {
                payable(msg.sender).sendValue(bidItem.bidPriceWithFeeToken);
            } else {
                IERC20(bidItem.paymentToken).safeTransfer(
                    msg.sender,
                    bidItem.bidPriceWithFeeToken
                );
            }
        }

        idToBidItem[bidId].status = BidStatus.Canceled;
        emit BidCanceled(bidId);
    }

    function reclaimAuction(
        uint256 auctionId
    ) external nonReentrant whenNotPaused {
        AuctionItem memory auctionItem = idToAuctionItem[auctionId];

        require(auctionItem.seller == msg.sender, "Only auction owner");
        require(!auctionItem.sold, "Auction canceled");
        require(auctionItem.endTime < block.timestamp, "Auction not end");
        require(auctionItem.listBidId.length == 0, "Auction was bidden");

        _itemsSold.increment();

        idToAuctionItem[auctionId].sold = true;
        NFT.transferFrom(
            address(this),
            auctionItem.seller,
            auctionItem.tokenId
        );
        emit AuctionReclaimed(auctionId);
    }

    function approveAddress(
        uint256 _tokenId
    ) public onlyOwner nonReentrant whenNotPaused {
        _approveAddress(_tokenId);
    }

    function transferNFTTo(
        address _from,
        address _to,
        uint256 tokenId
    ) external nonReentrant whenNotPaused {
        require(
            NFT.adminApproved(tokenId) == address(this),
            "TokenId not approved by admin"
        );
        if (_listedTokenIds.contains(tokenId)) {
            uint256 auctionId = tokenToAuctionId[tokenId];
            idToAuctionItem[auctionId].sold = true;
            if (_from == address(this)) {
                _itemsSold.increment();
            }
        }
        NFT.transferFrom(_from, _to, tokenId);
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    function _createAuctionItem(AuctionCreateParams memory params) internal {
        require(
            params.endTime > params.startTime &&
                params.startTime >= block.timestamp,
            "Invalid time"
        );
        require(
            params.beneficiaries.length == params.percents.length,
            "Invalid beneficiaries length"
        );

        uint256 totalSharePercent;
        for (uint256 i = 0; i < params.percents.length; i++) {
            totalSharePercent += params.percents[i];
        }
        require(
            totalSharePercent <= PERCENT_BASIS_POINT,
            "Invalid share percent"
        );
        _listedTokenIds.add(params.tokenId);

        totalAuctions++;
        tokenToAuctionId[params.tokenId] = totalAuctions;
        AuctionItem storage newAuction = idToAuctionItem[totalAuctions];

        newAuction.tokenId = params.tokenId;
        newAuction.auctionId = totalAuctions;
        newAuction.seller = payable(msg.sender);
        newAuction.isCustodianWallet = params.isCustodianWallet;
        newAuction.royalty = params.royalty;
        newAuction.startPriceUSD = params.startPriceUSD;
        newAuction.reservePriceUSD = params.reservePriceUSD;
        newAuction.initialList = params.initialList;
        newAuction.sold = false;
        newAuction.startTime = params.startTime;
        newAuction.endTime = params.endTime;
        newAuction.beneficiaries = params.beneficiaries;
        newAuction.percents = params.percents;

        _approveAddress(params.tokenId);
        NFT.transferFrom(msg.sender, address(this), params.tokenId);

        emit AuctionItemCreated(
            totalAuctions,
            params.tokenId,
            msg.sender,
            params.isCustodianWallet,
            params.royalty,
            params.startPriceUSD,
            params.reservePriceUSD,
            params.initialList,
            params.startTime,
            params.endTime,
            params.beneficiaries,
            params.percents
        );
    }

    function _checkValidBid(
        AuctionItem memory auctionItem,
        uint256 priceUSD
    ) internal view {
        require(!auctionItem.sold, "Auction sold");

        require(
            block.timestamp >= auctionItem.startTime &&
                block.timestamp <= auctionItem.endTime,
            "Not in auction time"
        );

        require(auctionItem.seller != msg.sender, "Seller cannot bid");

        require(
            priceUSD >= auctionItem.startPriceUSD,
            "Price less than start price"
        );

        require(
            auctionItem.listBidId.length == 0 ||
                priceUSD >
                (idToBidItem[auctionItem.highestBidId].bidPriceUSD *
                    (PERCENT_BASIS_POINT + minPriceIncreasePercent)) /
                    PERCENT_BASIS_POINT,
            "Price less than min price"
        );
    }

    function _createBidToken(
        uint256 tokenId,
        uint256 auctionId,
        address bidder,
        address paymentToken,
        uint256 priceUSD,
        uint256 priceToken,
        uint256 priceWithFeeToken,
        uint256 reservePriceToken,
        uint80 oracleRoundId,
        bool isFiat
    ) internal {
        totalBids++;
        uint256 bidId = totalBids;
        BidItem memory newBidItem = BidItem(
            bidId,
            tokenId,
            auctionId,
            bidder,
            paymentToken,
            priceUSD,
            priceToken,
            priceWithFeeToken,
            reservePriceToken,
            oracleRoundId,
            isFiat,
            BidStatus.Lived
        );

        idToBidItem[bidId] = newBidItem;
        idToAuctionItem[auctionId].listBidId.push(bidId);
        idToAuctionItem[auctionId].highestBidId = bidId;

        emit BidCreated(
            bidId,
            tokenId,
            auctionId,
            bidder,
            paymentToken,
            priceUSD,
            priceToken,
            priceWithFeeToken,
            reservePriceToken,
            oracleRoundId,
            isFiat,
            BidStatus.Lived
        );
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
                AuctionItem memory currentItem = idToAuctionItem[
                    tokenToAuctionId[currentId]
                ];
                items[currentIndex] = currentItem;
                currentIndex += 1;
            }
        }
        return items;
    }
}
