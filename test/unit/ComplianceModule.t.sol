// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "../../lib/forge-std/src/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ComplianceModule} from "../../src/compliance/ComplianceModule.sol";
import {IdentityRegistry} from "../../src/compliance/IdentityRegistry.sol";
import {KYCRegistry} from "../../src/compliance/KYCRegistry.sol";
import {PropertyToken} from "../../src/core/PropertyToken.sol";
import {IComplianceModule} from "../../src/interfaces/IComplianceModule.sol";
import {
    ComplianceModule__TokenNotRegistered,
    ComplianceModule__TokenAlreadyRegistered,
    ComplianceModule__TransferDenied
} from "../../src/utils/Errors.sol";
import {TokenComplianceAdded, TokenComplianceUpdated, HolderCountUpdated} from "../../src/utils/Events.sol";

/// @dev Helper: builds a ComplianceRules struct with only the fields needed per test.
library Rules {
    function maxHolders(uint256 n) internal pure returns (IComplianceModule.ComplianceRules memory r) {
        r.maxHolders = n;
    }

    function maxPerHolder(uint256 cap) internal pure returns (IComplianceModule.ComplianceRules memory r) {
        r.maxTokensPerHolder = cap;
    }

    function blocked(uint16[] memory countries) internal pure returns (IComplianceModule.ComplianceRules memory r) {
        r.blockedCountries = countries;
    }

    function allowed(uint16[] memory countries) internal pure returns (IComplianceModule.ComplianceRules memory r) {
        r.allowedCountries = countries;
    }
}

