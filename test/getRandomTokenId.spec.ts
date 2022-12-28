import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { deployments, ethers } from "hardhat";
import { VRFMinting, VRFCoordinatorV2Mock } from "../typechain";

describe("Test Get Random Token Id", function () {
  let owner!: SignerWithAddress;
  let externalUser0!: SignerWithAddress;
  let externalUser1!: SignerWithAddress;
  let vrfMinting!: VRFMinting;
  let vrfCoordinatorV2Mock!: VRFCoordinatorV2Mock;

  const requstAndGetRandomness = async (
    signer: SignerWithAddress
  ): Promise<BigNumber> => {
    await vrfMinting.connect(signer).requestRandomness();
    const requestId = await vrfMinting.addressToRequestId(signer.address);
    vrfCoordinatorV2Mock.fulfillRandomWords(requestId, vrfMinting.address);
    const tokenId = await vrfMinting.getRandomTokenId(signer.address);
    return tokenId;
  };

  before(async function () {
    [owner, externalUser0, externalUser1] = await ethers.getSigners();
  });

  beforeEach(async function () {
    await deployments.fixture(["mocks", "VRFMinting"]);
    vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");
    vrfMinting = await ethers.getContract("VRFMinting");
  });

  it("Should revert when randomness not fulfilled!", async function () {
    await expect(vrfMinting.getRandomTokenId(owner.address)).to.be.revertedWith(
      "Request not fulfilled"
    );
    console.log(await vrfMinting.getRandomnessRequestState(owner.address));
  });

  it("Should return a random token id", async function () {
    const tokenId = await requstAndGetRandomness(owner);
    console.log(tokenId);
    expect(tokenId).to.be.equal(BigNumber.from("461")); // This is predictable because vrfv2 mock uses requestID as seed
  });

  it("Should return a random token id when called multiple times", async function () {
    const tokenId = await requstAndGetRandomness(owner); // predictable no matter who requested.
    const tokenId2 = await requstAndGetRandomness(externalUser0);
    const tokenId3 = await requstAndGetRandomness(externalUser1);
    const tokenId4 = await requstAndGetRandomness(owner);
    const tokenId5 = await requstAndGetRandomness(externalUser0);
    console.log(tokenId, tokenId2, tokenId3, tokenId4, tokenId5);
    expect(tokenId).to.be.equal(BigNumber.from("461"));
    expect(tokenId2).to.be.equal(BigNumber.from("1359"));
    expect(tokenId3).to.be.equal(BigNumber.from("2557"));
    expect(tokenId4).to.be.equal(BigNumber.from("760"));
    expect(tokenId5).to.be.equal(BigNumber.from("956"));
  });

  let skip: boolean = true;
  it("Should return a random token id when got preasured", async function () {
    if (skip) this.skip();
    this.timeout(200000);
    const firstMintWindowClosedAt = 469; // firstRandomInt 461
    const secondMintWindowClosedAt = 1401; // secondRandomInt 1359
    const thirdMintWindowClosedAt = 3333; // thirdRandomInt 2557
    const fourthMintWindowClosedAt = 289; // fourthRandomInt 760. This mint window started from tokenId 1
    for (let i = 461; i < firstMintWindowClosedAt; i++) {
      await vrfMinting.setMintedIdMapping(i);
    }
    const tokenId = await requstAndGetRandomness(owner);
    expect(tokenId).to.be.equal(BigNumber.from(firstMintWindowClosedAt));

    for (let i = firstMintWindowClosedAt; i < secondMintWindowClosedAt; i++) {
      await vrfMinting.setMintedIdMapping(i);
    }
    const tokenId2 = await requstAndGetRandomness(owner);
    expect(tokenId2).to.be.equal(BigNumber.from(secondMintWindowClosedAt));

    for (let i = secondMintWindowClosedAt; i < thirdMintWindowClosedAt; i++) {
      await vrfMinting.setMintedIdMapping(i); //461 to 3332 is minted at this point.
    }
    const tokenId3 = await requstAndGetRandomness(owner);
    expect(tokenId3).to.be.equal(BigNumber.from(0));
    await vrfMinting.setMintedIdMapping(0);

    for (let i = 1; i < fourthMintWindowClosedAt; i++) {
      await vrfMinting.setMintedIdMapping(i); // 1 to 288 && 461 to 3332 is minted at this point.
    }
    const tokenId4 = await requstAndGetRandomness(owner);
    expect(tokenId4).to.be.equal(BigNumber.from(fourthMintWindowClosedAt));
  });

  let skip2: boolean = true;
  it("Should return a random token id when only one is left", async function () {
    if (skip2) this.skip();
    this.timeout(100000);
    const firstRandomValue = 461;
    for (let i = firstRandomValue; i < 3333; i++) {
      await vrfMinting.setMintedIdMapping(i);
    }
    for (let i = 0; i < firstRandomValue - 1; i++) {
      await vrfMinting.setMintedIdMapping(i); // 461-332 && 0-459 is minted at this point. 460 is left.
    }

    const tokenId = await requstAndGetRandomness(owner);
    expect(tokenId).to.be.equal(BigNumber.from(460));
  });
});
