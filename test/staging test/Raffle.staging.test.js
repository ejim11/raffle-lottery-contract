const { getNamedAccounts, deployments, ethers, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Staging Tests", async function () {
          let raffle, entranceFee, deployer

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer

              raffle = await ethers.getContract("Raffle", deployer)

              entranceFee = await raffle.getEntranceFee()
          })

          describe("fulfillRandomWords", function () {
              it("works with live chainlink keepers and chainlink vrf, we get a random winner", async function () {
                  // enter the raffle
                  const startingTimeStamp = await raffle.getLastTimeStamp()

                  const accounts = await ethers.getSigners()

                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          try {
                              const recentWinner = await raffle.getRecentWinner()

                              const raffleState = await raffle.getRaffleState()

                              const winnerEndingBalance = await accounts[0].getBalance()

                              const endingTimeStamp = await raffle.getLastTimeStamp()

                              await expect(raffle.getPlayer(0)).to.be.reverted

                              assert.equal(recentWinner.toString(), accounts[0].address)

                              assert.equal(raffleState.toString(), "0")

                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(entranceFee).toString()
                              )

                              assert(endingTimeStamp > startingTimeStamp)

                              resolve()
                          } catch (e) {
                              reject(e)
                          }
                      })

                      //   setup listener before we enter the raffle
                      //  just incase the blockchain moves really quick

                      const txResponse = await raffle.enterRaffle({ value: entranceFee })

                      const txReciept = await txResponse.wait(1)

                      const { gasUsed, effectiveGasPrice } = txReciept

                      gasCost = gasUsed.mul(effectiveGasPrice)

                      const winnerStartingBalance = await accounts[0].getBalance()
                  })
              })
          })
      })
