import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ApiError,
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  getStoredUser,
  setStoredUser,
  notifySessionExpired,
  setSessionExpiredHandler,
  getAccessTokenExpiryMs,
  API_BASE,
} from "@/lib/api";

describe("ApiError", () => {
  it("creates error with all properties", () => {
    const err = new ApiError("Test error", "TEST_CODE", 400, "field1", "req-123");
    expect(err.message).toBe("Test error");
    expect(err.code).toBe("TEST_CODE");
    expect(err.status).toBe(400);
    expect(err.field).toBe("field1");
    expect(err.request_id).toBe("req-123");
    expect(err.name).toBe("ApiError");
    expect(err).toBeInstanceOf(Error);
  });

  it("creates error with defaults", () => {
    const err = new ApiError("Default error");
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.status).toBe(500);
    expect(err.field).toBeNull();
    expect(err.request_id).toBeNull();
  });

  it("creates error with partial overrides", () => {
    const err = new ApiError("Partial", "CUSTOM_CODE", 422);
    expect(err.code).toBe("CUSTOM_CODE");
    expect(err.status).toBe(422);
    expect(err.field).toBeNull();
    expect(err.request_id).toBeNull();
  });
});

describe("Token management", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("getAccessToken returns null when no token stored", () => {
    expect(getAccessToken()).toBeNull();
  });

  it("getRefreshToken returns null when no token stored", () => {
    expect(getRefreshToken()).toBeNull();
  });

  it("setTokens stores both tokens", () => {
    setTokens({ access_token: "access-123", refresh_token: "refresh-456" });
    expect(getAccessToken()).toBe("access-123");
    expect(getRefreshToken()).toBe("refresh-456");
  });

  it("clearTokens removes all stored auth data", () => {
    setTokens({ access_token: "access-123", refresh_token: "refresh-456" });
    setStoredUser({ id: "u1", name: "Test", email: "test@test.com", phone: null, role: "clinic_owner" });
    clearTokens();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(getStoredUser()).toBeNull();
  });
});

describe("User storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("getStoredUser returns null when nothing stored", () => {
    expect(getStoredUser()).toBeNull();
  });

  it("setStoredUser stores user and getStoredUser retrieves it", () => {
    const user = { id: "u1", name: "Dr. Smith", email: "smith@test.com", phone: "123", role: "doctor" as const };
    setStoredUser(user);
    expect(getStoredUser()).toEqual(user);
  });

  it("setStoredUser(null) removes stored user", () => {
    const user = { id: "u1", name: "Test", email: "test@test.com", phone: null, role: "clinic_owner" as const };
    setStoredUser(user);
    setStoredUser(null);
    expect(getStoredUser()).toBeNull();
  });

  it("getStoredUser returns null for invalid JSON", () => {
    localStorage.setItem("medinexa.user", "NOT-JSON");
    expect(getStoredUser()).toBeNull();
  });
});

describe("Session expiry", () => {
  it("notifySessionExpired calls handler when set", () => {
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    notifySessionExpired();
    expect(handler).toHaveBeenCalled();
    setSessionExpiredHandler(null);
  });

  it("notifySessionExpired clears tokens and user", () => {
    setTokens({ access_token: "access-123", refresh_token: "refresh-456" });
    setStoredUser({ id: "u1", name: "Test", email: "test@test.com", phone: null, role: "clinic_owner" });
    const handler = vi.fn();
    setSessionExpiredHandler(handler);
    notifySessionExpired();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(getStoredUser()).toBeNull();
    setSessionExpiredHandler(null);
  });
});

describe("getAccessTokenExpiryMs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when no token stored", () => {
    expect(getAccessTokenExpiryMs()).toBeNull();
  });

  it("returns null for malformed token", () => {
    localStorage.setItem("medinexa.access_token", "not-a-jwt");
    expect(getAccessTokenExpiryMs()).toBeNull();
  });

  it("returns expiry ms for valid JWT structure", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const payload = btoa(JSON.stringify({ exp }));
    const token = `header.${payload}.signature`;
    localStorage.setItem("medinexa.access_token", token);
    const result = getAccessTokenExpiryMs();
    expect(result).toBe(exp * 1000);
  });

  it("handles base64url-encoded JWT payload", () => {
    const exp = Math.floor(Date.now() / 1000) + 7200;
    const payload = btoa(JSON.stringify({ exp }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const token = `header.${payload}.signature`;
    localStorage.setItem("medinexa.access_token", token);
    const result = getAccessTokenExpiryMs();
    expect(result).toBe(exp * 1000);
  });

  it("returns null when exp claim is missing", () => {
    const payload = btoa(JSON.stringify({ sub: "user1" }));
    const token = `header.${payload}.signature`;
    localStorage.setItem("medinexa.access_token", token);
    expect(getAccessTokenExpiryMs()).toBeNull();
  });
});

describe("API_BASE", () => {
  it("is defined", () => {
    expect(API_BASE).toBeDefined();
    expect(typeof API_BASE).toBe("string");
  });
});
