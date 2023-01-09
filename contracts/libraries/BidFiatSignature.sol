// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

library BidFiatSignature {
    /* ========== SIGNATURE FUNCTIONS ========== */

    function verifyBidFiatMessage(
        bytes memory signature,
        address bidder,
        uint256 auctionId,
        uint256 tokenId,
        uint256 priceUSD,
        address marketplace,
        address nFT,
        address _verifier
    ) internal view returns (bool) {
        if (signature.length == 0) return false;
        bytes32 dataHash = encodeBidFiatData(
            bidder,
            auctionId,
            tokenId,
            priceUSD,
            marketplace,
            nFT
        );
        bytes32 signHash = ECDSA.toEthSignedMessageHash(dataHash);
        address recovered = ECDSA.recover(signHash, signature);
        return recovered == _verifier;
    }

    function encodeBidFiatData(
        address bidder,
        uint256 auctionId,
        uint256 tokenId,
        uint256 priceUSD,
        address marketplace,
        address nFT
    ) internal view returns (bytes32) {
        uint256 id;
        assembly {
            id := chainid()
        }
        return
            keccak256(
                abi.encode(
                    id,
                    bidder,
                    auctionId,
                    marketplace,
                    tokenId,
                    nFT,
                    priceUSD
                )
            );
    }

    function verifyEditBidFiatMessage(
        bytes memory signature,
        address bidder,
        uint256 bidId,
        uint256 auctionId,
        uint256 tokenId,
        uint256 priceUSD,
        address marketplace,
        address nFT,
        address _verifier
    ) internal view returns (bool) {
        if (signature.length == 0) return false;
        bytes32 dataHash = encodeEditBidFiatData(
            bidder,
            bidId,
            auctionId,
            tokenId,
            priceUSD,
            marketplace,
            nFT
        );
        bytes32 signHash = ECDSA.toEthSignedMessageHash(dataHash);
        address recovered = ECDSA.recover(signHash, signature);
        return recovered == _verifier;
    }

    function encodeEditBidFiatData(
        address bidder,
        uint256 bidId,
        uint256 auctionId,
        uint256 tokenId,
        uint256 priceUSD,
        address marketplace,
        address nFT
    ) internal view returns (bytes32) {
        uint256 id;
        assembly {
            id := chainid()
        }
        return
            keccak256(
                abi.encode(
                    id,
                    bidder,
                    bidId,
                    auctionId,
                    marketplace,
                    tokenId,
                    nFT,
                    priceUSD
                )
            );
    }

    function verifyCancelBidFiatMessage(
        bytes memory signature,
        address bidder,
        uint256 bidId,
        uint256 auctionId,
        uint256 tokenId,
        address marketplace,
        address nFT,
        address _verifier
    ) internal view returns (bool) {
        if (signature.length == 0) return false;
        bytes32 dataHash = encodeCancelBidFiatData(
            bidder,
            bidId,
            auctionId,
            tokenId,
            marketplace,
            nFT
        );
        bytes32 signHash = ECDSA.toEthSignedMessageHash(dataHash);
        address recovered = ECDSA.recover(signHash, signature);
        return recovered == _verifier;
    }

    function encodeCancelBidFiatData(
        address bidder,
        uint256 bidId,
        uint256 auctionId,
        uint256 tokenId,
        address marketplace,
        address nFT
    ) internal view returns (bytes32) {
        uint256 id;
        assembly {
            id := chainid()
        }
        return
            keccak256(
                abi.encode(
                    id,
                    bidder,
                    bidId,
                    auctionId,
                    marketplace,
                    tokenId,
                    nFT
                )
            );
    }
}
