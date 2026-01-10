import { db } from "../db";
import { bouncieSettings, bouncieVehicles } from "@shared/schema";
import { eq } from "drizzle-orm";

const BOUNCIE_AUTH_URL = "https://auth.bouncie.com/dialog/authorize";
const BOUNCIE_TOKEN_URL = "https://auth.bouncie.com/oauth/token";
const BOUNCIE_API_BASE = "https://api.bouncie.dev/v1";

interface BouncieVehicle {
  imei: string;
  nickName?: string;
  make?: string;
  model?: string;
  year?: string;
  vin?: string;
  licensePlate?: string;
  stats?: {
    lastGps?: {
      latitude: number;
      longitude: number;
      timestamp: string;
      speed: number;
      heading: number;
    };
  };
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export class BouncieService {
  private clientId: string;
  private clientSecret: string;
  private authorizationCode: string;  // Long-lived auth code from Developer Portal
  private redirectUri: string;         // Registered redirect URI
  private cachedAccessToken: string | null = null;
  private cachedTokenExpiresAt: Date | null = null;

  constructor() {
    this.clientId = process.env.BOUNCIE_CLIENT_ID || "";
    this.clientSecret = process.env.BOUNCIE_CLIENT_SECRET || "";
    this.authorizationCode = process.env.BOUNCIE_API_KEY || "";  // The auth code from Developer Portal
    this.redirectUri = process.env.BOUNCIE_REDIRECT_URI || "";   // Must match the registered URI in Bouncie Developer Portal
  }

  isConfigured(): boolean {
    return Boolean(this.authorizationCode && this.clientId && this.clientSecret);
  }
  
  hasApiKey(): boolean {
    return Boolean(this.authorizationCode);
  }

  getAuthorizationUrl(redirectUri: string, state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      ...(state && { state }),
    });
    return `${BOUNCIE_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string, redirectUri: string): Promise<TokenResponse> {
    // Bouncie expects form-urlencoded data, not JSON
    const params = new URLSearchParams();
    params.append("client_id", this.clientId);
    params.append("client_secret", this.clientSecret);
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", redirectUri);

    console.log("[BouncieService] Exchanging code for token with redirect_uri:", redirectUri);

    const response = await fetch(BOUNCIE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[BouncieService] Token exchange failed:", response.status, error);
      throw new Error(`Failed to exchange code for token: ${error}`);
    }

    return response.json();
  }

  async getSettings() {
    const settings = await db.select().from(bouncieSettings).limit(1);
    return settings[0] || null;
  }

  async saveSettings(data: {
    authorizationCode?: string;
    accessToken?: string;
    tokenExpiresAt?: Date;
    connectedAt?: Date;
    lastSyncAt?: Date;
  }) {
    const existing = await this.getSettings();
    
    if (existing) {
      await db.update(bouncieSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(bouncieSettings.id, existing.id));
    } else {
      await db.insert(bouncieSettings).values(data);
    }
  }

  async getAccessToken(): Promise<string | null> {
    // Check if we have a cached token that's still valid (with 60s buffer)
    if (this.cachedAccessToken && this.cachedTokenExpiresAt) {
      const bufferTime = 60 * 1000; // 60 second buffer
      if (this.cachedTokenExpiresAt.getTime() - bufferTime > Date.now()) {
        return this.cachedAccessToken;
      }
    }

    // Check database for valid token
    const settings = await this.getSettings();
    if (settings?.accessToken && settings?.tokenExpiresAt) {
      const bufferTime = 60 * 1000;
      if (settings.tokenExpiresAt.getTime() - bufferTime > Date.now()) {
        this.cachedAccessToken = settings.accessToken;
        this.cachedTokenExpiresAt = settings.tokenExpiresAt;
        return settings.accessToken;
      }
    }

    // Need to exchange auth code for a fresh token
    if (!this.authorizationCode) {
      return null;
    }

    try {
      console.log("[BouncieService] Exchanging authorization code for access token...");
      const tokenResponse = await this.exchangeCodeForToken(this.authorizationCode, this.redirectUri);
      const tokenExpiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);
      
      // Cache in memory
      this.cachedAccessToken = tokenResponse.access_token;
      this.cachedTokenExpiresAt = tokenExpiresAt;
      
      // Save to database
      await this.saveSettings({
        authorizationCode: this.authorizationCode,
        accessToken: tokenResponse.access_token,
        tokenExpiresAt,
        connectedAt: new Date(),
      });
      
      console.log("[BouncieService] Successfully obtained access token, expires at:", tokenExpiresAt);
      return tokenResponse.access_token;
    } catch (error) {
      console.error("[BouncieService] Failed to exchange auth code for token:", error);
      return null;
    }
  }

  async isConnected(): Promise<boolean> {
    // If auth code is configured, we're connected (can exchange for token)
    if (this.authorizationCode && this.clientId && this.clientSecret) {
      return true;
    }
    const settings = await this.getSettings();
    return Boolean(settings?.accessToken);
  }

  async disconnect() {
    const settings = await this.getSettings();
    if (settings) {
      await db.update(bouncieSettings)
        .set({
          accessToken: null,
          authorizationCode: null,
          tokenExpiresAt: null,
          connectedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(bouncieSettings.id, settings.id));
    }
  }

  async fetchVehiclesFromBouncie(): Promise<BouncieVehicle[]> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      throw new Error("Not connected to Bouncie. Please check your credentials (Client ID, Client Secret, Authorization Code, and Redirect URI).");
    }

    console.log("[BouncieService] Fetching vehicles from Bouncie API...");
    const response = await fetch(`${BOUNCIE_API_BASE}/vehicles`, {
      headers: {
        Authorization: accessToken,  // Bouncie API expects token without "Bearer" prefix
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Clear cached token and try once more with fresh token
        this.cachedAccessToken = null;
        this.cachedTokenExpiresAt = null;
        
        const freshToken = await this.getAccessToken();
        if (freshToken) {
          const retryResponse = await fetch(`${BOUNCIE_API_BASE}/vehicles`, {
            headers: {
              Authorization: freshToken,
              "Content-Type": "application/json",
            },
          });
          
          if (retryResponse.ok) {
            return retryResponse.json();
          }
        }
        throw new Error("Bouncie authorization expired. Please reconnect.");
      }
      const error = await response.text();
      throw new Error(`Failed to fetch vehicles from Bouncie: ${error}`);
    }

    return response.json();
  }

  async syncVehicles(): Promise<{ created: number; updated: number; total: number }> {
    const bouncieVehiclesList = await this.fetchVehiclesFromBouncie();
    let created = 0;
    let updated = 0;

    for (const bv of bouncieVehiclesList) {
      const existing = await db.select()
        .from(bouncieVehicles)
        .where(eq(bouncieVehicles.imei, bv.imei))
        .limit(1);

      const vehicleData = {
        imei: bv.imei,
        vehicleName: bv.nickName || `Vehicle ${bv.imei.slice(-4)}`,
        nickname: bv.nickName,
        vehicleMake: bv.make,
        vehicleModel: bv.model,
        vehicleYear: bv.year,
        vin: bv.vin,
        licensePlate: bv.licensePlate,
        lastLatitude: bv.stats?.lastGps?.latitude?.toString(),
        lastLongitude: bv.stats?.lastGps?.longitude?.toString(),
        lastSpeed: bv.stats?.lastGps?.speed?.toString(),
        lastHeading: bv.stats?.lastGps?.heading,
        lastLocationUpdatedAt: bv.stats?.lastGps?.timestamp ? new Date(bv.stats.lastGps.timestamp) : null,
        updatedAt: new Date(),
      };

      if (existing.length > 0) {
        await db.update(bouncieVehicles)
          .set(vehicleData)
          .where(eq(bouncieVehicles.id, existing[0].id));
        updated++;
      } else {
        await db.insert(bouncieVehicles).values({
          ...vehicleData,
          isActive: true,
        });
        created++;
      }
    }

    await this.saveSettings({ lastSyncAt: new Date() });

    return { created, updated, total: bouncieVehiclesList.length };
  }

  async refreshLocations(): Promise<void> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return;

    try {
      const vehicles = await this.fetchVehiclesFromBouncie();
      
      for (const bv of vehicles) {
        if (bv.stats?.lastGps) {
          await db.update(bouncieVehicles)
            .set({
              lastLatitude: bv.stats.lastGps.latitude?.toString(),
              lastLongitude: bv.stats.lastGps.longitude?.toString(),
              lastSpeed: bv.stats.lastGps.speed?.toString(),
              lastHeading: bv.stats.lastGps.heading,
              lastLocationUpdatedAt: new Date(bv.stats.lastGps.timestamp),
              updatedAt: new Date(),
            })
            .where(eq(bouncieVehicles.imei, bv.imei));
        }
      }
    } catch (error) {
      console.error("Failed to refresh Bouncie locations:", error);
    }
  }
}

export const bouncieService = new BouncieService();
