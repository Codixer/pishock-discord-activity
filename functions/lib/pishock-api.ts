// Centralized PiShock API helper functions

export async function decrypt(encryptedData: string): Promise<any> {
  try {
    const dataString = atob(encryptedData);
    return JSON.parse(dataString);
  } catch (error) {
    throw new Error('Failed to decrypt data');
  }
}

export async function encrypt(data: any): Promise<string> {
  // Simple base64 encoding for now - in production, use proper encryption
  return btoa(JSON.stringify(data));
}

// Test PiShock device operation with a minimal beep command
export async function testPiShockOperation(apiKey: string, username: string, sharecode: string): Promise<{ 
  success: boolean; 
  error?: string; 
  debugInfo?: any 
}> {
  try {
    console.log('PISHOCK_TEST: Testing device operation with minimal beep command');
    console.log('PISHOCK_TEST: Username:', username);
    console.log('PISHOCK_TEST: Share code:', sharecode);
    
    // Use V3 API Operate endpoint with minimal test command (1% beep for 1 second)
    const response = await fetch('https://ps.pishock.com/PiShock/Operate', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PiShock-Discord-Activity/1.0'
      },
      body: JSON.stringify({
        username: username,
        apikey: apiKey,
        code: sharecode,
        intensity: 1,
        duration: 1,
        op: 2, // 2 = beep (least intrusive test)
        name: 'DiscordActivityConnectionTest',
      }),
    });
    
    console.log('PISHOCK_TEST: Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('PISHOCK_TEST: HTTP error:', response.status, errorText);
      return { 
        success: false, 
        error: `HTTP ${response.status}: ${errorText}`,
        debugInfo: { status: response.status, error: errorText }
      };
    }
    
    const responseText = await response.text();
    console.log('PISHOCK_TEST: Response text:', responseText);
    
    // Check for success responses as per V3 API documentation
    if (responseText.includes('Operation Succeeded') || responseText.includes('Operation Attempted.')) {
      console.log('PISHOCK_TEST: ✓ Device operation test successful');
      return { success: true, debugInfo: { response: responseText } };
    }
    
    // Check for specific error messages from V3 API documentation
    let errorMessage = 'Unknown error';
    if (responseText.includes("This code doesn't exist")) {
      errorMessage = 'Share code not found. Please check your share code.';
    } else if (responseText.includes('Not Authorized')) {
      errorMessage = 'Not authorized. Please check your API credentials.';
    } else if (responseText.includes('Shocker is Paused')) {
      errorMessage = 'Device is paused. Please unpause it in the PiShock web panel.';
    } else if (responseText.includes('Device currently not connected')) {
      errorMessage = 'Device is not connected. Please ensure your PiShock device is online.';
    } else if (responseText.includes('already been used by somebody else')) {
      errorMessage = 'Share code is already in use. Please generate a new one.';
    } else if (responseText.includes('Unknown Op')) {
      errorMessage = 'Invalid operation specified.';
    } else if (responseText.includes('Intensity must be between')) {
      errorMessage = 'Invalid intensity specified.';
    } else if (responseText.includes('Duration must be between')) {
      errorMessage = 'Invalid duration specified.';
    } else {
      errorMessage = `Unexpected response: ${responseText}`;
    }
    
    console.log('PISHOCK_TEST: Operation failed:', errorMessage);
    return { 
      success: false, 
      error: errorMessage,
      debugInfo: { response: responseText }
    };
    
  } catch (error) {
    console.error('PISHOCK_TEST: Network error:', error);
    return { 
      success: false, 
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      debugInfo: { networkError: error instanceof Error ? error.message : 'Unknown error' }
    };
  }
}

