// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title VeilBidFlareAwardReceipt
/// @notice Non-transferable public proof of one threshold-FCC procurement award.
/// @dev The deploying market is the only minter. No private bid fields are stored.
contract VeilBidFlareAwardReceipt {
    struct Award {
        uint256 tenderId;
        uint256 winnerBidId;
        address buyer;
        address winner;
        address paymentToken;
        uint256 amount;
        bytes32 rulesHash;
        bytes32 orderedBidRoot;
        bytes32 resultDigest;
        uint64 finalizedAt;
        uint64 finalizedBlock;
    }

    string public constant name = "VeilBid Flare Award Receipt";
    string public constant symbol = "VBFLARE";
    address public immutable market;

    mapping(uint256 => address) private owners;
    mapping(address => uint256) private balances;
    mapping(uint256 => Award) private awards;

    error InvalidAward();
    error NotMarket();
    error ReceiptAlreadyMinted(uint256 tenderId);
    error ReceiptDoesNotExist(uint256 tenderId);
    error ReceiptIsNonTransferable();

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event AwardReceiptMinted(
        uint256 indexed tenderId,
        uint256 indexed winnerBidId,
        address indexed winner,
        uint256 amount,
        bytes32 resultDigest
    );

    constructor() {
        market = msg.sender;
    }

    function mint(Award calldata award) external {
        if (msg.sender != market) revert NotMarket();
        if (
            award.tenderId == 0 || award.winnerBidId == 0 || award.buyer == address(0) || award.winner == address(0)
                || award.paymentToken == address(0) || award.amount == 0 || award.rulesHash == bytes32(0)
                || award.orderedBidRoot == bytes32(0) || award.resultDigest == bytes32(0)
        ) revert InvalidAward();
        if (owners[award.tenderId] != address(0)) revert ReceiptAlreadyMinted(award.tenderId);

        awards[award.tenderId] = Award({
            tenderId: award.tenderId,
            winnerBidId: award.winnerBidId,
            buyer: award.buyer,
            winner: award.winner,
            paymentToken: award.paymentToken,
            amount: award.amount,
            rulesHash: award.rulesHash,
            orderedBidRoot: award.orderedBidRoot,
            resultDigest: award.resultDigest,
            finalizedAt: uint64(block.timestamp),
            finalizedBlock: uint64(block.number)
        });
        owners[award.tenderId] = award.winner;
        balances[award.winner] += 1;
        emit Transfer(address(0), award.winner, award.tenderId);
        emit AwardReceiptMinted(award.tenderId, award.winnerBidId, award.winner, award.amount, award.resultDigest);
    }

    function ownerOf(uint256 tokenId) external view returns (address owner) {
        owner = owners[tokenId];
        if (owner == address(0)) revert ReceiptDoesNotExist(tokenId);
    }

    function balanceOf(address owner) external view returns (uint256) {
        if (owner == address(0)) revert InvalidAward();
        return balances[owner];
    }

    function getAward(uint256 tenderId) external view returns (Award memory) {
        if (owners[tenderId] == address(0)) revert ReceiptDoesNotExist(tenderId);
        return awards[tenderId];
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        if (owners[tokenId] == address(0)) revert ReceiptDoesNotExist(tokenId);
        return address(0);
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    function approve(address, uint256) external pure {
        revert ReceiptIsNonTransferable();
    }

    function setApprovalForAll(address, bool) external pure {
        revert ReceiptIsNonTransferable();
    }

    function transferFrom(address, address, uint256) external pure {
        revert ReceiptIsNonTransferable();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert ReceiptIsNonTransferable();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert ReceiptIsNonTransferable();
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || interfaceId == 0x80ac58cd;
    }
}
