// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.12;

import {Math} from "@openzeppelin/contracts/math/Math.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";

import {FixedPointMath} from "../FixedPointMath.sol";
import {IDetailedERC20} from "../../interfaces/IDetailedERC20.sol";

library Round {
  using FixedPointMath for FixedPointMath.uq192x64;
  using Round for Data;
  using Round for List;
  using SafeMath for uint256;

  struct Data {
    uint256 availableBalance;
    uint256 commitEndTime;
    uint256 lockupDuration;
    uint256 totalDeposited;
  }

  struct List {
    Data[] elements;
  }

  /// @dev Gets if the round has been completed.
  ///
  /// @return if the current time is equal to or after the round's end time.
  function isCommitPhaseComplete(Data storage _self) internal view returns (bool) {
    return block.timestamp >= _self.commitEndTime;
  }

  /// @dev Gets the current amount of tokens to distribute per token staked.
  ///
  /// @return the distribute weight.
  function getDistributeWeight(Data storage _self) internal view returns (FixedPointMath.uq192x64 memory) {
    FixedPointMath.uq192x64 memory _weight = FixedPointMath.fromU256(_self.getDistributeBalance());
    return _weight.div(_self.totalDeposited);
  }

  /// @dev Gets the amount to distribute to stakers.
  ///
  /// @return the amount to distribute.
  function getDistributeBalance(Data storage _self) internal view returns (uint256) {
    return Math.min(_self.availableBalance, _self.totalDeposited);
  }

  /// @dev Gets the amount to distribute in the next round.
  ///
  /// @return the runoff amount.
  function getRunoffBalance(Data storage _self) internal view returns (uint256) {
    return _self.availableBalance.sub(_self.getDistributeBalance());
  }

  /// @dev Adds a round to the list.
  ///
  /// @param _element the element to add.
  function push(List storage _self, Data memory _element) internal {
    _self.elements.push(_element);
  }

  /// @dev Gets a element from the list.
  ///
  /// @param _index the index in the list.
  ///
  /// @return the element at the specified index.
  function get(List storage _self, uint256 _index) internal view returns (Data storage) {
    return _self.elements[_index];
  }

  /// @dev Gets the last element in the list.
  ///
  /// This function will revert if there are no elements in the list.
  ///
  /// @return the last element in the list.
  function last(List storage _self) internal view returns (Data storage) {
    return _self.elements[_self.lastIndex()];
  }

  /// @dev Gets the index of the last element in the list.
  ///
  /// This function will revert if there are no elements in the list.
  ///
  /// @return the index of the last element.
  function lastIndex(List storage _self) internal view returns (uint256) {
    uint256 _length = _self.length();
    return _length.sub(1, "Round.List: list is empty");
  }

  /// @dev Gets the number of elements in the list.
  ///
  /// @return the number of elements.
  function length(List storage _self) internal view returns (uint256) {
    return _self.elements.length;
  }
}