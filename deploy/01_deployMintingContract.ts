import { BigNumber } from "ethers";
import { ethers, network } from "hardhat";
import { verify } from "../helper-functions";
import { DeployFunction } from "hardhat-deploy/dist/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import {
  developmentChains,
  networkConfig,
  VERIFICATION_BLOCK_CONFIRMATIONS,
} from "../config";
import { VRFCoordinatorV2Mock } from "../typechain";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  const { deploy, log } = deployments;

  const chainId = hre.network.config.chainId;
  if (!chainId) return;
  let subscriptionId: BigNumber;
  let vrfCoordinatorAddr: string | undefined;
  let VRFCoordinatorV2Mock: VRFCoordinatorV2Mock;

  if (chainId === 31337) {
    const VRFCoordinatorV2MockDepl = await deployments.get(
      "VRFCoordinatorV2Mock"
    );
    VRFCoordinatorV2Mock = await ethers.getContractAt(
      "VRFCoordinatorV2Mock",
      VRFCoordinatorV2MockDepl.address
    );

    const fundAmount = networkConfig[chainId].fundAmount;
    const transaction = await VRFCoordinatorV2Mock.createSubscription();
    const transactionReceipt = await transaction.wait(1);
    if (!transactionReceipt.events) return;
    subscriptionId = ethers.BigNumber.from(
      transactionReceipt.events[0].topics[1]
    );
    await VRFCoordinatorV2Mock.fundSubscription(subscriptionId, fundAmount);
    vrfCoordinatorAddr = VRFCoordinatorV2Mock.address;
  } else {
    vrfCoordinatorAddr = networkConfig[chainId].vrfCoordinator;
    subscriptionId = BigNumber.from(process.env.VRF_SUBSCRIPTION_ID);
  }

  const waitBlockConfirmations = developmentChains.includes(network.name)
    ? 1
    : VERIFICATION_BLOCK_CONFIRMATIONS;

  const args = ["VRFMinting", "VRFM", 3333, vrfCoordinatorAddr, subscriptionId];

  const vrfMintingContract = await deploy("VRFMinting", {
    from: deployer,
    args: args,
    log: true,
    waitConfirmations: waitBlockConfirmations,
  });

  if (chainId === 31337) {
    //@ts-ignore
    await VRFCoordinatorV2Mock.addConsumer(
      subscriptionId,
      vrfMintingContract.address
    );
  }

  if (
    (!developmentChains.includes(network.name) &&
      process.env.POLYGONSCAN_API_KEY) ||
    process.env.ETHERSCAN_API_KEY
  ) {
    log("Verifying...", process.env.POLYGONSCAN_API_KEY);
    await verify(
      vrfMintingContract.address,
      args,
      "contracts/VRFMinting.sol:VRFMinting"
    );
  }
};

export default func;

func.tags = ["VRFMinting"];
