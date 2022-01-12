// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.12;

interface IBridgeToken {
  function name() external view returns (string memory);
  function symbol() external view returns (string memory);
  function decimals() external view returns (uint8);
  function totalSupply() external view returns (uint256);
  function balanceOf(address account) external view returns (uint256);

  function mint(address to, uint256 amount, address feeAddress, uint256 feeAmount, bytes32 originTxId) external;
  function approve(address spender, uint256 amount) external returns (bool);
  function transfer(address recipient, uint256 amount) external returns (bool);
}