contract ComplianceModuleTest is Test {
    ComplianceModule internal compliance;
    IdentityRegistry internal idReg;
    KYCRegistry internal kyc;
    PropertyToken internal token;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");

    uint16 internal constant CC_USA = 840;
    uint16 internal constant CC_DEU = 276;
    uint16 internal constant CC_IRN = 364; // Iran (example blocked country)
    uint256 internal constant MAX_SUPPLY = 1_000 ether;

    // ─── Setup ───────────────────────────────────────────────────────────────

    function setUp() public {
        vm.startPrank(admin);

        // KYCRegistry (upgradeable)
        KYCRegistry kycImpl = new KYCRegistry();
        kyc = KYCRegistry(address(new ERC1967Proxy(address(kycImpl), abi.encodeCall(KYCRegistry.initialize, (admin)))));

        // IdentityRegistry
        idReg = new IdentityRegistry(admin, address(kyc));

        // ComplianceModule (with IdentityRegistry for country checks)
        compliance = new ComplianceModule(admin, address(idReg));

        // PropertyToken wired to ComplianceModule
        token = new PropertyToken("RWA Token", "RWA", 1, MAX_SUPPLY, admin, address(kyc), address(compliance));

        // KYC all actors
        kyc.verify(alice, CC_USA, 2, 0);
        kyc.verify(bob, CC_USA, 2, 0);
        kyc.verify(carol, CC_USA, 2, 0);
        kyc.verify(dave, CC_DEU, 2, 0);

        // Register identities (needed for country checks in ComplianceModule)
        idReg.registerIdentity(alice, CC_USA, keccak256("alice"));
        idReg.registerIdentity(bob, CC_USA, keccak256("bob"));
        idReg.registerIdentity(carol, CC_USA, keccak256("carol"));
        idReg.registerIdentity(dave, CC_DEU, keccak256("dave"));

        vm.stopPrank();
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function _addRules(IComplianceModule.ComplianceRules memory rules) internal {
        vm.prank(admin);
        compliance.addTokenCompliance(address(token), rules);
    }

    function _mint(address to, uint256 amount) internal {
        vm.prank(admin);
        token.mint(to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        vm.prank(from);
        token.transfer(to, amount);
    }

    function _noLimitRules() internal pure returns (IComplianceModule.ComplianceRules memory r) {
        // all zeros = no limits
    }

    // ─── addTokenCompliance ──────────────────────────────────────────────────

    function test_addTokenCompliance_registers() public {
        _addRules(_noLimitRules());
        // canTransfer returns true (no limits)
        (bool ok,) = compliance.canTransfer(address(token), alice, bob, 1 ether);
        assertTrue(ok);
    }

    function test_addTokenCompliance_emitsEvent() public {
        vm.prank(admin);
        vm.expectEmit(true, false, false, false, address(compliance));
        emit TokenComplianceAdded(address(token));
        compliance.addTokenCompliance(address(token), _noLimitRules());
    }

    function test_addTokenCompliance_revert_alreadyRegistered() public {
        _addRules(_noLimitRules());
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ComplianceModule__TokenAlreadyRegistered.selector, address(token)));
        compliance.addTokenCompliance(address(token), _noLimitRules());
    }

    function test_addTokenCompliance_revert_noRole() public {
        bytes32 role = compliance.COMPLIANCE_ADMIN_ROLE();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role));
        compliance.addTokenCompliance(address(token), _noLimitRules());
    }

    // ─── updateTokenCompliance ───────────────────────────────────────────────

    function test_updateTokenCompliance_replacesRules() public {
        _addRules(_noLimitRules());
        IComplianceModule.ComplianceRules memory newRules = Rules.maxHolders(5);
        vm.prank(admin);
        compliance.updateTokenCompliance(address(token), newRules);
        assertEq(compliance.getComplianceRules(address(token)).maxHolders, 5);
    }

    function test_updateTokenCompliance_emitsEvent() public {
        _addRules(_noLimitRules());
        vm.prank(admin);
        vm.expectEmit(true, false, false, false, address(compliance));
        emit TokenComplianceUpdated(address(token));
        compliance.updateTokenCompliance(address(token), _noLimitRules());
    }

    function test_updateTokenCompliance_revert_notRegistered() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(ComplianceModule__TokenNotRegistered.selector, address(token)));
        compliance.updateTokenCompliance(address(token), _noLimitRules());
    }

    // ─── canTransfer — unregistered token ────────────────────────────────────

    function test_canTransfer_trueForUnregisteredToken() public view {
        (bool ok, string memory reason) = compliance.canTransfer(address(token), alice, bob, 1 ether);
        assertTrue(ok);
        assertEq(reason, "");
    }

    // ─── Max holders enforcement ─────────────────────────────────────────────

    function test_maxHolders_allowsUpToLimit() public {
        // Cap at 2 holders
        _addRules(Rules.maxHolders(2));
        _mint(alice, 100 ether);
        _mint(bob, 100 ether);

        // Both are now holders — compliance tracks them via transferred()
        assertEq(compliance.holderCount(address(token)), 2);
    }

    function test_maxHolders_blocksWhenExceeded() public {
        vm.startPrank(admin);
        PropertyToken token2 = new PropertyToken("T2", "T2", 2, MAX_SUPPLY, admin, address(kyc), address(compliance));
        compliance.addTokenCompliance(address(token2), Rules.maxHolders(2));
        token2.mint(alice, 100 ether);
        token2.mint(bob, 100 ether);
        vm.stopPrank();

        assertEq(compliance.holderCount(address(token2)), 2);

        // Transfer alice → carol (a new, third holder) is blocked
        (bool ok, string memory reason) = compliance.canTransfer(address(token2), alice, carol, 50 ether);
        assertFalse(ok);
        assertEq(reason, "max holders exceeded");
    }

    /// @dev Primary issuance is how most tokens enter circulation. Mint used to skip the
    ///      rule engine entirely, leaving maxHolders unenforced on the main path.
    function test_maxHolders_enforcedOnMint() public {
        vm.startPrank(admin);
        PropertyToken token2 = new PropertyToken("T3", "T3", 3, MAX_SUPPLY, admin, address(kyc), address(compliance));
        compliance.addTokenCompliance(address(token2), Rules.maxHolders(2));
        token2.mint(alice, 100 ether);
        token2.mint(bob, 100 ether);

        vm.expectRevert(abi.encodeWithSelector(ComplianceModule__TransferDenied.selector, "max holders exceeded"));
        token2.mint(carol, 50 ether);
        vm.stopPrank();

        assertEq(compliance.holderCount(address(token2)), 2);
    }

    /// @dev Same gap for the per-wallet cap.
    function test_maxTokensPerHolder_enforcedOnMint() public {
        vm.startPrank(admin);
        PropertyToken token2 = new PropertyToken("T4", "T4", 4, MAX_SUPPLY, admin, address(kyc), address(compliance));
        compliance.addTokenCompliance(address(token2), Rules.maxPerHolder(100 ether));

        token2.mint(alice, 100 ether); // exactly at the cap — allowed

        vm.expectRevert(
            abi.encodeWithSelector(ComplianceModule__TransferDenied.selector, "exceeds per-holder token cap")
        );
        token2.mint(alice, 1); // one wei over — rejected
        vm.stopPrank();

        assertEq(token2.balanceOf(alice), 100 ether);
    }

    /// @dev Burns must stay unrestricted — they reduce exposure, never increase it.
    function test_burn_notRuleChecked() public {
        vm.startPrank(admin);
        PropertyToken token2 = new PropertyToken("T5", "T5", 5, MAX_SUPPLY, admin, address(kyc), address(compliance));
        compliance.addTokenCompliance(address(token2), Rules.maxHolders(1));
        token2.mint(alice, 100 ether);
        token2.burn(alice, 100 ether);
        vm.stopPrank();

        assertEq(token2.balanceOf(alice), 0);
        assertEq(compliance.holderCount(address(token2)), 0);
    }

    function test_maxHolders_allowsIfSenderExits() public {
        _addRules(Rules.maxHolders(2));
        _mint(alice, 100 ether);
        _mint(bob, 100 ether);

        // alice transfers ALL tokens to carol: alice exits (net change = 0)
        (bool ok,) = compliance.canTransfer(address(token), alice, carol, 100 ether);
        assertTrue(ok);
    }

    function test_maxHolders_decrementOnFullExit() public {
        _addRules(Rules.maxHolders(5));
        _mint(alice, 100 ether);
        assertEq(compliance.holderCount(address(token)), 1);
        assertTrue(compliance.isHolder(address(token), alice));

        _transfer(alice, bob, 100 ether); // alice exits
        assertEq(compliance.holderCount(address(token)), 1);
        assertFalse(compliance.isHolder(address(token), alice));
        assertTrue(compliance.isHolder(address(token), bob));
    }

    function test_maxHolders_partialTransferKeepsSenderAsHolder() public {
        _addRules(Rules.maxHolders(5));
        _mint(alice, 100 ether);
        _transfer(alice, bob, 40 ether);

        assertEq(compliance.holderCount(address(token)), 2);
        assertTrue(compliance.isHolder(address(token), alice));
        assertTrue(compliance.isHolder(address(token), bob));
    }

    // ─── Per-wallet token cap enforcement ────────────────────────────────────

    function test_maxTokensPerHolder_allowsUpToLimit() public {
        IComplianceModule.ComplianceRules memory r = Rules.maxPerHolder(100 ether);
        _addRules(r);
        _mint(alice, 50 ether);
        _mint(bob, 50 ether);

        // alice sending 50 to bob who already has 50: total 100 — exactly at limit
        (bool ok,) = compliance.canTransfer(address(token), alice, bob, 50 ether);
        assertTrue(ok);
    }

    function test_maxTokensPerHolder_blocksExceedingCap() public {
        IComplianceModule.ComplianceRules memory r = Rules.maxPerHolder(100 ether);
        _addRules(r);
        _mint(alice, 100 ether);
        _mint(bob, 60 ether);

        // alice transferring 50 to bob who already has 60 → 110 > 100
        (bool ok, string memory reason) = compliance.canTransfer(address(token), alice, bob, 50 ether);
        assertFalse(ok);
        assertEq(reason, "exceeds per-holder token cap");
    }

    function test_maxTokensPerHolder_reverts_on_transfer() public {
        IComplianceModule.ComplianceRules memory r = Rules.maxPerHolder(100 ether);
        _addRules(r);
        _mint(alice, 100 ether);
        _mint(bob, 60 ether);

        // Expect transfer to revert with ComplianceModule__TransferDenied
        vm.prank(alice);
        vm.expectRevert();
        token.transfer(bob, 50 ether);
    }

    // ─── Country blocking ─────────────────────────────────────────────────────

    function test_blockedCountry_preventsRecipient() public {
        // Register carol with blocked country
        vm.startPrank(admin);
        kyc.verify(makeAddr("iranWallet"), CC_IRN, 2, 0);
        idReg.registerIdentity(makeAddr("iranWallet"), CC_IRN, keccak256("iran"));
        vm.stopPrank();
        address iranWallet = makeAddr("iranWallet");

        uint16[] memory blocked = new uint16[](1);
        blocked[0] = CC_IRN;
        IComplianceModule.ComplianceRules memory r;
        r.blockedCountries = blocked;
        _addRules(r);

        _mint(alice, 100 ether);

        (bool ok, string memory reason) = compliance.canTransfer(address(token), alice, iranWallet, 10 ether);
        assertFalse(ok);
        assertEq(reason, "recipient country blocked");
    }

    function test_blockedCountry_preventsSender() public {
        // Seed first: mints are rule-checked now, so a blocked-country mint would revert.
        _mint(dave, 100 ether);

        // Register dave (CC_DEU) as blocked sender
        uint16[] memory blocked = new uint16[](1);
        blocked[0] = CC_DEU;
        IComplianceModule.ComplianceRules memory r;
        r.blockedCountries = blocked;
        _addRules(r);

        (bool ok, string memory reason) = compliance.canTransfer(address(token), dave, alice, 10 ether);
        assertFalse(ok);
        assertEq(reason, "sender country blocked");
    }

    function test_blockedCountry_allowsUnblockedCountry() public {
        uint16[] memory blocked = new uint16[](1);
        blocked[0] = CC_IRN;
        IComplianceModule.ComplianceRules memory r;
        r.blockedCountries = blocked;
        _addRules(r);

        _mint(alice, 100 ether);

        (bool ok,) = compliance.canTransfer(address(token), alice, bob, 10 ether);
        assertTrue(ok);
    }

    // ─── Allowed countries ────────────────────────────────────────────────────

    function test_allowedCountries_blocksUnlisted() public {
        uint16[] memory allowed = new uint16[](1);
        allowed[0] = CC_USA;
        IComplianceModule.ComplianceRules memory r;
        r.allowedCountries = allowed;
        _addRules(r);

        _mint(alice, 100 ether);

        // dave is CC_DEU — not in allowed list
        (bool ok, string memory reason) = compliance.canTransfer(address(token), alice, dave, 10 ether);
        assertFalse(ok);
        assertEq(reason, "recipient country not allowed");
    }

    function test_allowedCountries_allowsListed() public {
        uint16[] memory allowed = new uint16[](2);
        allowed[0] = CC_USA;
        allowed[1] = CC_DEU;
        IComplianceModule.ComplianceRules memory r;
        r.allowedCountries = allowed;
        _addRules(r);

        _mint(alice, 100 ether);

        (bool ok,) = compliance.canTransfer(address(token), alice, dave, 10 ether);
        assertTrue(ok);
    }

    function test_allowedCountries_blocksSenderNotInList() public {
        // Seed dave's balance BEFORE the rule set exists — compliance now covers mints, so
        // minting to a disallowed country under an active rule set would (correctly) revert.
        _mint(dave, 100 ether); // dave CC_DEU

        uint16[] memory allowed = new uint16[](1);
        allowed[0] = CC_USA;
        IComplianceModule.ComplianceRules memory r;
        r.allowedCountries = allowed;
        _addRules(r);

        (bool ok, string memory reason) = compliance.canTransfer(address(token), dave, alice, 10 ether);
        assertFalse(ok);
        assertEq(reason, "sender country not allowed");
    }

    function test_allowedCountries_emptyMeansAllAllowed() public {
        // No allowedCountries set — any country passes
        _addRules(_noLimitRules());
        _mint(alice, 100 ether);

        (bool ok,) = compliance.canTransfer(address(token), alice, dave, 10 ether);
        assertTrue(ok);
    }

    // ─── transferred() — security: non-token caller is ignored ───────────────

    function test_transferred_ignoredIfCallerNotToken() public {
        _addRules(_noLimitRules());
        // Someone tries to spoof a transfer for a different token
        vm.prank(alice); // alice is NOT the token contract
        compliance.transferred(address(token), address(0), alice, 100 ether);
        // Holder count should NOT change
        assertEq(compliance.holderCount(address(token)), 0);
    }

    // ─── Holder count — mint / burn tracking ─────────────────────────────────

    function test_holderCount_incrementsOnMint() public {
        _addRules(_noLimitRules());
        _mint(alice, 100 ether);
        assertEq(compliance.holderCount(address(token)), 1);
        _mint(bob, 50 ether);
        assertEq(compliance.holderCount(address(token)), 2);
    }

    function test_holderCount_noDoubleCountOnSecondMint() public {
        _addRules(_noLimitRules());
        _mint(alice, 50 ether);
        _mint(alice, 50 ether); // alice is already a holder
        assertEq(compliance.holderCount(address(token)), 1);
    }

    function test_holderCount_decrementsOnBurn() public {
        _addRules(_noLimitRules());
        _mint(alice, 100 ether);
        vm.prank(admin);
        token.burn(alice, 100 ether);
        assertEq(compliance.holderCount(address(token)), 0);
    }

    // ─── identityRegistry() accessor ─────────────────────────────────────────

    function test_identityRegistry_accessor() public view {
        assertEq(compliance.identityRegistry(), address(idReg));
    }

    function test_complianceModule_noIdentityRegistry_skipsCountryChecks() public {
        // Deploy compliance without identity registry
        vm.prank(admin);
        ComplianceModule noIdCompliance = new ComplianceModule(admin, address(0));
        assertEq(noIdCompliance.identityRegistry(), address(0));

        uint16[] memory blocked = new uint16[](1);
        blocked[0] = CC_IRN;
        IComplianceModule.ComplianceRules memory r;
        r.blockedCountries = blocked;

        vm.prank(admin);
        noIdCompliance.addTokenCompliance(address(token), r);

        // Without identity registry, country checks are skipped — transfer is allowed
        (bool ok,) = noIdCompliance.canTransfer(address(token), alice, bob, 10 ether);
        assertTrue(ok);
    }
}
