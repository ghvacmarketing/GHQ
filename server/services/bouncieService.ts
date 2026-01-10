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
  private apiKey: string;

  constructor() {
    this.clientId = process.env.BOUNCIE_CLIENT_ID || "";
    this.clientSecret = process.env.BOUNCIE_CLIENT_SECRET || "";
    this.apiKey = process.env.BOUNCIE_API_KEY || "";
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey || (this.clientId && this.clientSecret));
  }
  
  hasApiKey(): boolean {
    return Boolean(this.apiKey);
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

  async exchangeCodeForToken(code: string, redirectUri?: string): Promise<TokenResponse> {
    const payload: Record<string, string> = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "authorization_code",
      code,
    };
    
    // Only include redirect_uri if provided (not needed for developer portal codes)
    if (redirectUri) {
      payload.redirect_uri = redirectUri;
    }

    const response = await fetch(BOUNCIE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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
    // If API key is configured, use it directly
    if (this.apiKey) {
      return this.apiKey;
    }
    const settings = await this.getSettings();
    return settings?.accessToken || null;
  }

  async isConnected(): Promise<boolean> {
    // If API key is configured, we're always connected
    if (this.apiKey) {
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

  async fetchVehiclesFromBouncie(redirectUri?: string): Promise<BouncieVehicle[]> {
    let accessToken = await this.getAccessToken();
    if (!accessToken) {
      throw new Error("Not connected to Bouncie. Please connect first.");
    }

    const response = await fetch(`${BOUNCIE_API_BASE}/vehicles`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // If we have an API key set, it might be an authorization code that needs to be exchanged
        if (this.apiKey && redirectUri) {
          console.log("[BouncieService] Token invalid, attempting to exchange API key as authorization code...");
          try {
            const tokenResponse = await this.exchangeCodeForToken(this.apiKey, redirectUri);
            const tokenExpiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);
            await this.saveSettings({
              authorizationCode: this.apiKey,
              accessToken: tokenResponse.access_token,
              tokenExpiresAt,
              connectedAt: new Date(),
            });
            
            // Retry the request with the new token
            const retryResponse = await fetch(`${BOUNCIE_API_BASE}/vehicles`, {
              headers: {
                Authorization: `Bearer ${tokenResponse.access_token}`,
                "Content-Type": "application/json",
              },
            });
            
            if (retryResponse.ok) {
              return retryResponse.json();
            }
          } catch (exchangeError) {
            console.error("[BouncieService] Failed to exchange code:", exchangeError);
          }
        }
        throw new Error("Bouncie authorization expired. Please reconnect.");
      }
      const error = await response.text();
      throw new Error(`Failed to fetch vehicles from Bouncie: ${error}`);
    }

    return response.json();
  }

  async syncVehicles(redirectUri?: string): Promise<{ created: number; updated: number; total: number }> {
    const bouncieVehiclesList = await this.fetchVehiclesFromBouncie(redirectUri);
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
