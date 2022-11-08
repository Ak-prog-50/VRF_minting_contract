interface ICollectionConfig {
  contractName: string;
  hiddenMetadataUri: string;
  revealedUriPrefix: string;
  revealedUriSuffix: string;
  publicSale: {
    price: number;
    maxMintAmountPerTx: number;
    maxMintAmountPerWallet: number;
  };
}

const CollectionConfig: ICollectionConfig = {
  contractName: "VRFMinting",
  hiddenMetadataUri: "ipfs://metadata_uri/hidden.json",
  revealedUriPrefix: "ipfs://image_uri_here/",
  revealedUriSuffix: ".json",
  publicSale: {
    price: 0.069,
    maxMintAmountPerTx: 1,
    maxMintAmountPerWallet: 5,
  },
};

export default CollectionConfig;
