// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";

contract DPNFTVault is ERC20Upgradeable, ERC721HolderUpgradeable {
    /// @notice the ERC721 token address of the vault's token
    IERC721 public token;

    /// @notice the ERC721 token ID of the vault's token
    uint256 public id;

    event TokenDeposited(address receiver, uint256 supply);
    event TokenRedeemed(address receiver);

    function initialize(
        address _token,
        uint256 _id,
        string memory _name,
        string memory _symbol
    ) external initializer {
        // initialize inherited contracts
        __ERC20_init(_name, _symbol);
        __ERC721Holder_init();
        // set storage variables
        token = IERC721(_token);
        id = _id;
    }

    function mint(address receiver, uint256 supply) external {
        token.safeTransferFrom(msg.sender, address(this), id);

        _mint(receiver, supply);

        emit TokenDeposited(receiver, supply);
    }

    function redeem() external {
        _burn(msg.sender, totalSupply());

        token.transferFrom(address(this), msg.sender, id);

        emit TokenRedeemed(msg.sender);
    }
}
