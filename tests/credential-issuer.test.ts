import { describe, it, expect, beforeEach } from "vitest";

interface CredentialEntry {
  issuer: string;
  issuedTo: string;
  issuedAt: bigint;
  expiresAt?: bigint;
  isRevoked: boolean;
}

interface EventEntry {
  issuer: string;
  credentialHash: string;
  eventType: string;
  timestamp: bigint;
}

interface MockContract {
  admin: string;
  paused: boolean;
  credentialCount: bigint;
  issuerWhitelist: Map<string, { isWhitelisted: boolean }>;
  credentials: Map<string, CredentialEntry>;
  events: Map<bigint, EventEntry>;
  lastEventId: bigint;
  blockHeight: bigint;
  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  addIssuer(caller: string, issuer: string): { value: boolean } | { error: number };
  removeIssuer(caller: string, issuer: string): { value: boolean } | { error: number };
  issueCredential(caller: string, credentialHash: string, issuedTo: string, expiresAt?: bigint): { value: boolean } | { error: number };
  revokeCredential(caller: string, credentialHash: string): { value: boolean } | { error: number };
  isCredentialValid(credentialHash: string): { value: boolean } | { error: number };
  getCredentialDetails(credentialHash: string): { value: CredentialEntry } | { error: number };
  getIssuerStatus(issuer: string): { value: boolean };
  getCredentialCount(): { value: bigint };
  getAdmin(): { value: string };
  isPaused(): { value: boolean };
  getEvent(eventId: bigint): { value: EventEntry } | { error: number };
  getIssuerEvents(issuer: string, limit: bigint, offset: bigint): { value: EventEntry[] } | { error: number };
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  credentialCount: 0n,
  issuerWhitelist: new Map(),
  credentials: new Map(),
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

  addIssuer(caller: string, issuer: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (issuer === "SP000000000000000000002Q6VF78") return { error: 105 };
    if (this.issuerWhitelist.has(issuer)) return { error: 108 };
    this.issuerWhitelist.set(issuer, { isWhitelisted: true });
    return { value: true };
  },

  removeIssuer(caller: string, issuer: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (!this.issuerWhitelist.has(issuer)) return { error: 109 };
    this.issuerWhitelist.delete(issuer);
    return { value: true };
  },

  issueCredential(caller: string, credentialHash: string, issuedTo: string, expiresAt?: bigint) {
    if (this.paused) return { error: 107 };
    if (!this.issuerWhitelist.has(caller)) return { error: 102 };
    if (credentialHash.length === 0 || credentialHash.length > 64) return { error: 101 };
    if (issuedTo === "SP000000000000000000002Q6VF78") return { error: 105 };
    if (this.credentials.has(credentialHash)) return { error: 103 };
    if (this.blockHeight === 0n) return { error: 106 };
    this.credentials.set(credentialHash, { issuer: caller, issuedTo, issuedAt: this.blockHeight, expiresAt, isRevoked: false });
    this.credentialCount += 1n;
    this.lastEventId += 1n;
    this.events.set(this.lastEventId, { issuer: caller, credentialHash, eventType: "issue", timestamp: this.blockHeight });
    return { value: true };
  },

  revokeCredential(caller: string, credentialHash: string) {
    if (this.paused) return { error: 107 };
    if (!this.issuerWhitelist.has(caller)) return { error: 102 };
    const credential = this.credentials.get(credentialHash);
    if (!credential) return { error: 104 };
    if (credential.issuer !== caller) return { error: 100 };
    if (credential.isRevoked) return { error: 104 };
    this.credentials.set(credentialHash, { ...credential, isRevoked: true });
    this.lastEventId += 1n;
    this.events.set(this.lastEventId, { issuer: caller, credentialHash, eventType: "revoke", timestamp: this.blockHeight });
    return { value: true };
  },

  isCredentialValid(credentialHash: string) {
    const credential = this.credentials.get(credentialHash);
    if (!credential) return { error: 104 };
    const isValid = !credential.isRevoked && (!credential.expiresAt || this.blockHeight <= credential.expiresAt);
    return { value: isValid };
  },

  getCredentialDetails(credentialHash: string) {
    const credential = this.credentials.get(credentialHash);
    return credential ? { value: credential } : { error: 104 };
  },

  getIssuerStatus(issuer: string) {
    return { value: this.issuerWhitelist.has(issuer) };
  },

