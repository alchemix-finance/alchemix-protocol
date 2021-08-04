import chai from "chai";
import chaiSubset from "chai-subset";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import { BigNumber, BigNumberish, ContractFactory, Signer, utils } from "ethers";
import { Transmuter } from "../../types/Transmuter";
import { AlchemistEth } from "../../types/AlchemistEth";
import { StakingPools } from "../../types/StakingPools";
import { AlEth } from "../../types/AlEth";
import { Erc20Mock } from "../../types/Erc20Mock";
import { Weth9 } from "../../types/Weth9";
import { MAXIMUM_U256, ZERO_ADDRESS, getGas } from "../utils/helpers";
import { VaultAdapterMock } from "../../types/VaultAdapterMock";
import { YearnVaultAdapter } from "../../types/YearnVaultAdapter";
import { YearnVaultMock } from "../../types/YearnVaultMock";
import { YearnControllerMock } from "../../types/YearnControllerMock";
import { min } from "moment";
import { mintDaiToAddress } from "../../utils/mintUtils";
const {parseEther, formatEther} = utils;

chai.use(solidity);
chai.use(chaiSubset);

const { expect } = chai;

let AlchemistFactory: ContractFactory;
let AlETHFactory: ContractFactory;
let ERC20MockFactory: ContractFactory;
let VaultAdapterMockFactory: ContractFactory;
let TransmuterFactory: ContractFactory;
let YearnVaultAdapterFactory: ContractFactory;
let YearnVaultMockFactory: ContractFactory;
let YearnControllerMockFactory: ContractFactory;
let Weth9Factory: ContractFactory;

