import { describe, it, expect, beforeEach } from "vitest";

interface PolicyEntry {
  verifier: string;
  credentialType: string;
  user?: string;
  isAllowed: boolean;
}

interface EventEntry {
  policyId: string;
  verifier: string;
  credentialType: string;
  user?: string;
  eventType: string;
  timestamp: bigint;
}

interface MockCredentialIssuer {
  getCredentialDetails(credentialHash: string): { value: { issuer: string, issuedTo: string, issuedAt: bigint, expiresAt?: bigint, isRevoked: boolean } } | { error: number };
}

interface MockVerificationHub {
  getVerificationDetails(proofHash: string): { value: { verifier: string, user: string, credentialHash: string, submittedAt: bigint, isVerified: boolean } } | { error: number };
}

interface MockContract {
  admin: string;
  paused: boolean;
  policyCount: bigint;
  credentialIssuerContract?: string;
  verificationHubContract?: string;
  policies: Map<string, PolicyEntry>;
  events: Map<bigint, EventEntry>;
  lastEventId: bigint;
  blockHeight: bigint;
  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  setCredentialIssuerContract(caller: string, issuerContract: string): { value: boolean } | { error: number };
  setVerificationHubContract(caller: string, hubContract: string): { value: boolean } | { error: number };
  setAccessPolicy(caller: string, policyId: string, verifier: string, credentialType: string, user: string | undefined, isAllowed: boolean): { value: boolean } | { error: number };
  checkAccess(caller: string, proofHash: string, credentialType: string, credentialIssuer: MockCredentialIssuer, verificationHub: MockVerificationHub): { value: boolean } | { error: number };
  getPolicyDetails(policyId: string): { value: PolicyEntry } | { error: number };
  getPolicyCount(): { value: bigint };
  getAdmin(): { value: string };
  isPaused(): { value: boolean };
  getEvent(eventId: bigint): { value: EventEntry } | { error: number };
  getVerifierEvents(verifier: string, limit: bigint, offset: bigint): { value: EventEntry[] } | { error: number };
}

const mockCredentialIssuer: MockCredentialIssuer = {
  getCredentialDetails(credentialHash: string) {
    return credentialHash === "hash123"
      ? { value: { issuer: "ST2CY5...", issuedTo: "ST3NB...", issuedAt: 1000n, expiresAt: 2000n, isRevoked: false } }
      : { error: 104 };
  },
};

const mockVerificationHub: MockVerificationHub = {
  getVerificationDetails(proofHash: string) {
    return proofHash === "proof123"
      ? { value: { verifier: "ST4PF...", user: "ST3NB...", credentialHash: "hash123", submittedAt: 1000n, isVerified: false } }
      : { error: 104 };
  },
};

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  policyCount: 0n,
  credentialIssuerContract: undefined,
  verificationHubContract: undefined,
  policies: new Map(),
  events: new Map(),
  lastEventId: 0n,
  blockHeight: 1000n,

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: pause };
  },

  setCredentialIssuerContract(caller: string, issuerContract: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (issuerContract === "SP000000000000000000002Q6VF78") return { error: 104 };
    this.credentialIssuerContract = issuerContract;
    return { value: true };
  },

  setVerificationHubContract(caller: string, hubContract: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (hubContract === "SP000000000000000000002Q6VF78") return { error: 104 };
    this.verificationHubContract = hubContract;
    return { value: true };
  },

  setAccessPolicy(caller: string, policyId: string, verifier: string, credentialType: string, user: string | undefined, isAllowed: boolean) {
    if (this.paused) return { error: 106 };
    if (!this.isAdmin(caller)) return { error: 100 };
    if (policyId.length === 0 || policyId.length > 64) return { error: 101 };
    if (verifier === "SP000000000000000000002Q6VF78") return { error: 104 };
    if (this.blockHeight === 0n) return { error: 105 };
    this.policies.set(policyId, { verifier, credentialType, user, isAllowed });
    this.policyCount += 1n;
    this.lastEventId += 1n;
    this.events.set(this.lastEventId, { policyId, verifier, credentialType, user, eventType: "set-policy", timestamp: this.blockHeight });
    return { value: true };
  },

  checkAccess(caller: string, proofHash: string, credentialType: string, credentialIssuer: MockCredentialIssuer, verificationHub: MockVerificationHub) {
    if (this.paused) return { error: 106 };
    if (!this.verificationHubContract) return { error: 107 };
    if (!this.credentialIssuerContract) return { error: 107 };
    const verification = verificationHub.getVerificationDetails(proofHash);
    if ("error" in verification) return { error: 101 };
    const { credentialHash, user } = verification.value;
    const credential = credentialIssuer.getCredentialDetails(credentialHash);
    if ("error" in credential) return { error: 101 };
    const policies = Array.from(this.policies.values()).filter(
      policy =>
        policy.verifier === caller &&
        policy.credentialType === credentialType &&
        (!policy.user || policy.user === user)
    );
    return { value: policies.some(policy => policy.isAllowed) };
  },

  getPolicyDetails(policyId: string) {
    const policy = this.policies.get(policyId);
    return policy ? { value: policy } : { error: 103 };
  },

  getPolicyCount() {
    return { value: this.policyCount };
  },

  getAdmin() {
    return { value: this.admin };
  },

  isPaused() {
    return { value: this.paused };
  },

  getEvent(eventId: bigint) {
    const event = this.events.get(eventId);
    return event ? { value: event } : { error: 404 };
  },

  getVerifierEvents(verifier: string, limit: bigint, offset: bigint) {
    const eventIds = Array.from({ length: Number(limit) }, (_, i) => BigInt(i) + offset + 1n);
    const filtered = eventIds
      .map(id => this.events.get(id))
      .filter((event): event is EventEntry => event !== undefined && event.verifier === verifier);
    return { value: filtered };
  },
};

