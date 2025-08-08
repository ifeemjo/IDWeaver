import { describe, it, expect, beforeEach } from "vitest";

interface DidEntry {
  did: string;
  registeredAt: bigint;
  lastUpdated: bigint;
}

interface EventEntry {
  user: string;
  did: string;
  eventType: string;
  timestamp: bigint;
}

interface MockContract {
  admin: string;
  paused: boolean;
  registrationCount: bigint;
  didRegistry: Map<string, DidEntry>;
  didToPrincipal: Map<string, { user: string }>;
  events: Map<bigint, EventEntry>;
  lastEventId: bigint;
  blockHeight: bigint;
  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  registerDid(caller: string, did: string): { value: boolean } | { error: number };
  updateDid(caller: string, newDid: string): { value: boolean } | { error: number };
  deactivateDid(caller: string): { value: boolean } | { error: number };
  getDid(user: string): { value: string } | { error: number };
  getPrincipal(did: string): { value: string } | { error: number };
  getRegistrationDetails(user: string): { value: DidEntry } | { error: number };
  getRegistrationCount(): { value: bigint };
  getAdmin(): { value: string };
  isPaused(): { value: boolean };
  getEvent(eventId: bigint): { value: EventEntry } | { error: number };
  getUserEvents(user: string, limit: bigint, offset: bigint): { value: EventEntry[] } | { error: number };
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  registrationCount: 0n,
  didRegistry: new Map(),
  didToPrincipal: new Map(),
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

  registerDid(caller: string, did: string) {
    if (this.paused) return { error: 107 };
    if (did.length === 0 || did.length > 256 || !did.includes(":")) return { error: 101 };
    if (this.didRegistry.has(caller) || this.didToPrincipal.has(did)) return { error: 102 };
    if (this.blockHeight === 0n) return { error: 105 };
    this.didRegistry.set(caller, { did, registeredAt: this.blockHeight, lastUpdated: this.blockHeight });
    this.didToPrincipal.set(did, { user: caller });
    this.registrationCount += 1n;
    this.lastEventId += 1n;
    this.events.set(this.lastEventId, { user: caller, did, eventType: "register", timestamp: this.blockHeight });
    return { value: true };
  },

  updateDid(caller: string, newDid: string) {
    if (this.paused) return { error: 107 };
    if (newDid.length === 0 || newDid.length > 256 || !newDid.includes(":")) return { error: 101 };
    const currentEntry = this.didRegistry.get(caller);
    if (!currentEntry) return { error: 103 };
    if (this.didToPrincipal.has(newDid)) return { error: 102 };
    const oldDid = currentEntry.did;
    this.didToPrincipal.delete(oldDid);
    this.didRegistry.set(caller, { did: newDid, registeredAt: currentEntry.registeredAt, lastUpdated: this.blockHeight });
    this.didToPrincipal.set(newDid, { user: caller });
    this.lastEventId += 1n;
    this.events.set(this.lastEventId, { user: caller, did: newDid, eventType: "update", timestamp: this.blockHeight });
    return { value: true };
  },

  deactivateDid(caller: string) {
    if (this.paused) return { error: 107 };
    const currentEntry = this.didRegistry.get(caller);
    if (!currentEntry) return { error: 103 };
    const did = currentEntry.did;
    this.didRegistry.delete(caller);
    this.didToPrincipal.delete(did);
    this.registrationCount -= 1n;
    this.lastEventId += 1n;
    this.events.set(this.lastEventId, { user: caller, did, eventType: "deactivate", timestamp: this.blockHeight });
    return { value: true };
  },

  getDid(user: string) {
    const entry = this.didRegistry.get(user);
    return entry ? { value: entry.did } : { error: 103 };
  },

  getPrincipal(did: string) {
    const entry = this.didToPrincipal.get(did);
    return entry ? { value: entry.user } : { error: 103 };
  },

  getRegistrationDetails(user: string) {
    const entry = this.didRegistry.get(user);
    return entry ? { value: entry } : { error: 103 };
  },

