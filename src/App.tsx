Here's the fixed version with all missing closing brackets added:

```javascript
  }, [instanceId, auth, selectedUsers, addNotification]);

  if (loading) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center overflow-hidden">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Connecting to Discord...</p>
          {instanceId && (
            <p className="text-gray-300 text-sm mt-2">Instance: {instanceId}</p>
          )}
        </div>
      </div>
    );
  }

  if (!safetyAccepted) {
    return <SafetyWarning onAccept={() => setSafetyAccepted(true)} />;
  }

  // Show invalid session message
  if (!isInstanceValid) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-red-900 via-red-800 to-orange-900 text-white overflow-hidden flex items-center justify-center">
        <div className="text-center max-w-md p-8">
          <div className="w-16 h-16 mx-auto mb-6 bg-red-500/20 rounded-full flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <h1 className="text-3xl font-bold mb-4">Invalid Session</h1>
          <p className="text-red-200 mb-6">
            This Discord Activity session is not valid or has expired. Discord Activity sessions have a maximum duration of 6 hours for security and performance reasons.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => window.close()}
              className="w-full py-3 px-6 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors"
            >
              Close Session
            </button>
            <p className="text-sm text-red-300 text-center">
              To continue using PiShock Controller, please start a new Discord Activity session from your Discord server or DM.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Rest of the component code...
}
```

The main issues were:

1. Missing closing bracket for the `useEffect` hook that saves instance data
2. Missing closing bracket for the `MainApp` component function

I've added these closing brackets in the appropriate places while maintaining the existing code structure and functionality.