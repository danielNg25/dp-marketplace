// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./libraries/PriceConverter.sol";
import "./DPNFT.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract DPMarketplaceC1 is ReentrancyGuard {
    using Counters for Counters.Counter;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;

    EnumerableSet.AddressSet private _paymentMethods;
    mapping(address => address) public aggregatorV3Address;

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

    modifier onlyOwner() {
        require(owner == msg.sender, "Restricted to owner");
        _;
    }

    /* ========== GOVERNANCE ========== */

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

    function withdraw() external payable nonReentrant onlyOwner {
        payable(msg.sender).transfer(address(this).balance);
    }

    function updateListingPriceSecondary(
        uint _listingPriceSecondary
    ) public payable nonReentrant onlyOwner {
        listingPriceSecondary = _listingPriceSecondary;
    }

    function setPaymentMethod(
        address _token,
        address _aggregatorV3Address
    ) external onlyOwner {
        require(
            !_paymentMethods.contains(_token),
            "Payment method already set"
        );
        _paymentMethods.add(_token);
        aggregatorV3Address[_token] = _aggregatorV3Address;
    }

    function removePaymentMethod(address _token) external onlyOwner {
        require(_paymentMethods.contains(_token), "Payment method not set");
        _paymentMethods.remove(_token);
        aggregatorV3Address[_token] = address(0);
    }

    /* ========== MUTATIVE FUNCTIONS ========== */
    function createToken(
        string memory tokenURI,
        address payable _c_Wallet,
        bool _isCustodianWallet,
        uint8 _royalty,
        bool _withPhysical,
        uint256 _sellpriceUSD,
        uint256 _reservePriceUSD,
        uint256 price
    ) external payable nonReentrant returns (uint) {
        require(
            _sellpriceUSD >= _reservePriceUSD,
            "Price must be >= reserve price"
        );

        uint256 newTokenId = NFT.mint(msg.sender, tokenURI);

        if (_withPhysical != true) {
            _reservePriceUSD = 0x0;
        }

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
    ) internal {
        require(price > 0, "Price must be at least 1 wei");
        require(msg.value == listingPrice, "Price must be = listing price");

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
            require(
                idToMarketItem[tokenId].sold == true,
                "Can not resell unsold item"
            );
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
            msg.value == listingPriceSecondary,
            "Price must be = Sec list price"
        );

        _listedTokenIds.add(tokenId);

        idToMarketItem[tokenId] = MarketItem(
            tokenId,
            payable(msg.sender),
            payable(c_Wallet),
            isCustodianWallet,
            royalty,
            false,
            sellpriceUSD,
            0,
            price,
            false,
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
            false,
            sellpriceUSD,
            0,
            price,
            false,
            false
        );
    }

    function createMarketSale(
        uint256 tokenId,
        address paymentToken
    ) external payable nonReentrant {
        require(
            _paymentMethods.contains(paymentToken),
            "Payment token not supported"
        );

        MarketItem memory item = idToMarketItem[tokenId];

        uint price2 = item.sellpriceUSD.getUsdToken(
            paymentToken,
            aggregatorV3Address[paymentToken]
        );
        if (paymentToken == address(0)) {
            require(msg.value == price2, "missing asking price");
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
                    uint sr_Token = sr_USD.getOrgUsdToken(
                        paymentToken,
                        aggregatorV3Address[paymentToken]
                    );
                    charityTokenTotal += (sr_Token * 80) / 100;
                }

                uint r_USD = item.reservePriceUSD;
                uint r_Token = r_USD.getOrgUsdToken(
                    paymentToken,
                    aggregatorV3Address[paymentToken]
                );
                creatorToken = ((r_USD * 65) / 100).getOrgUsdToken(
                    paymentToken,
                    aggregatorV3Address[paymentToken]
                );
                charityTokenTotal += (r_Token * 20) / 100;

                web3reTokenTotal = price2 - creatorToken - charityTokenTotal;
            } else {
                creatorToken = ((item.sellpriceUSD * 85) / 100).getOrgUsdToken(
                    paymentToken,
                    aggregatorV3Address[paymentToken]
                );
                charityTokenTotal = ((item.sellpriceUSD * 10) / 100)
                    .getOrgUsdToken(
                        paymentToken,
                        aggregatorV3Address[paymentToken]
                    );
                web3reTokenTotal = price2 - creatorToken - charityTokenTotal;
            }
            if (paymentToken == address(0)) {
                payable(_charity).transfer(charityTokenTotal);
                payable(item.c_Wallet).transfer(creatorToken);
                payable(_web3re).transfer(web3reTokenTotal);
            } else {
                IERC20(paymentToken).transfer(_charity, charityTokenTotal);
                IERC20(paymentToken).transfer(item.c_Wallet, creatorToken);
                IERC20(paymentToken).transfer(_web3re, web3reTokenTotal);
            }

            _itemsSold.increment();
        } else {
            if (item.isCustodianWallet == true) {
                if (item.royalty >= 2) {
                    creatorToken = ((item.sellpriceUSD * 2) / 100)
                        .getOrgUsdToken(
                            paymentToken,
                            aggregatorV3Address[paymentToken]
                        );
                }
            } else {
                creatorToken = ((item.sellpriceUSD * item.royalty) / 100)
                    .getOrgUsdToken(
                        paymentToken,
                        aggregatorV3Address[paymentToken]
                    );
            }

            sellerToken = ((item.sellpriceUSD * 80) / 100).getOrgUsdToken(
                paymentToken,
                aggregatorV3Address[paymentToken]
            );
            charityTokenTotal = ((item.sellpriceUSD * 10) / 100).getOrgUsdToken(
                    paymentToken,
                    aggregatorV3Address[paymentToken]
                );
            web3reTokenTotal =
                price2 -
                creatorToken -
                sellerToken -
                charityTokenTotal;
            if (paymentToken == address(0)) {
                payable(item.c_Wallet).transfer(creatorToken);
                payable(item.seller).transfer(sellerToken);
                payable(_charity).transfer(charityTokenTotal);
                payable(_web3re).transfer(web3reTokenTotal);
            } else {
                IERC20(paymentToken).transfer(item.c_Wallet, creatorToken);
                IERC20(paymentToken).transfer(item.seller, sellerToken);
                IERC20(paymentToken).transfer(_charity, charityTokenTotal);
                IERC20(paymentToken).transfer(_web3re, web3reTokenTotal);
            }

            _itemsSold.increment();
        }

        idToMarketItem[tokenId].sold = true;
        idToMarketItem[tokenId].seller = payable(address(0));

        idToMarketItem[tokenId].initialList = false;
        idToMarketItem[tokenId].reservePriceUSD = 0;

        NFT.transferFrom(address(this), msg.sender, tokenId);
    }

    function approveAddress(uint256 _tokenId) public onlyOwner {
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
    function getPaymentMethods() external view returns (address[] memory) {
        return _paymentMethods.values();
    }

    function getPaymentMethodDetail(
        address _token
    ) external view returns (bool, address) {
        bool isSupported = _paymentMethods.contains(_token);

        return (isSupported, aggregatorV3Address[_token]);
    }

    function getItemSold() external view returns (uint256) {
        return _itemsSold.current();
    }

    function getListingPrice() external view returns (uint256) {
        return listingPrice;
    }

    function getListingPriceSecondary() public view returns (uint256) {
        return listingPriceSecondary;
    }

    function getMarketItem(
        uint256 marketItemId
    ) external view returns (MarketItem memory) {
        return idToMarketItem[marketItemId];
    }

    function getUsdTokenPrice(
        uint256 tokenId,
        address paymentToken
    ) external view returns (uint) {
        uint priceR = idToMarketItem[tokenId].sellpriceUSD.getUsdToken(
            paymentToken,
            aggregatorV3Address[paymentToken]
        );
        return priceR;
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
