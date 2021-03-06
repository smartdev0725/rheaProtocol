// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.11;


import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";


interface IRheaGeToken is IERC20Upgradeable, IERC20MetadataUpgradeable {
    event RheaGeTokensMinted(
        address indexed to,
        uint256 amount
    );

    event RheaGeTokensBurned(
        address indexed from,
        uint256 amount
    );

    function init(
        address _roleManager
    ) external;

    function mint(address to, uint256 amount) external;

    function burn(address account, uint256 amount) external;
}
