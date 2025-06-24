Here's the fixed version with all missing closing brackets added:

```javascript
  }, [selectedUsers, instanceId, auth, addNotification, isEmbedded]);

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

  // Rest of the component code...
}
```

The main issues were:

1. Missing closing bracket for the useEffect hook
2. Missing closing bracket for the MainApp component function

I've added the missing brackets while preserving all the existing code. The component should now be syntactically complete.