// Mock data for development mode
export const isDevelopmentMode = () => {
  return import.meta.env.DEV || 
         window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1' ||
         window.location.port === '3000';
};

// Mock Discord auth response
export const mockAuthResponse = {
  access_token: 'mock_access_token_dev',
  user: {
    id: 'dev_user_123',
    username: 'DevUser',
    discriminator: '0001',
    avatar: null,
    global_name: 'Development User'
  }
};

// Mock participants
export const mockParticipants = [
  {
    id: 'dev_user_123',
    username: 'DevUser',
    discriminator: '0001',
    avatar: null,
    global_name: 'Development User',
    avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
    displayName: 'Development User'
  },
  {
    id: 'test_user_456',
    username: 'TestUser',
    discriminator: '0002',
    avatar: null,
    global_name: 'Test User',
    avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png',
    displayName: 'Test User'
  },
  {
    id: 'mock_user_789',
    username: 'MockUser',
    discriminator: '0003',
    avatar: null,
    global_name: 'Mock User',
    avatarUrl: 'https://cdn.discordapp.com/embed/avatars/2.png',
    displayName: 'Mock User'
  }
];

// Mock PiShock status for users
export const mockUserPiShockStatus = {
  'dev_user_123': {
    hasCredentials: true,
    isConnected: true,
    hasDevice: true,
    deviceCount: 1,
    piShockUserId: 'mock_pishock_123',
    isRelay: false,
    maxIntensity: 75,
    maxDuration: 10
  },
  'test_user_456': {
    hasCredentials: true,
    isConnected: true,
    hasDevice: true,
    deviceCount: 2,
    piShockUserId: 'mock_pishock_456',
    isRelay: false,
    maxIntensity: 100,
    maxDuration: 15
  },
  'mock_user_789': {
    hasCredentials: false,
    isConnected: false,
    hasDevice: false,
    deviceCount: 0,
    piShockUserId: null,
    isRelay: false,
    maxIntensity: 100,
    maxDuration: 15
  }
};

// Mock activity log entries
export const mockActivityLogEntries = [
  {
    id: 'mock_entry_1',
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
    instanceId: 'dev_instance_123',
    executorUserId: 'dev_user_123',
    executorUsername: 'Development User',
    executorAvatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
    targetUserId: 'test_user_456',
    targetUsername: 'Test User',
    targetAvatar: 'https://cdn.discordapp.com/embed/avatars/1.png',
    action: 'vibrate' as const,
    intensity: 25,
    duration: 3,
    guildId: 'mock_guild_123',
    guildName: 'Development Server'
  },
  {
    id: 'mock_entry_2',
    timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
    instanceId: 'dev_instance_123',
    executorUserId: 'test_user_456',
    executorUsername: 'Test User',
    executorAvatar: 'https://cdn.discordapp.com/embed/avatars/1.png',
    targetUserId: 'dev_user_123',
    targetUsername: 'Development User',
    targetAvatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
    action: 'beep' as const,
    intensity: 50,
    duration: 2,
    guildId: 'mock_guild_123',
    guildName: 'Development Server'
  },
  {
    id: 'mock_entry_3',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 minutes ago
    instanceId: 'dev_instance_123',
    executorUserId: 'dev_user_123',
    executorUsername: 'Development User',
    executorAvatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
    targetUserId: 'test_user_456',
    targetUsername: 'Test User',
    targetAvatar: 'https://cdn.discordapp.com/embed/avatars/1.png',
    action: 'shock' as const,
    intensity: 15,
    duration: 1,
    guildId: 'mock_guild_123',
    guildName: 'Development Server'
  }
];

// Mock instance data
export const mockInstanceData = {
  selectedUserId: 'test_user_456',
  lastUpdated: new Date().toISOString()
};

// Mock PiShock settings
export const mockPiShockSettings = {
  hasSettings: true,
  settings: {
    username: 'mock_username',
    sharecode: 'MOCK123',
    hasOwnDevice: true,
    maxIntensity: 75,
    maxDuration: 10,
    lastUpdated: new Date().toISOString(),
    piShockUserId: 'mock_pishock_123'
  }
};

// Mock fetch function that returns appropriate mock data based on URL
export const mockFetch = async (url: string, options?: RequestInit): Promise<Response> => {
  console.log('🔒 DEV MODE: Blocking API request to:', url);
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 300));
  
  let mockData: any = {};
  let status = 200;
  
  if (url.includes('/auth/discord')) {
    mockData = mockAuthResponse;
  } else if (url.includes('/pishock-status')) {
    const userId = url.match(/users\/([^\/]+)\/pishock-status/)?.[1];
    mockData = mockUserPiShockStatus[userId!] || mockUserPiShockStatus['mock_user_789'];
  } else if (url.includes('/pishock-settings') && options?.method === 'GET') {
    mockData = mockPiShockSettings;
  } else if (url.includes('/pishock-settings') && options?.method === 'PUT') {
    mockData = { success: true, isConnected: true, hasOwnDevice: true, piShockUserId: 'mock_pishock_123' };
  } else if (url.includes('/pishock-test')) {
    mockData = { success: true, isConnected: true, piShockUserId: 'mock_pishock_123' };
  } else if (url.includes('/pishock-execute')) {
    mockData = { success: true, logEntryId: 'mock_log_' + Date.now() };
  } else if (url.includes('/activity-log')) {
    mockData = { 
      entries: mockActivityLogEntries, 
      total: mockActivityLogEntries.length, 
      hasMore: false 
    };
  } else if (url.includes('/instances/') && url.includes('/data')) {
    if (options?.method === 'PUT') {
      mockData = { success: true };
    } else {
      mockData = mockInstanceData;
    }
  } else if (url.includes('/instances/') && url.includes('/status')) {
    if (options?.method === 'PUT') {
      mockData = { success: true };
    } else {
      mockData = {
        status: 'active',
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
        participant_count: mockParticipants.length
      };
    }
  } else if (url.includes('/version')) {
    mockData = {
      latestVersion: 'dev-stable',
      deployedAt: new Date().toISOString()
    };
  } else if (url.includes('/discord/guilds/')) {
    mockData = {
      avatar: null,
      nick: 'Mock Guild Nickname'
    };
  } else {
    // Default success response
    mockData = { success: true };
  }
  
  return new Response(JSON.stringify(mockData), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

// Override global fetch in development mode
export const setupMockFetch = () => {
  if (isDevelopmentMode()) {
    console.log('🔒 DEV MODE: All API requests will be blocked and return mock data');
    
    // Store original fetch
    const originalFetch = window.fetch;
    
    // Override fetch
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      
      // Block all API requests and return mock data
      if (url.includes('/api/') || url.includes('/.proxy/api/')) {
        return mockFetch(url, init);
      }
      
      // Allow other requests (like Discord SDK calls, external resources)
      return originalFetch(input, init);
    };
  }
};