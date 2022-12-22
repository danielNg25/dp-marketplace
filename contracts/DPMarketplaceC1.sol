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

contract DPMarketplaceC1 is Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;
    using EnumerableSet for EnumerableSet.UintSet;
    using PriceConverter for uint256;

    EnumerableSet.UintSet private _listedTokenIds;
    Counters.Counter private _itemsSold;

    DPNFT public NFT;
    IDPFeeManager public FeeManager;

    mapping(uint256 => MarketItem) private idToMarketItem;

    struct MarketItem {
        uint256 tokenId;
        address payable seller;
        address payable c_Wallet;
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
        address c_Wallet,
        bool isCustodianWallet,
        uint8 royalty,
        bool withPhysical,
        uint256 sellpriceUSD,
        uint256 reservePriceUSD,
        uint256 price,
        bool initialList,
        bool sold
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
        uint256 sellpriceUSD,
        uint256 reservePriceUSD,
        uint256 price
    ) external payable nonReentrant returns (uint) {
        require(
            sellpriceUSD >= reservePriceUSD,
            "Price must be >= reserve price"
        );
        require(price > 0, "Price must be at least 1 wei");
        require(
            msg.value == FeeManager.getListingPrice(),
            "Price must be = listing price"
        );
        uint256 newTokenId = NFT.mint(msg.sender, tokenURI);

        if (withPhysical != true) {
            reservePriceUSD = 0x0;
        }

        createMarketItem(
            newTokenId,
            c_Wallet,
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
        address payable c_Wallet,
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
            payable(c_Wallet),
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
        emit MarketItemCreated(
            tokenId,
            msg.sender,
            c_Wallet,
            isCustodianWallet,
            royalty,
            withPhysical,
            sellpriceUSD,
            reservePriceUSD,
            price,
            true,
            false
        );
    }

    function resellToken(
        uint256 tokenId,
        uint256 sellpriceUSD,
        uint256 price,
        bool _unlist
    ) external payable nonReentrant {
        if (_unlist) {
            require(
                msg.sender == idToMarketItem[tokenId].seller &&
                    idToMarketItem[tokenId].initialList == false,
                "Only s may unlist"
            );
            idToMarketItem[tokenId].sold = true;
            idToMarketItem[tokenId].seller = payable(address(0));
            _itemsSold.increment();
            NFT.transferFrom(address(this), msg.sender, tokenId);
        } else {
            require(
                idToMarketItem[tokenId].sold == true,
                "Can not resell unsold item"
            );
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
        }
    }

    function createExternalMintedItem(
        uint256 tokenId,
        address c_Wallet,
        bool isCustodianWallet,
        uint8 royalty,
        uint256 sellpriceUSD,
        uint256 price
    ) external payable nonReentrant {
        require(NFT.ownerOf(tokenId) == msg.sender, "Only item o");
        require(!_listedTokenIds.contains(tokenId), "Item already listed");
        require(
            msg.value == FeeManager.getListingPriceSecondary(),
            "Price must be = Sec list price"
        );

        createMarketItem(
            tokenId,
            payable(c_Wallet),
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
    ) external payable nonReentrant {
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
                payable(msg.sender).transfer(msg.value - price2);
            }
        } else {
            IERC20(paymentToken).transferFrom(
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
                    uint sr_USD = item.sellpriceUSD - item.reservePriceUSD;
                    uint sr_Token = sr_USD.getOrgUsdToken(priceData);
                    charityTokenTotal += (sr_Token * 80) / 100;
                }

                uint r_USD = item.reservePriceUSD;
                uint r_Token = r_USD.getOrgUsdToken(priceData);
                creatorToken = ((r_USD * 65) / 100).getOrgUsdToken(priceData);
                charityTokenTotal += (r_Token * 20) / 100;

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
                payable(feeInfo.charity).transfer(charityTokenTotal);
                payable(item.c_Wallet).transfer(creatorToken);
                payable(feeInfo.web3re).transfer(web3reTokenTotal);
            } else {
                IERC20(paymentToken).transfer(
                    feeInfo.charity,
                    charityTokenTotal
                );
                IERC20(paymentToken).transfer(item.c_Wallet, creatorToken);
                IERC20(paymentToken).transfer(feeInfo.web3re, web3reTokenTotal);
            }

            _itemsSold.increment();
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
                payable(item.c_Wallet).transfer(creatorToken);
                payable(item.seller).transfer(sellerToken);
                payable(feeInfo.charity).transfer(charityTokenTotal);
                payable(feeInfo.web3re).transfer(web3reTokenTotal);
            } else {
                IERC20(paymentToken).transfer(item.c_Wallet, creatorToken);
                IERC20(paymentToken).transfer(item.seller, sellerToken);
                IERC20(paymentToken).transfer(
                    feeInfo.charity,
                    charityTokenTotal
                );
                IERC20(paymentToken).transfer(feeInfo.web3re, web3reTokenTotal);
            }

            _itemsSold.increment();
        }

        idToMarketItem[tokenId].sold = true;
        idToMarketItem[tokenId].seller = payable(address(0));

        idToMarketItem[tokenId].initialList = false;
        idToMarketItem[tokenId].reservePriceUSD = 0;

        NFT.transferFrom(address(this), msg.sender, tokenId);
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
