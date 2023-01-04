// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "./DPNFTVault.sol";
import "./InitializedProxy.sol";
import "./interface/IDPNFT.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract DPNFT is
    ERC721,
    ERC721URIStorage,
    ERC721Enumerable,
    ERC721Burnable,
    Ownable,
    IDPNFT
{
    using EnumerableSet for EnumerableSet.UintSet;
    // Base URI
    string private _baseUri;
    address public immutable tokenVaultLogic;
    mapping(address => bool) public administrators;
    mapping(uint256 => address) public adminApproved;
    mapping(uint256 => Type) private _tokenTypes;

    uint256 public totalSeries;
    mapping(uint256 => address) public ownerOfSeries;
    mapping(uint256 => EnumerableSet.UintSet) private _series;
    mapping(uint256 => uint256) public tokenIdToSeries;

    mapping(uint256 => address) public vaults;

    constructor() ERC721("GoyaCoin", "GOYA") {
        tokenVaultLogic = address(new DPNFTVault());
    }

    modifier onlyAdministrator() {
        require(administrators[_msgSender()], "DPNFT: Not administrator");
        _;
    }

    event AdministratorSet(
        address account,
        bool indexed oldStatus,
        bool indexed newStatus
    );

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, tokenId);
        adminApproved[tokenId] = address(0);
    }

    function _setTokenType(uint256 _tokenId, Type _type) internal {
        _tokenTypes[_tokenId] = _type;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseUri;
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function tokenType(uint256 tokenId) public view returns (Type) {
        return _tokenTypes[tokenId];
    }

    function series(uint256 seriesId) public view returns (uint256[] memory) {
        return _series[seriesId].values();
    }

    function seriesLength(uint256 seriesId) public view returns (uint256) {
        return _series[seriesId].length();
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721Enumerable, IERC165) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _setBaseURI(string memory baseUri) internal {
        _baseUri = baseUri;
    }

    function baseURI() external view returns (string memory) {
        return _baseURI();
    }

    function setURIPrefix(string memory baseUri) public onlyOwner {
        _setBaseURI(baseUri);
    }

    /**
     * @dev Function to approve with administrator
     * @param tokenId to be approved
     */
    function administratorApprove(uint256 tokenId) external onlyAdministrator {
        adminApproved[tokenId] = _msgSender();
        _approve(_msgSender(), tokenId);
    }

    function _mintToken(
        uint256 tokenId,
        address receiver,
        string memory uri,
        Type typeOfToken
    ) internal {
        _safeMint(receiver, tokenId);
        _setTokenType(tokenId, typeOfToken);
        _setTokenURI(tokenId, uri);
        _setApprovalForAll(receiver, msg.sender, true);
    }

    /**
     * @dev Function to safely mint tokens that is not series token.
     * @param receiver The address that will receive the minted token.
     * @param uri The uri to mint.
     * @return tokenId of new nft
     */
    function mint(
        address receiver,
        string memory uri,
        Type typeOfToken
    ) public onlyAdministrator returns (uint256) {
        uint256 tokenId = totalSupply() + 1;

        require(
            typeOfToken != Type.Series,
            "DPNFT: use mintSeriesToken instead"
        );

        if (typeOfToken == Type.Fragment) {
            bytes memory _initializationCalldata =
                abi.encodeWithSignature(
                    "initialize(address,uint256,string,string)",
                    address(this),
                    tokenId,
                    name(),
                    symbol()
                );
            address vault = address(new InitializedProxy(tokenVaultLogic, _initializationCalldata));
            vaults[tokenId] = vault;
        }

        _mintToken(tokenId, receiver, uri, typeOfToken);

        return tokenId;
    }

    /**
     * @dev Function to safely mint tokens that is series token.
     * @param receiver The address that will receive the minted token.
     * @param uri The uri to mint.
     * @return tokenId of new nft
     *
     * @notice caller of this function have to safely check whether sender is owner of the series
     */
    function mintSeriesToken(
        address receiver,
        string memory uri,
        uint256 seriesId,
        address caller
    ) public onlyAdministrator returns (uint256) {
        uint256 tokenId = totalSupply() + 1;

        require(seriesId <= totalSeries, "DPNFT: Invalid series id");
        
        if (seriesId == 0) {
            seriesId = ++totalSeries;
            ownerOfSeries[seriesId] = caller;
        } else {
            require(ownerOfSeries[seriesId] == caller, "DPNFT: Only series owner");
        }

        _series[seriesId].add(tokenId);
        tokenIdToSeries[tokenId] = seriesId;
        

        _mintToken(tokenId, receiver, uri, Type.Series);

        return tokenId;
    }

    /**
     * @dev Function to safely mint batch tokens that is not series token.
     * @param receivers The address that will receive the minted token.
     * @param uris The uri to mint.
     * @return tokenId of new nft
     */
    function mintBatch(
        address[] memory receivers,
        string[] memory uris,
        Type[] memory tokenTypes
    ) public onlyAdministrator returns (uint256[] memory) {
        uint256 length = receivers.length;

        require(
            length > 0 && length == uris.length && length == tokenTypes.length,
            "DPNFT: Invalid input length"
        );

        uint256[] memory returnIds = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            uint256 tokenId = mint(receivers[i], uris[i], tokenTypes[i]);
            returnIds[i] = tokenId;
        }
        return returnIds;
    }

    /**
     * @dev Function to safely mint batch tokens that is series token.
     * @param receivers The address that will receive the minted token.
     * @param uris The uri to mint.
     * @return tokenId of new nft
     * 
     * @notice caller of this function have to safely check whether sender is owner of the series
     */
    function mintBatchSeriesToken(
        address[] memory receivers,
        string[] memory uris,
        uint256[] memory seriesIds,
        address caller
    ) public onlyAdministrator returns (uint256[] memory) {
        uint256 length = receivers.length;

        require(
            length > 0 && length == uris.length && length == seriesIds.length,
            "DPNFT: Invalid input length"
        );

        uint256[] memory returnIds = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            uint256 tokenId = mintSeriesToken(receivers[i], uris[i], seriesIds[i], caller);
            returnIds[i] = tokenId;
        }
        return returnIds;
    }

    /**
     * @dev Burns a specific ERC721 token.
     * @param tokenId uint256 id of the ERC721 token to be burned.
     */
    function _burn(
        uint256 tokenId
    ) internal override(ERC721, ERC721URIStorage) {
        //solhint-disable-next-line max-line-length
        require(
            _isApprovedOrOwner(_msgSender(), tokenId),
            "DPNFT: Caller is not owner nor approved"
        );
        super._burn(tokenId);
    }

    /**
     * @dev Gets the list of token IDs of the requested owner.
     * @param owner address owning the tokens
     * @return uint256[] List of token IDs owned by the requested address
     */
    function tokensOfOwner(
        address owner
    ) public view returns (uint256[] memory) {
        uint256 balance = balanceOf(owner);
        uint256[] memory tokens = new uint256[](balance);
        for (uint256 i = 0; i < balance; i++) {
            tokens[i] = tokenOfOwnerByIndex(owner, i);
        }

        return tokens;
    }

    function setAdministratorStatus(
        address account,
        bool status
    ) external onlyOwner {
        bool oldStatus = administrators[account];
        require(oldStatus != status, "DPNFT: Status set");
        administrators[account] = status;
        emit AdministratorSet(account, oldStatus, status);
    }
}
