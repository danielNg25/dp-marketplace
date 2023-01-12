// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol";

interface IDPNFT is IERC721, IERC721Enumerable {
    enum Type {
        Basic,
        HasPhysical,
        Series,
        Fragment
    }

    function creators(uint256 tokenId) external view returns (address);

    function tokenVaultLogic() external view returns (address);

    function administrators(address account) external view returns (bool);

    function adminApproved(uint256 tokenId) external view returns (address);

    function administratorApprove(uint256 tokenId) external;

    function tokenType(uint256 tokenId) external view returns (Type);

    function mint(
        address receiver,
        string memory uri,
        address creator,
        Type typeOfToken
    ) external returns (uint256);

    function mintSeriesToken(
        address receiver,
        string memory uri,
        address creator,
        uint256 seriesId,
        address caller
    ) external returns (uint256);

    function mintBatch(
        address[] memory receivers,
        string[] memory uris,
        address[] memory creatorList,
        Type[] memory tokenTypes
    ) external returns (uint256[] memory);

    function mintBatchSeries(
        address[] memory receivers,
        string[] memory uris,
        address[] memory creatorList,
        uint256[] memory seriesIds,
        address caller
    ) external returns (uint256[] memory);

    function setURIPrefix(string memory baseUri) external;

    function setAdministratorStatus(address account, bool status) external;

    function baseURI() external view returns (string memory);

    function tokensOfOwner(
        address owner
    ) external view returns (uint256[] memory);

    function series(uint256 seriesId) external view returns (uint256[] memory);

    function seriesLength(uint256 seriesId) external view returns (uint256);

    function totalSeries() external view returns (uint256);

    function ownerOfSeries(uint256 seriesId) external view returns (address);

    function tokenIdToSeries(uint256 tokenId) external view returns (uint256);

    function vaults(uint256 tokenId) external view returns (address);
}
