// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./libraries/PriceConverterTest.sol";
import "./DPNFT.sol";

import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "hardhat/console.sol";

contract DPMarketplaceC1 is ReentrancyGuard {
    using Counters for Counters.Counter;
    using EnumerableSet for EnumerableSet.UintSet;

    EnumerableSet.UintSet private _listedTokenIds;
    Counters.Counter private _itemsSold;

    DPNFT public NFT;

    uint256 listingPrice = 0.00001 ether;
    uint256 listingPriceSecondary = 0.0001 ether;

    address payable owner;

    address private _contractOwner;
    address private _charity;
    address private _web3re;

    using PriceConverter for uint256;

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

    event MarketItemCreated(
        uint256 indexed tokenId,
        address seller,
        address owner,
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

    constructor(
        address contractOwner_,
        address charity_,
        address web3re_,
        address NFTAddress_
    ) {
        _contractOwner = contractOwner_;
        _charity = charity_;
        _web3re = web3re_;
        owner = payable(contractOwner_);
        NFT = DPNFT(NFTAddress_);
    }

    function withdraw() external payable nonReentrant {
        require(owner == msg.sender, "Only mktplace owner can withdraw");
        payable(msg.sender).transfer(address(this).balance);
    }

    function approveAddress(uint256 _tokenId) public {
        require(
            owner == msg.sender,
            "Only mktplace owner can appoint approvers"
        );
        _approveAddress(_tokenId);
    }

    function _approveAddress(uint256 _tokenId) internal {
        NFT.administratorApprove(_tokenId);
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

    function getItemSold() external view returns (uint256) {
        return _itemsSold.current();
    }

    function getListingPrice() external view returns (uint256) {
        return listingPrice;
    }

    function updateListingPriceSecondary(
        uint _listingPriceSecondary
    ) public payable nonReentrant {
        require(
            owner == msg.sender,
            "Only mktplace owner can upd Sec list price."
        );
        listingPriceSecondary = _listingPriceSecondary;
    }

    function getListingPriceSecondary() public view returns (uint256) {
        return listingPriceSecondary;
    }

    function getMarketItem(
        uint256 marketItemId
    ) external view returns (MarketItem memory) {
        return idToMarketItem[marketItemId];
    }

    function getUsdMaticPrice(uint256 tokenId) external view returns (uint) {
        uint priceR = idToMarketItem[tokenId].sellpriceUSD.getUsdMatic();
        return priceR;
    }

    function createToken(
        string memory tokenURI,
        address payable _c_Wallet,
        bool _isCustodianWallet,
        uint8 _royalty,
        bool _withPhysical,
        uint256 _sellpriceUSD,
        uint256 _reservePriceUSD,
        uint256 price
    ) external payable returns (uint) {
        require(
            _sellpriceUSD >= _reservePriceUSD,
            "Price must be >= reserve price"
        );

        uint256 newTokenId = NFT.mint(msg.sender, tokenURI);

        createMarketItem(
            newTokenId,
            _c_Wallet,
            _isCustodianWallet,
            _royalty,
            _withPhysical,
            _sellpriceUSD,
            _reservePriceUSD,
            price
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
        uint256 price
    ) public payable nonReentrant {
        require(NFT.ownerOf(tokenId) == msg.sender, "Only item o");
        require(
            !_listedTokenIds.contains(tokenId),
            "Item already initialListed"
        );
        require(price > 0, "Price must be at least 1 wei");
        require(msg.value == listingPrice, "Price must be = listing price");
        require(sellpriceUSD >= reservePriceUSD, "Price must be > r price");
        if (withPhysical != true) {
            reservePriceUSD = 0x0;
        }
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
            true,
            false
        );

        _approveAddress(tokenId);
        NFT.transferFrom(msg.sender, address(this), tokenId);
        emit MarketItemCreated(
            tokenId,
            msg.sender,
            address(this),
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
        uint256 _sellpriceUSD,
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
            require(NFT.ownerOf(tokenId) == msg.sender, "Only item o");
            require(
                msg.value == listingPriceSecondary,
                "Price must be = Sec list price"
            );

            idToMarketItem[tokenId].sold = false;
            idToMarketItem[tokenId].sellpriceUSD = _sellpriceUSD;
            idToMarketItem[tokenId].price = price;
            idToMarketItem[tokenId].seller = payable(msg.sender);
            _itemsSold.decrement();
            NFT.administratorApprove(tokenId);
            NFT.transferFrom(msg.sender, address(this), tokenId);
        }
    }

    function createMarketSale(uint256 tokenId) external payable nonReentrant {
        uint price2 = idToMarketItem[tokenId].sellpriceUSD.getUsdMatic();
        require(msg.value >= price2, "missing asking price");

        uint creator_MATIC = 0x0;
        uint seller_MATIC = 0x0;
        uint charity_matic1 = 0x0;
        uint charity_matic_total = 0x0;
        uint web3re_matic_total;
        address creator = idToMarketItem[tokenId].c_Wallet;

        if (idToMarketItem[tokenId].initialList == true) {
            if (idToMarketItem[tokenId].withPhysical == true) {
                if (
                    (idToMarketItem[tokenId].sellpriceUSD) >
                    (idToMarketItem[tokenId].reservePriceUSD)
                ) {
                    uint sr_USD = idToMarketItem[tokenId].sellpriceUSD -
                        idToMarketItem[tokenId].reservePriceUSD;
                    uint sr_MATIC = sr_USD.getOrgUsdMatic();
                    charity_matic1 = (sr_MATIC * 80) / 100;
                }

                uint r_USD = idToMarketItem[tokenId].reservePriceUSD;
                uint r_MATIC = r_USD.getOrgUsdMatic();
                creator_MATIC = ((r_USD * 65) / 100).getOrgUsdMatic();
                uint charity_matic2 = (r_MATIC * 20) / 100;

                charity_matic_total = charity_matic1 + charity_matic2;
                web3re_matic_total =
                    msg.value -
                    creator_MATIC -
                    charity_matic_total;
            } else {
                creator_MATIC = ((idToMarketItem[tokenId].sellpriceUSD * 85) /
                    100).getOrgUsdMatic();
                charity_matic_total = ((idToMarketItem[tokenId].sellpriceUSD *
                    10) / 100).getOrgUsdMatic();
                web3re_matic_total =
                    msg.value -
                    creator_MATIC -
                    charity_matic_total;
            }
            payable(_charity).transfer(charity_matic_total);
            payable(creator).transfer(creator_MATIC);
            payable(_web3re).transfer(web3re_matic_total);

            _itemsSold.increment();
        } else {
            address seller = idToMarketItem[tokenId].seller;
            uint8 royalty_pc = idToMarketItem[tokenId].royalty;

            if (idToMarketItem[tokenId].isCustodianWallet == true) {
                if (royalty_pc >= 2) {
                    creator_MATIC = ((idToMarketItem[tokenId].sellpriceUSD *
                        2) / 100).getOrgUsdMatic();
                }
            } else {
                creator_MATIC = ((idToMarketItem[tokenId].sellpriceUSD *
                    royalty_pc) / 100).getOrgUsdMatic();
            }

            seller_MATIC = ((idToMarketItem[tokenId].sellpriceUSD * 80) / 100)
                .getOrgUsdMatic();
            charity_matic_total = ((idToMarketItem[tokenId].sellpriceUSD * 10) /
                100).getOrgUsdMatic();
            web3re_matic_total =
                msg.value -
                creator_MATIC -
                seller_MATIC -
                charity_matic_total;

            payable(creator).transfer(creator_MATIC);
            payable(seller).transfer(seller_MATIC);
            payable(_charity).transfer(charity_matic_total);
            payable(_web3re).transfer(web3re_matic_total);

            _itemsSold.increment();
        }

        idToMarketItem[tokenId].sold = true;
        idToMarketItem[tokenId].seller = payable(address(0));

        idToMarketItem[tokenId].initialList = false;
        idToMarketItem[tokenId].reservePriceUSD = 0;

        NFT.transferFrom(address(this), msg.sender, tokenId);
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
