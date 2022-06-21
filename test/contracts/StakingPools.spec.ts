import chai from "chai";
import chaiSubset from "chai-subset";
import {solidity} from "ethereum-waffle";
import {ethers} from "hardhat";
import {BigNumber, BigNumberish, ContractFactory, Signer} from "ethers";

import {StakingPools} from "../../types/StakingPools";
import {Erc20Mock} from "../../types/Erc20Mock";
import {MAXIMUM_U256, mineBlocks, ZERO_ADDRESS} from "../utils/helpers";

chai.use(solidity);
chai.use(chaiSubset);

const {expect} = chai;

let StakingPoolsFactory: ContractFactory;
let ERC20MockFactory: ContractFactory;

describe("StakingPools", () => {
  let deployer: Signer;
  let governance: Signer;
  let newGovernance: Signer;
  let signers: Signer[];

  let pools: StakingPools;
  let reward: Erc20Mock;
  let rewardRate = 5000;

  before(async () => {
    StakingPoolsFactory = await ethers.getContractFactory("StakingPools");
    ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
  });

  beforeEach(async () => {
    [deployer, governance, newGovernance, ...signers] = await ethers.getSigners();

    reward = (await ERC20MockFactory.connect(deployer).deploy(
      "Test Token",
      "TEST",
      18
    )) as Erc20Mock;

    pools = (await StakingPoolsFactory.connect(deployer).deploy(
      reward.address,
      governance.getAddress()
    )) as StakingPools;
  });

  describe("set governance", () => {
    it("only allows governance", async () => {
      expect(pools.setPendingGovernance(await newGovernance.getAddress())).revertedWith(
        "StakingPools: only governance"
      );
    });

    context("when caller is governance", () => {
      beforeEach(async () => {
        pools = pools.connect(governance);
      });

      it("prevents getting stuck", async () => {
        expect(pools.setPendingGovernance(ZERO_ADDRESS)).revertedWith(
          "StakingPools: pending governance address cannot be 0x0"
        );
      });

      it("sets the pending governance", async () => {
        await pools.setPendingGovernance(await newGovernance.getAddress());
        expect(await pools.governance()).equal(await governance.getAddress());
      });

      it("updates governance upon acceptance", async () => {
        await pools.setPendingGovernance(await newGovernance.getAddress());
        await pools.connect(newGovernance).acceptGovernance()
        expect(await pools.governance()).equal(await newGovernance.getAddress());
      });

      it("emits GovernanceUpdated event", async () => {
        await pools.setPendingGovernance(await newGovernance.getAddress());
        expect(pools.connect(newGovernance).acceptGovernance())
          .emit(pools, "GovernanceUpdated")
          .withArgs(await newGovernance.getAddress());
      });
    });
  });

  describe("set reward rate", () => {
    let newRewardRate: BigNumberish = 100000;

    it("only allows governance to call", async () => {
      expect(pools.setRewardRate(newRewardRate)).revertedWith(
        "StakingPools: only governance"
      );
    });

    context("when caller is governance", () => {
      beforeEach(async () => (pools = pools.connect(governance)));

      it("updates reward rate", async () => {
        await pools.setRewardRate(newRewardRate);
        expect(await pools.rewardRate()).equal(newRewardRate);
      });

      it("emits RewardRateUpdated event", async () => {
        expect(pools.setRewardRate(newRewardRate))
          .emit(pools, "RewardRateUpdated")
          .withArgs(newRewardRate);
      });
    });
  });

  describe("create pool", () => {
    let token: Erc20Mock;

    beforeEach(async () => {
      token = (await ERC20MockFactory.connect(deployer).deploy(
        "Staking Token",
        "STAKE",
        18
      )) as Erc20Mock;
    });

    it("only allows governance to call", async () => {
      expect(pools.createPool(token.address)).revertedWith(
        "StakingPools: only governance"
      );
    });

    context("when caller is governance", async () => {
      beforeEach(async () => (pools = pools.connect(governance)));

      it("emits PoolCreated event", async () => {
        expect(pools.createPool(token.address))
          .emit(pools, "PoolCreated")
          .withArgs(0, token.address);
      });

      context("when reusing token", async () => {
        it("reverts", async () => {
          await pools.createPool(token.address);
          expect(pools.createPool(token.address)).revertedWith("StakingPools: token already has a pool");
        });
      });
    });
  });

  describe("set pool reward weights", () => {
    it("only allows governance to call", async () => {
      expect(pools.setRewardRate([1])).revertedWith(
        "StakingPools: only governance"
      );
    });

    context("when caller is governance", () => {
      beforeEach(async () => (pools = pools.connect(governance)));

      const shouldBehaveLikeSetRewardWeights = (
        rewardWeights: BigNumberish[]
      ) => {
        beforeEach(async () => {
          await pools.setRewardWeights(rewardWeights);
        });

        it("updates the total reward weight", async () => {
          const totalWeight = rewardWeights
            .map((value) => BigNumber.from(value))
            .reduce((acc, value) => acc.add(value), BigNumber.from(0));

          expect(await pools.totalRewardWeight()).equal(totalWeight);
        });

        it("updates the reward weights", async () => {
          for (let poolId = 0; poolId < rewardWeights.length; poolId++) {
            expect(await pools.getPoolRewardWeight(poolId)).equal(rewardWeights[poolId]);
          }
        });
      };

      it("reverts when weight array length mismatches", () => {
        expect(pools.setRewardWeights([1])).revertedWith(
          "StakingPools: weights length mismatch"
        );
      });

      context("with one pool", async () => {
        let token: Erc20Mock;

        beforeEach(async () => {
          token = (await ERC20MockFactory.connect(deployer).deploy(
            "Staking Token",
            "STAKE",
            18
          )) as Erc20Mock;
        });

        beforeEach(async () => {
          await pools.connect(governance).createPool(token.address);
        });

        shouldBehaveLikeSetRewardWeights([10000]);
      });

      context("with many pools", async () => {
        let numberPools = 5;
        let tokens: Erc20Mock[];

        beforeEach(async () => {
          tokens = new Array<Erc20Mock>();
          for (let i = 0; i < numberPools; i++) {
            tokens.push(
              (await ERC20MockFactory.connect(deployer).deploy(
                "Staking Token",
                "STAKE",
                18
              )) as Erc20Mock
            );
          }
        });

        beforeEach(async () => {
          for (let n = 0; n < numberPools; n++) {
            await pools
              .connect(governance)
              .createPool(tokens[n].address);
          }
        });

        shouldBehaveLikeSetRewardWeights([
          10000,
          20000,
          30000,
          40000,
          50000,
        ]);
      });
    });
  });

  describe("deposit tokens", () => {
    let depositor: Signer;
    let token: Erc20Mock;

    beforeEach(async () => {
      [depositor, ...signers] = signers;
      token = (await ERC20MockFactory.connect(deployer).deploy(
        "Staking Token",
        "STAKE",
        18
      )) as Erc20Mock;
      await pools.connect(governance).createPool(token.address);
      await pools.connect(governance).setRewardWeights([1]);
    });

    const shouldBehaveLikeDeposit = (
      poolId: BigNumberish,
      amount: BigNumberish
    ) => {
      let startingTokenBalance: BigNumber;
      let startingTotalDeposited: BigNumber;
      let startingDeposited: BigNumber;

      beforeEach(async () => {
        startingTokenBalance = await token.balanceOf(await depositor.getAddress());
        startingTotalDeposited = await pools.getPoolTotalDeposited(0);
        startingDeposited = await pools.getStakeTotalDeposited(await depositor.getAddress(), 0);

        await token.approve(pools.address, amount);
        await pools.deposit(poolId, amount);
      });

      it("increments total deposited amount", async () => {
        expect(await pools.getPoolTotalDeposited(0))
          .equal(startingTotalDeposited.add(amount));
      });

      it("increments deposited amount", async () => {
        expect(await pools.getStakeTotalDeposited(await depositor.getAddress(), 0))
          .equal(startingDeposited.add(amount));
      });

      it("transfers deposited tokens", async () => {
        expect(await token.balanceOf(await depositor.getAddress()))
          .equal(startingTokenBalance.sub(amount));
      });
    };

    context("with no previous deposits", async () => {
      let depositAmount = 50000;

      beforeEach(async () => (pools = pools.connect(depositor)));
      beforeEach(async () => (token = token.connect(depositor)));

      beforeEach(async () => {
        await token.mint(await depositor.getAddress(), depositAmount);
      });

      shouldBehaveLikeDeposit(0, depositAmount);

      it("does not reward tokens", async () => {
        expect(await pools.getStakeTotalUnclaimed(await depositor.getAddress(), 0))
          .equal(0);
      });
    });

    context("with previous deposits", async () => {
      let initialDepositAmount = 50000;
      let depositAmount = 100000;

      beforeEach(async () => (pools = pools.connect(depositor)));
      beforeEach(async () => (token = token.connect(depositor)));

      beforeEach(async () => {
        await token.mint(
          await depositor.getAddress(),
          initialDepositAmount + depositAmount
        );
        await token.approve(pools.address, initialDepositAmount);
        await pools.deposit(0, initialDepositAmount);
      });

      shouldBehaveLikeDeposit(0, depositAmount);
    });
  });

  describe("withdraw tokens", () => {
    let depositor: Signer;
    let token: Erc20Mock;

    beforeEach(async () => {
      [depositor, ...signers] = signers;
      token = (await ERC20MockFactory.connect(deployer).deploy(
        "Staking Token",
        "STAKE",
        18
      )) as Erc20Mock;

      await pools.connect(governance).createPool(token.address);
      await pools.connect(governance).setRewardWeights([1]);
    });

    const shouldBehaveLikeWithdraw = (
      poolId: BigNumberish,
      amount: BigNumberish
    ) => {
      let startingTokenBalance: BigNumber;
      let startingTotalDeposited: BigNumber;
      let startingDeposited: BigNumber;

      beforeEach(async () => {
        startingTokenBalance = await token.balanceOf(await depositor.getAddress());
        startingTotalDeposited = await pools.getPoolTotalDeposited(0);
        startingDeposited = await pools.getStakeTotalDeposited(await depositor.getAddress(), 0);
      });

      beforeEach(async () => {
        await pools.withdraw(poolId, amount);
      });

      it("decrements total deposited amount", async () => {
        expect(await pools.getPoolTotalDeposited(0))
          .equal(startingTotalDeposited.sub(amount));
      });

      it("decrements deposited amount", async () => {
        expect(await pools.getStakeTotalDeposited(await depositor.getAddress(), 0))
          .equal(startingDeposited.sub(amount));
      });

      it("transfers deposited tokens", async () => {
        expect(await token.balanceOf(await depositor.getAddress())).equal(
          startingTokenBalance.add(amount)
        );
      });
    };

    context("with previous deposits", async () => {
      let depositAmount = 50000;
      let withdrawAmount = 25000;

      beforeEach(async () => {
        token = token.connect(depositor)
        await token.connect(deployer).mint(await depositor.getAddress(), MAXIMUM_U256);
        await token.connect(depositor).approve(pools.address, MAXIMUM_U256);
        await token.mint(await depositor.getAddress(), depositAmount);
        await token.approve(pools.address, depositAmount);

        pools = pools.connect(depositor)
        await pools.deposit(0, depositAmount);
      });

      shouldBehaveLikeWithdraw(0, withdrawAmount)
    });
  });

  describe("claim tokens", () => {
    let depositor: Signer;
    let token: Erc20Mock;

    let rewardWeight = 1;
    let depositAmount = 50000;
    let rewardRate = 1000;

    beforeEach(async () => {
      [depositor, ...signers] = signers;

      token = (await ERC20MockFactory.connect(deployer).deploy(
        "Staking Token",
        "STAKE",
        18
      )) as Erc20Mock;
    });

    beforeEach(async () => (token = token.connect(depositor)));

    beforeEach(async () => {
      await token.mint(await depositor.getAddress(), MAXIMUM_U256);
      await token.approve(pools.address, MAXIMUM_U256);
    });

    beforeEach(async () => (pools = pools.connect(governance)));

    beforeEach(async () => {
      await pools.createPool(token.address);
      await pools.setRewardWeights([rewardWeight]);
    });

    context("with deposit", () => {
      const EPSILON: number = 5;

      let elapsedBlocks = 1000;

      beforeEach(async () => {
        await pools.connect(governance).setRewardRate(rewardRate);
        pools = pools.connect(depositor)
        await pools.deposit(0, depositAmount);
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.claim(0);
      });

      it("mints reward tokens", async () => {
        const rewardAmount = rewardRate * (elapsedBlocks + 1);

        expect(await reward.balanceOf(await depositor.getAddress()))
          .gte(rewardAmount - EPSILON)
          .lte(rewardAmount);
      });

      it("clears unclaimed amount", async () => {
        expect(await pools.getStakeTotalUnclaimed(await depositor.getAddress(), 0)).equal(0);
      });
    });

    context("with multiple deposits", () => {
      const EPSILON: number = 5;

      let elapsedBlocks = 100;

      beforeEach(async () => {
        await pools.connect(governance).setRewardRate(rewardRate);
        pools = pools.connect(depositor)
        await pools.deposit(0, depositAmount);
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.deposit(0, depositAmount);
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.claim(0);
      });

      it("mints reward tokens", async () => {
        const rewardAmount = rewardRate * (elapsedBlocks + elapsedBlocks + 2);

        expect(await reward.balanceOf(await depositor.getAddress()))
          .gte(rewardAmount - EPSILON)
          .lte(rewardAmount);
      });

      it("clears unclaimed amount", async () => {
        expect(await pools.getStakeTotalUnclaimed(await depositor.getAddress(), 0)).equal(0);
      });
    });
  });

  describe("get stake unclaimed amount", () => {
    let depositor: Signer;
    let token: Erc20Mock;

    let rewardWeight = 1;
    let depositAmount = 50000;
    let rewardRate = 5000;

    beforeEach(async () => {
      [depositor, ...signers] = signers;

      token = (await ERC20MockFactory.connect(deployer).deploy(
        "Staking Token",
        "STAKE",
        18
      )) as Erc20Mock;
    });

    beforeEach(async () => (token = token.connect(depositor)));

    beforeEach(async () => {
      await token.mint(await depositor.getAddress(), MAXIMUM_U256);
      await token.approve(pools.address, MAXIMUM_U256);
    });

    beforeEach(async () => (pools = pools.connect(governance)));

    beforeEach(async () => {
      await pools.createPool(token.address);
      await pools.setRewardWeights([rewardWeight]);
      await pools.setRewardRate(rewardRate);
    });

    context("with deposit", () => {
      const EPSILON: number = 5;

      let elapsedBlocks = 100;

      beforeEach(async () => (pools = pools.connect(depositor)));

      beforeEach(async () => await pools.deposit(0, depositAmount));

      beforeEach(async () => {
        await mineBlocks(ethers.provider, elapsedBlocks);
      });

      it("properly calculates the balance", async () => {
        const rewardAmount = rewardRate * elapsedBlocks;

        expect(await pools.getStakeTotalUnclaimed(await depositor.getAddress(), 0)).equal(rewardAmount);
      });
    });

    context("with multiple deposits", () => {
      const EPSILON: number = 5;

      let elapsedBlocks = 100;

      beforeEach(async () => (pools = pools.connect(depositor)));

      beforeEach(async () => {
        await pools.deposit(0, depositAmount);
        await mineBlocks(ethers.provider, elapsedBlocks);
        await pools.deposit(0, depositAmount);
        await mineBlocks(ethers.provider, elapsedBlocks);
      });

      it("properly calculates the balance", async () => {
        const rewardAmount = rewardRate * (elapsedBlocks + elapsedBlocks + 1);

        expect(await pools.getStakeTotalUnclaimed(await depositor.getAddress(), 0))
          .gte(rewardAmount - EPSILON)
          .lte(rewardAmount);
      });
    });
  });
});
