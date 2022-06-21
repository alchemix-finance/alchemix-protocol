import chai from "chai";
import chaiSubset from "chai-subset";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import { ContractFactory, Signer, BigNumber, utils } from "ethers";
import { AlToken } from "../../types/AlToken";
import { Alchemist } from "../../types/Alchemist";
import { VaultAdapterMockWithIndirection } from "../../types/VaultAdapterMockWithIndirection";

import { Erc20Mock } from "../../types/Erc20Mock";
import { getAddress, parseEther, formatEther } from "ethers/lib/utils";
import { MAXIMUM_U256, ZERO_ADDRESS, mineBlocks } from "../utils/helpers";
import { TransmuterB } from "../../types/TransmuterB";
import { waitForTxConfirmation } from "../../utils/txUtils";
import { SSL_OP_EPHEMERAL_RSA } from "constants";
import { Transmuter } from "../../types/Transmuter";

chai.use(solidity);
chai.use(chaiSubset);

const { expect } = chai;

let AlchemistFactory: ContractFactory;
let TransmuterBFactory: ContractFactory;
let ERC20MockFactory: ContractFactory;
let AlUSDFactory: ContractFactory;
let VaultAdapterMockFactory: ContractFactory;

describe("TransmuterB", () => {
  let deployer: Signer;
  let depositor: Signer;
  let signers: Signer[];
  let alchemist: Alchemist;
  let governance: Signer;
  let minter: Signer;
  let rewards: Signer;
  let sentinel: Signer;
  let user: Signer;
  let mockAlchemist: Signer;
  let token: Erc20Mock;
  let transmuter: TransmuterB;
  let adapter: VaultAdapterMockWithIndirection;
  let transVaultAdaptor: VaultAdapterMockWithIndirection;
  let alUsd: AlToken;
  let harvestFee = 1000;
  let ceilingAmt = utils.parseEther("10000000");
  let collateralizationLimit = "2000000000000000000";
  let mintAmount = 5000;
  let mockAlchemistAddress: string;
  let preTestTotalAlUSDSupply: BigNumber;
  let keeprs;
  let keeprStates;

  before(async () => {
    TransmuterBFactory = await ethers.getContractFactory("TransmuterB");
    ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    AlUSDFactory = await ethers.getContractFactory("AlToken");
    AlchemistFactory = await ethers.getContractFactory("Alchemist");
    VaultAdapterMockFactory = await ethers.getContractFactory(
      "VaultAdapterMockWithIndirection"
    );
  });

  beforeEach(async () => {
    signers = await ethers.getSigners();
  });

  beforeEach(async () => {
    [
      deployer,
      rewards,
      depositor,
      sentinel,
      minter,
      governance,
      mockAlchemist,
      user,
      ...signers
    ] = await ethers.getSigners();

    keeprs = [await deployer.getAddress()];
    keeprStates = [true]

    token = (await ERC20MockFactory.connect(deployer).deploy(
      "Mock DAI",
      "DAI",
      18
    )) as Erc20Mock;

    alUsd = (await AlUSDFactory.connect(deployer).deploy()) as AlToken;

    mockAlchemistAddress = await mockAlchemist.getAddress();

    alchemist = (await AlchemistFactory.connect(deployer).deploy(
      token.address,
      alUsd.address,
      await governance.getAddress(),
      await sentinel.getAddress()
    )) as Alchemist;
    transmuter = (await TransmuterBFactory.connect(deployer).deploy(
      alUsd.address,
      token.address,
      await governance.getAddress()
    )) as TransmuterB;
    transVaultAdaptor = (await VaultAdapterMockFactory.connect(deployer).deploy(
        token.address
      )) as VaultAdapterMockWithIndirection;
    await transmuter.connect(governance).setKeepers(keeprs, keeprStates);
    await transmuter.connect(governance).setRewards(await rewards.getAddress())
    await transmuter.connect(governance).initialize(transVaultAdaptor.address);
    await transmuter.connect(governance).setTransmutationPeriod(40320);
    await transmuter.connect(governance).setSentinel(await sentinel.getAddress());
    await alchemist.connect(governance).setTransmuter(transmuter.address);
    await alchemist.connect(governance).setRewards(await rewards.getAddress());
    await alchemist.connect(governance).setHarvestFee(harvestFee);
    await transmuter.connect(governance).setWhitelist(mockAlchemistAddress, true);

    adapter = (await VaultAdapterMockFactory.connect(deployer).deploy(
      token.address
    )) as VaultAdapterMockWithIndirection;
    await alchemist.connect(governance).initialize(adapter.address);
    await alchemist
      .connect(governance)
      .setCollateralizationLimit(collateralizationLimit);
    await alUsd.connect(deployer).setWhitelist(alchemist.address, true);
    await alUsd.connect(deployer).setCeiling(alchemist.address, ceilingAmt);
    await token.mint(mockAlchemistAddress, utils.parseEther("10000"));
    await token.connect(mockAlchemist).approve(transmuter.address, MAXIMUM_U256);

    await token.mint(await depositor.getAddress(), utils.parseEther("20000"));
    await token.mint(await minter.getAddress(), utils.parseEther("20000"));
    await token.connect(depositor).approve(transmuter.address, MAXIMUM_U256);
    await alUsd.connect(depositor).approve(transmuter.address, MAXIMUM_U256);
    await token.connect(depositor).approve(alchemist.address, MAXIMUM_U256);
    await alUsd.connect(depositor).approve(alchemist.address, MAXIMUM_U256);
    await token.connect(minter).approve(transmuter.address, MAXIMUM_U256);
    await alUsd.connect(minter).approve(transmuter.address, MAXIMUM_U256);
    await token.connect(minter).approve(alchemist.address, MAXIMUM_U256);
    await alUsd.connect(minter).approve(alchemist.address, MAXIMUM_U256);

    await alchemist.connect(depositor).deposit(utils.parseEther("10000"));
    await alchemist.connect(depositor).mint(utils.parseEther("5000"));

    await alchemist.connect(minter).deposit(utils.parseEther("10000"));
    await alchemist.connect(minter).mint(utils.parseEther("5000"));

    transmuter = transmuter.connect(depositor)

    preTestTotalAlUSDSupply = await alUsd.totalSupply();
  });

  describe("stake()", () => {

    it("stakes 1000 alUsd and reads the correct amount", async () => {
      await transmuter.stake(1000);
      expect(
        await transmuter.depositedAlTokens(await depositor.getAddress())
      ).equal(1000);
    });

    it("stakes 1000 alUsd two times and reads the correct amount", async () => {
      await transmuter.stake(1000);
      await transmuter.stake(1000);
      expect(
        await transmuter.depositedAlTokens(await depositor.getAddress())
      ).equal(2000);
    });

  });

  describe("unstake()", () => {

    it("reverts on depositing and then unstaking balance greater than deposit", async () => {
      await transmuter.stake(utils.parseEther("1000"));
      expect(transmuter.unstake(utils.parseEther("2000"))).revertedWith(
        "Transmuter: unstake amount exceeds deposited amount"
      );
    });

    it("deposits and unstakes 1000 alUSD", async () => {
      await transmuter.stake(utils.parseEther("1000"));
      await transmuter.unstake(utils.parseEther("1000"));
      expect(
        await transmuter.depositedAlTokens(await depositor.getAddress())
      ).equal(0);
    });

    it("deposits 1000 alUSD and unstaked 500 alUSd", async () => {
      await transmuter.stake(utils.parseEther("1000"));
      await transmuter.unstake(utils.parseEther("500"));
      expect(
        await transmuter.depositedAlTokens(await depositor.getAddress())
      ).equal(utils.parseEther("500"));
    });

  });

  describe("distributes correct amount", () => {
    let distributeAmt = utils.parseEther("1000");
    let stakeAmt = utils.parseEther("1000");
    let transmutationPeriod = 20;

    beforeEach(async () => {
      await transmuter.connect(governance).setTransmutationPeriod(transmutationPeriod);
      await token.mint(await minter.getAddress(), utils.parseEther("20000"));
      await token.connect(minter).approve(transmuter.address, MAXIMUM_U256);
      await alUsd.connect(minter).approve(transmuter.address, MAXIMUM_U256);
      await token.connect(minter).approve(alchemist.address, MAXIMUM_U256);
      await alUsd.connect(minter).approve(alchemist.address, MAXIMUM_U256);
      await alchemist.connect(minter).deposit(utils.parseEther("10000"));
      await alchemist.connect(minter).mint(utils.parseEther("5000"));
      await token.mint(await rewards.getAddress(), utils.parseEther("20000"));
      await token.connect(rewards).approve(transmuter.address, MAXIMUM_U256);
      await alUsd.connect(rewards).approve(transmuter.address, MAXIMUM_U256);
      await token.connect(rewards).approve(alchemist.address, MAXIMUM_U256);
      await alUsd.connect(rewards).approve(alchemist.address, MAXIMUM_U256);
      await alchemist.connect(rewards).deposit(utils.parseEther("10000"));
      await alchemist.connect(rewards).mint(utils.parseEther("5000"));
    });

    it("deposits 100000 alUSD, distributes 1000 DAI, and the correct amount of tokens are distributed to depositor", async () => {
      let numBlocks = 5;
      await transmuter.connect(depositor).stake(stakeAmt);
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
      await mineBlocks(ethers.provider, numBlocks);
      let userInfo = await transmuter.userInfo(await depositor.getAddress());
      // pendingdivs should be (distributeAmt * (numBlocks / transmutationPeriod))
      expect(userInfo.pendingdivs).equal(distributeAmt.div(4));
    });

    it("two people deposit equal amounts and recieve equal amounts in distribution", async () => {
      await transmuter.connect(depositor).stake(utils.parseEther("1000"));
      await transmuter.connect(minter).stake(utils.parseEther("1000"));
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
      await mineBlocks(ethers.provider, 10);
      let userInfo1 = await transmuter.userInfo(await depositor.getAddress());
      let userInfo2 = await transmuter.userInfo(await minter.getAddress());
      expect(userInfo1.pendingdivs).gt(0);
      expect(userInfo1.pendingdivs).equal(userInfo2.pendingdivs);
    });

    it("deposits of 500, 250, and 250 from three people and distribution is correct", async () => {
      await transmuter.connect(depositor).stake(utils.parseEther("500"));
      await transmuter.connect(minter).stake(utils.parseEther("250"));
      await transmuter.connect(rewards).stake(utils.parseEther("250"));
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
      await mineBlocks(ethers.provider, 10);
      let userInfo1 = await transmuter.userInfo(await depositor.getAddress());
      let userInfo2 = await transmuter.userInfo(await minter.getAddress());
      let userInfo3 = await transmuter.userInfo(await rewards.getAddress());
      let user2: BigNumber = userInfo2.pendingdivs;
      let user3: BigNumber = userInfo3.pendingdivs;
      let sumOfTwoUsers = user2.add(user3);
      expect(userInfo1.pendingdivs).gt(0);
      expect(sumOfTwoUsers).equal(userInfo1.pendingdivs);
    });

  });

  describe("transmute() claim() transmuteAndClaim()", () => {
    let distributeAmt = utils.parseEther("500");
    let transmutedAmt = BigNumber.from("12400793650793600");

    it("transmutes the correct amount", async () => {
      await transmuter.stake(utils.parseEther("1000"));
      await mineBlocks(ethers.provider, 10);
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
      await transmuter.transmute();
      let userInfo = await transmuter.userInfo(await depositor.getAddress());
      expect(userInfo.realised).equal(transmutedAmt);
    });

    it("burns the supply of alUSD on transmute()", async () => {
      await transmuter.stake(utils.parseEther("1000"));
      await mineBlocks(ethers.provider, 10);
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
      await transmuter.transmute();
      let alUSDTokenSupply = await alUsd.totalSupply();
      expect(alUSDTokenSupply).equal(preTestTotalAlUSDSupply.sub(transmutedAmt));
    });

    it("moves DAI from pendingdivs to inbucket upon staking more", async () => {
      await transmuter.stake(utils.parseEther("1000"));
      await mineBlocks(ethers.provider, 10);
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
      await transmuter.stake(utils.parseEther("100"));
      let userInfo = await transmuter.userInfo(await depositor.getAddress());
      expect(userInfo.inbucket).equal(transmutedAmt);
    });

    it("transmutes and claims using transmute() and then claim()", async () => {
      await transmuter.stake(utils.parseEther("1000"));
      await mineBlocks(ethers.provider, 10);
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
      let tokenBalanceBefore = await token.connect(depositor).balanceOf(await depositor.getAddress());
      await transmuter.transmute();
      await transmuter.claim();
      let tokenBalanceAfter = await token.connect(depositor).balanceOf(await depositor.getAddress());
      expect(tokenBalanceAfter).equal(tokenBalanceBefore.add(transmutedAmt));
    });

    it("transmutes and claims using transmuteAndClaim()", async () => {
      await transmuter.stake(utils.parseEther("1000"));
      await mineBlocks(ethers.provider, 10);
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
      let tokenBalanceBefore = await token.connect(depositor).balanceOf(await depositor.getAddress());
      await transmuter.transmuteAndClaim();
      let tokenBalanceAfter = await token.connect(depositor).balanceOf(await depositor.getAddress());
      expect(tokenBalanceAfter).equal(tokenBalanceBefore.add(transmutedAmt));
    });

    it("transmutes the full buffer if a complete phase has passed", async () => {
      await transmuter.stake(utils.parseEther("1000"));
      await transmuter.connect(governance).setTransmutationPeriod(10);
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
      await mineBlocks(ethers.provider, 11);
      let tokenBalanceBefore = await token.connect(depositor).balanceOf(await depositor.getAddress());
      await transmuter.connect(depositor).transmuteAndClaim();
      let tokenBalanceAfter = await token.connect(depositor).balanceOf(await depositor.getAddress());
      expect(tokenBalanceAfter).equal(tokenBalanceBefore.add(distributeAmt));
    });

    it("transmutes the staked amount and distributes overflow if a bucket overflows", async () => {
      // 1) DEPOSITOR stakes 100 dai
      // 2) distribution of 90 dai, let transmutation period pass
      // DEPOSITOR gets 90 dai
      // 3) MINTER stakes 200 dai
      // 4) distribution of 60 dai, let transmutation period pass
      // DEPOSITOR gets 20 dai, MINTER gets 40 dai
      // 5) USER stakes 200 dai (to distribute allocations)
      // 6) transmute DEPOSITOR, bucket overflows by 10 dai
      // MINTER gets 5 dai, USER gets 5 dai
      let distributeAmt0 = utils.parseEther("90")
      let distributeAmt1 = utils.parseEther("60")
      let depStakeAmt0 = utils.parseEther("100")
      let depStakeAmt1 = utils.parseEther("200")
      await transmuter.connect(governance).setTransmutationPeriod(10);
      await token.connect(minter).approve(transmuter.address, MAXIMUM_U256);
      await alUsd.connect(minter).approve(transmuter.address, MAXIMUM_U256);
      await alUsd.connect(user).approve(transmuter.address, MAXIMUM_U256);
      await token.connect(minter).approve(alchemist.address, MAXIMUM_U256);
      await token.connect(user).approve(alchemist.address, MAXIMUM_U256);
      await alUsd.connect(minter).approve(alchemist.address, MAXIMUM_U256);
      await alUsd.connect(user).approve(alchemist.address, MAXIMUM_U256);
      await token.mint(await minter.getAddress(), utils.parseEther("20000"));
      await alchemist.connect(minter).deposit(utils.parseEther("10000"));
      await alchemist.connect(minter).mint(utils.parseEther("5000"));
      await token.mint(await user.getAddress(), utils.parseEther("20000"));
      await alchemist.connect(user).deposit(utils.parseEther("10000"));
      await alchemist.connect(user).mint(utils.parseEther("5000"));

      // user 1 deposit
      await transmuter.connect(depositor).stake(depStakeAmt0);
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt0);
      await mineBlocks(ethers.provider, 10);

      // user 2 deposit
      await transmuter.connect(minter).stake(depStakeAmt1);
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt1);
      await mineBlocks(ethers.provider, 10);

      await transmuter.connect(user).stake(depStakeAmt1);

      let minterInfo = await transmuter.userInfo(await minter.getAddress());
      let minterBucketBefore = minterInfo.inbucket;
      await transmuter.connect(depositor).transmuteAndClaim();
      minterInfo = await transmuter.userInfo(await minter.getAddress());
      let userInfo = await transmuter.userInfo(await user.getAddress());

      let minterBucketAfter = minterInfo.inbucket;
      expect(minterBucketAfter).equal(minterBucketBefore.add(parseEther("5")));
      expect(userInfo.inbucket).equal(parseEther("5"));
    });

    describe("ensureSufficientFundsExistLocally()", async () => {

      let distributeAmt = utils.parseEther("500");
      let plantableThreshold = parseEther("100");
      let transmuterPreClaimBal;
      let userPreClaimBal;
      let vaultPreClaimBal;

      beforeEach(async () => {
        await transmuter.connect(governance).setPlantableThreshold(plantableThreshold); // 100
        await transmuter.connect(governance).setTransmutationPeriod(10);
      })

      describe("transmuterPreClaimBal < claimAmount", async () => {
        let stakeAmt = utils.parseEther("200");

        beforeEach(async () => {
          await transmuter.connect(depositor).stake(stakeAmt);
          await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
          await mineBlocks(ethers.provider, 10);
          await transmuter.connect(depositor).transmute();
  
          transmuterPreClaimBal = await token.balanceOf(transmuter.address);
          userPreClaimBal = await token.balanceOf(await depositor.getAddress());
          vaultPreClaimBal = await transVaultAdaptor.totalValue();
          await transmuter.claim();
        })

        it("recalls enough funds to handle the claim request", async () => {
          let userPostClaimBal = await token.balanceOf(await depositor.getAddress());
          let claimAmt = (userPostClaimBal).sub(userPreClaimBal);
          expect(transmuterPreClaimBal).lt(claimAmt);
        })

        it("recalls enough funds to reach plantableThreshold", async () => {
          let transmuterPostClaimBal = await token.balanceOf(transmuter.address);
          expect(transmuterPostClaimBal).equal(plantableThreshold);

          let vaultPostClaimBal = await transVaultAdaptor.totalValue();
          expect(vaultPostClaimBal).equal(vaultPreClaimBal.sub(stakeAmt))
        })
  
        it("recalls all funds from the vault if the vault contains less than plantableThreshold", async () => {
          let stakeAmt2 = parseEther("250");
          await transmuter.connect(depositor).stake(stakeAmt2);
          await mineBlocks(ethers.provider, 10);
          await transmuter.connect(depositor).transmute();
          await transmuter.claim();

          let transmuterPostClaimBal = await token.balanceOf(transmuter.address);
          expect(transmuterPostClaimBal).equal(distributeAmt.sub(stakeAmt.add(stakeAmt2)))

          let vaultPostClaimBal = await transVaultAdaptor.totalValue();
          expect(vaultPostClaimBal).equal(0)
        })
      })
  
      describe("transmuterPreClaimBal >= claimAmount", async () => {
        let stakeAmt = utils.parseEther("50");

        beforeEach(async () => {
          await transmuter.connect(depositor).stake(stakeAmt);
          await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
          await mineBlocks(ethers.provider, 10);
          await transmuter.connect(depositor).transmute();
  
          transmuterPreClaimBal = await token.balanceOf(transmuter.address);
          userPreClaimBal = await token.balanceOf(await depositor.getAddress());
          vaultPreClaimBal = await transVaultAdaptor.totalValue();
          await transmuter.claim();
        })
  
        it("does not recall funds from the vault if resulting balance is under plantableThreshold", async () => {
          let vaultPostClaimBal = await transVaultAdaptor.totalValue();
          expect(vaultPostClaimBal).equal(vaultPreClaimBal)
        })
      })
    })

  });

  describe("transmuteClaimAndWithdraw()", () => {
    let distributeAmt = utils.parseEther("500");
    let transmutedAmt = BigNumber.from("6200396825396800");
    let alUsdBalanceBefore: BigNumber;
    let tokenBalanceBefore: BigNumber;

    beforeEach(async () => {
      tokenBalanceBefore = await token.connect(depositor).balanceOf(await depositor.getAddress());
      alUsdBalanceBefore = await alUsd.connect(depositor).balanceOf(await depositor.getAddress());
      await transmuter.stake(utils.parseEther("1000"));
      await transmuter.connect(minter).stake(utils.parseEther("1000"));
      await mineBlocks(ethers.provider, 10);
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
      await transmuter.transmuteClaimAndWithdraw();
    })

    it("has a staking balance of 0 alUSD after transmuteClaimAndWithdraw()", async () => {
      let userInfo = await transmuter.userInfo(await depositor.getAddress());
      expect(userInfo.depositedAl).equal(0);
      expect(await transmuter.depositedAlTokens(await depositor.getAddress())).equal(0);
    });

    it("returns the amount of alUSD staked less the transmuted amount", async () => {
      let alUsdBalanceAfter = await alUsd.connect(depositor).balanceOf(await depositor.getAddress());
      expect(alUsdBalanceAfter).equal(alUsdBalanceBefore.sub(transmutedAmt))
    });

    it("burns the correct amount of transmuted alUSD using transmuteClaimAndWithdraw()", async () => {
      let alUSDTokenSupply = await alUsd.totalSupply();
      expect(alUSDTokenSupply).equal(preTestTotalAlUSDSupply.sub(transmutedAmt));
    });

    it("successfully sends DAI to owner using transmuteClaimAndWithdraw()", async () => {
      let tokenBalanceAfter = await token.connect(depositor).balanceOf(await depositor.getAddress());
      expect(tokenBalanceAfter).equal(tokenBalanceBefore.add(transmutedAmt));
    });

  });

  describe("exit()", () => {
    let distributeAmt = utils.parseEther("500");
    let transmutedAmt = BigNumber.from("6200396825396800");
    let alUsdBalanceBefore: BigNumber;
    let tokenBalanceBefore: BigNumber;

    beforeEach(async () => {
      tokenBalanceBefore = await token.connect(depositor).balanceOf(await depositor.getAddress());
      alUsdBalanceBefore = await alUsd.connect(depositor).balanceOf(await depositor.getAddress());
      await transmuter.stake(utils.parseEther("1000"));
      await transmuter.connect(minter).stake(utils.parseEther("1000"));
      await mineBlocks(ethers.provider, 10);
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
      await transmuter.exit();
    })

    it("transmutes and then withdraws alUSD from staking", async () => {
      let alUsdBalanceAfter = await alUsd.connect(depositor).balanceOf(await depositor.getAddress());
      expect(alUsdBalanceAfter).equal(alUsdBalanceBefore.sub(transmutedAmt));
    });

    it("transmutes and claimable DAI moves to realised value", async () => {
      let userInfo = await transmuter.userInfo(await depositor.getAddress());
      expect(userInfo.realised).equal(transmutedAmt);
    })

    it("does not claim the realized tokens", async () => {
      let tokenBalanceAfter = await token.connect(depositor).balanceOf(await depositor.getAddress());
      expect(tokenBalanceAfter).equal(tokenBalanceBefore);
    })

  })

  describe("forceTransmute()", () => {
    let distributeAmt = utils.parseEther("5000");

    beforeEach(async () => {
      transmuter.connect(governance).setTransmutationPeriod(10);
      await token.mint(await minter.getAddress(), utils.parseEther("20000"));
      await token.connect(minter).approve(transmuter.address, MAXIMUM_U256);
      await alUsd.connect(minter).approve(transmuter.address, MAXIMUM_U256);
      await token.connect(minter).approve(alchemist.address, MAXIMUM_U256);
      await alUsd.connect(minter).approve(alchemist.address, MAXIMUM_U256);
      await alchemist.connect(minter).deposit(utils.parseEther("10000"));
      await alchemist.connect(minter).mint(utils.parseEther("5000"));
      await transmuter.connect(depositor).stake(utils.parseEther(".01"));
    });

    it("User 'depositor' has alUSD overfilled, user 'minter' force transmutes user 'depositor' and user 'depositor' has DAI sent to his address", async () => {
      await transmuter.connect(minter).stake(utils.parseEther("10"));
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
      await mineBlocks(ethers.provider, 10);
      let tokenBalanceBefore = await token.connect(depositor).balanceOf(await depositor.getAddress());
      await transmuter.connect(minter).forceTransmute(await depositor.getAddress());
      let tokenBalanceAfter = await token.connect(depositor).balanceOf(await depositor.getAddress());
      expect(tokenBalanceBefore).equal(tokenBalanceAfter.sub(utils.parseEther("0.01")));
    });

    it("User 'depositor' has alUSD overfilled, user 'minter' force transmutes user 'depositor' and user 'minter' overflow added inbucket", async () => {
      await transmuter.connect(minter).stake(utils.parseEther("10"));
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
      await mineBlocks(ethers.provider, 10);
      await transmuter.connect(minter).forceTransmute(await depositor.getAddress());
      let userInfo = await transmuter.connect(minter).userInfo(await minter.getAddress());
      // TODO calculate the expected value
      expect(userInfo.inbucket).equal("4999989999999999999999");
    });

    it("you can force transmute yourself", async () => {
      await transmuter.connect(minter).stake(utils.parseEther("1"));
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
      await mineBlocks(ethers.provider, 10);
      let tokenBalanceBefore = await token.connect(depositor).balanceOf(await depositor.getAddress());
      await transmuter.connect(depositor).forceTransmute(await depositor.getAddress());
      let tokenBalanceAfter = await token.connect(depositor).balanceOf(await depositor.getAddress());
      expect(tokenBalanceBefore).equal(tokenBalanceAfter.sub(utils.parseEther("0.01")));
    });

    it("you can force transmute yourself even when you are the only one in the transmuter", async () => {
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
      await mineBlocks(ethers.provider, 10);
      let tokenBalanceBefore = await token.connect(depositor).balanceOf(await depositor.getAddress());
      await transmuter.connect(depositor).forceTransmute(await depositor.getAddress());
      let tokenBalanceAfter = await token.connect(depositor).balanceOf(await depositor.getAddress());
      expect(tokenBalanceBefore).equal(tokenBalanceAfter.sub(utils.parseEther("0.01")));
    });

    it("reverts when you are not overfilled", async () => {
      await transmuter.connect(minter).stake(utils.parseEther("1000"));
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, utils.parseEther("1000"));
      expect(transmuter.connect(minter).forceTransmute(await depositor.getAddress())).revertedWith("Transmuter: !overflow");
    });

  });
  //not sure what this is actually testing.... REEEE
  describe("Multiple Users displays all overfilled users", () => {

    it("returns userInfo", async () => {
      await transmuter.stake(utils.parseEther("1000"));
      await transmuter.connect(minter).stake(utils.parseEther("1000"));
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, utils.parseEther("5000"));
      let multipleUsers = await transmuter.getMultipleUserInfo(0, 1);
      let userList = multipleUsers.theUserData;
      expect(userList.length).equal(2)
    })

  })

  describe("distribute()", () => {
    let transmutationPeriod = 20;

    beforeEach(async () => {
      await transmuter.connect(governance).setTransmutationPeriod(transmutationPeriod);
    })

    it("must be whitelisted to call distribute", async () => {
      await transmuter.connect(depositor).stake(utils.parseEther("1000"));
      expect(
        transmuter.connect(depositor).distribute(alchemist.address, utils.parseEther("1000"))
      ).revertedWith("Transmuter: !whitelisted")
    });

    it("increases buffer size, but does not immediately increase allocations", async () => {
      await transmuter.connect(depositor).stake(utils.parseEther("1000"));
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, utils.parseEther("1000"))
      let userInfo = await transmuter.userInfo(await depositor.getAddress());
      let bufferInfo = await transmuter.bufferInfo();

      expect(bufferInfo._buffer).equal(utils.parseEther("1000"));
      expect(bufferInfo._deltaBlocks).equal(0);
      expect(bufferInfo._toDistribute).equal(0);
      expect(userInfo.pendingdivs).equal(0);
      expect(userInfo.depositedAl).equal(utils.parseEther("1000"));
      expect(userInfo.inbucket).equal(0);
      expect(userInfo.realised).equal(0);
    });

    describe("userInfo()", async () => {

      it("distribute increases allocations if the buffer is already > 0", async () => {
        let blocksMined = 10;
        let stakeAmt = utils.parseEther("1000");
        await transmuter.connect(depositor).stake(stakeAmt);
        await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, utils.parseEther("1000"))
        await mineBlocks(ethers.provider, blocksMined);
        let userInfo = await transmuter.userInfo(await depositor.getAddress());
        let bufferInfo = await transmuter.bufferInfo();
  
        // 2 = transmutationPeriod / blocksMined
        expect(bufferInfo._buffer).equal(stakeAmt);
        expect(userInfo.pendingdivs).equal(stakeAmt.div(2));
        expect(userInfo.depositedAl).equal(stakeAmt);
        expect(userInfo.inbucket).equal(0);
        expect(userInfo.realised).equal(0);
      });
  
      it("increases buffer size, and userInfo() shows the correct state without an extra nudge", async () => {
        let stakeAmt = utils.parseEther("1000");
        await transmuter.connect(depositor).stake(stakeAmt);
        await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, stakeAmt)
        await mineBlocks(ethers.provider, 10);
        let userInfo = await transmuter.userInfo(await depositor.getAddress());
        let bufferInfo = await transmuter.bufferInfo();
  
        expect(bufferInfo._buffer).equal("1000000000000000000000");
        expect(userInfo.pendingdivs).equal(stakeAmt.div(2));
        expect(userInfo.depositedAl).equal(stakeAmt);
        expect(userInfo.inbucket).equal(0);
        expect(userInfo.realised).equal(0);
      });

    })

    describe("_plantOrRecallExcessFunds", async () => {
      let stakeAmt = parseEther("50");
      let transmuterPreDistributeBal;
      let transmuterPostDistributeBal;
      let plantableThreshold = parseEther("100");
      let plantableMargin = "10";
      let vaultPreDistributeBal;

      beforeEach(async () => {
        await transmuter.connect(depositor).stake(stakeAmt);
        await transmuter.connect(governance).setPlantableThreshold(plantableThreshold); // 100
        await transmuter.connect(governance).setPlantableMargin(plantableMargin);
        transmuterPreDistributeBal = await token.balanceOf(transmuter.address); // 0
      })

      describe("transmuterPostDistributeBal < plantableThreshold", async () => {
        
        it("does not send funds to the active vault", async () => {
          let distributeAmt = utils.parseEther("50");
          vaultPreDistributeBal = await transVaultAdaptor.totalValue();
          await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
          let vaultPostDistributeBal = await transVaultAdaptor.totalValue();
          expect(vaultPostDistributeBal).equal(vaultPreDistributeBal);
        })

        describe("vault has funds before distribute()", async () => {
          let vaultPostDistributeBal;

          beforeEach(async () => {
            // breach plantableThreshold to send 50 to vault
            let distributeAmt0 = parseEther("150")
            await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt0);
            // transmuterBal = 100, vaultBal = 50
  
            // transmute and claim staked 50
            await mineBlocks(ethers.provider, 10);
            await transmuter.connect(depositor).transmute();
            await transmuter.claim();
            // transmuterBal = 50, vaultBal = 50
          })

          it("recalls funds from the active vault if they are available", async () => {
            // distribute 25 to force 25 recall from vault
            let distributeAmt1 = parseEther("25")
            vaultPreDistributeBal = await transVaultAdaptor.totalValue();
            await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt1);
  
            vaultPostDistributeBal = await transVaultAdaptor.totalValue();
            expect(vaultPostDistributeBal).equal(vaultPreDistributeBal.sub(parseEther("25")));
          })
    
          it("recalls the exact amount of funds needed to reach plantableThreshold", async () => {
            // distribute 25 to force 25 recall from vault
            let distributeAmt1 = parseEther("25")
            vaultPreDistributeBal = await transVaultAdaptor.totalValue();
            await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt1);
  
            transmuterPostDistributeBal = await token.balanceOf(transmuter.address);
            expect(transmuterPostDistributeBal).equal(plantableThreshold)
          })

          it("does not recall funds if below by less than plantableMargin", async () => {
            // distribute 45
            let distributeAmt1 = parseEther("45")
            vaultPreDistributeBal = await transVaultAdaptor.totalValue();
            await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt1);
  
            vaultPostDistributeBal = await transVaultAdaptor.totalValue();
            expect(vaultPostDistributeBal).equal(vaultPreDistributeBal);
          })

        })
      })
  
      describe("transmuterPostDistributeBal > plantableThreshold", async () => {
        let vaultPreDistributeBal;

        beforeEach(async () => {
          vaultPreDistributeBal = await transVaultAdaptor.totalValue();
        })

        it("sends excess funds to the active vault", async () => {
          let distributeAmt = parseEther("150");
          await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
          let vaultPostDistributeBal = await transVaultAdaptor.totalValue();
          expect(vaultPostDistributeBal).equal(vaultPreDistributeBal.add(parseEther("50")));
        })
  
        it("sends the exact amount of funds in excess to reach plantableThreshold", async () => {
          let distributeAmt = parseEther("150");
          await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
          let transmuterPostDistributeBal = await token.balanceOf(transmuter.address);
          expect(transmuterPostDistributeBal).equal(plantableThreshold);
        })

        it("does not send funds if above by less than plantableMargin", async () => {
          // distribute 45
          let distributeAmt = parseEther("55")
          await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);

          let vaultPostDistributeBal = await transVaultAdaptor.totalValue();
          expect(vaultPostDistributeBal).equal(vaultPreDistributeBal);
        })
      })
  
      describe("transmuterPostDistributeBal == plantableThreshold", async () => {
        it("does nothing", async () => {
          let distributeAmt = parseEther("100");
          vaultPreDistributeBal = await transVaultAdaptor.totalValue();
          await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);

          let vaultPostDistributeBal = await transVaultAdaptor.totalValue();
          expect(vaultPostDistributeBal).equal(vaultPreDistributeBal);

          let transmuterPostDistributeBal = await token.balanceOf(transmuter.address);
          expect(transmuterPostDistributeBal).equal(plantableThreshold);
        })
      })
    })

  });

  describe("recall", async () => {
    describe("recallAllFundsFromVault()", async () => {
      let plantableThreshold = parseEther("100");
      let stakeAmt = parseEther("100");
      let distributeAmt = utils.parseEther("150");

      beforeEach(async () => {
        await transmuter.connect(depositor).stake(stakeAmt);
        await transmuter.connect(governance).setPlantableThreshold(plantableThreshold); // 100
        await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
        // transmuter 100, vault 50
      })

      it("reverts when not paused", async () => {
        expect(transmuter.connect(governance).recallAllFundsFromVault(0))
          .revertedWith("Transmuter: not paused, or not governance or sentinel")
      });

      it("reverts when not governance or sentinel", async () => {
        await transmuter.connect(governance).setPause(true);
        expect(transmuter.connect(minter).recallAllFundsFromVault(0))
          .revertedWith("Transmuter: not paused, or not governance or sentinel")
      });

      it("recalls funds from active vault", async () => {
        await transmuter.connect(sentinel).setPause(true);
        let transmuterPreRecallBal = await token.balanceOf(transmuter.address);

        await transmuter.connect(governance).recallAllFundsFromVault(0);

        let transmuterPostRecallBal = await token.balanceOf(transmuter.address);
        let vaultPostRecallBal = await transVaultAdaptor.totalValue()
        
        expect(transmuterPostRecallBal).equal(transmuterPreRecallBal.add(parseEther("50")));
        expect(vaultPostRecallBal).equal(0);
      })

      it("recalls funds from any non-active vault", async () => {
        await transmuter.connect(sentinel).setPause(true);
        let transmuterPreRecallBal = await token.balanceOf(transmuter.address);

        let newVault = (await VaultAdapterMockFactory.connect(deployer).deploy(
          token.address
        )) as VaultAdapterMockWithIndirection;
        await transmuter.connect(governance).migrate(newVault.address);
        await transmuter.connect(sentinel).recallAllFundsFromVault(0);

        let transmuterPostRecallBal = await token.balanceOf(transmuter.address);
        let vaultPostRecallBal = await transVaultAdaptor.totalValue()
        
        expect(transmuterPostRecallBal).equal(transmuterPreRecallBal.add(parseEther("50")));
        expect(vaultPostRecallBal).equal(0);
      })
    })

    describe("recallFundsFromVault", async () => {
      let plantableThreshold = parseEther("100");
      let stakeAmt = parseEther("100");
      let distributeAmt = utils.parseEther("150");
      let recallAmt = parseEther("10");

      beforeEach(async () => {
        await transmuter.connect(depositor).stake(stakeAmt);
        await transmuter.connect(governance).setPlantableThreshold(plantableThreshold); // 100
        await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
        // transmuter 100, vault 50
      })

      it("reverts when not paused", async () => {
        expect(transmuter.connect(governance).recallAllFundsFromVault(0))
          .revertedWith("Transmuter: not paused, or not governance or sentinel")
      });

      it("reverts when not governance or sentinel", async () => {
        await transmuter.connect(governance).setPause(true);
        expect(transmuter.connect(minter).recallAllFundsFromVault(0))
          .revertedWith("Transmuter: not paused, or not governance or sentinel")
      });

      it("recalls funds from active vault", async () => {
        let transmuterPreRecallBal = await token.balanceOf(transmuter.address);

        await transmuter.connect(sentinel).setPause(true);
        await transmuter.connect(sentinel).recallFundsFromVault(0, recallAmt);

        let transmuterPostRecallBal = await token.balanceOf(transmuter.address);
        let vaultPostRecallBal = await transVaultAdaptor.totalValue()
        
        expect(transmuterPostRecallBal).equal(transmuterPreRecallBal.add(recallAmt));
        expect(vaultPostRecallBal).equal(distributeAmt.sub(plantableThreshold).sub(recallAmt));
      })

      it("recalls funds from any non-active vault", async () => {
        await transmuter.connect(sentinel).setPause(true);
        let transmuterPreRecallBal = await token.balanceOf(transmuter.address);

        let newVault = (await VaultAdapterMockFactory.connect(deployer).deploy(
          token.address
        )) as VaultAdapterMockWithIndirection;
        await transmuter.connect(governance).migrate(newVault.address);
        await transmuter.connect(sentinel).recallFundsFromVault(0, recallAmt);

        let transmuterPostRecallBal = await token.balanceOf(transmuter.address);
        let vaultPostRecallBal = await transVaultAdaptor.totalValue()
        
        expect(transmuterPostRecallBal).equal(transmuterPreRecallBal.add(recallAmt));
        expect(vaultPostRecallBal).equal(distributeAmt.sub(plantableThreshold).sub(recallAmt));
      })
    })
  })

  describe("harvest()", () => {
    let transmutationPeriod = 10;
    let plantableThreshold = parseEther("100");
    let stakeAmt = parseEther("50");
    let yieldAmt = parseEther("10");

    beforeEach(async () => {
      await transmuter.connect(governance).setTransmutationPeriod(transmutationPeriod);
      await transmuter.connect(governance).setRewards(await rewards.getAddress());
      await transmuter.connect(depositor).stake(stakeAmt);
      await transmuter.connect(governance).setPlantableThreshold(plantableThreshold); // 100
      await token.connect(minter).transfer(transVaultAdaptor.address, yieldAmt)
      let transmuterPreDistributeBal = await token.balanceOf(transmuter.address); // 0
    })

    it("harvests yield from the vault", async () => {
      let rewardsAddress = await rewards.getAddress()
      let transBalPreHarvest = await token.balanceOf(rewardsAddress);
      await transmuter.connect(deployer).harvest(0);
      let transBalPostHarvest = await token.balanceOf(rewardsAddress);
      expect(transBalPostHarvest).equal(transBalPreHarvest.add(yieldAmt))
    });

  });

  describe("migrateFunds()", () => {
    let transmutationPeriod = 10;
    let plantableThreshold = parseEther("20");
    let stakeAmt = parseEther("50");
    let distributeAmt = parseEther("100");
    let newTransmuter: TransmuterB;
    let newTransVaultAdaptor: VaultAdapterMockWithIndirection;

    beforeEach(async () => {
      newTransmuter = (await TransmuterBFactory.connect(deployer).deploy(
        alUsd.address,
        token.address,
        await governance.getAddress()
      )) as TransmuterB;
      newTransVaultAdaptor = (await VaultAdapterMockFactory.connect(deployer).deploy(
        token.address
      )) as VaultAdapterMockWithIndirection;
      await transmuter.connect(governance).setRewards(await rewards.getAddress());
      await newTransmuter.connect(governance).setKeepers(keeprs, keeprStates);
      await newTransmuter.connect(governance).setRewards(await rewards.getAddress());
      await newTransmuter.connect(governance).initialize(newTransVaultAdaptor.address);
      await newTransmuter.connect(governance).setWhitelist(transmuter.address, true);
      await transmuter.connect(governance).setTransmutationPeriod(transmutationPeriod);
      await transmuter.connect(depositor).stake(stakeAmt);
      await transmuter.connect(governance).setPlantableThreshold(plantableThreshold);
      await transmuter.connect(mockAlchemist).distribute(mockAlchemistAddress, distributeAmt);
    })

    it("reverts if anyone but governance tries to migrate", async () => {
      expect(transmuter.connect(depositor).migrateFunds(newTransmuter.address))
        .revertedWith("Transmuter: !governance");
    });

    it("reverts when trying to migrate to 0x0", async () => {
      expect(transmuter.connect(governance).migrateFunds("0x0000000000000000000000000000000000000000"))
        .revertedWith("cannot migrate to 0x0");
    });

    it("reverts if not in emergency mode", async () => {
      expect(transmuter.connect(governance).migrateFunds(newTransmuter.address))
        .revertedWith("migrate: set emergency exit first");
    });

    it("reverts if there are not enough funds to service all open transmuter stakes", async () => {
      await transmuter.connect(governance).setPause(true);
      expect(transmuter.connect(governance).migrateFunds(newTransmuter.address))
        .revertedWith("not enough funds to service stakes");
    })

    it("sends all available funds to the new transmuter", async () => {
      await transmuter.connect(governance).setPause(true);
      await transmuter.connect(governance).recallAllFundsFromVault(0);
      let newTransmuterPreMigrateBal = await token.balanceOf(newTransmuter.address);
      await transmuter.connect(governance).migrateFunds(newTransmuter.address);

      let transmuterPostMigrateBal = await token.balanceOf(transmuter.address);
      expect(transmuterPostMigrateBal).equal(stakeAmt);

      let amountMigrated = distributeAmt.sub(stakeAmt);
      let newTransmuterPostMigrateBal = await token.balanceOf(newTransmuter.address);
      expect(newTransmuterPostMigrateBal).equal(newTransmuterPreMigrateBal.add(amountMigrated))
    })

  });

});
