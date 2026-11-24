# Software Requirements Specification (SRS)

## Automated OpenSea FCFS & Public NFT Minting Bot

| Document Field | Value |
|---|---|
| Document ID | SRS-OS-MINT-001 |
| Version | 1.1 (Baseline Specification) |
| Target Host | Oracle Cloud VPS (Ubuntu LTS) |
| Primary Stack | TypeScript, Viem, Fastify, Postgres, Redis |

## 1. Introduction

### 1.1 Purpose

This document defines the functional, data, interface, and performance requirements for an automated EVM NFT minting system targeting OpenSea Drops (SeaDrop). It serves as a technical blueprint so collaborators understand the system architecture, data flow, and operational boundaries.

### 1.2 Scope

The system automates two primary OpenSea minting workflows across EVM-compatible networks:

- **FCFS / Allowlist Mints (mintSigned):** Acquiring pre-signed cryptographic payloads from OpenSea's Drops API at stage activation and broadcasting transactions with minimal latency.
- **Public Mints (mintPublic):** Executing public drop transactions either via OpenSea's Drops API or by calling the SeaDrop smart contract directly on-chain.

Operators configure tasks, manage burner wallets, and monitor execution through two synchronized interfaces: a **Web Dashboard** and a **Telegram Bot**.

### 1.3 Phased Development Strategy

- **Phase 1 (MVP):** Core TypeScript execution engine and Telegram bot controls/notifications deployed on an Oracle VPS.
- **Phase 2 (Control Plane):** Full-stack Web Dashboard backed by Fastify, PostgreSQL, and Redis.
- **Phase 3 (Hot-Path Optimization):** Migrating the transaction-execution worker from TypeScript to a compiled Rust binary while keeping the API, database, Web UI, and Telegram bot unchanged.

## 2. System Architecture & Operating Environment

### 2.1 High-Level Architecture

The system uses a decoupled modular design that isolates time-sensitive blockchain execution from user-facing HTTP and messaging I/O:

**SRS-OS-MINT-001 • Automated OpenSea NFT Minting Bot**

**Page 1 of 5**

```text
┌──────────────────────┐      ┌──────────────────────┐
│    Web Dashboard     │      │     Telegram Bot     │
│      (Next.js)       │      │       (grammY)       │
└──────────┬───────────┘      └──────────┬───────────┘
           │                             │
           └──────────────┬──────────────┘
                          ▼
               ┌─────────────────────┐
               │   Core API & State  │
               │      (Fastify)      │
               └──────────┬──────────┘
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
┌───────────────────────┐   ┌───────────────────────┐
│  PostgreSQL + Redis   │   │   Mint Engine Worker  │
│ (Tasks, Wallets, Logs)│   │ (TS/Viem -> Rust)     │
└───────────────────────┘   └───────────────────────┘
```

### 2.2 Operating Environment

- **Server Infrastructure:** Oracle Cloud VPS running Ubuntu Linux (22.04 / 24.04 LTS), provisioned in a region geographically close to primary RPC endpoints to minimize network round-trip latency.
- **Runtime & Tooling:** Node.js (v20+), TypeScript, Viem (EVM client), Fastify (REST API), grammY (Telegram framework), Next.js (Web UI), PostgreSQL, and Redis.

## 3. External Interface Requirements

### 3.1 Blockchain & RPC Interface

- Connects to EVM networks (Ethereum, Base, Arbitrum, Optimism, Polygon) via low-latency HTTPS and WebSocket RPC endpoints.
- Interacts with the canonical SeaDrop 1.0 contract (0x00005EA00Ac477B1030CE78506496e8C2dE24bf5).

### 3.2 OpenSea Drops API Interface

- **GET /api/v2/drops/{slug}:** Fetches drop metadata, stage schedules (startTime, endTime), wallet mint caps, and pricing.
- **POST /api/v2/drops/{slug}/mint:** Submits wallet address, quantity, and optional token_id (for ERC-1155) to retrieve encoded mintSigned or mintPublic transaction payloads (to, data, value).

### 3.3 User Interfaces

- **Telegram Bot:** Command-driven interface (/add, /tasks, /wallets, /gas, /pause, /cancel) plus asynchronous push notifications.
- **Web Dashboard:** Browser interface for bulk wallet management, visual task scheduling, gas presets, and live execution logs.

**SRS-OS-MINT-001 • Automated OpenSea NFT Minting Bot**

**Page 2 of 5**

## 4. Functional Requirements

### 4.1 Drop Configuration & Resolution

- **FR-1.1:** Users shall be able to create a mint task using either an OpenSea collection slug or a direct NFT contract address.
- **FR-1.2:** The system shall automatically fetch stage parameters from OpenSea's API and support fallback on-chain reads (getPublicDrop) directly from SeaDrop.

### 4.2 Mint Execution Modes

- **FR-2.1 (Pre-Signed FCFS / Allowlist):** For mintSigned stages, the worker shall authenticate via SIWE (Sign-In With Ethereum) when required, poll OpenSea's /mint endpoint leading into startTime, cache the returned calldata in memory, and immediately sign and broadcast the raw transaction upon receiving a valid payload.
- **FR-2.2 (Direct Public Mint):** For public stages, the worker shall support encoding and sending mintPublic directly to the SeaDrop contract at startTime without relying on OpenSea's API.
- **FR-2.3 (Token Standards):** The system shall support both ERC-721 and ERC-1155 drops.

