// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./libraries/PriceConverter.sol";
import "./libraries/DPFeeManagerStruct.sol";
import "./interface/IDPNFT.sol";
import "./interface/IDPFeeManager.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract DPMarketplaceC1 is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using Address for address payable;
    using Counters for Counters.Counter;
    using EnumerableSet for EnumerableSet.UintSet;
    using PriceConverter for uint256;

    EnumerableSet.UintSet private _listedTokenIds;
    Counters.Counter private _itemsSold;

    IDPNFT public NFT;
    IDPFeeManager public FeeManager;

    mapping(uint256 => MarketItem) private idToMarketItem;

    struct MarketItem {
        uint256 tokenId;
        address payable seller;
        address payable creatorWallet;
        bool isCustodianWallet;
        uint8 royalty;
        bool withPhysical;
        uint256 sellpriceUSD;
        uint256 reservePriceUSD;
        uint256 price;
        bool initialList;
        bool sold;
    }

    /* ========== EVENTS ========== */

    event MarketItemCreated(
        uint256 indexed tokenId,
        address seller,
        address creatorWallet,
        bool isCustodianWallet,
        uint8 royalty,
        bool withPhysical,
        uint256 sellpriceUSD,
        uint256 reservePriceUSD,
        uint256 price,
        bool initialList
    );
    event MarketItemResold(
        uint256 indexed tokenId,
        address seller,
        address creatorWallet,
        bool isCustodianWallet,
        uint8 royalty,
        bool withPhysical,
        uint256 sellpriceUSD,
        uint256 reservePriceUSD,
        uint256 price,
        bool initialList
    );
    event MarketItemSold(
        uint256 indexed tokenId,
        address seller,
        address buyer,
        address creatorWallet,
        address charity,
        address web3re,
        address paymentToken,
        uint80 oracleRoundId,
        uint256 sellpriceUSD,
        uint256 sellPriceToken,
        uint256 buyerAmountToken,
        uint256 creatorWalletAmountToken,
        uint256 charityAmountToken,
        uint256 web3reAmountToken
    );
    event FundsWithdrawed(address receiver, address token, uint256 amount);

    /* ========== MODIFIERS ========== */

    /* ========== GOVERNANCE ========== */

    constructor(
        address contractOwner_,
        address nFTAddress_,
        address dPFeeManager_
    ) {
        FeeManager = IDPFeeManager(dPFeeManager_);
        NFT = IDPNFT(nFTAddress_);
        _transferOwnership(contractOwner_);
    }

    function withdrawFunds(
        address payable receiver,
        address token
    ) external payable nonReentrant onlyOwner {
        uint256 withdrawAmount;
        if (token == address(0)) {
            withdrawAmount = address(this).balance;
            require(withdrawAmount > 0, "Nothing to withdraw");
            receiver.sendValue(withdrawAmount);
        } else {
            withdrawAmount = IERC20(token).balanceOf(address(this));
            require(withdrawAmount > 0, "Nothing to withdraw");
            IERC20(token).safeTransfer(receiver, withdrawAmount);
        }

        emit FundsWithdrawed(receiver, token, withdrawAmount);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    function createToken(
        string memory tokenURI,
        IDPNFT.Type tokenType,
        uint256 seriesId,
        address payable creatorWallet,
        bool isCustodianWallet,
        uint8 royalty,
        uint256 sellpriceUSD,
        uint256 reservePriceUSD,
        uint256 price
    ) external payable nonReentrant whenNotPaused returns (uint) {
        require(
            sellpriceUSD >= reservePriceUSD,
            "Price must be >= reserve price"
        );
        require(price > 0, "Price must be at least 1 wei");
        require(
            msg.value == FeeManager.getListingPrice(),
            "Price must be = listing price"
        );
        uint256 newTokenId;

        bool withPhysical = (tokenType == IDPNFT.Type.HasPhysical);
        if (withPhysical != true) {
            reservePriceUSD = 0x0;
            newTokenId = NFT.mint(msg.sender, tokenURI, tokenType);
        } else {
            newTokenId = NFT.mintSeriesToken(msg.sender, tokenURI, seriesId, msg.sender);
        }

        createMarketItem(
            newTokenId,
            creatorWallet,
            isCustodianWallet,
            royalty,
            withPhysical,
            sellpriceUSD,
            reservePriceUSD,
            price,
            true
        );
        emit MarketItemCreated(
            newTokenId,
            msg.sender,
            creatorWallet,
            isCustodianWallet,
            royalty,
            withPhysical,
            sellpriceUSD,
            reservePriceUSD,
            price,
            true
        );
        return newTokenId;
    }

    function createMarketItem(
        uint256 tokenId,
        address payable creatorWallet,
        bool isCustodianWallet,
        uint8 royalty,
        bool withPhysical,
        uint256 sellpriceUSD,
        uint256 reservePriceUSD,
        uint256 price,
        bool initialList
    ) internal {
        _listedTokenIds.add(tokenId);

        idToMarketItem[tokenId] = MarketItem(
            tokenId,
            payable(msg.sender),
            payable(creatorWallet),
            isCustodianWallet,
            royalty,
            withPhysical,
            sellpriceUSD,
            reservePriceUSD,
            price,
            initialList,
            false
        );

        _approveAddress(tokenId);
        NFT.transferFrom(msg.sender, address(this), tokenId);
    }

    function resellToken(
        uint256 tokenId,
        uint256 sellpriceUSD,
        uint256 price,
        bool _unlist
    ) external payable nonReentrant whenNotPaused {
        MarketItem memory marketItem = idToMarketItem[tokenId];
        if (_unlist) {
            require(
                msg.sender == marketItem.seller &&
                    marketItem.initialList == false,
                "Only s may unlist"
            );
            idToMarketItem[tokenId].sold = true;
            idToMarketItem[tokenId].seller = payable(address(0));
            _itemsSold.increment();
            NFT.transferFrom(address(this), msg.sender, tokenId);
        } else {
            require(marketItem.sold == true, "Can not resell unsold item");
            require(NFT.ownerOf(tokenId) == msg.sender, "Only item o");
            require(
                msg.value == FeeManager.getListingPriceSecondary(),
                "Price must be = Sec list price"
            );

            idToMarketItem[tokenId].sold = false;
            idToMarketItem[tokenId].sellpriceUSD = sellpriceUSD;
            idToMarketItem[tokenId].price = price;
            idToMarketItem[tokenId].seller = payable(msg.sender);
            _itemsSold.decrement();
            _approveAddress(tokenId);
            NFT.transferFrom(msg.sender, address(this), tokenId);

            emit MarketItemResold(
                tokenId,
                msg.sender,
                marketItem.creatorWallet,
                marketItem.isCustodianWallet,
                marketItem.royalty,
                marketItem.withPhysical,
                sellpriceUSD,
                marketItem.reservePriceUSD,
                price,
                marketItem.initialList
            );
        }
    }

    function createExternalMintedItem(
        uint256 tokenId,
        address creatorWallet,
        bool isCustodianWallet,
        uint8 royalty,
        uint256 sellpriceUSD,
        uint256 price
    ) external payable nonReentrant whenNotPaused {
        require(NFT.ownerOf(tokenId) == msg.sender, "Only item o");
        require(!_listedTokenIds.contains(tokenId), "Item already listed");
        require(
            msg.value == FeeManager.getListingPriceSecondary(),
            "Price must be = Sec list price"
        );

        createMarketItem(
            tokenId,
            payable(creatorWallet),
            isCustodianWallet,
            royalty,
            false,
            sellpriceUSD,
            0,
            price,
            false
        );

        emit MarketItemCreated(
            tokenId,
            msg.sender,
            creatorWallet,
            isCustodianWallet,
            royalty,
            false,
            sellpriceUSD,
            0,
            price,
            false
        );
    }

    function createMarketSale(
        uint256 tokenId,
        address paymentToken
    ) external payable nonReentrant whenNotPaused {
        FeeManagerStruct.FeeInformation memory feeInfo = FeeManager
            .getFeeInformation(paymentToken);
        require(
            feeInfo.aggregatorV3 != address(0),
            "Payment token not supported"
        );

        MarketItem memory item = idToMarketItem[tokenId];

        PriceConverter.PriceData memory priceData = PriceConverter.getPrice(
            paymentToken,
            feeInfo.aggregatorV3
        );

        uint price2 = item.sellpriceUSD.getUsdToken(priceData);
        if (paymentToken == address(0)) {
            require(msg.value >= price2, "missing asking price");
            if (msg.value > price2) {
                payable(msg.sender).sendValue(msg.value - price2);
            }
        } else {
            IERC20(paymentToken).safeTransferFrom(
                msg.sender,
                address(this),
                price2
            );
        }

        uint creatorToken = 0x0;
        uint sellerToken = 0x0;
        uint charityTokenTotal = 0x0;
        uint web3reTokenTotal;

        if (item.initialList == true) {
            if (item.withPhysical == true) {
                if ((item.sellpriceUSD) > (item.reservePriceUSD)) {
                    uint srUSD = item.sellpriceUSD - item.reservePriceUSD;
                    uint srToken = srUSD.getOrgUsdToken(priceData);
                    charityTokenTotal += (srToken * 80) / 100;
                }

                uint rUSD = item.reservePriceUSD;
                uint rToken = rUSD.getOrgUsdToken(priceData);
                creatorToken = ((rUSD * 65) / 100).getOrgUsdToken(priceData);
                charityTokenTotal += (rToken * 20) / 100;

                web3reTokenTotal = price2 - creatorToken - charityTokenTotal;
            } else {
                creatorToken = ((item.sellpriceUSD * 85) / 100).getOrgUsdToken(
                    priceData
                );
                charityTokenTotal = ((item.sellpriceUSD * 10) / 100)
                    .getOrgUsdToken(priceData);
                web3reTokenTotal = price2 - creatorToken - charityTokenTotal;
            }
            if (paymentToken == address(0)) {
                payable(feeInfo.charity).sendValue(charityTokenTotal);
                payable(item.creatorWallet).sendValue(creatorToken);
                payable(feeInfo.web3re).sendValue(web3reTokenTotal);
            } else {
                IERC20(paymentToken).safeTransfer(
                    feeInfo.charity,
                    charityTokenTotal
                );
                IERC20(paymentToken).safeTransfer(
                    item.creatorWallet,
                    creatorToken
                );
                IERC20(paymentToken).safeTransfer(
                    feeInfo.web3re,
                    web3reTokenTotal
                );
            }

            _itemsSold.increment();
            emit MarketItemSold(
                tokenId,
                item.seller,
                msg.sender,
                item.creatorWallet,
                feeInfo.charity,
                feeInfo.web3re,
                paymentToken,
                priceData.oracleRoundId,
                item.sellpriceUSD,
                price2,
                sellerToken,
                creatorToken,
                charityTokenTotal,
                web3reTokenTotal
            );
        } else {
            if (item.isCustodianWallet == true) {
                if (item.royalty >= 2) {
                    creatorToken = ((item.sellpriceUSD * 2) / 100)
                        .getOrgUsdToken(priceData);
                }
            } else {
                creatorToken = ((item.sellpriceUSD * item.royalty) / 100)
                    .getOrgUsdToken(priceData);
            }

            sellerToken = ((item.sellpriceUSD * 80) / 100).getOrgUsdToken(
                priceData
            );
            charityTokenTotal = ((item.sellpriceUSD * 10) / 100).getOrgUsdToken(
                priceData
            );

            web3reTokenTotal =
                price2 -
                creatorToken -
                sellerToken -
                charityTokenTotal;
            if (paymentToken == address(0)) {
                payable(item.creatorWallet).sendValue(creatorToken);
                payable(item.seller).sendValue(sellerToken);
                payable(feeInfo.charity).sendValue(charityTokenTotal);
                payable(feeInfo.web3re).sendValue(web3reTokenTotal);
            } else {
                IERC20(paymentToken).safeTransfer(
                    item.creatorWallet,
                    creatorToken
                );
                IERC20(paymentToken).safeTransfer(item.seller, sellerToken);
                IERC20(paymentToken).safeTransfer(
                    feeInfo.charity,
                    charityTokenTotal
                );
                IERC20(paymentToken).safeTransfer(
                    feeInfo.web3re,
                    web3reTokenTotal
                );
            }

            _itemsSold.increment();
            emit MarketItemSold(
                tokenId,
                item.seller,
                msg.sender,
                item.creatorWallet,
                feeInfo.charity,
                feeInfo.web3re,
                paymentToken,
                priceData.oracleRoundId,
                item.sellpriceUSD,
                price2,
                sellerToken,
                creatorToken,
                charityTokenTotal,
                web3reTokenTotal
            );
        }

        idToMarketItem[tokenId].sold = true;
        idToMarketItem[tokenId].seller = payable(address(0));

        idToMarketItem[tokenId].initialList = false;
        idToMarketItem[tokenId].reservePriceUSD = 0;

        NFT.transferFrom(address(this), msg.sender, tokenId);
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
            idToMarketItem[tokenId].sold = true;
            idToMarketItem[tokenId].initialList = false;
            idToMarketItem[tokenId].seller = payable(address(0));
            idToMarketItem[tokenId].reservePriceUSD = 0;
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

    function getMarketItem(
        uint256 marketItemId
    ) external view returns (MarketItem memory) {
        return idToMarketItem[marketItemId];
    }

    function getUsdTokenPrice(
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
            priceR = idToMarketItem[tokenId].sellpriceUSD.getUsdToken(
                priceData
            );
        }
        return (isSupported, priceR);
    }

    function fetchMarketItems() public view returns (MarketItem[] memory) {
        uint itemCount = _listedTokenIds.length();
        uint unsoldItemCount = itemCount - _itemsSold.current();
        uint currentIndex = 0;

        MarketItem[] memory items = new MarketItem[](unsoldItemCount);
        for (uint i = 0; i < itemCount; i++) {
            uint currentId = _listedTokenIds.at(i);
            if (NFT.ownerOf(currentId) == address(this)) {
                MarketItem storage currentItem = idToMarketItem[currentId];
                items[currentIndex] = currentItem;
                currentIndex += 1;
            }
        }
        return items;
    }

    function fetchMyNFTs() public view returns (MarketItem[] memory) {
        uint totalItemCount = _listedTokenIds.length();
        uint itemCount = 0;
        uint currentIndex = 0;

        for (uint i = 0; i < totalItemCount; i++) {
            uint currentId = _listedTokenIds.at(i);
            if (NFT.ownerOf(currentId) == msg.sender) {
                itemCount += 1;
            }
        }

        MarketItem[] memory items = new MarketItem[](itemCount);
        for (uint i = 0; i < totalItemCount; i++) {
            uint currentId = _listedTokenIds.at(i);
            if (NFT.ownerOf(currentId) == msg.sender) {
                MarketItem storage currentItem = idToMarketItem[currentId];
                items[currentIndex] = currentItem;
                currentIndex += 1;
            }
        }
        return items;
    }

    function fetchItemsListed() public view returns (MarketItem[] memory) {
        uint totalItemCount = _listedTokenIds.length();
        uint itemCount = 0;
        uint currentIndex = 0;

        for (uint i = 0; i < totalItemCount; i++) {
            if (idToMarketItem[_listedTokenIds.at(i)].seller == msg.sender) {
                itemCount += 1;
            }
        }

        MarketItem[] memory items = new MarketItem[](itemCount);
        for (uint i = 0; i < totalItemCount; i++) {
            uint currentId = _listedTokenIds.at(i);
            if (idToMarketItem[currentId].seller == msg.sender) {
                MarketItem storage currentItem = idToMarketItem[currentId];
                items[currentIndex] = currentItem;
                currentIndex += 1;
            }
        }
        return items;
    }
}
