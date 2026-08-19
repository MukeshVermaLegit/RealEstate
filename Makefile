# ─── RWA Real Estate — Deployment Makefile ────────────────────────────────
# Usage: make <target>
# Requires: foundry, docker, docker-compose, node, @graphprotocol/graph-cli

-include .env
export

FORGE_FLAGS   := --rpc-url $(RPC_URL) --private-key $(PRIVATE_KEY) --broadcast --verify --etherscan-api-key $(ETHERSCAN_API_KEY) -vvvv
FORGE_DRY_RUN := --rpc-url $(RPC_URL) --private-key $(PRIVATE_KEY) -vvvv

# ── 0. Sanity checks ──────────────────────────────────────────────────────────

.PHONY: check-env
check-env:
	@test -f .env || (echo "ERROR: .env not found — copy .env.example and fill it in" && exit 1)
	@test "$(RPC_URL)"        != "" || (echo "ERROR: RPC_URL not set"        && exit 1)
	@test "$(PRIVATE_KEY)"    != "" || (echo "ERROR: PRIVATE_KEY not set"    && exit 1)
	@test "$(MULTISIG_ADDRESS)" != "0xYourMultisigAddressHere" || \
		(echo "ERROR: MULTISIG_ADDRESS not set — see .env.example" && exit 1)
	@echo "✔  .env looks good"

# ── 1. Tests ──────────────────────────────────────────────────────────────────

.PHONY: test
test:
	forge test -vvv

.PHONY: test-gas
test-gas:
	forge test --gas-report

# ── 2. Deploy Governance (step 1 of 2) ───────────────────────────────────────
# After this runs: copy "TimelockController :" address into .env TIMELOCK_ADDRESS

.PHONY: deploy-governance
deploy-governance: check-env
	forge script script/DeployGovernance.s.sol $(FORGE_FLAGS)
	@echo ""
	@echo ">>> Copy the 'TimelockController :' address above into TIMELOCK_ADDRESS in .env"
	@echo ">>> Then run: make deploy-core"

.PHONY: deploy-governance-dry
deploy-governance-dry: check-env
	forge script script/DeployGovernance.s.sol $(FORGE_DRY_RUN)

# ── 3. Deploy Core (step 2 of 2) ─────────────────────────────────────────────
# Requires TIMELOCK_ADDRESS to be filled in .env first

.PHONY: deploy-core
deploy-core: check-env
	@test "$(TIMELOCK_ADDRESS)" != "0xTimelockControllerAddressHere" || \
		(echo "ERROR: Fill TIMELOCK_ADDRESS in .env first (from deploy-governance output)" && exit 1)
	@test "$(PAYMENT_TOKEN)" != "0xUsdcOrPaymentTokenAddressHere" || \
		(echo "ERROR: Fill PAYMENT_TOKEN in .env (Sepolia USDC: 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238)" && exit 1)
	forge script script/DeployCore.s.sol $(FORGE_FLAGS)
	@echo ""
	@echo ">>> Copy the proxy addresses above into:"
	@echo "    frontend/lib/contracts/addresses.ts  (11155111 section)"
	@echo "    subgraph/subgraph.yaml               (each source.address)"
	@echo ">>> Then run: make subgraph-deploy"

.PHONY: deploy-core-dry
deploy-core-dry: check-env
	forge script script/DeployCore.s.sol $(FORGE_DRY_RUN)

# ── 4. Graph Node (docker-compose) ───────────────────────────────────────────

.PHONY: graph-up
graph-up:
	docker compose up -d
	@echo "Graph node starting... wait ~15s then check: make graph-status"

.PHONY: graph-down
graph-down:
	docker compose down

.PHONY: graph-logs
graph-logs:
	docker compose logs -f graph-node

.PHONY: graph-status
graph-status:
	@curl -s http://localhost:8030/graphql \
		-H 'Content-Type: application/json' \
		-d '{"query":"{indexingStatuses{subgraph health}}"}' | python3 -m json.tool 2>/dev/null \
		|| echo "Graph node not yet reachable — try again in a few seconds"

# ── 5. Subgraph ───────────────────────────────────────────────────────────────

.PHONY: subgraph-install
subgraph-install:
	cd subgraph && npm install

.PHONY: subgraph-codegen
subgraph-codegen:
	cd subgraph && npx graph codegen

.PHONY: subgraph-build
subgraph-build:
	cd subgraph && npx graph build

.PHONY: subgraph-create
subgraph-create:
	cd subgraph && npx graph create --node http://localhost:8020/ rwa-realestate

.PHONY: subgraph-deploy
subgraph-deploy: subgraph-build
	cd subgraph && npx graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 rwa-realestate
	@echo "Subgraph deployed → http://localhost:8000/subgraphs/name/rwa-realestate"

# Full subgraph setup from scratch (after graph-up is healthy):
.PHONY: subgraph-init
subgraph-init: subgraph-install subgraph-codegen subgraph-build subgraph-create subgraph-deploy

# ── 6. Frontend ───────────────────────────────────────────────────────────────

.PHONY: frontend-install
frontend-install:
	cd frontend && npm install

.PHONY: frontend-dev
frontend-dev:
	cd frontend && npm run dev

.PHONY: frontend-build
frontend-build:
	cd frontend && npm run build

# ── 7. Full local stack ───────────────────────────────────────────────────────
# Starts graph node, deploys subgraph, starts frontend — all in sequence.

.PHONY: stack-up
stack-up: graph-up
	@echo "Waiting 20s for graph-node to initialize..."
	@sleep 20
	$(MAKE) subgraph-init
	$(MAKE) frontend-dev

# ── 8. Complete deployment sequence reminder ──────────────────────────────────

.PHONY: help
help:
	@echo ""
	@echo "=== Deployment Sequence ==="
	@echo ""
	@echo "  1.  Fill in .env (copy from .env.example)"
	@echo "  2.  make test                  — run all tests"
	@echo "  3.  make deploy-governance     — deploy TimelockController"
	@echo "      → paste output address into .env TIMELOCK_ADDRESS"
	@echo "  4.  make deploy-core           — deploy all core contracts"
	@echo "      → paste output addresses into:"
	@echo "          frontend/lib/contracts/addresses.ts"
	@echo "          subgraph/subgraph.yaml"
	@echo "  5.  make graph-up              — start Graph Node stack"
	@echo "  6.  make subgraph-init         — codegen + build + deploy subgraph"
	@echo "  7.  make frontend-dev          — start Next.js dev server"
	@echo ""
	@echo "=== Quick commands ==="
	@echo "  make graph-logs    — tail graph-node logs"
	@echo "  make graph-status  — check subgraph indexing status"
	@echo "  make test-gas      — run tests with gas report"
	@echo ""
