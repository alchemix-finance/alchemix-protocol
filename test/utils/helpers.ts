import {BigNumber, BigNumberish, ethers} from "ethers";
import * as moment from "moment";
require('dotenv').config()

export const AVALANCHE_NODE_URL = process.env.AVALANCHE_MAINNET_URL;
export const BLOCK_NUMBER = parseInt(process.env.MAINNET_BLOCK_NUMBER || '') || 9441313;

export const YAK_AAVE_DAI_E_ADDRESS = "0xA914FEb3C4B580fF6933CEa4f39988Cd10Aa2985";
export const DAI_E_TOKEN_ADDRESS = "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70";
export const YAK_USDT_E_ADDRESS = "0x07B0E11D80Ccf75CB390c9Be6c27f329c119095A";

export const ONE = BigNumber.from(1);
export const MAXIMUM_U32 = ONE.shl(31);
export const MAXIMUM_U256 = ONE.shl(255);
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const THRESHOLD = ethers.utils.parseEther("00001");

export const snapshot = async (
  provider: ethers.providers.JsonRpcProvider
): Promise<number> => {
  await provider.send("evm_snapshot", []);
  return await mine(provider);
};

export const revert = async (
  provider: ethers.providers.JsonRpcProvider,
  snapshotId: number
): Promise<any> => {
  return await provider.send("evm_revert", [snapshotId]);
};

export const increaseTime = async (
  provider: ethers.providers.JsonRpcProvider,
  seconds: number
): Promise<any> => {
  return provider.send("evm_increaseTime", [seconds]);
};

export const setNextBlockTime = async (
  provider: ethers.providers.JsonRpcProvider,
  time: moment.Moment
): Promise<any> => {
  return provider.send("evm_setNextBlockTimestamp", [time.unix()]);
};

export const mine = async (
  provider: ethers.providers.JsonRpcProvider
): Promise<any> => {
  return provider.send("evm_mine", []);
};

export const mineBlocks = async (
  provider: ethers.providers.JsonRpcProvider,
  numberBlocks: number
): Promise<any> => {
  for (let i = 0; i < numberBlocks; i++) {
    await provider.send("evm_mine", []);
  }
  return Promise.resolve();
};

export const feeOn = (
  value: BigNumberish,
  numerator: BigNumberish,
  resolution: BigNumberish
): BigNumber => {
  return ONE.mul(value).mul(numerator).div(resolution);
};

export const takeFee = (
  value: BigNumberish,
  numerator: BigNumberish,
  resolution: BigNumberish
): BigNumber => {
  return ONE.mul(value).sub(feeOn(value, numerator, resolution));
};

export const delay = ms => new Promise(res => setTimeout(res, ms));