// Validate PiShock credentials using Legacy API (for getting user ID)
export async function validatePiShockCredentials(apiKey: string, username: string): Promise<{ 
  valid: boolean; 
  userId?: string; 
  error?: string; 
  debugInfo?: any 
}> {
  try {
    console.log('PISHOCK_AUTH: Validating credentials using Legacy API');
    console.log('PISHOCK_AUTH: Username:', username);
    console.log('PISHOCK_AUTH: API Key length:', apiKey.length);

    // Use the exact endpoint from Legacy API documentation
    const url = `https://auth.pishock.com/Auth/GetUserIfAPIKeyValid?apikey=${encodeURIComponent(apiKey)}&username=${encodeURIComponent(username)}`;
    console.log('PISHOCK_AUTH: Making request to:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/1.0',
        'Accept': 'application/json, text/plain, */*'
      }
    });

    console.log('PISHOCK_AUTH: Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('PISHOCK_AUTH: Error response:', errorText);
      return { 
        valid: false, 
        error: `Authentication failed: HTTP ${response.status}`,
        debugInfo: { status: response.status, error: errorText }
      };
    }

    const responseText = await response.text();
    console.log('PISHOCK_AUTH: Raw response text:', responseText);

    // Parse the response
    let authData;
    try {
      authData = JSON.parse(responseText);
      console.log('PISHOCK_AUTH: Parsed JSON response:', authData);
    } catch (parseError) {
      console.log('PISHOCK_AUTH: Failed to parse as JSON, trying as plain text');
      
      // Sometimes the API returns just a plain number (user ID)
      if (/^\d+$/.test(responseText.trim())) {
        const userId = responseText.trim();
        console.log('PISHOCK_AUTH: Found plain text user ID:', userId);
        return { 
          valid: true, 
          userId,
          debugInfo: { type: 'plain_text', value: userId }
        };
      }
      
      return { 
        valid: false, 
        error: 'Invalid response format - not JSON or plain number',
        debugInfo: { parseError: parseError.message, responseText: responseText.substring(0, 200) }
      };
    }

    // Look for UserID field as specified in documentation
    let userId = null;
    
    // Check for UserID field variations (the API actually returns "UserId")
    if (authData.UserId !== undefined && authData.UserId !== null) {
      userId = authData.UserId.toString();
      console.log('PISHOCK_AUTH: Found UserId in response:', userId);
    } else if (authData.UserID !== undefined && authData.UserID !== null) {
      userId = authData.UserID.toString();
      console.log('PISHOCK_AUTH: Found UserID in response:', userId);
    } else if (authData.userId !== undefined && authData.userId !== null) {
      userId = authData.userId.toString();
      console.log('PISHOCK_AUTH: Found userId in response:', userId);
    } else if (authData.id !== undefined && authData.id !== null) {
      userId = authData.id.toString();
      console.log('PISHOCK_AUTH: Found id in response:', userId);
    } else if (typeof authData === 'number') {
      userId = authData.toString();
      console.log('PISHOCK_AUTH: Response is a number:', userId);
    }

    if (userId && /^\d+$/.test(userId)) {
      console.log('PISHOCK_AUTH: ✓ Successfully validated PiShock credentials');
      return { 
        valid: true, 
        userId,
        debugInfo: { authData, foundUserId: userId }
      };
    }

    console.log('PISHOCK_AUTH: No valid UserID found in response');
    return { 
      valid: false, 
      error: 'No UserID found in API response',
      debugInfo: { authData, availableFields: Object.keys(authData || {}) }
    };

  } catch (error) {
    console.error('PISHOCK_AUTH: Credential validation error:', error);
    return { 
      valid: false, 
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      debugInfo: { networkError: error instanceof Error ? error.message : 'Unknown error' }
    };
  }
}

// Check user devices using V3 API
export async function checkUserDevices(userId: string, apiKey: string): Promise<{ 
  hasDevices: boolean; 
  devices?: any[]; 
  error?: string; 
  debugInfo?: any 
}> {
  try {
    console.log('PISHOCK_DEVICES: Checking user devices using V3 API');
    console.log('PISHOCK_DEVICES: User ID:', userId);
    
    // Use exact endpoint from V3 API documentation
    const url = `https://ps.pishock.com/PiShock/GetUserDevices?UserId=${userId}&Token=${encodeURIComponent(apiKey)}&api=true`;
    console.log('PISHOCK_DEVICES: Making devices request to:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/1.0',
        'Accept': 'application/json'
      }
    });
    
    console.log('PISHOCK_DEVICES: Devices response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('PISHOCK_DEVICES: Devices error response:', errorText);
      return { 
        hasDevices: false, 
        error: `Device check failed: HTTP ${response.status}`,
        debugInfo: { status: response.status, error: errorText }
      };
    }
    
    const responseText = await response.text();
    console.log('PISHOCK_DEVICES: Devices raw response:', responseText.substring(0, 500));
    
    let devices;
    try {
      devices = JSON.parse(responseText);
      console.log('PISHOCK_DEVICES: Parsed devices data:', devices);
    } catch (parseError) {
      console.log('PISHOCK_DEVICES: Failed to parse devices JSON:', parseError);
      return { 
        hasDevices: false, 
        error: 'Invalid devices response format',
        debugInfo: { parseError: parseError.message, responseText: responseText.substring(0, 200) }
      };
    }
    
    // Check if user has any devices with shockers (as per documentation format)
    const hasDevices = Array.isArray(devices) && devices.length > 0 && 
                      devices.some(device => device.shockers && Array.isArray(device.shockers) && device.shockers.length > 0);
    
    console.log('PISHOCK_DEVICES: Has devices result:', hasDevices);
    console.log('PISHOCK_DEVICES: Device count:', devices?.length || 0);
    
    return { 
      hasDevices, 
      devices: hasDevices ? devices : [],
      debugInfo: { deviceCount: devices?.length || 0, devicesWithShockers: devices?.filter(d => d.shockers?.length > 0).length || 0 }
    };
    
  } catch (error) {
    console.error('PISHOCK_DEVICES: Failed to check user devices:', error);
    return { 
      hasDevices: false, 
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      debugInfo: { networkError: error instanceof Error ? error.message : 'Unknown error' }
    };
  }
}