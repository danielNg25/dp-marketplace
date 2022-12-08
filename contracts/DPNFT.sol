// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract DPNFT is
    ERC721,
    ERC721URIStorage,
    ERC721Enumerable,
    ERC721Burnable,
    Ownable
{
    // Base URI
    string private _baseUri;

    mapping(address => bool) public administrators;

    constructor() ERC721("GoyaCoin", "GOYA") {}

    modifier onlyAdministrator() {
        require(administrators[_msgSender()], "Not administrator");
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
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseUri;
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721Enumerable) returns (bool) {
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
        _approve(_msgSender(), tokenId);
    }

    /**
     * @dev Function to safely mint tokens.
     * @param receiver The address that will receive the minted token.
     * @param uri The uri to mint.
     * @return tokenId of new nft
     */
    function mint(
        address receiver,
        string memory uri
    ) public onlyAdministrator returns (uint256) {
        uint256 tokenId = totalSupply() + 1;
        _safeMint(receiver, tokenId);
        _setTokenURI(tokenId, uri);
        _setApprovalForAll(receiver, msg.sender, true);
        return tokenId;
    }

    /**
     * @dev Function to safely mint batch tokens.
     * @param receivers The address that will receive the minted token.
     * @param uris The uri to mint.
     * @return tokenId of new nft
     */
    function mintBatch(
        address[] memory receivers,
        string[] memory uris
    ) public onlyAdministrator returns (uint256[] memory) {
        uint256 length = receivers.length;

        require(
            length > 0 && receivers.length == uris.length,
            "Invalid input length"
        );

        uint256[] memory returnIds = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            uint256 tokenId = mint(receivers[i], uris[i]);
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
            "caller is not owner nor approved"
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
        require(oldStatus != status, "Status set");
        administrators[account] = status;
        emit AdministratorSet(account, oldStatus, status);
    }
}
