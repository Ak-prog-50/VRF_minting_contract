// SPDX-License-Identifier: UNLICENSE

pragma solidity >=0.8.9 <0.9.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";

error NoTokenIdAvailable();

contract VRFMinting is
    ERC721Enumerable,
    Ownable,
    ReentrancyGuard,
    VRFConsumerBaseV2
{
    event RandomnessRequestSent(uint256 requestId, uint32 numWords);
    event RandomnessRequestFulfilled(uint256 requestId, uint256[] randomWords);

    using Strings for uint256;

    enum SaleStatus {
        PAUSED,
        PUBLIC_MINT
    }

    struct RequestStatus {
        bool fulfilled;
        bool exists;
        uint256[] randomWords;
    }

    uint256 public maxSupply;
    SaleStatus public saleStatus;

    VRFCoordinatorV2Interface public vrfCoordinator;
    uint64 public subscriptionId;
    bytes32 public keyHash =
        0x79d3d8832d904592c0bf9818b621522c988bb8b0c05cdc3b15aea1b6e8db0c15; // goerli keyhash
    uint16 public requestConfirmations = 3; // number of block confirmations VRF service waits for before responding.
    uint32 public callbackGasLimit = 100000; // gas limit when VRF callback rawFulfillRandomWords func in VRFConsumerBaseV2.
    uint32 public numWords = 1; // number of words(uint256 values) in the random word request

    mapping(address => uint256) public addressToRequestId;
    mapping(uint256 => RequestStatus) public requestIdToRequestStatus;
    mapping(address => uint256) public totalPublicMintByAddress;

    uint256 public costPublic = 0.069 ether;
    uint256 public maxMintAmountPerWalletPublic = 5;

    string public uriPrefix = "ipfs://image_uri_here/";
    string public uriSuffix = ".json";
    string public hiddenMetadataUri = "ipfs://metadata_uri/hidden.json";
    bool public revealed = false;

    constructor(
        string memory _tokenName,
        string memory _tokenSymbol,
        uint256 _maxSupply,
        address _vrfCoordinator,
        uint64 _subscriptionId
    ) ERC721(_tokenName, _tokenSymbol) VRFConsumerBaseV2(_vrfCoordinator) {
        maxSupply = _maxSupply;
        saleStatus = SaleStatus.PAUSED;
        vrfCoordinator = VRFCoordinatorV2Interface(_vrfCoordinator);
        subscriptionId = _subscriptionId;
    }

    modifier mintCompliance(uint256 _mintAmount) {
        uint16 maxMintAmountPerTx = 1;
        if (_msgSender() != owner()) {
            require(
                _mintAmount > 0 && _mintAmount <= maxMintAmountPerTx,
                "Invalid mint amount!"
            );
        }

        require(
            totalSupply() + _mintAmount <= maxSupply,
            "Max supply exceeded!"
        );
        _;
    }

    modifier mintPriceCompliance(uint256 _mintAmount) {
        if (_msgSender() != owner()) {
            require(
                msg.value >= costPublic * _mintAmount,
                "Insufficient funds!"
            );
        }
        _;
    }

    // Should have requested randomness before calling this function
    function mint(uint256 _mintAmount)
        public
        payable
        mintCompliance(_mintAmount)
        mintPriceCompliance(_mintAmount)
    {
        require(
            saleStatus == SaleStatus.PUBLIC_MINT,
            "The public sale is not enabled!"
        );

        require(
            (totalPublicMintByAddress[_msgSender()] + _mintAmount) <=
                maxMintAmountPerWalletPublic,
            "Max public mint exceeded!"
        );

        uint256 tokenId = getRandomTokenId(_msgSender());

        totalPublicMintByAddress[_msgSender()] += _mintAmount;
        _safeMint(_msgSender(), tokenId);
    }

    function setPublicMintEnabled() public onlyOwner {
        saleStatus = SaleStatus.PUBLIC_MINT;
    }

    function setSalePaused() public onlyOwner {
        saleStatus = SaleStatus.PAUSED;
    }

    function setCostPublic(uint256 _cost) public onlyOwner {
        costPublic = _cost;
    }

    function setMaxMintAmountPerWalletPublic(uint256 _maxMintAmountPerWallet)
        public
        onlyOwner
    {
        maxMintAmountPerWalletPublic = _maxMintAmountPerWallet;
    }

    function setUriPrefix(string memory _uriPrefix) public onlyOwner {
        uriPrefix = _uriPrefix;
    }

    function setUriSuffix(string memory _uriSuffix) public onlyOwner {
        uriSuffix = _uriSuffix;
    }

    function setHiddenMetadataUri(string memory _hiddenMetadataUri)
        public
        onlyOwner
    {
        hiddenMetadataUri = _hiddenMetadataUri;
    }

    function setRevealed(bool _revealed) public onlyOwner {
        revealed = _revealed;
    }

    function setSubscriptionId(uint64 _subscriptionId) public onlyOwner {
        subscriptionId = _subscriptionId;
    }

    function setKeyHash(bytes32 _keyHash) public onlyOwner {
        keyHash = _keyHash;
    }

    function setRequestConfirmations(uint16 _requestConfirmations)
        public
        onlyOwner
    {
        requestConfirmations = _requestConfirmations;
    }

    function setCallbackGasLimit(uint32 _callbackGasLimit) public onlyOwner {
        callbackGasLimit = _callbackGasLimit;
    }

    function setNumWords(uint32 _numWords) public onlyOwner {
        numWords = _numWords;
    }

    function getRandomnessRequestState(address requester)
        public
        view
        returns (RequestStatus memory)
    {
        return requestIdToRequestStatus[addressToRequestId[requester]];
    }

    function getRandomTokenId(address requester)
        public
        view
        returns (uint256 randomTokenId)
    {
        RequestStatus memory requestStatus = getRandomnessRequestState(
            requester
        );
        require(requestStatus.fulfilled, "Request not fulfilled");
        uint256 randomWord = requestStatus.randomWords[0];
        uint256 randomTokenIdFirst = randomWord % maxSupply; // 3333 is not a token id
        uint256 stopValue = randomTokenIdFirst;
        if (_exists(randomTokenIdFirst)) {
            while (
                _exists(randomTokenIdFirst) &&
                randomTokenIdFirst < maxSupply - 1
            ) {
                randomTokenIdFirst = (randomTokenIdFirst + 1);
            }
            if (_exists(randomTokenIdFirst)) {
                // randomTokenIdFirst should be 3332 in here
                randomTokenIdFirst = 0;
                while (
                    _exists(randomTokenIdFirst) &&
                    randomTokenIdFirst < stopValue
                ) {
                    randomTokenIdFirst = (randomTokenIdFirst + 1);
                }
                if (_exists(randomTokenIdFirst)) {
                    revert NoTokenIdAvailable();
                } else if (!_exists(randomTokenIdFirst)) {
                    randomTokenId = randomTokenIdFirst;
                }
            } else if (!_exists(randomTokenIdFirst)) {
                randomTokenId = randomTokenIdFirst;
            }
        } else if (!_exists(randomTokenIdFirst)) {
            randomTokenId = randomTokenIdFirst;
        }
    }

    function walletOfOwner(address _owner)
        public
        view
        returns (uint256[] memory)
    {
        uint256 ownerTokenCount = balanceOf(_owner);
        uint256[] memory tokenIds = new uint256[](ownerTokenCount);
        for (uint256 i; i < ownerTokenCount; i++) {
            tokenIds[i] = tokenOfOwnerByIndex(_owner, i);
        }
        return tokenIds;
    }

    function tokenURI(uint256 _tokenId)
        public
        view
        virtual
        override
        returns (string memory)
    {
        require(
            _exists(_tokenId),
            "ERC721Metadata: URI query for nonexistent token"
        );

        if (revealed == false) {
            return hiddenMetadataUri;
        }

        string memory currentBaseURI = _baseURI();
        return
            bytes(currentBaseURI).length > 0
                ? string(
                    abi.encodePacked(
                        currentBaseURI,
                        _tokenId.toString(),
                        uriSuffix
                    )
                )
                : "";
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return uriPrefix;
    }

    function withdraw_single() public onlyOwner nonReentrant {
        (bool os, ) = payable(owner()).call{value: address(this).balance}("");
        require(os);
    }

    function requestRandomness() external returns (RequestStatus memory) {
        // Will revert if subscription is not set and funded.
        uint256 requestId = vrfCoordinator.requestRandomWords(
            keyHash,
            subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            numWords
        );
        requestIdToRequestStatus[requestId] = RequestStatus({
            randomWords: new uint256[](0),
            exists: true,
            fulfilled: false
        });
        addressToRequestId[_msgSender()] = requestId;

        emit RandomnessRequestSent(requestId, numWords);
        return requestIdToRequestStatus[requestId];
    }

    function fulfillRandomWords(
        uint256 _requestId,
        uint256[] memory _randomWords
    ) internal override {
        require(
            requestIdToRequestStatus[_requestId].exists,
            "request not found"
        );
        requestIdToRequestStatus[_requestId].fulfilled = true;
        requestIdToRequestStatus[_requestId].randomWords = _randomWords;
        emit RandomnessRequestFulfilled(_requestId, _randomWords);
    }
}