  getRegistrationCount() {
    return { value: this.registrationCount };
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

  getUserEvents(user: string, limit: bigint, offset: bigint) {
    const allEvents = Array.from(this.events.values());
    const filtered = allEvents
      .filter(event => event.user === user)
      .slice(Number(offset), Number(offset) + Number(limit));
    return { value: filtered };
  },
};

describe("Identity Registry Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.registrationCount = 0n;
    mockContract.didRegistry = new Map();
    mockContract.didToPrincipal = new Map();
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

  it("should register a valid DID", () => {
    const result = mockContract.registerDid("ST2CY5...", "did:weave:12345");
    expect(result).toEqual({ value: true });
    expect(mockContract.getDid("ST2CY5...")).toEqual({ value: "did:weave:12345" });
    expect(mockContract.getPrincipal("did:weave:12345")).toEqual({ value: "ST2CY5..." });
    expect(mockContract.getRegistrationCount()).toEqual({ value: 1n });
    expect(mockContract.getEvent(1n)).toEqual({
      value: { user: "ST2CY5...", did: "did:weave:12345", eventType: "register", timestamp: 1000n },
    });
  });

  it("should prevent registering an invalid DID", () => {
    const result = mockContract.registerDid("ST2CY5...", "");
    expect(result).toEqual({ error: 101 });
  });

  it("should prevent registering an already registered DID", () => {
    mockContract.registerDid("ST2CY5...", "did:weave:12345");
    const result = mockContract.registerDid("ST3NB...", "did:weave:12345");
    expect(result).toEqual({ error: 102 });
  });

  it("should allow updating a DID", () => {
    mockContract.registerDid("ST2CY5...", "did:weave:12345");
    const result = mockContract.updateDid("ST2CY5...", "did:weave:67890");
    expect(result).toEqual({ value: true });
    expect(mockContract.getDid("ST2CY5...")).toEqual({ value: "did:weave:67890" });
    expect(mockContract.getPrincipal("did:weave:12345")).toEqual({ error: 103 });
    expect(mockContract.getPrincipal("did:weave:67890")).toEqual({ value: "ST2CY5..." });
    expect(mockContract.getEvent(2n)).toEqual({
      value: { user: "ST2CY5...", did: "did:weave:67890", eventType: "update", timestamp: 1000n },
    });
  });

  it("should prevent updating to an already registered DID", () => {
    mockContract.registerDid("ST2CY5...", "did:weave:12345");
    mockContract.registerDid("ST3NB...", "did:weave:67890");
    const result = mockContract.updateDid("ST2CY5...", "did:weave:67890");
    expect(result).toEqual({ error: 102 });
  });

  it("should allow deactivating a DID", () => {
    mockContract.registerDid("ST2CY5...", "did:weave:12345");
    const result = mockContract.deactivateDid("ST2CY5...");
    expect(result).toEqual({ value: true });
    expect(mockContract.getDid("ST2CY5...")).toEqual({ error: 103 });
    expect(mockContract.getPrincipal("did:weave:12345")).toEqual({ error: 103 });
    expect(mockContract.getRegistrationCount()).toEqual({ value: 0n });
    expect(mockContract.getEvent(2n)).toEqual({
      value: { user: "ST2CY5...", did: "did:weave:12345", eventType: "deactivate", timestamp: 1000n },
    });
  });

  it("should prevent actions when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    expect(mockContract.registerDid("ST2CY5...", "did:weave:12345")).toEqual({ error: 107 });
    expect(mockContract.updateDid("ST2CY5...", "did:weave:67890")).toEqual({ error: 107 });
    expect(mockContract.deactivateDid("ST2CY5...")).toEqual({ error: 107 });
  });

  it("should return registration details", () => {
    mockContract.registerDid("ST2CY5...", "did:weave:12345");
    const result = mockContract.getRegistrationDetails("ST2CY5...");
    expect(result).toEqual({
      value: { did: "did:weave:12345", registeredAt: 1000n, lastUpdated: 1000n },
    });
  });

  it("should return user events with pagination", () => {
    mockContract.registerDid("ST2CY5...", "did:weave:12345");
    mockContract.updateDid("ST2CY5...", "did:weave:67890");
    const result = mockContract.getUserEvents("ST2CY5...", 2n, 0n);
    expect(result).toEqual({
      value: [
        { user: "ST2CY5...", did: "did:weave:12345", eventType: "register", timestamp: 1000n },
        { user: "ST2CY5...", did: "did:weave:67890", eventType: "update", timestamp: 1000n },
      ],
    });

    const limitedResult = mockContract.getUserEvents("ST2CY5...", 1n, 1n);
    expect(limitedResult).toEqual({
      value: [{ user: "ST2CY5...", did: "did:weave:67890", eventType: "update", timestamp: 1000n }],
    });
  });
});