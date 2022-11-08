import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, utils } from "ethers";
import { deployments, ethers } from "hardhat";
import CollectionConfig from "../collectionConfig";
import { VRFMinting, VRFCoordinatorV2Mock } from "../typechain";

enum SaleType {
  PUBLIC_SALE = 0.069,
}

enum SaleStatusNumber {
  PAUSED = 0,
  PUBLIC_SALE = 1,
}

function getPrice(saleType: SaleType, mintAmount: number) {
  return utils.parseEther(saleType.toString()).mul(mintAmount);
}

describe(`VRFMinting public mint test`, function () {
  let owner!: SignerWithAddress;
  let whitelistedUser!: SignerWithAddress;
  let ogUser0!: SignerWithAddress;
  let holder!: SignerWithAddress;
  let externalUser0!: SignerWithAddress;
  let externalUser1!: SignerWithAddress;
  let vrfCoordinatorV2Mock!: VRFCoordinatorV2Mock;
  let vrfMinting!: VRFMinting;

  before(async function () {
    [owner, ogUser0, whitelistedUser, holder, externalUser0, externalUser1] =
      await ethers.getSigners();
    await deployments.fixture(["mocks", "VRFMinting"]);
    vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");
    vrfMinting = await ethers.getContract("VRFMinting");
  });

  it("Should setup public mint", async function () {
    await vrfMinting.setPublicMintEnabled();
    expect(await vrfMinting.saleStatus()).to.equal(
      SaleStatusNumber.PUBLIC_SALE
    );
  });

  it("Should revert if public mint is not enabled", async function () {
    await vrfMinting.setSalePaused();
    expect(await vrfMinting.saleStatus()).to.equal(SaleStatusNumber.PAUSED);
    await expect(
      vrfMinting
        .connect(externalUser1)
        .mint(1, { value: getPrice(SaleType.PUBLIC_SALE, 1) })
    ).to.be.revertedWith("The public sale is not enabled!");
    await vrfMinting.setPublicMintEnabled();
  });

  it("should revert if randomness request has not been requested", async function () {
    const randomnessReqestState = await vrfMinting.getRandomnessRequestState(
      externalUser0.address
    );
    expect(randomnessReqestState[0]).to.equal(false); // fulfilled
    expect(randomnessReqestState[1]).to.equal(false); // exists
    await expect(
      vrfMinting
        .connect(externalUser0)
        .mint(CollectionConfig.publicSale.maxMintAmountPerTx, {
          value: getPrice(SaleType.PUBLIC_SALE, 1),
        })
    ).to.be.revertedWith("Request not fulfilled");
  });

  it("should revert if randomness request has not been fulfilled", async function () {
    await vrfMinting.connect(externalUser0).requestRandomness();
    const randomnessReqestState = await vrfMinting.getRandomnessRequestState(
      externalUser0.address
    );
    expect(randomnessReqestState[0]).to.equal(false); // fulfilled
    expect(randomnessReqestState[1]).to.equal(true); // exists
    await expect(
      vrfMinting
        .connect(externalUser0)
        .mint(CollectionConfig.publicSale.maxMintAmountPerTx, {
          value: getPrice(SaleType.PUBLIC_SALE, 1),
        })
    ).to.be.revertedWith("Request not fulfilled");
  });

  it("should request randomness and mint NFT", async function () {
    await expect(vrfMinting.ownerOf(BigNumber.from(1359))).to.be.revertedWith(
      "ERC721: owner query for nonexistent token"
    );
    await expect(vrfMinting.tokenURI(BigNumber.from(1359))).to.be.revertedWith(
      "ERC721Metadata: URI query for nonexistent token"
    );

    await vrfMinting.connect(externalUser0).requestRandomness();
    const requestId = await vrfMinting.addressToRequestId(
      externalUser0.address
    );
    await vrfCoordinatorV2Mock.fulfillRandomWords(
      requestId,
      vrfMinting.address
    );

    const userBalanceBefore = await vrfMinting.balanceOf(externalUser0.address);
    await vrfMinting
      .connect(externalUser0)
      .mint(CollectionConfig.publicSale.maxMintAmountPerTx, {
        value: getPrice(SaleType.PUBLIC_SALE, 1),
      });
    const userBalanceAfter = await vrfMinting.balanceOf(externalUser0.address);

    expect(userBalanceBefore).to.equal(0);
    expect(userBalanceAfter).to.equal(1);
    expect(await vrfMinting.ownerOf(BigNumber.from(1359))).to.equal(
      externalUser0.address
    );
    expect(await vrfMinting.tokenURI(BigNumber.from(1359))).to.equal(
      CollectionConfig.hiddenMetadataUri
    );
    await vrfMinting.setRevealed(true);
    expect(await vrfMinting.tokenURI(BigNumber.from(1359))).to.equal(
      `${CollectionConfig.revealedUriPrefix}1359${CollectionConfig.revealedUriSuffix}`
    );
  });

  it("Should revert if invalidMintAmount", async function () {
    await expect(
      vrfMinting
        .connect(externalUser0)
        .mint(CollectionConfig.publicSale.maxMintAmountPerTx + 1, {
          value: getPrice(SaleType.PUBLIC_SALE, 1),
        })
    ).to.be.revertedWith("Invalid mint amount!");

    await expect(
      vrfMinting
        .connect(externalUser0)
        .mint(0, { value: getPrice(SaleType.PUBLIC_SALE, 0) })
    ).to.be.revertedWith("Invalid mint amount!");
  });

  it("Should revert after minting maxMintAmountPerWallet", async function () {
    let alreadyMinted = 1;
    while (alreadyMinted < CollectionConfig.publicSale.maxMintAmountPerWallet) {
      await vrfMinting
        .connect(externalUser0)
        .mint(1, { value: getPrice(SaleType.PUBLIC_SALE, 1) });
      alreadyMinted++;
    }
    expect(await vrfMinting.balanceOf(externalUser0.address)).to.equal(
      CollectionConfig.publicSale.maxMintAmountPerWallet
    );
    await expect(
      vrfMinting
        .connect(externalUser0)
        .mint(CollectionConfig.publicSale.maxMintAmountPerTx, {
          value: getPrice(SaleType.PUBLIC_SALE, 1),
        })
    ).to.be.revertedWith("Max public mint exceeded!");
  });

  it("Should revert if not enough ETH sent", async function () {
    await expect(
      vrfMinting
        .connect(externalUser0)
        .mint(CollectionConfig.publicSale.maxMintAmountPerTx, {
          value: getPrice(SaleType.PUBLIC_SALE, 0),
        })
    ).to.be.revertedWith("Insufficient funds!");
  });

  it("Should be able to mint externalUser1", async function () {
    await vrfMinting.connect(externalUser1).requestRandomness();
    const requestId = await vrfMinting.addressToRequestId(
      externalUser1.address
    );
    await vrfCoordinatorV2Mock.fulfillRandomWords(
      requestId,
      vrfMinting.address
    );

    await vrfMinting
      .connect(externalUser1)
      .mint(1, { value: getPrice(SaleType.PUBLIC_SALE, 1) });
    expect(await vrfMinting.balanceOf(externalUser1.address)).to.equal(1);
  });

  it("Wallets of minters", async function () {
    const user0Wallet = await vrfMinting.walletOfOwner(externalUser0.address);
    const user1Wallet = await vrfMinting.walletOfOwner(externalUser1.address);
    // tokenIds are predicatable because mock contract uses requestId as seed
    expect(user0Wallet[0].toString()).to.equal("1359");
    expect(user0Wallet[3].toString()).to.equal("1362");
    expect(user1Wallet[0].toString()).to.equal("2557");
  });
});
