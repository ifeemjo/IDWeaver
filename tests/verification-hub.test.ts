import { describe, it, expect, beforeEach } from "vitest";

interface VerificationEntry {
  verifier: string;
  user: string;
  credentialHash: string;
  submittedAt: bigint;
  isVerified: boolean;
}

interface EventEntry {
  verifier: string;
  user: string;
  proofHash: string;
  credentialHash: string;
  eventType: string;
  timestamp: bigint;
}

interface MockCredentialIssuer {
  isCredentialValid(credentialHash: string): { value: boolean } | { error: number };
}

interface MockContract {
  admin: string;
  paused: boolean;
  verificationCount: bigint;
  credentialIssuerContract?: string;
  verifications: Map<string, VerificationEntry>;
  events: Map<bigint, EventEntry>;
  lastEventId: bigint;
  blockHeight: bigint;
  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  setCredentialIssuerContract(caller: string, issuerContract: string): { value: boolean } | { error: number };
  submitProof(caller: string, proofHash: string, credentialHash: string, verifier: string, credentialIssuer: MockCredentialIssuer): { value: boolean } | { error: number };
  markProofVerified(caller: string, proofHash: string): { value: boolean } | { error: number };
  getVerificationDetails(proofHash: string): { value: VerificationEntry } | { error: number };
  getVerificationCount(): { value: bigint };
  getAdmin(): { value: string };
  isPaused(): { value: boolean };
  getEvent(eventId: bigint): { value: EventEntry } | { error: number };
  getVerifierEvents(verifier: string, limit: bigint, offset: bigint): { value: EventEntry[] } | { error: number };
}

