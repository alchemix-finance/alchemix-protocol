// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.12;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/math/Math.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";

import {FixedPointMath} from "../FixedPointMath.sol";
import {IDetailedERC20} from "../../interfaces/IDetailedERC20.sol";

library Vault {
  using FixedPointMath for FixedPointMath.uq192x64;
  using Vault for Data;
  using Vault for List;
  using SafeMath for uint256;

  struct Data {
    IERC20 token;
    address owner;
    uint256 lockedAmount;
    uint256 totalClaimed;
    uint256 startTime;
    uint256 endTime;
  }

  struct List {
    Data[] elements;
  }

  /// @dev Gets the duration of the vesting period.
  ///
  /// @return the duration of the vesting period in seconds.
  function getDuration(Data storage _self) internal view returns (uint256) {
    return _self.endTime.sub(_self.startTime);
  }

  /// @dev Gets the amount of tokens that have been released up to the current moment.
  ///
  /// @return the released amount of tokens.
  function getReleasedAmount(Data storage _self) internal view returns (uint256) {
    if (block.timestamp < _self.startTime) {
      return 0;
    }

    uint256 _lowerTime = block.timestamp;
    uint256 _upperTime = Math.min(block.timestamp, _self.endTime);
    uint256 _elapsedTime = _upperTime.sub(_lowerTime);

    uint256 _numerator = _self.lockedAmount.mul(_elapsedTime);
    uint256 _denominator = _self.getDuration();

    return _numerator.div(_denominator);
  }

  /// @dev Gets the amount of tokens that are available to be claimed from a vault.
  ///
  /// @return the available amount of tokens.
  function getAvailableAmount(Data storage _self) internal view returns (uint256) {
    uint256 _releasedAmount = _self.getReleasedAmount();
    return _releasedAmount.sub(_self.totalClaimed);
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
    return _length.sub(1, "Vault.List: list is empty");
  }

  /// @dev Gets the number of elements in the list.
  ///
  /// @return the number of elements.
  function length(List storage _self) internal view returns (uint256) {
    return _self.elements.length;
  }
}