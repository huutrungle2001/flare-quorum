// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Immutable public record of one proof-derived VeilBid award.
/// @dev The deploying market is the only minter. Tokens cannot be transferred,
/// approved, or burned.
contract VeilBidAwardReceipt is ERC721 {
    error InvalidAward();
    error NotMarket();
    error ReceiptAlreadyMinted(uint256 tenderId);
    error ReceiptIsNonTransferable();

    struct Award {
        uint256 tenderId;
        address buyer;
        address winner;
        address paymentToken;
        uint64 finalizedAt;
        uint64 finalizedBlock;
    }

    address public immutable market;
    mapping(uint256 tenderId => Award award) private _awards;

    event AwardReceiptMinted(
        uint256 indexed tenderId,
        address indexed buyer,
        address indexed winner,
        address paymentToken
    );

    constructor() ERC721("VeilBid Award Receipt", "VBAWARD") {
        market = msg.sender;
    }

    function mint(
        uint256 tenderId,
        address buyer,
        address winner,
        address paymentToken
    ) external {
        if (msg.sender != market) revert NotMarket();
        if (
            tenderId == 0 ||
            buyer == address(0) ||
            winner == address(0) ||
            paymentToken == address(0)
        ) {
            revert InvalidAward();
        }
        if (_ownerOf(tenderId) != address(0)) {
            revert ReceiptAlreadyMinted(tenderId);
        }

        _awards[tenderId] = Award({
            tenderId: tenderId,
            buyer: buyer,
            winner: winner,
            paymentToken: paymentToken,
            finalizedAt: uint64(block.timestamp),
            finalizedBlock: uint64(block.number)
        });
        _mint(winner, tenderId);

        emit AwardReceiptMinted(tenderId, buyer, winner, paymentToken);
    }

    function getAward(uint256 tenderId) external view returns (Award memory) {
        _requireOwned(tenderId);
        return _awards[tenderId];
    }

    function approve(address, uint256) public pure override {
        revert ReceiptIsNonTransferable();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert ReceiptIsNonTransferable();
    }

    function transferFrom(address, address, uint256) public pure override {
        revert ReceiptIsNonTransferable();
    }

    function safeTransferFrom(
        address,
        address,
        uint256,
        bytes memory
    ) public pure override {
        revert ReceiptIsNonTransferable();
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0)) {
            revert ReceiptIsNonTransferable();
        }
        return super._update(to, tokenId, auth);
    }
}
