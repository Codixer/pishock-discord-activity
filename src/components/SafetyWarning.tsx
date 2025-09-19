import React, { useState } from 'react';
import { AlertTriangle, Shield, CheckCircle } from 'lucide-react';

interface SafetyWarningProps {
  onAccept: () => void;
}

export function SafetyWarning({ onAccept }: SafetyWarningProps) {
  const [acknowledgedItems, setAcknowledgedItems] = useState<boolean[]>([
    false, false, false, false, false
  ]);

  const safetyItems = [
    "I accept full responsibility for safe use and understand my actions will deliver real electronic shocks to other users",
    "I understand device owners can block me and developers cannot override these blocks or restore my access",
    "I understand this controls real electronic shock devices physically attached to other users",
    "I understand developers bear no liability for any harm, injury, or adverse effects from using this application",
    "I confirm voluntary participation with full knowledge of risks" 
  ];

  const toggleAcknowledgment = (index: number) => {
    const newAcknowledged = [...acknowledgedItems];
    newAcknowledged[index] = !newAcknowledged[index];
    setAcknowledgedItems(newAcknowledged);
  };

  const allAcknowledged = acknowledgedItems.every(item => item);

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-red-900 via-red-800 to-orange-900 flex items-center justify-center p-4 overflow-hidden">
      <div className="max-w-2xl w-full bg-black/40 backdrop-blur-sm rounded-2xl border border-red-500/20 p-6">
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mb-3">
            <AlertTriangle className="h-6 w-6 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Safety Warning</h1>
          <p className="text-red-200 text-sm">
            This application controls electrical shock devices. Read and acknowledge these terms to proceed.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {safetyItems.map((item, index) => (
            <div key={index} className="flex items-start space-x-3">
              <button
                onClick={() => toggleAcknowledgment(index)}
                className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  acknowledgedItems[index]
                    ? 'bg-green-600 border-green-500'
                    : 'border-gray-400 hover:border-gray-300'
                }`}
              >
                {acknowledgedItems[index] && (
                  <CheckCircle className="h-3 w-3 text-white" />
                )}
              </button>
              <p className="text-gray-200 text-sm leading-relaxed">{item}</p>
            </div>
          ))}
        </div>

        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 mb-4">
          <div className="flex items-start space-x-3">
            <Shield className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-red-200">
              <p className="font-semibold mb-1">Important:</p>
              <p>
                Use at your own risk. Developers assume no responsibility for harm or injury. 
                Must comply with local laws.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={onAccept}
          disabled={!allAcknowledged}
          className={`w-full py-3 px-6 rounded-xl font-semibold transition-all ${
            allAcknowledged
              ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
          }`}
        >
          I Acknowledge and Accept All Terms
        </button>
      </div>
    </div>
  );
}