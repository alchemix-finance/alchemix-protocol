// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "hardhat/console.sol";

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";

import {FixedPointMath} from "../libraries/FixedPointMath.sol";
import {IDetailedERC20} from "../interfaces/IDetailedERC20.sol";
import {IVaultAdapter} from "../interfaces/IVaultAdapter.sol";
import {IYakStrategy} from "../interfaces/IYakStrategy.sol";

/// @title YakStrategyAdapter
///
/// @dev A vault adapter implementation which wraps a Yak Strategy.
contract YakStrategyAdapter is IVaultAdapter {
    using FixedPointMath for FixedPointMath.FixedDecimal;
    using SafeERC20 for IDetailedERC20;
    using SafeERC20 for IYakStrategy;
    using SafeMath for uint256;

    /// @dev The vault that the adapter is wrapping.
    IYakStrategy public vault;

    /// @dev The address which has admin control over this contract.
    address public admin;

    /// @dev The decimals of the token.
    uint256 public decimals;

    constructor(IYakStrategy _vault, address _admin) public {
        vault = _vault;
        admin = _admin;
        updateApproval();
        decimals = _vault.decimals();
    }

    /// @dev A modifier which reverts if the caller is not the admin.
    modifier onlyAdmin() {
        require(admin == msg.sender, "YakStrategyAdapter: only admin");
        _;
    }

    /// @dev Gets the token that the vault accepts.
    ///
    /// @return the accepted token.
    function token() external view override returns (IDetailedERC20) {
        return IDetailedERC20(vault.depositToken());
    }

    /// @dev Gets the total value of the assets that the adapter holds in the vault.
    ///
    /// @return the total assets.
    function totalValue() external view override returns (uint256) {
        return vault.getDepositTokensForShares(vault.balanceOf(address(this)));
    }

    /// @dev Deposits tokens into the vault.
    ///
    /// @param _amount the amount of tokens to deposit into the vault.
    function deposit(uint256 _amount) external override {
        vault.deposit(_amount);
    }

    /// @dev Withdraws tokens from the vault to the recipient.
    ///
    /// This function reverts if the caller is not the admin.
    ///
    /// @param _recipient the account to withdraw the tokes to.
    /// @param _amount    the amount of tokens to withdraw.
    function withdraw(address _recipient, uint256 _amount)
        external
        override
        onlyAdmin
    {
        vault.withdraw(_amount);
        address _token = vault.depositToken();
        uint256 _depositTokenAmount = vault.getDepositTokensForShares(_amount);
        IDetailedERC20(_token).safeTransfer(_recipient, _depositTokenAmount);
    }

    /// @dev Sends vault tokens to the recipient
    ///
    /// This function reverts if the caller is not the admin.
    ///
    /// @param _recipient the account to send the tokens to.
    /// @param _amount    the amount of tokens to send.
    function indirectWithdraw(address _recipient, uint256 _amount)
        external
        onlyAdmin
    {
        uint256 _mintedAmount = vault.getSharesForDepositTokens(_amount);
        vault.safeTransfer(_recipient, _mintedAmount);
    }

    /// @dev Updates the vaults approval of the token to be the maximum value.
    function updateApproval() public {
        address _token = vault.depositToken();
        IDetailedERC20(_token).safeApprove(address(vault), uint256(-1));
    }
}
