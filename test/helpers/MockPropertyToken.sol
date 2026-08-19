// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IPropertyToken} from "../../src/interfaces/IPropertyToken.sol";

/// @dev Simple ERC-20 mock implementing IPropertyToken — for tests only.
///      No KYC checks, no role restrictions.
contract MockPropertyToken is IPropertyToken, ERC20 {
    uint256 private immutable _propertyId;
    uint256 private immutable _maxSupply;
    bool private _paused;

    constructor(
        string memory name,
        string memory symbol,
        uint256 propertyId_,
        uint256 maxSupply_
    ) ERC20(name, symbol) {
        _propertyId = propertyId_;
        _maxSupply  = maxSupply_;
    }

    function propertyId() external view override returns (uint256) {
        return _propertyId;
    }

    function maxSupply() external view override returns (uint256) {
        return _maxSupply;
    }

    function mint(address to, uint256 amount) external override {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external override {
        _burn(from, amount);
    }

    function forcedTransfer(address from, address to, uint256 amount) external override {
        _transfer(from, to, amount);
    }

    function canTransfer(address from, address to, uint256 amount) external view override returns (bool ok, string memory reason) {
        if (_paused) return (false, "paused");
        if (balanceOf(from) < amount) return (false, "insufficient balance");
        if (to == address(0)) return (false, "zero address");
        return (true, "");
    }

    function pause() external override {
        _paused = true;
    }

    function unpause() external override {
        _paused = false;
    }

    mapping(address => uint256) private _lockupExpiry;

    function setLockupExpiry(address investor, uint256 expiry) external override {
        _lockupExpiry[investor] = expiry;
    }

    function lockupExpiry(address investor) external view override returns (uint256) {
        return _lockupExpiry[investor];
    }
}
