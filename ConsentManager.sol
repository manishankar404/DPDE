// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ConsentManager {
    // patient => provider => access granted
    mapping(address => mapping(address => bool)) public providerAccess;

    // patient => list of providers requesting access
    mapping(address => address[]) private pendingRequests;

    // patient => provider => is pending
    mapping(address => mapping(address => bool)) private isPendingRequest;

    // patient => provider => 1-based index in pendingRequests[patient]
    mapping(address => mapping(address => uint256)) private pendingIndexPlusOne;

    event AccessRequested(address indexed patient, address indexed provider);
    event AccessGranted(address indexed patient, address indexed provider);
    event AccessRevoked(address indexed patient, address indexed provider);

    function requestPatientAccess(address patient) public {
        require(patient != address(0), "Invalid patient address");
        require(patient != msg.sender, "Cannot request your own records");
        require(!providerAccess[patient][msg.sender], "Access already granted");
        require(!isPendingRequest[patient][msg.sender], "Request already pending");

        pendingRequests[patient].push(msg.sender);
        isPendingRequest[patient][msg.sender] = true;
        pendingIndexPlusOne[patient][msg.sender] = pendingRequests[patient].length;

        emit AccessRequested(patient, msg.sender);
    }

    function grantAccess(address provider) public {
        require(provider != address(0), "Invalid provider address");
        require(isPendingRequest[msg.sender][provider], "No pending request");

        providerAccess[msg.sender][provider] = true;
        _removePending(msg.sender, provider);

        emit AccessGranted(msg.sender, provider);
    }

    function revokeAccess(address provider) public {
        require(provider != address(0), "Invalid provider address");
        providerAccess[msg.sender][provider] = false;
        emit AccessRevoked(msg.sender, provider);
    }

    function rejectAccessRequest(address provider) public {
        require(provider != address(0), "Invalid provider address");
        require(isPendingRequest[msg.sender][provider], "No pending request");
        _removePending(msg.sender, provider);
    }

    function hasAccess(address patient, address provider) public view returns (bool) {
        return providerAccess[patient][provider];
    }

    function getPendingRequests(address patient) public view returns (address[] memory) {
        return pendingRequests[patient];
    }

    function isPending(address patient, address provider) public view returns (bool) {
        return isPendingRequest[patient][provider];
    }

    function _removePending(address patient, address provider) internal {
        uint256 index = pendingIndexPlusOne[patient][provider];
        require(index != 0, "No pending request");

        uint256 lastIndex = pendingRequests[patient].length;
        if (index != lastIndex) {
            address moved = pendingRequests[patient][lastIndex - 1];
            pendingRequests[patient][index - 1] = moved;
            pendingIndexPlusOne[patient][moved] = index;
        }

        pendingRequests[patient].pop();
        delete pendingIndexPlusOne[patient][provider];
        delete isPendingRequest[patient][provider];
    }
}