  getCredentialCount() {
    return { value: this.credentialCount };
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

  getIssuerEvents(issuer: string, limit: bigint, offset: bigint) {
    const eventIds = Array.from({ length: Number(limit) }, (_, i) => BigInt(i) + offset + 1n);
    const filtered = eventIds
      .map(id => this.events.get(id))
      .filter((event): event is EventEntry => event !== undefined && event.issuer === issuer);
    return { value: filtered };
  },
};

describe("Credential Issuer Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.credentialCount = 0n;
    mockContract.issuerWhitelist = new Map();
    mockContract.credentials = new Map();
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

  it("should allow admin to add and remove issuer from whitelist", () => {
    const addResult = mockContract.addIssuer(mockContract.admin, "ST2CY5...");
    expect(addResult).toEqual({ value: true });
    expect(mockContract.getIssuerStatus("ST2CY5...")).toEqual({ value: true });

    const removeResult = mockContract.removeIssuer(mockContract.admin, "ST2CY5...");
    expect(removeResult).toEqual({ value: true });
    expect(mockContract.getIssuerStatus("ST2CY5...")).toEqual({ value: false });
  });

  it("should prevent adding already whitelisted issuer", () => {
    mockContract.addIssuer(mockContract.admin, "ST2CY5...");
    const result = mockContract.addIssuer(mockContract.admin, "ST2CY5...");
    expect(result).toEqual({ error: 108 });
  });

  it("should prevent removing non-whitelisted issuer", () => {
    const result = mockContract.removeIssuer(mockContract.admin, "ST2CY5...");
    expect(result).toEqual({ error: 109 });
  });

  it("should allow whitelisted issuer to issue credential", () => {
    mockContract.addIssuer(mockContract.admin, "ST2CY5...");
    const result = mockContract.issueCredential("ST2CY5...", "hash123", "ST3NB...", 2000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.getCredentialDetails("hash123")).toEqual({
      value: { issuer: "ST2CY5...", issuedTo: "ST3NB...", issuedAt: 1000n, expiresAt: 2000n, isRevoked: false },
    });
    expect(mockContract.getCredentialCount()).toEqual({ value: 1n });
    expect(mockContract.getEvent(1n)).toEqual({
      value: { issuer: "ST2CY5...", credentialHash: "hash123", eventType: "issue", timestamp: 1000n },
    });
  });

  it("should prevent non-whitelisted issuer from issuing credential", () => {
    const result = mockContract.issueCredential("ST2CY5...", "hash123", "ST3NB...", 2000n);
    expect(result).toEqual({ error: 102 });
  });

  it("should prevent issuing invalid credential hash", () => {
    mockContract.addIssuer(mockContract.admin, "ST2CY5...");
    const result = mockContract.issueCredential("ST2CY5...", "", "ST3NB...");
    expect(result).toEqual({ error: 101 });
  });

  it("should allow issuer to revoke credential", () => {
    mockContract.addIssuer(mockContract.admin, "ST2CY5...");
    mockContract.issueCredential("ST2CY5...", "hash123", "ST3NB...", 2000n);
    const result = mockContract.revokeCredential("ST2CY5...", "hash123");
    expect(result).toEqual({ value: true });
    expect(mockContract.getCredentialDetails("hash123")).toEqual({
      value: { issuer: "ST2CY5...", issuedTo: "ST3NB...", issuedAt: 1000n, expiresAt: 2000n, isRevoked: true },
    });
    expect(mockContract.getEvent(2n)).toEqual({
      value: { issuer: "ST2CY5...", credentialHash: "hash123", eventType: "revoke", timestamp: 1000n },
    });
  });

  it("should prevent revoking non-existent credential", () => {
    mockContract.addIssuer(mockContract.admin, "ST2CY5...");
    const result = mockContract.revokeCredential("ST2CY5...", "hash123");
    expect(result).toEqual({ error: 104 });
  });

  it("should prevent non-issuer from revoking credential", () => {
    mockContract.addIssuer(mockContract.admin, "ST2CY5...");
    mockContract.issueCredential("ST2CY5...", "hash123", "ST3NB...", 2000n);
    const result = mockContract.revokeCredential("ST4PF...", "hash123");
    expect(result).toEqual({ error: 102 });
  });

  it("should validate credential status", () => {
    mockContract.addIssuer(mockContract.admin, "ST2CY5...");
    mockContract.issueCredential("ST2CY5...", "hash123", "ST3NB...", 2000n);
    expect(mockContract.isCredentialValid("hash123")).toEqual({ value: true });

    mockContract.blockHeight = 3000n;
    expect(mockContract.isCredentialValid("hash123")).toEqual({ value: false });

    mockContract.revokeCredential("ST2CY5...", "hash123");
    expect(mockContract.isCredentialValid("hash123")).toEqual({ value: false });
  });

  it("should prevent actions when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    expect(mockContract.issueCredential("ST2CY5...", "hash123", "ST3NB...", 2000n)).toEqual({ error: 107 });
    expect(mockContract.revokeCredential("ST2CY5...", "hash123")).toEqual({ error: 107 });
  });

  it("should return issuer events with pagination", () => {
    mockContract.addIssuer(mockContract.admin, "ST2CY5...");
    mockContract.issueCredential("ST2CY5...", "hash123", "ST3NB...", 2000n);
    mockContract.revokeCredential("ST2CY5...", "hash123");
    const result = mockContract.getIssuerEvents("ST2CY5...", 2n, 0n);
    expect(result).toEqual({
      value: [
        { issuer: "ST2CY5...", credentialHash: "hash123", eventType: "issue", timestamp: 1000n },
        { issuer: "ST2CY5...", credentialHash: "hash123", eventType: "revoke", timestamp: 1000n },
      ],
    });

    const limitedResult = mockContract.getIssuerEvents("ST2CY5...", 1n, 1n);
    expect(limitedResult).toEqual({
      value: [{ issuer: "ST2CY5...", credentialHash: "hash123", eventType: "revoke", timestamp: 1000n }],
    });
  });
});