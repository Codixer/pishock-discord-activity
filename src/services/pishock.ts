import type { 
  PiShockAuthResponse, 
  PiShockDevice, 
  ShareCodesByOwner, 
  SharedShockersByOwner,
  OperateRequest,
  UserCredentials
} from '../types/pishock';

export class PiShockAPI {
  private static readonly AUTH_BASE = 'https://auth.pishock.com';
  private static readonly API_BASE = 'https://ps.pishock.com';

  /**
   * Authenticate user and get their PiShock User ID
   */
  static async authenticate(apiKey: string, username: string): Promise<PiShockAuthResponse> {
    const url = `${this.AUTH_BASE}/Auth/GetUserIfAPIKeyValid?apikey=${encodeURIComponent(apiKey)}&username=${encodeURIComponent(username)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/2.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.UserId) {
      throw new Error('Invalid credentials: No User ID returned');
    }

    return data;
  }

  /**
   * Get user's own devices and shockers
   */
  static async getUserDevices(userId: number, apiKey: string): Promise<PiShockDevice[]> {
    const url = `${this.API_BASE}/PiShock/GetUserDevices?UserId=${userId}&Token=${encodeURIComponent(apiKey)}&api=true`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/2.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get user devices: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!Array.isArray(data)) {
      throw new Error('Invalid response: Expected array of devices');
    }

    return data;
  }

  /**
   * Get share codes owned by the user
   */
  static async getShareCodesByOwner(userId: number, apiKey: string): Promise<ShareCodesByOwner> {
    const url = `${this.API_BASE}/PiShock/GetShareCodesByOwner?UserId=${userId}&Token=${encodeURIComponent(apiKey)}&api=true`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/2.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get share codes: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Get detailed shocker information by share IDs
   */
  static async getShockersByShareIds(
    userId: number, 
    apiKey: string, 
    shareIds: number[]
  ): Promise<SharedShockersByOwner> {
    if (shareIds.length === 0) {
      return {};
    }

    const shareIdParams = shareIds.map(id => `shareIds=${id}`).join('&');
    const url = `${this.API_BASE}/PiShock/GetShockersByShareIds?UserId=${userId}&Token=${encodeURIComponent(apiKey)}&api=true&${shareIdParams}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/2.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get shockers by share IDs: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Send operation command to a shocker
   */
  static async operate(request: OperateRequest): Promise<string> {
    const url = `${this.API_BASE}/PiShock/Operate`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PiShock-Discord-Activity/2.0',
        'Accept': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Operation failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.text();
  }

  /**
   * Get complete user setup (devices + shared shockers)
   */
  static async getCompleteUserSetup(credentials: UserCredentials): Promise<{
    devices: PiShockDevice[];
    sharedShockers: SharedShockersByOwner;
  }> {
    // First authenticate to get/verify user ID
    const authData = await this.authenticate(credentials.apiKey, credentials.username);
    const userId = authData.UserId;

    // Get user's own devices
    const devices = await this.getUserDevices(userId, credentials.apiKey);

    // Get share codes
    const shareCodesByOwner = await this.getShareCodesByOwner(userId, credentials.apiKey);

    // Get all share IDs
    const allShareIds: number[] = [];
    Object.values(shareCodesByOwner).forEach(shareIds => {
      allShareIds.push(...shareIds);
    });

    // Get detailed shocker information for all share codes
    const sharedShockers = allShareIds.length > 0 
      ? await this.getShockersByShareIds(userId, credentials.apiKey, allShareIds)
      : {};

    return {
      devices,
      sharedShockers
    };
  }
}