import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { deployments, ethers } from "hardhat";
import { VRFMinting, VRFCoordinatorV2Mock } from "../typechain";

export const POINT_ONE_LINK = `100000000000000000`;
export const LINK_PER_GAS = 1e9; // 0.000000001 LINK per gas

describe("Test Randomness Request/Recieve", function () {
  let owner: SignerWithAddress;
  let vrfCoordinatorV2Mock: VRFCoordinatorV2Mock;
  let vrfMinting: VRFMinting;

  before(async function () {
    [owner] = await ethers.getSigners();
  });

  beforeEach(async function () {
    await deployments.fixture(["mocks", "VRFMinting"]);
    vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");
    vrfMinting = await ethers.getContract("VRFMinting");
  });

  it("Should request randomness: VRFCoordinator event", async function () {
    await expect(vrfMinting.requestRandomness()).to.emit(
      vrfCoordinatorV2Mock,
      "RandomWordsRequested"
    );
  });

  it("Should request randomness: VRFMinting Contract event", async function () {
    await expect(vrfMinting.requestRandomness()).to.emit(
      vrfMinting,
      "RandomnessRequestSent"
    );
    const requestId = await vrfMinting.addressToRequestId(owner.address);
    console.log("requestId", requestId);
    console.log(await vrfMinting.requestIdToRequestStatus(requestId));
    console.log(await vrfMinting.getRandomnessRequestState(owner.address));
  });

  it("Should request randomness and get a result", async function () {
    const tx = await vrfMinting.requestRandomness();
    const txReceipt = await tx.wait(1);
    if (!txReceipt.events) return;
    //TODO: get the requestId from the event
    const requestId = await vrfMinting.addressToRequestId(owner.address);
    console.log("requestId", requestId);

    // simulate callback from the oracle network
    await expect(
      vrfCoordinatorV2Mock.fulfillRandomWords(requestId, vrfMinting.address)
    ).to.emit(vrfMinting, "RandomnessRequestFulfilled");
    console.log(await vrfMinting.requestIdToRequestStatus(requestId));
    const randomnessRequestState = await vrfMinting.getRandomnessRequestState(
      owner.address
    );
    console.log(randomnessRequestState[2]);
    expect(randomnessRequestState[0]).to.equal(true);
  });

  it("Should successfully fire event on callback", async function () {
    await new Promise(async (resolve, reject) => {
      vrfMinting.once("RandomnessRequestFulfilled", async () => {
        console.log("RandomnessRequestFulfilled event fired!");
        const randomnessRequestState =
          await vrfMinting.getRandomnessRequestState(owner.address);
        try {
          expect(randomnessRequestState[0]).to.equal(true);
          expect(randomnessRequestState[1]).to.equal(true);
          console.log(randomnessRequestState[2]); // 78541660797044910968829902406342334108369226379826116161446442989268089806461

          resolve(true);
        } catch (e) {
          reject(e);
        }
      });
      await vrfMinting.requestRandomness();
      const requestId = await vrfMinting.addressToRequestId(owner.address);
      vrfCoordinatorV2Mock.fulfillRandomWords(requestId, vrfMinting.address);
    });
  });

  it("Should return different results on multiple requests", async function () {
    for (let i = 0; i < 3; i++) {
      await vrfMinting.requestRandomness();
      const requestId2 = await vrfMinting.addressToRequestId(owner.address);
      console.log(`requestId${i}`, requestId2);
      vrfCoordinatorV2Mock.fulfillRandomWords(requestId2, vrfMinting.address);
      const randomnessRequestState2 =
        await vrfMinting.getRandomnessRequestState(owner.address);
      console.log(randomnessRequestState2[2], "\n");
      expect(randomnessRequestState2[0]).to.equal(true);
      expect(randomnessRequestState2[1]).to.equal(true);
    }
  });
});