describe("AlchemistEth", () => {
  let signers: Signer[];

  before(async () => {
    AlchemistFactory = await ethers.getContractFactory("AlchemistEth");
    TransmuterFactory = await ethers.getContractFactory("Transmuter");
    AlETHFactory = await ethers.getContractFactory("AlEth");
    ERC20MockFactory = await ethers.getContractFactory("ERC20Mock");
    VaultAdapterMockFactory = await ethers.getContractFactory(
      "VaultAdapterMock"
    );
    YearnVaultAdapterFactory = await ethers.getContractFactory("YearnVaultAdapter");
    YearnVaultMockFactory = await ethers.getContractFactory("YearnVaultMock");
    YearnControllerMockFactory = await ethers.getContractFactory("YearnControllerMock");
    Weth9Factory = await ethers.getContractFactory("WETH9");
  });

  beforeEach(async () => {
    signers = await ethers.getSigners();
  });

  describe("constructor", async () => {
    let deployer: Signer;
    let governance: Signer;
    let sentinel: Signer;
    let token: Weth9;
    let alEth: AlEth;
    let alchemist: AlchemistEth;
    
    beforeEach(async () => {
      [deployer, governance, sentinel, ...signers] = signers;

      token = (await Weth9Factory.connect(deployer).deploy()) as Weth9;

      alEth = (await AlETHFactory.connect(deployer).deploy()) as AlEth;
    });

    context("when governance is the zero address", () => {
      it("reverts", async () => {
        expect(
          AlchemistFactory.connect(deployer).deploy(
            token.address,
            alEth.address,
            ZERO_ADDRESS,
            await sentinel.getAddress()
          )
        ).revertedWith("Alchemist: governance address cannot be 0x0.");
      });
    });
  });

  describe("update Alchemist addys and variables", () => {
    let deployer: Signer;
    let governance: Signer;
    let newGovernance: Signer;
    let rewards: Signer;
    let sentinel: Signer;
    let transmuter: Signer;
    let token: Weth9;
    let alEth: AlEth;
    let alchemist: AlchemistEth;


    beforeEach(async () => {
      [
        deployer,
        governance,
        newGovernance,
        rewards,
        sentinel,
        transmuter,
        ...signers
      ] = signers;

      token = (await Weth9Factory.connect(deployer).deploy()) as Weth9;

      alEth = (await AlETHFactory.connect(deployer).deploy()) as AlEth;

      alchemist = (await AlchemistFactory.connect(deployer).deploy(
        token.address,
        alEth.address,
        await governance.getAddress(),
        await sentinel.getAddress()
      )) as AlchemistEth;

      await alchemist.connect(governance).setEmergencyExit(false);
    });

    describe("set governance", () => {
      context("when caller is not current governance", () => {
        beforeEach(() => (alchemist = alchemist.connect(deployer)));

        it("reverts", async () => {
          expect(
            alchemist.setPendingGovernance(await newGovernance.getAddress())
          ).revertedWith("Alchemist: only governance");
        });
      });

      context("when caller is current governance", () => {
        beforeEach(() => (alchemist = alchemist.connect(governance)));

        it("reverts when setting governance to zero address", async () => {
          expect(alchemist.setPendingGovernance(ZERO_ADDRESS)).revertedWith(
            "Alchemist: governance address cannot be 0x0."
          );
        });

        it("updates rewards", async () => {
          await alchemist.setRewards(await rewards.getAddress());
          expect(await alchemist.rewards()).equal(await rewards.getAddress());
        });
      });
    });

    describe("set transmuter", () => {
      context("when caller is not current governance", () => {
        it("reverts", async () => {
          expect(
            alchemist.setTransmuter(await transmuter.getAddress())
          ).revertedWith("Alchemist: only governance");
        });
      });

      context("when caller is current governance", () => {
        beforeEach(() => (alchemist = alchemist.connect(governance)));

        it("reverts when setting transmuter to zero address", async () => {
          expect(alchemist.setTransmuter(ZERO_ADDRESS)).revertedWith(
            "Alchemist: transmuter address cannot be 0x0."
          );
        });

        it("updates transmuter", async () => {
          await alchemist.setTransmuter(await transmuter.getAddress());
          expect(await alchemist.transmuter()).equal(
            await transmuter.getAddress()
          );
        });
      });
    });

    describe("set rewards", () => {
      context("when caller is not current governance", () => {
        beforeEach(() => (alchemist = alchemist.connect(deployer)));

        it("reverts", async () => {
          expect(alchemist.setRewards(await rewards.getAddress())).revertedWith(
            "Alchemist: only governance"
          );
        });
      });

      context("when caller is current governance", () => {
        beforeEach(() => (alchemist = alchemist.connect(governance)));

        it("reverts when setting rewards to zero address", async () => {
          expect(alchemist.setRewards(ZERO_ADDRESS)).revertedWith(
            "Alchemist: rewards address cannot be 0x0."
          );
        });

        it("updates rewards", async () => {
          await alchemist.setRewards(await rewards.getAddress());
          expect(await alchemist.rewards()).equal(await rewards.getAddress());
        });
      });
    });

    describe("set peformance fee", () => {
      context("when caller is not current governance", () => {
        beforeEach(() => (alchemist = alchemist.connect(deployer)));

        it("reverts", async () => {
          expect(alchemist.setHarvestFee(1)).revertedWith(
            "Alchemist: only governance"
          );
        });
      });

      context("when caller is current governance", () => {
        beforeEach(() => (alchemist = alchemist.connect(governance)));

        it("reverts when performance fee greater than maximum", async () => {
          const MAXIMUM_VALUE = await alchemist.PERCENT_RESOLUTION();
          expect(alchemist.setHarvestFee(MAXIMUM_VALUE.add(1))).revertedWith(
            "Alchemist: harvest fee above maximum"
          );
        });

        it("updates performance fee", async () => {
          await alchemist.setHarvestFee(1);
          expect(await alchemist.harvestFee()).equal(1);
        });
      });
    });

    describe("set collateralization limit", () => {
      context("when caller is not current governance", () => {
        beforeEach(() => (alchemist = alchemist.connect(deployer)));

        it("reverts", async () => {
          const collateralizationLimit = await alchemist.MINIMUM_COLLATERALIZATION_LIMIT();
          expect(
            alchemist.setCollateralizationLimit(collateralizationLimit)
          ).revertedWith("Alchemist: only governance");
        });
      });

      context("when caller is current governance", () => {
        beforeEach(() => (alchemist = alchemist.connect(governance)));

        it("reverts when performance fee less than minimum", async () => {
          const MINIMUM_LIMIT = await alchemist.MINIMUM_COLLATERALIZATION_LIMIT();
          expect(
            alchemist.setCollateralizationLimit(MINIMUM_LIMIT.sub(1))
          ).revertedWith("Alchemist: collateralization limit below minimum.");
        });

        it("reverts when performance fee greater than maximum", async () => {
          const MAXIMUM_LIMIT = await alchemist.MAXIMUM_COLLATERALIZATION_LIMIT();
          expect(
            alchemist.setCollateralizationLimit(MAXIMUM_LIMIT.add(1))
          ).revertedWith("Alchemist: collateralization limit above maximum");
        });

        it("updates collateralization limit", async () => {
          const collateralizationLimit = await alchemist.MINIMUM_COLLATERALIZATION_LIMIT();
          await alchemist.setCollateralizationLimit(collateralizationLimit);
          expect(await alchemist.collateralizationLimit()).containSubset([
            collateralizationLimit,
          ]);
        });
      });
    });
  });

  describe("vault actions", () => {
    let deployer: Signer;
    let governance: Signer;
    let sentinel: Signer;
    let rewards: Signer;
    let transmuter: Signer;
    let minter: Signer;
    let user: Signer;
    let token: Weth9;
    let alEth: AlEth;
    let alchemist: AlchemistEth;
    let adapter: VaultAdapterMock;
    let newAdapter: VaultAdapterMock;
    let harvestFee = 1000;
    let pctReso = 10000;
    let transmuterContract: Transmuter;

    beforeEach(async () => {
      [
        deployer,
        governance,
        sentinel,
        rewards,
        transmuter,
        minter,
        user,
        ...signers
      ] = signers;

      token = (await Weth9Factory.connect(deployer).deploy()) as Weth9;

      alEth = (await AlETHFactory.connect(deployer).deploy()) as AlEth;

      alchemist = (await AlchemistFactory.connect(deployer).deploy(
        token.address,
        alEth.address,
        await governance.getAddress(),
        await sentinel.getAddress()
      )) as AlchemistEth;

      await alchemist
        .connect(governance)
        .setTransmuter(await transmuter.getAddress());
      await alchemist
        .connect(governance)
        .setRewards(await rewards.getAddress());
      await alchemist.connect(governance).setHarvestFee(harvestFee);
      transmuterContract = (await TransmuterFactory.connect(deployer).deploy(
        alEth.address,
        token.address,
        await governance.getAddress()
      )) as Transmuter;
      await alchemist.connect(governance).setTransmuter(transmuterContract.address);
      await transmuterContract.connect(governance).setWhitelist(alchemist.address, true);
      await token.connect(minter).deposit({value: parseEther("10000")});
      await token.connect(minter).approve(alchemist.address, parseEther("10000"));
    });

    describe("migrate", () => {
      beforeEach(async () => {
        adapter = (await VaultAdapterMockFactory.connect(deployer).deploy(
          token.address
        )) as VaultAdapterMock;

        newAdapter = (await VaultAdapterMockFactory.connect(deployer).deploy(
          token.address
        )) as VaultAdapterMock;

        await alchemist.connect(governance).initialize(adapter.address);
      });

      context("when caller is not current governance", () => {
        beforeEach(() => (alchemist = alchemist.connect(deployer)));

        it("reverts", async () => {
          expect(alchemist.migrate(newAdapter.address)).revertedWith(
            "Alchemist: only governance"
          );
        });
      });

      context("when caller is current governance", () => {
        beforeEach(() => (alchemist = alchemist.connect(governance)));

        context("when adapter is zero address", async () => {
          it("reverts", async () => {
            expect(alchemist.migrate(ZERO_ADDRESS)).revertedWith(
              "Alchemist: active vault address cannot be 0x0."
            );
          });
        });

        context("when adapter token mismatches", () => {
          const tokenAddress = ethers.utils.getAddress(
            "0xffffffffffffffffffffffffffffffffffffffff"
          );

          let invalidAdapter: VaultAdapterMock;

          beforeEach(async () => {
            invalidAdapter = (await VaultAdapterMockFactory.connect(
              deployer
            ).deploy(tokenAddress)) as VaultAdapterMock;
          });

          it("reverts", async () => {
            expect(alchemist.migrate(invalidAdapter.address)).revertedWith(
              "Alchemist: token mismatch"
            );
          });
        });

        context("when conditions are met", () => {
          beforeEach(async () => {
            await alchemist.migrate(newAdapter.address);
          });

          it("increments the vault count", async () => {
            expect(await alchemist.vaultCount()).equal(2);
          });

          it("sets the vaults adapter", async () => {
            expect(await alchemist.getVaultAdapter(0)).equal(adapter.address);
          });

          it("sets the vaults adapter", async () => {
            expect(await alchemist.getVaultAdapter(1)).equal(newAdapter.address);
          });
        });

        context("when adaptor is already defined in another vault", () => {
          it("reverts", async () => {
            expect(alchemist.migrate(adapter.address)).revertedWith('Adapter already in use');
          });
        });
      });

      context("on successful deployment", () => {
        it("alchemist is paused", async () => {
          expect(alchemist.connect(deployer).deposit(parseEther("1"), true, {value: parseEther("1")})).revertedWith("emergency pause enabled");
        })
      })
    });

    describe("recall funds", () => {
      context("from the active vault", () => {
        let adapter: YearnVaultAdapter;
        let controllerMock: YearnControllerMock;
        let vaultMock: YearnVaultMock;
        let depositAmt = parseEther("5000");
        let mintAmt = parseEther("1000");
        let recallAmt = parseEther("500");

        beforeEach(async () => {
          await alchemist.connect(governance).setEmergencyExit(false);
          await alchemist.connect(governance).setKeepers([await deployer.getAddress()], [true])
          controllerMock = await YearnControllerMockFactory
            .connect(deployer)
            .deploy() as YearnControllerMock;
          vaultMock = await YearnVaultMockFactory
            .connect(deployer)
            .deploy(token.address, controllerMock.address) as YearnVaultMock;
          adapter = await YearnVaultAdapterFactory
            .connect(deployer)
            .deploy(vaultMock.address, alchemist.address) as YearnVaultAdapter;
          await token.connect(deployer).deposit({value: parseEther("10000")});
          await token.approve(vaultMock.address, parseEther("10000"));
          await alchemist.connect(governance).initialize(adapter.address)
          await alchemist.connect(minter).deposit(depositAmt, false);
          await alchemist.connect(deployer).flush();
          // need at least one other deposit in the vault to not get underflow errors
          await vaultMock.connect(deployer).deposit(parseEther("100"));
        });

        it("reverts when not an emergency, not governance, and user does not have permission to recall funds from active vault", async () => {
          expect(alchemist.connect(minter).recall(0, 0))
            .revertedWith("Alchemist: not an emergency, not governance, and user does not have permission to recall funds from active vault")
        });

        it("governance can recall some of the funds", async () => {
          let beforeBal = await token.connect(governance).balanceOf(alchemist.address);
          await alchemist.connect(governance).recall(0, recallAmt);
          let afterBal = await token.connect(governance).balanceOf(alchemist.address);
          expect(beforeBal).equal(0);
          expect(afterBal).equal(recallAmt);
        });

        it("governance can recall all of the funds", async () => {
          await alchemist.connect(governance).recallAll(0);
          expect(await token.connect(governance).balanceOf(alchemist.address)).equal(depositAmt);
        });

        describe("in an emergency", async () => {
          it("anyone can recall funds", async () => {
            await alchemist.connect(governance).setEmergencyExit(true);
            await alchemist.connect(minter).recallAll(0);
            expect(await token.connect(governance).balanceOf(alchemist.address)).equal(depositAmt);
          });

          it("after some usage", async () => {
            await alchemist.connect(minter).deposit(mintAmt, false);
            await alchemist.connect(deployer).flush();
            let yieldAmt = parseEther("500")
            await token.connect(deployer).deposit({value: yieldAmt});
            await token.connect(deployer).transfer(adapter.address, yieldAmt);
            await alchemist.connect(governance).setEmergencyExit(true);
            await alchemist.connect(minter).recallAll(0);
            expect(await token.connect(governance).balanceOf(alchemist.address)).equal(depositAmt.add(mintAmt));
          });
        })
      });

      context("from an inactive vault", () => {
        let inactiveAdapter: VaultAdapterMock;
        let activeAdapter: VaultAdapterMock;
        let depositAmt = parseEther("5000");
        let mintAmt = parseEther("1000");
        let recallAmt = parseEther("500");

        beforeEach(async () => {
          inactiveAdapter = await VaultAdapterMockFactory.connect(deployer).deploy(token.address) as VaultAdapterMock;
          activeAdapter = await VaultAdapterMockFactory.connect(deployer).deploy(token.address) as VaultAdapterMock;
          await alchemist.connect(governance).setEmergencyExit(false);
          await alchemist.connect(governance).setKeepers([await deployer.getAddress()], [true])
          await alchemist.connect(governance).initialize(inactiveAdapter.address);
          await token.connect(minter).deposit({value: depositAmt});
          await token.connect(minter).approve(alchemist.address, depositAmt);
          await alchemist.connect(minter).deposit(depositAmt, false);
          await alchemist.connect(deployer).flush();
          await alchemist.connect(governance).migrate(activeAdapter.address);
        });

        it("anyone can recall some of the funds to the contract", async () => {
          await alchemist.connect(minter).recall(0, recallAmt);
          expect(await token.balanceOf(alchemist.address)).equal(recallAmt);
        });

        it("anyone can recall all of the funds to the contract", async () => {
          await alchemist.connect(minter).recallAll(0);
          expect(await token.balanceOf(alchemist.address)).equal(depositAmt);
        });

        describe("in an emergency", async () => {
          it("anyone can recall funds", async () => {
            await alchemist.connect(governance).setEmergencyExit(true);
            await alchemist.connect(minter).recallAll(0);
            expect(await token.connect(governance).balanceOf(alchemist.address)).equal(depositAmt);
          });
        })
      });
    });

    describe("flush funds", () => {
      let adapter: VaultAdapterMock;

      context("when the Alchemist is not initialized", () => {
        it("reverts", async () => {
          expect(alchemist.connect(deployer).flush()).revertedWith("Alchemist: not initialized.");
        });
      });

      context("when there is at least one vault to flush to", () => {
        context("when there is one vault", () => {
          let adapter: VaultAdapterMock;
          let mintAmount = parseEther("5000");

          beforeEach(async () => {
            await alchemist.connect(governance).setEmergencyExit(false);
            await alchemist.connect(governance).setKeepers([await deployer.getAddress()], [true])
            adapter = (await VaultAdapterMockFactory.connect(deployer).deploy(
              token.address
            )) as VaultAdapterMock;
          });

          beforeEach(async () => {
            await token.connect(deployer).deposit({value: mintAmount});
            await token.connect(deployer).transfer(alchemist.address, mintAmount);

            await alchemist.connect(governance).initialize(adapter.address);

            await alchemist.connect(deployer).flush();
          });

          it("flushes funds to the vault", async () => {
            expect(await token.balanceOf(adapter.address)).equal(mintAmount);
          });

          it("reverts if the caller is not whitelisted", async () => {
            expect(alchemist.connect(minter).flush()).revertedWith("Alchemist: only keepers.")
          })
        });

        context("when there are multiple vaults", () => {
          let inactiveAdapter: VaultAdapterMock;
          let activeAdapter: VaultAdapterMock;
          let mintAmount = parseEther("5");

          beforeEach(async () => {
            await alchemist.connect(governance).setEmergencyExit(false);
            await alchemist.connect(governance).setKeepers([await deployer.getAddress()], [true])
            inactiveAdapter = (await VaultAdapterMockFactory.connect(
              deployer
            ).deploy(token.address)) as VaultAdapterMock;

            activeAdapter = (await VaultAdapterMockFactory.connect(
              deployer
            ).deploy(token.address)) as VaultAdapterMock;

            await token.connect(deployer).deposit({value: mintAmount});
            await token.connect(deployer).transfer(alchemist.address, mintAmount);

            await alchemist
              .connect(governance)
              .initialize(inactiveAdapter.address);

            await alchemist.connect(governance).migrate(activeAdapter.address);

            await alchemist.connect(deployer).flush();
          });

          it("flushes funds to the active vault", async () => {
            expect(await token.balanceOf(activeAdapter.address)).equal(mintAmount);
          });
        });
      });
    });

    describe("deposit and withdraw tokens", () => {
        let depositAmt = parseEther("5000");
        let mintAmt = parseEther("1000");
        let ceilingAmt = parseEther("10000");
        let collateralizationLimit = "2000000000000000000"; // this should be set in the deploy sequence
        let epsilon = parseEther(".1") // margin of difference for gas

        describe("WETH", () => {
            beforeEach(async () => {
                await alchemist.connect(governance).setEmergencyExit(false);
                await alchemist.connect(governance).setKeepers([await deployer.getAddress()], [true])
                adapter = (await VaultAdapterMockFactory.connect(deployer).deploy(
                token.address
                )) as VaultAdapterMock;
                await alchemist.connect(governance).initialize(adapter.address);
                await alchemist
                .connect(governance)
                .setCollateralizationLimit(collateralizationLimit);
                await alEth.connect(deployer).setWhitelist(alchemist.address, true);
                await alEth.connect(deployer).setCeiling(alchemist.address, ceilingAmt);
                await token.connect(minter).deposit({value: depositAmt});
                await token.connect(minter).approve(alchemist.address, parseEther("100000000"));
                await alEth.connect(minter).approve(alchemist.address, parseEther("100000000"));
            });

            it("deposited amount is accounted for correctly", async () => {
                // let address = await deployer.getAddress();
                await alchemist.connect(minter).deposit(depositAmt, false);
                expect(
                await alchemist
                    .connect(minter)
                    .getCdpTotalDeposited(await minter.getAddress())
                ).equal(depositAmt);
            });
        
            it("deposits token and then withdraws all", async () => {
                let balBefore = await token.balanceOf(await minter.getAddress());
                await alchemist.connect(minter).deposit(depositAmt, false);
                await alchemist.connect(minter).withdraw(depositAmt, false);
                let balAfter = await token.balanceOf(await minter.getAddress());
                expect(balBefore).equal(balAfter);
            });

            it("reverts if ETH is sent with the deposit() call", async () => {
              expect(alchemist.connect(minter).deposit(depositAmt, false, {value: depositAmt})).revertedWith("msg.value != 0");
            });
        
            it("reverts when withdrawing too much", async () => {
                let overdraft = depositAmt.add(parseEther("1000"));
                await alchemist.connect(minter).deposit(depositAmt, false);
                expect(alchemist.connect(minter).withdraw(overdraft, false)).revertedWith("SafeERC20: low-level call failed");
            });
        
            it("reverts when cdp is undercollateralized", async () => {
                await alchemist.connect(minter).deposit(depositAmt, false);
                await alchemist.connect(minter).mint(mintAmt);
                expect(alchemist.connect(minter).withdraw(depositAmt, false)).revertedWith("Action blocked: unhealthy collateralization ratio");
            });

            it("reverts if ETH is sent when repaying with WETH", async () => {
              await alchemist.connect(minter).deposit(depositAmt, false);
              await alchemist.connect(minter).mint(mintAmt);
              expect(alchemist.connect(minter).repay(0, mintAmt, false, {value: mintAmt})).revertedWith("blackhole ETH");
            });
            
            it("deposits, mints, repays, and withdraws", async () => {
                let balBefore = await token.balanceOf(await minter.getAddress());
                await alchemist.connect(minter).deposit(depositAmt, false);
                await alchemist.connect(minter).mint(mintAmt);
                await alchemist.connect(minter).repay(0, mintAmt, false);
                await alchemist.connect(minter).withdraw(depositAmt, false);
                let balAfter = await token.balanceOf(await minter.getAddress());
                expect(balBefore).equal(balAfter);
            });
        
            it("deposits 5000 DAI, mints 1000 alUSD, and withdraws 3000 DAI", async () => {
                let withdrawAmt = depositAmt.sub(mintAmt.mul(2));
                await alchemist.connect(minter).deposit(depositAmt, false);
                await alchemist.connect(minter).mint(mintAmt);
                await alchemist.connect(minter).withdraw(withdrawAmt, false);
                expect(await token.balanceOf(await minter.getAddress())).equal(
                parseEther("13000")
                );
            });

            it("withdraws funds from the vault if needed", async () => {
                let withdrawAmt = depositAmt.sub(mintAmt.mul(2));
                await alchemist.connect(minter).deposit(depositAmt, false);
                await alchemist.connect(deployer).flush();
                await alchemist.connect(minter).mint(mintAmt);
                await alchemist.connect(minter).withdraw(withdrawAmt, false);
                expect(await token.balanceOf(await minter.getAddress())).equal(
                parseEther("13000")
                );
            });
        
            describe("flushActivator", async () => {
                beforeEach(async () => {
                    await alchemist.connect(governance).setFlushActivator(parseEther("1000"));
                    await token.connect(deployer).approve(alchemist.address, parseEther("1"));
                    await token.connect(deployer).deposit({value: parseEther("1")});
                    await token.connect(minter).deposit({value: parseEther("1000")});
                    await alchemist.connect(deployer).deposit(parseEther("1"), false);
                });
          
                it("deposit() flushes funds if amount >= flushActivator", async () => {
                    let balBeforeWhale = await token.balanceOf(adapter.address);
                    await alchemist.connect(minter).deposit(parseEther("1000"), false);
                    let balAfterWhale = await token.balanceOf(adapter.address);
                    expect(balBeforeWhale).equal(0);
                    expect(balAfterWhale).equal(parseEther("1001"));
                });
          
                it("deposit() does not flush funds if amount < flushActivator", async () => {
                    let balBeforeWhale = await token.balanceOf(adapter.address);
                    await alchemist.connect(minter).deposit(parseEther("999"), false);
                    let balAfterWhale = await token.balanceOf(adapter.address);
                    expect(balBeforeWhale).equal(0);
                    expect(balAfterWhale).equal(0);
                });
            })
        })

        describe("ETH", () => {
            beforeEach(async () => {
                await alchemist.connect(governance).setEmergencyExit(false);
                await alchemist.connect(governance).setKeepers([await deployer.getAddress()], [true])
                adapter = (await VaultAdapterMockFactory.connect(deployer).deploy(
                    token.address
                )) as VaultAdapterMock;
                await alchemist.connect(governance).initialize(adapter.address);
                await alchemist
                    .connect(governance)
                    .setCollateralizationLimit(collateralizationLimit);
                await alEth.connect(deployer).setWhitelist(alchemist.address, true);
                await alEth.connect(deployer).setCeiling(alchemist.address, ceilingAmt);
                await alEth.connect(minter).approve(alchemist.address, parseEther("100000000"));
            });
        
            it("deposited amount is accounted for correctly", async () => {
                await alchemist.connect(minter).deposit(depositAmt, true, {value: depositAmt});
                expect(
                    await alchemist
                    .connect(minter)
                    .getCdpTotalDeposited(await minter.getAddress())
                ).equal(depositAmt);
            });
        
            it("deposits token and then withdraws all", async () => {
                let balBefore = await minter.getBalance();
                await alchemist.connect(minter).deposit(depositAmt, true, {value: depositAmt});
                await alchemist.connect(minter).withdraw(depositAmt, true);
                let balAfter = await minter.getBalance();
                expect(balBefore.sub(balAfter)).lt(epsilon);
            });
        
            it("reverts when withdrawing too much", async () => {
                let overdraft = depositAmt.add(parseEther("1000"));
                await alchemist.connect(minter).deposit(depositAmt, true, {value: depositAmt});
                expect(alchemist.connect(minter).withdraw(overdraft, true)).revertedWith("SafeERC20: low-level call failed");
            });
        
            it("reverts when cdp is undercollateralized", async () => {
                await alchemist.connect(minter).deposit(depositAmt, true, {value: depositAmt});
                await alchemist.connect(minter).mint(mintAmt);
                expect(alchemist.connect(minter).withdraw(depositAmt, true)).revertedWith("Action blocked: unhealthy collateralization ratio");
            });

            it("reverts if ETH is sent when repaying with 0 ETH", async () => {
              await alchemist.connect(minter).deposit(depositAmt, false);
              await alchemist.connect(minter).mint(mintAmt);
              expect(alchemist.connect(minter).repay(0, mintAmt, true, {value: mintAmt})).revertedWith("blackhole ETH");
            });
                
            it("deposits, mints, repays, and withdraws", async () => {
                let balBefore = await minter.getBalance();
                await alchemist.connect(minter).deposit(depositAmt, true, {value: depositAmt});
                await alchemist.connect(minter).mint(mintAmt);
                await alchemist.connect(minter).repay(0, mintAmt, true, {value: 0});
                await alchemist.connect(minter).withdraw(depositAmt, true);
                let balAfter = await minter.getBalance();
                expect(balBefore.sub(balAfter)).lt(epsilon);
            });
        
            it("deposits 5000 DAI, mints 1000 alUSD, and withdraws 3000 DAI", async () => {
                let withdrawAmt = depositAmt.sub(mintAmt.mul(2));
                let balBefore = await minter.getBalance();
                await alchemist.connect(minter).deposit(depositAmt, true, {value: depositAmt});
                let balAfterDeposit = await minter.getBalance();
                await alchemist.connect(minter).mint(mintAmt);
                await alchemist.connect(minter).withdraw(withdrawAmt, true);
                let balAfterWithdrawl = await minter.getBalance();
                let amtWithdrawn = balAfterDeposit.sub(balAfterWithdrawl)
                expect(amtWithdrawn.sub(parseEther("3000"))).lt(epsilon);
            });

            it("withdraws funds from the vault if needed", async () => {
              let withdrawAmt = depositAmt.sub(mintAmt.mul(2));
              await alchemist.connect(minter).deposit(depositAmt, true, {value: depositAmt});
              await alchemist.connect(deployer).flush();
              let balAfterDeposit = await minter.getBalance();
              await alchemist.connect(minter).mint(mintAmt);
              await alchemist.connect(minter).withdraw(withdrawAmt, true);
              let balAfterWithdrawl = await minter.getBalance();
              let amtWithdrawn = balAfterDeposit.sub(balAfterWithdrawl)
              expect(amtWithdrawn.sub(parseEther("3000"))).lt(epsilon);
            });
        
            describe("flushActivator", async () => {
                beforeEach(async () => {
                    await alchemist.connect(governance).setFlushActivator(parseEther("1000"));
                    await token.connect(deployer).approve(alchemist.address, parseEther("1"));
                    await token.connect(deployer).deposit({value: parseEther("1")});
                    await token.connect(minter).deposit({value: parseEther("1000")});
                    await alchemist.connect(deployer).deposit(parseEther("1"), true, {value: parseEther("1")});
                });
        
                it("depositEth() flushes funds if amount >= flushActivator", async () => {
                    let balBeforeWhale = await token.balanceOf(adapter.address);
                    let alchBalBefore = await token.balanceOf(alchemist.address);
                    await alchemist.connect(minter).deposit(parseEther("1000"), true, {value: parseEther("1000")});
                    let balAfterWhale = await token.balanceOf(adapter.address);
                    let alchBalAfter = await token.balanceOf(alchemist.address);
                    expect(balBeforeWhale).equal(0);
                    expect(balAfterWhale).equal(parseEther("1001"));
                });
        
                it("depositEth() does not flush funds if amount < flushActivator", async () => {
                    let balBeforeWhale = await token.balanceOf(adapter.address);
                    await alchemist.connect(minter).deposit(parseEther("999"), true, {value: parseEther("999")});
                    let balAfterWhale = await token.balanceOf(adapter.address);
                    expect(balBeforeWhale).equal(0);
                    expect(balAfterWhale).equal(0);
                });
            })
        })
    });

    describe("repay and liquidate tokens", () => {
      let depositAmt = parseEther("5000");
      let mintAmt = parseEther("1000");
      let ceilingAmt = parseEther("10000");
      let collateralizationLimit = "2000000000000000000"; // this should be set in the deploy sequence

      describe("WETH", () => {
        beforeEach(async () => {
          await alchemist.connect(governance).setEmergencyExit(false);
          await alchemist.connect(governance).setKeepers([await deployer.getAddress()], [true])
          adapter = (await VaultAdapterMockFactory.connect(deployer).deploy(
            token.address
          )) as VaultAdapterMock;
          await alchemist.connect(governance).initialize(adapter.address);
          await alchemist
            .connect(governance)
            .setCollateralizationLimit(collateralizationLimit);
          await alEth.connect(deployer).setWhitelist(alchemist.address, true);
          await alEth.connect(deployer).setCeiling(alchemist.address, ceilingAmt);
          await token.connect(minter).deposit({value: ceilingAmt});
          await token.connect(minter).approve(alchemist.address, ceilingAmt);
          await alEth.connect(minter).approve(alchemist.address, parseEther("100000000"));
          await token.connect(minter).approve(transmuterContract.address, ceilingAmt);
          await alEth.connect(minter).approve(transmuterContract.address, depositAmt);
        });
        it("repay with dai reverts when repayment amount is greater than debt", async () => {
          await alchemist.connect(minter).deposit(depositAmt.sub(parseEther("1000")), false)
          expect(alchemist.connect(minter).repay(mintAmt, 0, false)).revertedWith("SafeMath: subtraction overflow")
        })
        it("liquidate max amount possible if trying to liquidate too much", async () => {
          let liqAmt = depositAmt;
          await alchemist.connect(minter).deposit(depositAmt, false);
          await alchemist.connect(minter).mint(mintAmt);
          await transmuterContract.connect(minter).stake(mintAmt);
          await alchemist.connect(minter).liquidate(liqAmt);
          const transBal = await token.balanceOf(transmuterContract.address);
          expect(transBal).equal(mintAmt);
        })
        it("liquidates funds from vault if not enough in the buffer", async () => {
          let liqAmt = parseEther("600");
          await alchemist.connect(minter).deposit(depositAmt, false);
          await alchemist.connect(deployer).flush();
          await alchemist.connect(minter).deposit(mintAmt.div(2), false);
          await alchemist.connect(minter).mint(mintAmt);
          await transmuterContract.connect(minter).stake(mintAmt);
          const alchemistTokenBalPre = await token.balanceOf(alchemist.address);
          await alchemist.connect(minter).liquidate(liqAmt);
          const alchemistTokenBalPost = await token.balanceOf(alchemist.address);
          const transmuterEndingTokenBal = await token.balanceOf(transmuterContract.address);
          expect(alchemistTokenBalPost).equal(0);
          expect(transmuterEndingTokenBal).equal(liqAmt);
        })
        it("liquidates the minimum necessary from the alchemist buffer", async () => {
          let dep2Amt = parseEther("50");
          let liqAmt = parseEther("20");
          await alchemist.connect(minter).deposit(parseEther("200"), false);
          await alchemist.connect(deployer).flush();
          await alchemist.connect(minter).deposit(dep2Amt, false);
          await alchemist.connect(minter).mint(parseEther("100"));
          await transmuterContract.connect(minter).stake(parseEther("100"));
          let alchemistTokenBalPre = await token.balanceOf(alchemist.address);
          await alchemist.connect(minter).liquidate(liqAmt);
          let alchemistTokenBalPost = await token.balanceOf(alchemist.address);
          let transmuterEndingTokenBal = await token.balanceOf(transmuterContract.address);
          expect(alchemistTokenBalPre).equal(dep2Amt);
          expect(alchemistTokenBalPost).equal(dep2Amt.sub(liqAmt));
          expect(transmuterEndingTokenBal).equal(liqAmt);
        })
        it("deposits, mints alEth, repays, and has no outstanding debt", async () => {
          await alchemist.connect(minter).deposit(depositAmt.sub(parseEther("1000")), false);
          await alchemist.connect(minter).mint(mintAmt);
          await transmuterContract.connect(minter).stake(mintAmt);
          await alchemist.connect(minter).repay(mintAmt, 0, false);
          expect(await alchemist.connect(minter).getCdpTotalDebt(await minter.getAddress())).equal(0)
        })
        it("deposits, mints, repays, and has no outstanding debt", async () => {
          await alchemist.connect(minter).deposit(depositAmt, false);
          await alchemist.connect(minter).mint(mintAmt);
          await alchemist.connect(minter).repay(0, mintAmt, false);
          expect(
            await alchemist
              .connect(minter)
              .getCdpTotalDebt(await minter.getAddress())
          ).equal(0);
        });
        it("deposits, mints alEth, repays with alEth and DAI, and has no outstanding debt", async () => {
          await alchemist.connect(minter).deposit(depositAmt.sub(parseEther("1000")), false);
          await alchemist.connect(minter).mint(mintAmt);
          await transmuterContract.connect(minter).stake(parseEther("500"));
          await alchemist.connect(minter).repay(parseEther("500"), parseEther("500"), false);
          expect(await alchemist.connect(minter).getCdpTotalDebt(await minter.getAddress())).equal(0)
        })
  
        it("deposits and liquidates DAI", async () => {
          await alchemist.connect(minter).deposit(depositAmt, false);
          await alchemist.connect(minter).mint(mintAmt);
          await transmuterContract.connect(minter).stake(mintAmt);
          await alchemist.connect(minter).liquidate(mintAmt);
          expect( await alchemist.connect(minter).getCdpTotalDeposited(await minter.getAddress())).equal(depositAmt.sub(mintAmt))
        });
      })

      describe("ETH", () => {
        beforeEach(async () => {
          await alchemist.connect(governance).setEmergencyExit(false);
          await alchemist.connect(governance).setKeepers([await deployer.getAddress()], [true])
          adapter = (await VaultAdapterMockFactory.connect(deployer).deploy(
            token.address
          )) as VaultAdapterMock;
          await alchemist.connect(governance).initialize(adapter.address);
          await alchemist
            .connect(governance)
            .setCollateralizationLimit(collateralizationLimit);
          await alEth.connect(deployer).setWhitelist(alchemist.address, true);
          await alEth.connect(deployer).setCeiling(alchemist.address, ceilingAmt);
          await alEth.connect(minter).approve(alchemist.address, parseEther("100000000"));
          await alEth.connect(minter).approve(transmuterContract.address, depositAmt);
        });
        it("repay with dai reverts when repayment amount is greater than debt", async () => {
          await alchemist.connect(minter).deposit(depositAmt.sub(parseEther("1000")), true, {value: depositAmt.sub(parseEther("1000"))})
          expect(alchemist.connect(minter).repay(mintAmt, 0, true, {value: mintAmt})).revertedWith("SafeMath: subtraction overflow")
        })
        it("liquidate max amount possible if trying to liquidate too much", async () => {
          let liqAmt = depositAmt;
          await alchemist.connect(minter).deposit(depositAmt, true, {value: depositAmt});
          await alchemist.connect(minter).mint(mintAmt);
          await transmuterContract.connect(minter).stake(mintAmt);
          await alchemist.connect(minter).liquidate(liqAmt);
          const transBal = await token.balanceOf(transmuterContract.address);
          expect(transBal).equal(mintAmt);
        })
        it("liquidates funds from vault if not enough in the buffer", async () => {
          let liqAmt = parseEther("600");
          await alchemist.connect(minter).deposit(depositAmt, true, {value: depositAmt});
          await alchemist.connect(deployer).flush();
          await alchemist.connect(minter).deposit(mintAmt.div(2), true, {value: mintAmt.div(2)});
          await alchemist.connect(minter).mint(mintAmt);
          await transmuterContract.connect(minter).stake(mintAmt);
          const alchemistTokenBalPre = await token.balanceOf(alchemist.address);
          await alchemist.connect(minter).liquidate(liqAmt);
          const alchemistTokenBalPost = await token.balanceOf(alchemist.address);
          const transmuterEndingTokenBal = await token.balanceOf(transmuterContract.address);
          expect(alchemistTokenBalPost).equal(0);
          expect(transmuterEndingTokenBal).equal(liqAmt);
        })
        it("liquidates the minimum necessary from the alchemist buffer", async () => {
          let dep2Amt = parseEther("50");
          let liqAmt = parseEther("20");
          await alchemist.connect(minter).deposit(parseEther("200"), true, {value: parseEther("200")});
          await alchemist.connect(deployer).flush();
          await alchemist.connect(minter).deposit(dep2Amt, true, {value: dep2Amt});
          await alchemist.connect(minter).mint(parseEther("100"));
          await transmuterContract.connect(minter).stake(parseEther("100"));
          let alchemistTokenBalPre = await token.balanceOf(alchemist.address);
          await alchemist.connect(minter).liquidate(liqAmt);
          let alchemistTokenBalPost = await token.balanceOf(alchemist.address);
          let transmuterEndingTokenBal = await token.balanceOf(transmuterContract.address);
          expect(alchemistTokenBalPre).equal(dep2Amt);
          expect(alchemistTokenBalPost).equal(dep2Amt.sub(liqAmt));
          expect(transmuterEndingTokenBal).equal(liqAmt);
        })
        it("deposits, mints alEth, repays, and has no outstanding debt", async () => {
          await alchemist.connect(minter).deposit(depositAmt.sub(parseEther("1000")), true, {value: depositAmt.sub(parseEther("1000"))});
          await alchemist.connect(minter).mint(mintAmt);
          await transmuterContract.connect(minter).stake(mintAmt);
          await alchemist.connect(minter).repay(mintAmt, 0, true, {value: mintAmt});
          expect(await alchemist.connect(minter).getCdpTotalDebt(await minter.getAddress())).equal(0)
        })
        it("deposits, mints, repays, and has no outstanding debt", async () => {
          await alchemist.connect(minter).deposit(depositAmt, true, {value: depositAmt});
          await alchemist.connect(minter).mint(mintAmt);
          await alchemist.connect(minter).repay(0, mintAmt, true, {value: 0});
          expect(
            await alchemist
              .connect(minter)
              .getCdpTotalDebt(await minter.getAddress())
          ).equal(0);
        });
        it("deposits, mints alEth, repays with alEth and ETH, and has no outstanding debt", async () => {
          await alchemist.connect(minter).deposit(depositAmt.sub(parseEther("1000")), false);
          await alchemist.connect(minter).mint(mintAmt);
          await transmuterContract.connect(minter).stake(parseEther("500"));
          await alchemist.connect(minter).repay(parseEther("500"), parseEther("500"), true, {value: parseEther("500")});
          expect(await alchemist.connect(minter).getCdpTotalDebt(await minter.getAddress())).equal(0)
        })
  
        it("deposits and liquidates DAI", async () => {
          await alchemist.connect(minter).deposit(depositAmt, false);
          await alchemist.connect(minter).mint(mintAmt);
          await transmuterContract.connect(minter).stake(mintAmt);
          await alchemist.connect(minter).liquidate(mintAmt);
          expect( await alchemist.connect(minter).getCdpTotalDeposited(await minter.getAddress())).equal(depositAmt.sub(mintAmt))
        });
      })
    });

    describe("mint", () => {
      let depositAmt = parseEther("5000");
      let mintAmt = parseEther("1000");
      let ceilingAmt = parseEther("1000");

      beforeEach(async () => {
        await alchemist.connect(governance).setEmergencyExit(false);
        await alchemist.connect(governance).setKeepers([await deployer.getAddress()], [true]);
        adapter = (await VaultAdapterMockFactory.connect(deployer).deploy(
          token.address
        )) as VaultAdapterMock;

        await alchemist.connect(governance).initialize(adapter.address);

        await alEth.connect(deployer).setCeiling(alchemist.address, ceilingAmt);
        await token.connect(minter).deposit({value: depositAmt});
        await token.connect(minter).approve(alchemist.address, depositAmt);
      });

      it("reverts if the Alchemist is not whitelisted", async () => {
        await alchemist.connect(minter).deposit(depositAmt, false);
        expect(alchemist.connect(minter).mint(mintAmt)).revertedWith(
          "AlETH: Alchemist is not whitelisted"
        );
      });

      context("is whiltelisted", () => {
        beforeEach(async () => {
          await alEth.connect(deployer).setWhitelist(alchemist.address, true);
        });

        it("reverts if the Alchemist is paused", async () => {
          await alEth.connect(deployer).pauseAlchemist(alchemist.address, true);
          await alchemist.connect(minter).deposit(depositAmt, false);
          expect(alchemist.connect(minter).mint(mintAmt)).revertedWith(
            "AlETH: Alchemist is currently paused."
          );
        });
  
        it("reverts when trying to mint too much", async () => {
          expect(alchemist.connect(minter).mint(parseEther("2000"))).revertedWith(
            "Loan-to-value ratio breached"
          );
        });
  
        it("reverts if the ceiling was breached", async () => {
          let lowCeilingAmt = parseEther("100");
          await alEth
            .connect(deployer)
            .setCeiling(alchemist.address, lowCeilingAmt);
          await alchemist.connect(minter).deposit(depositAmt, false);
          expect(alchemist.connect(minter).mint(mintAmt)).revertedWith(
            "AlETH: Alchemist's ceiling was breached"
          );
        });
  
        it("mints successfully to depositor", async () => {
          let balBefore = await token.balanceOf(await minter.getAddress());
          await alchemist.connect(minter).deposit(depositAmt, false);
          await alchemist.connect(minter).mint(mintAmt);
          let balAfter = await token.balanceOf(await minter.getAddress());
  
          expect(balAfter).equal(balBefore.sub(depositAmt));
          expect(await alEth.balanceOf(await minter.getAddress())).equal(mintAmt);
        });

        it("reduces credit if user has credit", async () => {
          await alchemist.connect(minter).deposit(depositAmt, false);
          let mintAmt = parseEther("100");

          // harvest yield to produce credit
          let deployerDepositAmt = parseEther("1000")
          let yieldAmt = parseEther("500");
          await token.connect(deployer).deposit({value: yieldAmt});
          await token.connect(deployer).transfer(adapter.address, yieldAmt);
          await alchemist.connect(deployer).deposit(deployerDepositAmt, true, {value: deployerDepositAmt})
          await alchemist.connect(deployer).mint(deployerDepositAmt.div(4))
          await alchemist.connect(deployer).harvest(0);
          let creditAfterHarvest = await alchemist.getCdpTotalCredit(await minter.getAddress())

          await alchemist.connect(minter).mint(mintAmt);
          let creditAfterMint = await alchemist.getCdpTotalCredit(await minter.getAddress())
  
          expect(creditAfterMint).equal(creditAfterHarvest.sub(mintAmt));
        });

        it("changing the min-c-ratio allows the user to borrow more", async () => {
          let depositAmount = parseEther("500")
          let mintAmount = depositAmount.div(4)
          await alchemist.connect(minter).deposit(depositAmount, false);
          await alchemist.connect(minter).mint(mintAmount)
          expect(alchemist.connect(minter).mint(mintAmount)).revertedWith("Alchemist: Loan-to-value ratio breached")

          await alchemist.connect(governance).setCollateralizationLimit("2000000000000000000")
          await alchemist.connect(minter).mint(mintAmount);
          let balAfter = await alEth.balanceOf(await minter.getAddress());
          expect(balAfter).equal(depositAmount.div(2));
        });
      });
    });

    describe("harvest", () => {
      let depositAmt = parseEther("5000");
      let mintAmt = parseEther("1000");
      let stakeAmt = mintAmt.div(2);
      let ceilingAmt = parseEther("10000");
      let yieldAmt = parseEther("100");

      beforeEach(async () => {
        await alchemist.connect(governance).setEmergencyExit(false);
        await alchemist.connect(governance).setKeepers([await deployer.getAddress()], [true])
        adapter = (await VaultAdapterMockFactory.connect(deployer).deploy(
          token.address
        )) as VaultAdapterMock;

        await alEth.connect(deployer).setWhitelist(alchemist.address, true);
        await alchemist.connect(governance).initialize(adapter.address);
        await alEth.connect(deployer).setCeiling(alchemist.address, ceilingAmt);
        await token.connect(minter).deposit({value: depositAmt});
        await token.connect(minter).approve(alchemist.address, depositAmt);
        await alEth.connect(minter).approve(transmuterContract.address, depositAmt);
        await alchemist.connect(minter).deposit(depositAmt, false);
        await alchemist.connect(minter).mint(mintAmt);
        await transmuterContract.connect(minter).stake(stakeAmt);
        await alchemist.connect(deployer).flush();
      });

      it("reverts if the caller is not whitelisted", async () => {
        expect(alchemist.connect(minter).harvest(0)).revertedWith("Alchemist: only keepers.")
      })

      it("harvests yield from the vault", async () => {
        await token.connect(deployer).deposit({value: yieldAmt});
        await token.connect(deployer).transfer(adapter.address, yieldAmt);
        await alchemist.connect(deployer).harvest(0);
        let transmuterBal = await token.balanceOf(transmuterContract.address);
        expect(transmuterBal).equal(yieldAmt.sub(yieldAmt.div(pctReso/harvestFee)));
        let vaultBal = await token.balanceOf(adapter.address);
        expect(vaultBal).equal(depositAmt);
      })

      it("sends the harvest fee to the rewards address", async () => {
        await token.connect(deployer).deposit({value: yieldAmt});
        await token.connect(deployer).transfer(adapter.address, yieldAmt);
        await alchemist.connect(deployer).harvest(0);
        let rewardsBal = await token.balanceOf(await rewards.getAddress());
        expect(rewardsBal).equal(yieldAmt.mul(100).div(harvestFee));
      })

      it("does not update any balances if there is nothing to harvest", async () => {
        let initTransBal = await token.balanceOf(transmuterContract.address);
        let initRewardsBal = await token.balanceOf(await rewards.getAddress());
        await alchemist.connect(deployer).harvest(0);
        let endTransBal = await token.balanceOf(transmuterContract.address);
        let endRewardsBal = await token.balanceOf(await rewards.getAddress());
        expect(initTransBal).equal(endTransBal);
        expect(initRewardsBal).equal(endRewardsBal);
      })
    })

    describe("convert", () => {
      let convertAmt = parseEther("500");
      let ceilingAmt = parseEther("1000");
      let epsilon = parseEther(".1") // margin of difference for gas

      beforeEach(async () => {
        await alchemist.connect(governance).setEmergencyExit(false);
        await alchemist.connect(governance).setKeepers([await deployer.getAddress()], [true]);
        adapter = (await VaultAdapterMockFactory.connect(deployer).deploy(
          token.address
        )) as VaultAdapterMock;

        await alchemist.connect(governance).initialize(adapter.address);

        await alEth.connect(deployer).setCeiling(alchemist.address, ceilingAmt);
      });

      beforeEach(async () => {
        await alEth.connect(deployer).setWhitelist(alchemist.address, true);
        await token.connect(minter).deposit({value: convertAmt})
        await token.connect(deployer).deposit({value: convertAmt})
        await token.connect(minter).approve(alchemist.address, convertAmt);
        await token.connect(deployer).approve(alchemist.address, convertAmt);
      });

      it("reverts if the Alchemist convert call is paused", async () => {
        expect(alchemist.connect(minter).convert(convertAmt, false)).revertedWith(
          "Alchemist: conversions are paused."
        );
      });

      context("convert() is unpaused", () => {
        beforeEach(async () => {
          await alchemist.connect(governance).setPauseConvert(false);
        })

        it("reverts if the Alchemist is paused", async () => {
          await alEth.connect(deployer).pauseAlchemist(alchemist.address, true);
          expect(alchemist.connect(minter).convert(convertAmt, false)).revertedWith(
            "AlETH: Alchemist is currently paused."
          );
        });
  
        it("reverts if ETH is sent with the convert() call", async () => {
          expect(alchemist.connect(minter).convert(convertAmt, false, {value: convertAmt})).revertedWith(
            "msg.value != 0"
          );
        });
  
        it("does not revert if the ceiling was breached", async () => {
          let lowCeilingAmt = parseEther("100");
          await alEth.connect(deployer).setCeiling(alchemist.address, lowCeilingAmt);
          await alchemist.connect(minter).convert(convertAmt, false)
          // test passes if does not revert
        });
  
        it("mints successfully to depositor (ETH input)", async () => {
          let balBefore = await minter.getBalance();
          await alchemist.connect(minter).convert(convertAmt, true, {value: convertAmt});
          let balAfter = await minter.getBalance();
  
          expect(balAfter.sub(balBefore.sub(convertAmt))).lt(epsilon);
          expect(await alEth.balanceOf(await minter.getAddress())).equal(convertAmt);
        });
  
        it("mints successfully to depositor (WETH input)", async () => {
          let balBefore = await token.balanceOf(await minter.getAddress());
          await alchemist.connect(minter).convert(convertAmt, false);
          let balAfter = await token.balanceOf(await minter.getAddress());
  
          expect(balAfter).equal(balBefore.sub(convertAmt));
          expect(await alEth.balanceOf(await minter.getAddress())).equal(convertAmt);
        });
  
        it("user's credit and debt do not change", async () => {
          // harvest yield to produce credit
          let deployerDepositAmt = parseEther("100")
          let yieldAmt = parseEther("500");
          await token.connect(deployer).deposit({value: yieldAmt});
          await token.connect(deployer).transfer(adapter.address, yieldAmt);
          await alchemist.connect(deployer).deposit(deployerDepositAmt, true, {value: deployerDepositAmt})
          await alchemist.connect(deployer).mint(deployerDepositAmt.div(4))
          await alchemist.connect(deployer).harvest(0);
  
          let creditBeforeConvert = await alchemist.getCdpTotalCredit(await minter.getAddress())
          let debtBeforeConvert = await alchemist.getCdpTotalCredit(await minter.getAddress())
          await alchemist.connect(minter).convert(convertAmt, false)
          let creditAfterConvert = await alchemist.getCdpTotalCredit(await minter.getAddress())
          let debtAfterConvert = await alchemist.getCdpTotalCredit(await minter.getAddress())
  
          expect(creditAfterConvert).equal(creditBeforeConvert);
          expect(debtAfterConvert).equal(debtBeforeConvert);
        });
  
        it("deposited funds get sent to the transmuter", async () => {
          let balBefore = await token.balanceOf(transmuterContract.address);
          await alchemist.connect(minter).convert(convertAmt, false);
          let balAfter = await token.balanceOf(transmuterContract.address);
          expect(balBefore).equal(0)
          expect(balAfter).equal(convertAmt);
        });

      })


    });
  });
});
