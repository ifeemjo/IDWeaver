# IDWeaver

A blockchain-based Self-Sovereign Identity (SSI) framework that enables individuals to own, control, and share their digital identities through verifiable credentials, trusted attestations, and selective disclosure — all secured on-chain.

---

## Overview

IDWeaver consists of five smart contracts that together form a decentralized, trustless identity layer suitable for both individuals and institutions:

1. **Identity Registry Contract** – Registers and manages decentralized identifiers (DIDs).
2. **Credential Issuer Contract** – Allows trusted entities to issue and revoke verifiable credentials.
3. **Verification Hub Contract** – Handles credential proof submissions for verification purposes.
4. **Access Policy Contract** – Enables users to define disclosure rules and permission settings.
5. **Reputation Score Contract** – Calculates and tracks user reputation based on verified credentials.

---

## Features

- **User-controlled identity** using decentralized identifiers (DIDs)  
- **Verifiable credentials** anchored on-chain via hash commitments  
- **Selective disclosure policies** for privacy-preserving identity sharing  
- **ZK-proof compatible** off-chain architecture  
- **Trustless verification** between issuers, users, and verifiers  
- **Reputation scores** based on attested activity or credentials  

---

## Smart Contracts

### Identity Registry Contract
- Register a user's DID against their principal address
- Update or rotate DID records
- Emit identity registration events

### Credential Issuer Contract
- Register and authorize issuers (universities, banks, NGOs)
- Issue, revoke, and expire credential hashes
- Store metadata and attestation references

### Verification Hub Contract
- Allow verifiers to request and validate credential proofs
- Users can anchor zk-proof hashes on-chain
- Enable one-time verification tokens

### Access Policy Contract
- Users define who can access what credential types
- Supports fine-grained permission control
- Policies enforced at credential request time

### Reputation Score Contract
- Assign scores to users based on verified credentials
- Reputation feeds into external systems (DeFi, jobs, etc.)
- DAO governance could influence scoring logic

---

## Installation

1. Install [Clarinet CLI](https://docs.hiro.so/clarinet/getting-started)
2. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/idweaver.git
   ```
3. Install dependencies:
    ```bash
    npm install
    ```
4. Run tests:
    ```bash
    npm test
    ```
5. Deploy contracts:
    ```bash
    clarinet deploy
    ```

---

## Usage

Each contract in IDWeaver operates as an independent module but integrates seamlessly with others to support a complete SSI flow:

Register DID → Receive Verifiable Credential → Set Access Policies → Submit Proof → Get Verified → Build Reputation

Use the frontend dApp or wallet plugin to manage identity interactions, credential issuance, and proof requests.

---

## License

MIT License
