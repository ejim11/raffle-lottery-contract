const { developmentChains } = require("../helper-hardhat-config")
const { network, ethers } = require("hardhat")

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()

    const BASE_FEE = ethers.utils.parseEther("0.25") // it costs 0.25 Link per request
    const GAS_PRICE_LINK = 1e9 //link per gas

    if (developmentChains.includes(network.name)) {
        log("Local network detected! Deploying mocks...")
        //  deploy a mock vrfCoordinator..
        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            log: true,
            args: [BASE_FEE, GAS_PRICE_LINK],
        })

        log("Mocks Deployed!")
        log("------------------")
    }
}

module.exports.tags = ["all", "mocks"]
