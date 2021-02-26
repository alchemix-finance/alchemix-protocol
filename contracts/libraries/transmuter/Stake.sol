// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.6.12;

import {Math} from "@openzeppelin/contracts/math/Math.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";

import {FixedPointMath} from "../FixedPointMath.sol";
import {IDetailedERC20} from "../../interfaces/IDetailedERC20.sol";
import {Round} from "./Round.sol";

/// @title Stake
///
/// @dev A library which provides the Stake data struct and associated functions.
library Stake {
  using FixedPointMath for FixedPointMath.uq192x64;
  using Round for Round.Data;
  using SafeMath for uint256;
  using Stake for Stake.Data;

  struct Data {
    uint256 totalDeposited;
    uint256 totalWeightedTime;
    uint256 lastUpdateTime;
    bool claimed;
  }

  function update(Data storage _self) internal {
    _self.totalWeightedTime = _self.getUpdatedTotalWeightedTime();
    _self.lastUpdateTime = block.timestamp;
  }

  function getExchangedBalance(Data storage _self, Round.Data storage _round) internal view returns (uint256) {
    FixedPointMath.uq192x64 memory _distributeWeight = _round.getDistributeWeight();
    FixedPointMath.uq192x64 memory _exchangedBalance = _distributeWeight.mul(_self.totalDeposited);
    return _exchangedBalance.decode();
  }

  function getUnexchangedBalance(Data storage _self, Round.Data storage _round) internal view returns (uint256) {
    return _self.totalDeposited.sub(_self.getExchangedBalance(_round));
  }

  function getRemainingLockupTime(Data storage _self, Round.Data storage _round) internal view returns (uint256) {
    uint256 _requiredWeightedTime = _self.getRequiredTotalWeightedTime(_round);
    uint256 _totalWeightedTime = _self.getUpdatedTotalWeightedTime();

    if (_totalWeightedTime >= _requiredWeightedTime) {
      return 0;
    }

    uint256 _difference = _requiredWeightedTime.sub(_totalWeightedTime);
    uint256 _totalDeposited = _self.totalDeposited;

    if (_totalDeposited == 0) {
      return 0;
    }

    return _difference.div(_totalDeposited);
  }

  function getRequiredTotalWeightedTime(Data storage _self, Round.Data storage _round) internal view returns (uint256) {
    return _self.totalDeposited.mul(_round.lockupDuration);
  }

  function getUpdatedTotalWeightedTime(Data storage _self) internal view returns (uint256) {
    uint256 _elapsedTime = block.timestamp.sub(_self.lastUpdateTime);
    if (_elapsedTime == 0) {
      return _self.totalWeightedTime;
    }

    uint256 _weightedTime = _self.totalDeposited.mul(_elapsedTime);
    return _self.totalWeightedTime.add(_weightedTime);
  }

  function isUnlocked(Data storage _self, Round.Data storage _round) internal view returns (bool) {
    uint256 _requiredWeightedTime = _self.getRequiredTotalWeightedTime(_round);
    uint256 _totalWeightedTime = _self.getUpdatedTotalWeightedTime();

    return _totalWeightedTime >= _requiredWeightedTime;
  }
}