describe("Access Policy Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.policyCount = 0n;
    mockContract.credentialIssuerContract = undefined;
    mockContract.verificationHubContract = undefined;
    mockContract.policies = new Map();
    mockContract.events = new Map();
    mockContract.lastEventId = 0n;
    mockContract.blockHeight = 1000n;
  });

  it("should allow admin to pause and unpause contract", () => {
    const pauseResult = mockContract.setPaused(mockContract.admin, true);
    expect(pauseResult).toEqual({ value: true });
    expect(mockContract.isPaused()).toEqual({ value: true });

    const unpauseResult = mockContract.setPaused(mockContract.admin, false);
    expect(unpauseResult).toEqual({ value: false });
    expect(mockContract.isPaused()).toEqual({ value: false });
  });

  it("should prevent non-admin from pausing contract", () => {
    const result = mockContract.setPaused("ST2CY5...", true);
    expect(result).toEqual({ error: 100 });
  });

  it("should allow admin to set credential issuer and verification hub contracts", () => {
    const issuerResult = mockContract.setCredentialIssuerContract(mockContract.admin, "ST2CY5...");
    expect(issuerResult).toEqual({ value: true });
    expect(mockContract.credentialIssuerContract).toEqual("ST2CY5...");

    const hubResult = mockContract.setVerificationHubContract(mockContract.admin, "ST3NB...");
    expect(hubResult).toEqual({ value: true });
    expect(mockContract.verificationHubContract).toEqual("ST3NB...");
  });

  it("should prevent non-admin from setting contracts", () => {
    const issuerResult = mockContract.setCredentialIssuerContract("ST2CY5...", "ST3NB...");
    expect(issuerResult).toEqual({ error: 100 });

    const hubResult = mockContract.setVerificationHubContract("ST2CY5...", "ST4PF...");
    expect(hubResult).toEqual({ error: 100 });
  });

  it("should allow admin to set access policy", () => {
    const result = mockContract.setAccessPolicy(mockContract.admin, "policy1", "ST4PF...", "credential-type1", "ST3NB...", true);
    expect(result).toEqual({ value: true });
    expect(mockContract.getPolicyDetails("policy1")).toEqual({
      value: { verifier: "ST4PF...", credentialType: "credential-type1", user: "ST3NB...", isAllowed: true },
    });
    expect(mockContract.getPolicyCount()).toEqual({ value: 1n });
    expect(mockContract.getEvent(1n)).toEqual({
      value: { policyId: "policy1", verifier: "ST4PF...", credentialType: "credential-type1", user: "ST3NB...", eventType: "set-policy", timestamp: 1000n },
    });
  });

  it("should prevent non-admin from setting access policy", () => {
    const result = mockContract.setAccessPolicy("ST2CY5...", "policy1", "ST4PF...", "credential-type1", "ST3NB...", true);
    expect(result).toEqual({ error: 100 });
  });

  it("should prevent setting invalid policy ID", () => {
    const result = mockContract.setAccessPolicy(mockContract.admin, "", "ST4PF...", "credential-type1", "ST3NB...", true);
    expect(result).toEqual({ error: 101 });
  });

  it("should allow verifier to check access with valid policy", () => {
    mockContract.setCredentialIssuerContract(mockContract.admin, "ST2CY5...");
    mockContract.setVerificationHubContract(mockContract.admin, "ST3NB...");
    mockContract.setAccessPolicy(mockContract.admin, "policy1", "ST4PF...", "credential-type1", "ST3NB...", true);
    const result = mockContract.checkAccess("ST4PF...", "proof123", "credential-type1", mockCredentialIssuer, mockVerificationHub);
    expect(result).toEqual({ value: true });
  });

  it("should deny access with no matching policy", () => {
    mockContract.setCredentialIssuerContract(mockContract.admin, "ST2CY5...");
    mockContract.setVerificationHubContract(mockContract.admin, "ST3NB...");
    mockContract.setAccessPolicy(mockContract.admin, "policy1", "ST4PF...", "credential-type1", "ST3NB...", false);
    const result = mockContract.checkAccess("ST4PF...", "proof123", "credential-type1", mockCredentialIssuer, mockVerificationHub);
    expect(result).toEqual({ value: false });
  });

  it("should prevent access check without contracts set", () => {
    const result = mockContract.checkAccess("ST4PF...", "proof123", "credential-type1", mockCredentialIssuer, mockVerificationHub);
    expect(result).toEqual({ error: 107 });
  });

  it("should prevent access check with invalid proof", () => {
    mockContract.setCredentialIssuerContract(mockContract.admin, "ST2CY5...");
    mockContract.setVerificationHubContract(mockContract.admin, "ST3NB...");
    const result = mockContract.checkAccess("ST4PF...", "invalid", "credential-type1", mockCredentialIssuer, mockVerificationHub);
    expect(result).toEqual({ error: 101 });
  });

  it("should prevent actions when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    mockContract.setCredentialIssuerContract(mockContract.admin, "ST2CY5...");
    mockContract.setVerificationHubContract(mockContract.admin, "ST3NB...");
    expect(mockContract.setAccessPolicy(mockContract.admin, "policy1", "ST4PF...", "credential-type1", "ST3NB...", true)).toEqual({ error: 106 });
    expect(mockContract.checkAccess("ST4PF...", "proof123", "credential-type1", mockCredentialIssuer, mockVerificationHub)).toEqual({ error: 106 });
  });

  it("should return verifier events with pagination", () => {
    mockContract.setAccessPolicy(mockContract.admin, "policy1", "ST4PF...", "credential-type1", "ST3NB...", true);
    mockContract.setAccessPolicy(mockContract.admin, "policy2", "ST4PF...", "credential-type2", undefined, false);
    const result = mockContract.getVerifierEvents("ST4PF...", 2n, 0n);
    expect(result).toEqual({
      value: [
        { policyId: "policy1", verifier: "ST4PF...", credentialType: "credential-type1", user: "ST3NB...", eventType: "set-policy", timestamp: 1000n },
        { policyId: "policy2", verifier: "ST4PF...", credentialType: "credential-type2", user: undefined, eventType: "set-policy", timestamp: 1000n },
      ],
    });

    const limitedResult = mockContract.getVerifierEvents("ST4PF...", 1n, 1n);
    expect(limitedResult).toEqual({
      value: [{ policyId: "policy2", verifier: "ST4PF...", credentialType: "credential-type2", user: undefined, eventType: "set-policy", timestamp: 1000n }],
    });
  });
});