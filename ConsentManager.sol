// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ConsentManager {
    struct File {
        address owner;
        mapping(address => bool) authorizedProviders;
    }

    // Mapping from CID to File struct
    mapping(string => File) private files;

    // Events
    event AccessGranted(address indexed provider, string cid);
    event AccessRevoked(address indexed provider, string cid);

    // Grant access to a provider for a file (only owner)
    function grantAccess(address provider, string memory cid) external {
        File storage file = files[cid];
        require(file.owner == msg.sender || file.owner == address(0), "Not file owner");
        if (file.owner == address(0)) {
            file.owner = msg.sender;
        }
        file.authorizedProviders[provider] = true;
        emit AccessGranted(provider, cid);
    }

    // Revoke access from a provider for a file (only owner)
    function revokeAccess(address provider, string memory cid) external {
        File storage file = files[cid];
        require(file.owner == msg.sender, "Not file owner");
        file.authorizedProviders[provider] = false;
        emit AccessRevoked(provider, cid);
    }

    // Check if a provider is authorized for a file
    function checkAccess(address provider, string memory cid) external view returns (bool) {
        File storage file = files[cid];
        return file.authorizedProviders[provider];
    }
}
