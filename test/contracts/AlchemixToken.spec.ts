import chai from "chai";
import chaiSubset from "chai-subset";
import {solidity} from "ethereum-waffle";
import {ethers} from "hardhat";
import {BigNumber, BigNumberish, ContractFactory, Signer} from "ethers";

import {Alchemist} from "../../types/Alchemist";
import { StakingPools } from "../../types/StakingPools";
import { Erc20Mock } from "../../types/Erc20Mock";
import {AlchemixToken} from "../../types/AlchemixToken";

chai.use(solidity);
chai.use(chaiSubset);

const {expect} = chai;

let AlchemixTokenFactory: ContractFactory;

describe("AlchemixToken", () => {
  let deployer: Signer;
  let signers: Signer[];

  let token: AlchemixToken;

  before(async () => {
    AlchemixTokenFactory = await ethers.getContractFactory("AlchemixToken");
  });

  beforeEach(async () => {
    [deployer, ...signers] = await ethers.getSigners();
  });

  beforeEach(async () => {
    token = await AlchemixTokenFactory.deploy() as AlchemixToken;
  });

  it("grants the admin role to the deployer", async () => {
    expect(await token.hasRole(await token.ADMIN_ROLE(), await deployer.getAddress())).is.true;
  });

  it("grants the minter role to the deployer", async () => {
    expect(await token.hasRole(await token.MINTER_ROLE(), await deployer.getAddress())).is.true;
  });

  describe("mint", async () => {
    context("when unauthorized", async () => {
      let unauthorizedMinter: Signer;
      let recipient: Signer;

      beforeEach(async () => [unauthorizedMinter, recipient, ...signers] = signers);

      beforeEach(async () => token = token.connect(unauthorizedMinter));

      it("reverts", async () => {
        expect(token.mint(await recipient.getAddress(), 1))
          .revertedWith("AlchemixToken: only minter");
      });
    });

    context("when authorized", async () => {
      let minter: Signer;
      let recipient: Signer;
      let amount: BigNumberish = 1000;

      beforeEach(async () => [minter, recipient, ...signers] = signers);

      beforeEach(async () => await token.grantRole(await token.MINTER_ROLE(), await minter.getAddress()));

      beforeEach(async () => token = token.connect(minter));

      it("mints tokens", async () => {
        await token.mint(await recipient.getAddress(), amount);
        expect(await token.balanceOf(await recipient.getAddress())).equal(amount);
      });
    });
  });
});
