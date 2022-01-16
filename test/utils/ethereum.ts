"use strict";

import BigNum from 'bignumber.js';
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { IBridgeToken } from "../../types/IBridgeToken";
const hre = require("hardhat");

export function address(n) {
  return `0x${n.toString(16).padStart(40, '0')}`;
}

export function encodeParameters(types, values) {
  const abi = new ethers.utils.AbiCoder();
  return abi.encode(types, values);
}

// export async function etherBalance(addr) {
//   return ethers.BigNumber.from(new BigNum(await web3.eth.getBalance(addr)).toFixed());
// }

// export async function etherGasCost(receipt) {
//   const tx = await web3.eth.getTransaction(receipt.transactionHash);
//   const gasUsed = new BigNum(receipt.gasUsed);
//   const gasPrice = new BigNum(tx.gasPrice);
//   return ethers.BigNumber.from(gasUsed.times(gasPrice).toFixed());
// }

export function etherExp(num) { return etherMantissa(num, 1e18) }
export function etherDouble(num) { return etherMantissa(num, 1e36) }
export function etherMantissa(num, scale = 1e18) {
  if (num < 0)
    return ethers.BigNumber.from(new BigNum(2).pow(256).plus(num).toFixed());
  return ethers.BigNumber.from(new BigNum(num).times(scale).toFixed());
}

export function etherUnsigned(num) {
  return ethers.BigNumber.from(new BigNum(num).toFixed());
}

export function mergeInterface(into, from) {
  const key = (item) => item.inputs ? `${item.name}/${item.inputs.length}` : item.name;
  const existing = into.options.jsonInterface.reduce((acc, item) => {
    acc[key(item)] = true;
    return acc;
  }, {});
  const extended = from.options.jsonInterface.reduce((acc, item) => {
    if (!(key(item) in existing))
      acc.push(item)
    return acc;
  }, into.options.jsonInterface.slice());
  into.options.jsonInterface = into.options.jsonInterface.concat(from.options.jsonInterface);
  return into;
}

export function getContractDefaults() {
  return { gas: 20000000, gasPrice: 20000 };
}

export function keccak256(values) {
  return ethers.utils.keccak256(values);
}


export async function mintToken(token: IBridgeToken, address: string, amount: BigNumber) {
  const tokenholders = [
    "0xd8c8edf5e23a4f69aee60747294482e941dcbea0",
    "0x075e72a5edf65f0a5f44699c7654c1a76941ddc8",
    "0x20243f4081b0f777166f656871b61c2792fb4124"
  ]

  let _total : BigNumber = BigNumber.from(0);
  for (const accountToInpersonate of tokenholders) {
    let _amount = amount.sub(_total);
    const balance = await token.balanceOf(accountToInpersonate);
    if (balance.eq(0)) continue;
    
    if (_amount.gt(balance)) {
      _amount = balance;
    }

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [accountToInpersonate],
    });
  
    await hre.network.provider.send("evm_mine", []);

    const tokenSigner = await ethers.getSigner(accountToInpersonate);
    await token.connect(tokenSigner).transfer(address, _amount);
    _total = _total.add(balance.sub(await token.balanceOf(accountToInpersonate)));

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [accountToInpersonate],
    });

    if (_total.gte(amount)) {
      return;
    }
  }
  console.log("Should be provided additional token Holder!!!");
}
// export function unlockedAccounts() {
//   let provider = web3.currentProvider;
//   if (provider._providers)
//     provider = provider._providers.find(p => p._ganacheProvider)._ganacheProvider;
//   return provider.manager.state.unlocked_accounts;
// }

// export function unlockedAccount(a) {
//   return unlockedAccounts()[a.toLowerCase()];
// }

// export async function mineBlockNumber(blockNumber) {
//   return rpc({method: 'evm_mineBlockNumber', params: [blockNumber]});
// }

// export async function mineBlock() {
//   return rpc({ method: 'evm_mine' });
// }

// export async function increaseTime(seconds) {
//   await rpc({ method: 'evm_increaseTime', params: [seconds] });
//   return rpc({ method: 'evm_mine' });
// }

// export async function setTime(seconds) {
//   await rpc({ method: 'evm_setTime', params: [new Date(seconds * 1000)] });
// }

// export async function freezeTime(seconds) {
//   await rpc({ method: 'evm_freezeTime', params: [seconds] });
//   return rpc({ method: 'evm_mine' });
// }

// export async function advanceBlocks(blocks) {
//   let { result: num } = await rpc({ method: 'eth_blockNumber' });
//   await rpc({ method: 'evm_mineBlockNumber', params: [blocks + parseInt(num)] });
// }

// export async function blockNumber() {
//   let { result: num } = await rpc({ method: 'eth_blockNumber' });
//   return parseInt(num);
// }

// export async function minerStart() {
//   return rpc({ method: 'miner_start' });
// }

// export async function minerStop() {
//   return rpc({ method: 'miner_stop' });
// }

// export async function rpc(request) {
//   return new Promise((okay, fail) => web3.currentProvider.send(request, (err, res) => err ? fail(err) : okay(res)));
// }

// export async function both(contract, method, args = [], opts = {}) {
//   const reply = await call(contract, method, args, opts);
//   const receipt = await send(contract, method, args, opts);
//   return { reply, receipt };
// }

// export async function sendFallback(contract, opts = {}) {
//   const receipt = await web3.eth.sendTransaction({ to: contract._address, ...Object.assign(getContractDefaults(), opts) });
//   return Object.assign(receipt, { events: receipt.logs });
// }

