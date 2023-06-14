const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", async function () {
          let raffle, vrfCoordinatorV2Mock, entranceFee, deployer, interval, subscriptionId

          const chainId = network.config.chainId

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer

              await deployments.fixture(["all"])

              raffle = await ethers.getContract("Raffle", deployer)

              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)

              subscriptionId = await raffle.getSubscriptionId()

              await vrfCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address)

              entranceFee = await raffle.getEntranceFee()

              interval = await raffle.getInterval()
          })

          describe("Constructor", function () {
              it("should initialize the raffle contract correctly", async function () {
                  const raffleState = await raffle.getRaffleState()
                  assert.equal(raffleState.toString(), "0")

                  assert.equal(interval.toString(), networkConfig[chainId]["interval"])

                  const gasLane = await raffle.getGaslane()
                  assert.equal(gasLane.toString(), networkConfig[chainId]["gasLane"])
              })
          })

          describe("Enter Raffle", function () {
              it("should revert if enough ethereum is not sent", async function () {
                  expect(raffle.enterRaffle()).to.be.revertedWith("Raffle__NotEnoughETHEntered")
              })

              it("should enter players when they enter raffle", async function () {
                  // entered the raffle
                  await raffle.enterRaffle({ value: entranceFee })

                  const firstPlayer = await raffle.getPlayer(0)
                  assert.equal(firstPlayer, deployer)
              })

              it("should emit an event when raffle is entered", async function () {
                  expect(await raffle.enterRaffle({ value: entranceFee })).to.emit(
                      "Raffle",
                      "RaffleEnter"
                  )
              })

              it("should not allow entrance when raffle is not open", async function () {
                  // enter raffle
                  await raffle.enterRaffle({ value: entranceFee })

                  //   increase time
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])

                  //   mine block
                  await network.provider.send("evm_mine", [])

                  //   we pretend to be a chainlink keeper
                  await raffle.performUpkeep([])

                  await expect(raffle.enterRaffle({ value: entranceFee })).to.be.revertedWith(
                      "Raffle__NotOpen"
                  )
              })
          })

          describe("CheckUpkeep", function () {
              it("should return false if people haven't sent any ETH", async function () {
                  //   increase time
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])

                  //   mine block
                  await network.provider.send("evm_mine", [])

                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])

                  assert(!upkeepNeeded)
              })

              it("should return false if raffle is not open", async function () {
                  // enter raffle
                  await raffle.enterRaffle({ value: entranceFee })

                  //   increase time
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])

                  //   mine block
                  await network.provider.send("evm_mine", [])

                  //   we pretend to be a chainlink keeper
                  await raffle.performUpkeep([])

                  const raffleState = await raffle.getRaffleState()

                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])

                  assert.equal(raffleState.toString(), "1")

                  assert.equal(upkeepNeeded, false)
              })

              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: entranceFee })

                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 5])

                  await network.provider.request({ method: "evm_mine", params: [] })

                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])

                  // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)

                  assert(!upkeepNeeded)
              })

              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: entranceFee })

                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])

                  await network.provider.request({ method: "evm_mine", params: [] })

                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])

                  // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)

                  assert(upkeepNeeded)
              })
          })

          describe("PerformUpkeep", function () {
              it("it can only run if checkUpkeep is true", async function () {
                  await raffle.enterRaffle({ value: entranceFee })

                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])

                  await network.provider.request({ method: "evm_mine", params: [] })

                  const tx = await raffle.performUpkeep([])

                  assert(tx)
              })

              it("should revert if checkUpkeep is false", async function () {
                  await expect(raffle.performUpkeep([])).to.be.revertedWith(
                      "Raffle__UpkeepNotNeeded"
                  )
              })

              it("should update the raffle state, emit an event and calls the vrf coordinator", async function () {
                  await raffle.enterRaffle({ value: entranceFee })

                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])

                  await network.provider.request({ method: "evm_mine", params: [] })

                  const txResponse = await raffle.performUpkeep([])

                  const txReciept = await txResponse.wait(1)

                  const requestId = txReciept.events[1].args.requestId

                  const raffleState = await raffle.getRaffleState()

                  assert(requestId.toNumber() > 0)

                  assert.equal(raffleState.toString(), "1")
              })
          })

          describe("FulfillRandomWords", function () {
              beforeEach(async function () {
                  await raffle.enterRaffle({ value: entranceFee })

                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])

                  await network.provider.request({ method: "evm_mine", params: [] })
              })

              it("can only be called after performUpkeep", async function () {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                  ).to.be.revertedWith("nonexistent request")

                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
              })

              it("picks a winner, resets the lottery and sends money", async function () {
                  const additionalEntrants = 3
                  const startingAccountIndex = 1
                  const accounts = await ethers.getSigners()

                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedRaffle = raffle.connect(accounts[i])

                      console.log(accounts[i].address)

                      await accountConnectedRaffle.enterRaffle({ value: entranceFee })
                  }

                  const startingTimeStamp = await raffle.getLastTimeStamp()

                  // performupKeeep (mock being chainlink keepers)
                  // fulfillRandomWords (mockk being the chainlink vrf)
                  // we will have to wait for the fulfillRandomWords to be called (simulate)

                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("Found the event")
                          try {
                              const recentWinner = await raffle.getRecentWinner()

                              console.log(recentWinner)

                              const raffleState = await raffle.getRaffleState()

                              const endingTimeStamp = await raffle.getLastTimeStamp()

                              const numPlayers = await raffle.getNumberOfPlayers()

                              const winnerEndingBalance = await accounts[1].getBalance()

                              assert.equal(numPlayers.toString(), "0")

                              assert.equal(raffleState.toString(), "0")

                              assert(endingTimeStamp > startingTimeStamp)

                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(
                                      entranceFee
                                          .mul(additionalEntrants)
                                          .add(entranceFee)
                                          .toString()
                                  )
                              )

                              resolve()
                          } catch (e) {
                              reject(e)
                          }
                      })

                      const tx = await raffle.performUpkeep([])
                      const txReceipt = await tx.wait(1)

                      const winnerStartingBalance = await accounts[1].getBalance()

                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address
                      )
                  })
              })
          })
      })
