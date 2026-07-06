import { useState, useCallback } from 'react';

export interface InstanceData {
  selectedUserId?: string;
  piShockSettings?: {
    apiKey?: string;
    username?: string;
    selectedShockerId?: string;
    selectedShockerName?: string;
    allowedShockerIds?: string[];
    allowOverLimitWithConsumable?: boolean;
    // Deprecated legacy field kept for compatibility reads only.
    sharecode?: string;
  };
  lastUpdated?: string;
  [key: string]: any;
}

export function useInstanceData(instanceId: string) {
  const [instanceData, setInstanceData] = useState<InstanceData>({});

  const updateInstanceData = useCallback((newData: Partial<InstanceData>) => {
    setInstanceData(prev => ({
      ...prev,
      ...newData,
      lastUpdated: new Date().toISOString(),
    }));
  }, []);

  const saveInstanceData = useCallback(async (auth: any) => {
    if (!instanceId || !auth) return;

    try {
      await fetch(`/api/instances/${instanceId}/data`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify(instanceData),
      });
    } catch (error) {
      console.error('Failed to save instance data:', error);
    }
  }, [instanceId, instanceData]);

  return {
    instanceData,
    updateInstanceData,
    saveInstanceData,
  };
}