### 4.3 Gas, Nonce & Multi-Wallet Management

- **FR-3.1:** The worker shall pre-fetch and cache each assigned wallet's current nonce and EIP-1559 gas parameters (maxFeePerGas, maxPriorityFeePerGas) prior to drop start time so zero read RPC calls occur during execution.
- **FR-3.2:** Users shall be able to assign multiple burner wallets to a single drop task for concurrent execution.
- **FR-3.3:** Users shall be able to configure custom priority fee (Gwei) boosts per task.

### 4.4 Notifications & Telemetry

- **FR-4.1:** The Mint Engine Worker shall publish lifecycle events (SIGNATURE_ACQUIRED, TX_BROADCASTED, TX_CONFIRMED, TX_REVERTED) to Redis Pub/Sub.
- **FR-4.2:** The Telegram bot shall forward these events to the user in real time, including transaction hashes, block explorer links, and decoded revert reasons on failure.

## 5. Logical Database & Storage Requirements

The system uses a hybrid storage model combining PostgreSQL (durable relational persistence) and Redis (in-memory speed and messaging).

### 5.1 PostgreSQL Entities (Persistent Storage)

| Entity / Table | Purpose | Key Attributes & Constraints |
|---|---|---|
| wallets | Stores burner wallets used for automated minting. | id, label, public_address, encrypted_private_key, iv_and_auth_tag, created_at. Private keys must be encrypted with AES-256-GCM. |

**SRS-OS-MINT-001 • Automated OpenSea NFT Minting Bot**

**Page 3 of 5**

| Entity / Table | Purpose | Key Attributes & Constraints |
|---|---|---|
| tasks | Stores configured mint jobs and execution rules. | id, collection_slug, contract_address, chain_id, mint_mode (SIGNED_FCFS \| PUBLIC_DIRECT \| PUBLIC_API), token_standard, token_id, quantity, start_timestamp, priority_fee_gwei, status. |
| task_wallets | Many-to-many join table linking tasks and burner wallets. | task_id, wallet_id, allocated_quantity, minted_count. Enforces per-wallet mint caps. |
| execution_logs | Audit trail of every broadcast attempt and outcome. | id, task_id, wallet_id, tx_hash, stage_type, status (PENDING \| CONFIRMED \| REVERTED), gas_used, error_reason, timestamp. |
| settings | Global system configuration and API credentials. | id, rpc_urls_json, opensea_api_key, default_gas_gwei, authorized_telegram_chat_ids. |

### 5.2 Redis Data Structures (In-Memory Runtime)

- **Active Task Cache (Hash / JSON):** Mirrors active and upcoming tasks in RAM so the Mint Engine Worker performs zero database disk queries during a live drop.
- **Nonce & Gas State (Key-Value):** Tracks live wallet nonces and base/priority fee snapshots milliseconds before execution.
- **Event Bus (Pub/Sub):** Streams real-time worker alerts directly to the Telegram bot and Web Dashboard log viewer.

## 6. Non-Functional Requirements

### 6.1 Performance & Latency

- **NFR-1.1:** Local processing time from receiving a valid mintSigned payload to broadcasting the signed raw transaction to the RPC node shall be under 15 ms.
- **NFR-1.2:** Both the Web Dashboard and Telegram bot shall read and write through the same Fastify API so state changes synchronize across both interfaces within 500 ms.

### 6.2 Security & Access Control

- **NFR-2.1:** Telegram bot commands shall strictly verify incoming chat_id against a server-side whitelist and ignore unauthorized users.
- **NFR-2.2:** Web Dashboard routes shall require authentication (JWT or wallet signature verification).
- **NFR-2.3:** Oracle Cloud VCN Security Lists shall block all inbound ports except 22 (SSH), 80 (HTTP), and 443 (HTTPS).

**SRS-OS-MINT-001 • Automated OpenSea NFT Minting Bot**

**Page 4 of 5**

### 6.3 Availability & Maintainability

- **NFR-3.1:** All background services (API, Telegram bot, Mint Worker) shall run under a process supervisor (PM2 or Docker Compose) with automatic restart policies on crash or VPS reboot.
- **NFR-3.2:** Communication between the control plane (API/DB) and execution worker shall rely on well-defined Redis schemas so the TypeScript worker can be swapped for a Rust binary in Phase 3 without modifying the frontend or Telegram bot.

## 7. Technology Stack Matrix

| Architectural Layer | Phase 1–2 (TypeScript Build) | Phase 3 (Rust Hot-Path Upgrade) |
|---|---|---|
| Execution Worker | Node.js, TypeScript, Viem | Rust, alloy / tokio |
| Backend API | Fastify (TypeScript) | Fastify (Unchanged) |
| Telegram Interface | grammY | grammY (Unchanged) |
| Web Frontend | Next.js, React, Tailwind CSS | Next.js (Unchanged) |
| Data & Event Queue | PostgreSQL, Redis | PostgreSQL, Redis (Unchanged) |
| Hosting & Process | Oracle Cloud VPS (Ubuntu), PM2 / Docker | Oracle Cloud VPS, Docker |

**SRS-OS-MINT-001 • Automated OpenSea NFT Minting Bot**

**Page 5 of 5**
