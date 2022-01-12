pragma solidity ^0.6.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IYakStrategy is IERC20 {
    
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint);
    function balanceOf(address owner) external view override returns (uint);
    function totalSupply() external view override returns (uint);


    function depositToken() external view returns (address);
    function rewardToken() external view returns (address);

    function getDepositTokensForShares(uint amount) external view returns (uint);
    function getSharesForDepositTokens(uint amount) external view returns (uint);
    
    function totalDeposits() external view returns (uint);
    function deposit(uint256 amount) external returns (uint);
    function depositFor(address account, uint256 amount) external returns (uint);
    function withdraw(uint256 amount) external returns (uint);
    function estimateReinvestReward() external view returns (uint);
    function checkReward() external view returns (uint256);
    function estimateDeployedBalance() external view returns (uint);

}