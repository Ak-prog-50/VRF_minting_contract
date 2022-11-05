import { DeployFunction } from "hardhat-deploy/types"
import { getNamedAccounts, deployments, network } from "hardhat"

const deployFunction: DeployFunction = async () => {
  const POINT_ONE_LINK: string = `100000000000000000`

  const { deploy, log } = deployments
  const { deployer } = await getNamedAccounts()
  const chainId: number | undefined = network.config.chainId

  if (chainId === 31337) {
    log(`Local network detected! Deploying mocks...`)

    await deploy("VRFCoordinatorV2Mock", {
      from: deployer,
      log: true,
      args: [
        POINT_ONE_LINK,
        1e9, // 0.000000001 LINK per gas
      ],
    })

    log(`Mocks Deployed!`)
  }
}

export default deployFunction
deployFunction.tags = [ `mocks`]