const mockCredentialIssuer: MockCredentialIssuer = {
  isCredentialValid(credentialHash: string) {
    return credentialHash === "hash123" ? { value: true } : { value: false };
  },
};

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  verificationCount: 0n,
  credentialIssuerContract: undefined,
  verifications: new Map(),
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
    if (issuerContract === "SP000000000000000000002Q6VF78") return { error: 105 };
    this.credentialIssuerContract = issuerContract;
    return { value: true };
  },

  submitProof(caller: string, proofHash: string, credentialHash: string, verifier: string, credentialIssuer: MockCredentialIssuer) {
    if (this.paused) return { error: 107 };
    if (proofHash.length === 0 || proofHash.length > 64) return { error: 101 };
    if (verifier === "SP000000000000000000002Q6VF78") return { error: 105 };
    if (this.verifications.has(proofHash)) return { error: 103 };
    if (this.blockHeight === 0n) return { error: 106 };
    if (!this.credentialIssuerContract) return { error: 108 };
    const isValid = credentialIssuer.isCredentialValid(credentialHash);
    if ("error" in isValid || !isValid.value) return { error: 102 };
    this.verifications.set(proofHash, { verifier, user: caller, credentialHash, submittedAt: this.blockHeight, isVerified: false });
    this.verificationCount += 1n;
    this.lastEventId += 1n;
    this.events.set(this.lastEventId, { verifier, user: caller, proofHash, credentialHash, eventType: "submit", timestamp: this.blockHeight });
    return { value: true };
  },

  markProofVerified(caller: string, proofHash: string) {
    if (this.paused) return { error: 107 };
    const verification = this.verifications.get(proofHash);
    if (!verification) return { error: 104 };
    if (verification.verifier !== caller) return { error: 100 };
    if (verification.isVerified) return { error: 103 };
    this.verifications.set(proofHash, { ...verification, isVerified: true });
    this.lastEventId += 1n;
    this.events.set(this.lastEventId, { verifier: caller, user: verification.user, proofHash, credentialHash: verification.credentialHash, eventType: "verify", timestamp: this.blockHeight });
    return { value: true };
  },

  getVerificationDetails(proofHash: string) {
    const verification = this.verifications.get(proofHash);
    return verification ? { value: verification } : { error: 104 };
  },

  getVerificationCount() {
    return { value: this.verificationCount };
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

describe("Verification Hub Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.verificationCount = 0n;
    mockContract.credentialIssuerContract = undefined;
    mockContract.verifications = new Map();
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

  it("should allow admin to set credential issuer contract", () => {
    const result = mockContract.setCredentialIssuerContract(mockContract.admin, "ST2CY5...");
    expect(result).toEqual({ value: true });
    expect(mockContract.credentialIssuerContract).toEqual("ST2CY5...");
  });

  it("should prevent non-admin from setting credential issuer contract", () => {
    const result = mockContract.setCredentialIssuerContract("ST2CY5...", "ST3NB...");
    expect(result).toEqual({ error: 100 });
  });

  it("should allow user to submit proof with valid credential", () => {
    mockContract.setCredentialIssuerContract(mockContract.admin, "ST2CY5...");
    const result = mockContract.submitProof("ST3NB...", "proof123", "hash123", "ST4PF...", mockCredentialIssuer);
    expect(result).toEqual({ value: true });
    expect(mockContract.getVerificationDetails("proof123")).toEqual({
      value: { verifier: "ST4PF...", user: "ST3NB...", credentialHash: "hash123", submittedAt: 1000n, isVerified: false },
    });
    expect(mockContract.getVerificationCount()).toEqual({ value: 1n });
    expect(mockContract.getEvent(1n)).toEqual({
      value: { verifier: "ST4PF...", user: "ST3NB...", proofHash: "proof123", credentialHash: "hash123", eventType: "submit", timestamp: 1000n },
    });
  });

  it("should prevent submitting proof with invalid credential", () => {
    mockContract.setCredentialIssuerContract(mockContract.admin, "ST2CY5...");
    const result = mockContract.submitProof("ST3NB...", "proof123", "invalid", "ST4PF...", mockCredentialIssuer);
    expect(result).toEqual({ error: 102 });
  });

  it("should prevent submitting proof without credential issuer contract", () => {
    const result = mockContract.submitProof("ST3NB...", "proof123", "hash123", "ST4PF...", mockCredentialIssuer);
    expect(result).toEqual({ error: 108 });
  });

  it("should prevent submitting invalid proof hash", () => {
    mockContract.setCredentialIssuerContract(mockContract.admin, "ST2CY5...");
    const result = mockContract.submitProof("ST3NB...", "", "hash123", "ST4PF...", mockCredentialIssuer);
    expect(result).toEqual({ error: 101 });
  });

  it("should allow verifier to mark proof as verified", () => {
    mockContract.setCredentialIssuerContract(mockContract.admin, "ST2CY5...");
    mockContract.submitProof("ST3NB...", "proof123", "hash123", "ST4PF...", mockCredentialIssuer);
    const result = mockContract.markProofVerified("ST4PF...", "proof123");
    expect(result).toEqual({ value: true });
    expect(mockContract.getVerificationDetails("proof123")).toEqual({
      value: { verifier: "ST4PF...", user: "ST3NB...", credentialHash: "hash123", submittedAt: 1000n, isVerified: true },
    });
    expect(mockContract.getEvent(2n)).toEqual({
      value: { verifier: "ST4PF...", user: "ST3NB...", proofHash: "proof123", credentialHash: "hash123", eventType: "verify", timestamp: 1000n },
    });
  });

  it("should prevent non-verifier from marking proof as verified", () => {
    mockContract.setCredentialIssuerContract(mockContract.admin, "ST2CY5...");
    mockContract.submitProof("ST3NB...", "proof123", "hash123", "ST4PF...", mockCredentialIssuer);
    const result = mockContract.markProofVerified("ST5QA...", "proof123");
    expect(result).toEqual({ error: 100 });
  });

  it("should prevent marking non-existent proof as verified", () => {
    mockContract.setCredentialIssuerContract(mockContract.admin, "ST2CY5...");
    const result = mockContract.markProofVerified("ST4PF...", "proof123");
    expect(result).toEqual({ error: 104 });
  });

  it("should prevent actions when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    mockContract.setCredentialIssuerContract(mockContract.admin, "ST2CY5...");
    expect(mockContract.submitProof("ST3NB...", "proof123", "hash123", "ST4PF...", mockCredentialIssuer)).toEqual({ error: 107 });
    expect(mockContract.markProofVerified("ST4PF...", "proof123")).toEqual({ error: 107 });
  });

  it("should return verifier events with pagination", () => {
    mockContract.setCredentialIssuerContract(mockContract.admin, "ST2CY5...");
    mockContract.submitProof("ST3NB...", "proof123", "hash123", "ST4PF...", mockCredentialIssuer);
    mockContract.markProofVerified("ST4PF...", "proof123");
    const result = mockContract.getVerifierEvents("ST4PF...", 2n, 0n);
    expect(result).toEqual({
      value: [
        { verifier: "ST4PF...", user: "ST3NB...", proofHash: "proof123", credentialHash: "hash123", eventType: "submit", timestamp: 1000n },
        { verifier: "ST4PF...", user: "ST3NB...", proofHash: "proof123", credentialHash: "hash123", eventType: "verify", timestamp: 1000n },
      ],
    });

    const limitedResult = mockContract.getVerifierEvents("ST4PF...", 1n, 1n);
    expect(limitedResult).toEqual({
      value: [{ verifier: "ST4PF...", user: "ST3NB...", proofHash: "proof123", credentialHash: "hash123", eventType: "verify", timestamp: 1000n }],
    });
  });
});