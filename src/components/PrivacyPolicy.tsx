import React, { useEffect } from 'react';
import { Shield, ArrowLeft, Eye, Database, Lock, Globe, Clock, AlertTriangle } from 'lucide-react';

interface PrivacyPolicyProps {
  onBack: () => void;
}

export function PrivacyPolicy({ onBack }: PrivacyPolicyProps) {
  // Enable scrolling for this page
  useEffect(() => {
    document.body.classList.add('legal-page');
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'auto';
    const root = document.getElementById('root');
    if (root) {
      root.style.overflow = 'auto';
      root.style.height = 'auto';
    }

    return () => {
      document.body.classList.remove('legal-page');
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      if (root) {
        root.style.overflow = 'hidden';
        root.style.height = '100vh';
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-blue-400 hover:text-blue-300 transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Application</span>
          </button>
          
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 bg-blue-500/20 rounded-lg">
              <Shield className="h-8 w-8 text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Privacy Policy</h1>
              <p className="text-gray-300">PiShock Discord Activity</p>
            </div>
          </div>
          
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
            <p className="text-blue-200 text-sm">
              <strong>Last Updated:</strong> {new Date().toLocaleDateString()}<br />
              <strong>Effective Date:</strong> {new Date().toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-8">
          {/* Introduction */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
              <Eye className="h-6 w-6 text-purple-400" />
              <span>Introduction</span>
            </h2>
            <div className="space-y-4 text-gray-300">
              <p>
                This Privacy Policy describes how PiShock Discord Activity ("we," "our," or "the Application") 
                collects, uses, and protects your information when you use our Discord Activity application 
                for controlling PiShock electrical devices.
              </p>
              <p>
                <strong className="text-white">Important:</strong> This application controls electrical shock devices 
                and requires careful handling of both user data and device access. Your privacy and safety are our top priorities.
              </p>
            </div>
          </section>

          {/* Information We Collect */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
              <Database className="h-6 w-6 text-green-400" />
              <span>Information We Collect</span>
            </h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Discord Information</h3>
                <ul className="space-y-1 text-gray-300 ml-4">
                  <li>• User ID, username, and display name</li>
                  <li>• Avatar and guild-specific avatars</li>
                  <li>• Guild membership information (when used in servers)</li>
                  <li>• OAuth2 access tokens (temporarily stored for session management)</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">PiShock Device Information</h3>
                <ul className="space-y-1 text-gray-300 ml-4">
                  <li>• PiShock API keys and usernames (encrypted)</li>
                  <li>• Device share codes (encrypted)</li>
                  <li>• Device connection status and capabilities</li>
                  <li>• Device limits (maximum intensity and duration)</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Activity Data</h3>
                <ul className="space-y-1 text-gray-300 ml-4">
                  <li>• All device commands (shock, vibrate, beep) with timestamps</li>
                  <li>• Command parameters (intensity, duration, operation type)</li>
                  <li>• Executor and target user information for each action</li>
                  <li>• Instance data for Discord Activity sessions</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Technical Information</h3>
                <ul className="space-y-1 text-gray-300 ml-4">
                  <li>• Application version and deployment information</li>
                  <li>• Error logs and debugging information</li>
                  <li>• Connection and authentication status</li>
                </ul>
              </div>
            </div>
          </section>

          {/* How We Use Information */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
              <Globe className="h-6 w-6 text-blue-400" />
              <span>How We Use Your Information</span>
            </h2>
            <div className="space-y-4 text-gray-300">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Primary Functions</h3>
                <ul className="space-y-1 ml-4">
                  <li>• Authenticate users through Discord OAuth2</li>
                  <li>• Connect to and control PiShock devices</li>
                  <li>• Display participant information in multiplayer sessions</li>
                  <li>• Log all device interactions for safety and accountability</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Safety and Security</h3>
                <ul className="space-y-1 ml-4">
                  <li>• Maintain activity logs for safety monitoring</li>
                  <li>• Enforce device limits and safety protocols</li>
                  <li>• Validate user permissions and consent</li>
                  <li>• Prevent unauthorized device access</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Application Improvement</h3>
                <ul className="space-y-1 ml-4">
                  <li>• Monitor application performance and reliability</li>
                  <li>• Debug technical issues and errors</li>
                  <li>• Ensure version compatibility across users</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Data Storage and Security */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
              <Lock className="h-6 w-6 text-yellow-400" />
              <span>Data Storage and Security</span>
            </h2>
            <div className="space-y-4 text-gray-300">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Encryption</h3>
                <p>
                  All PiShock credentials (API keys, usernames, share codes) are encrypted using 
                  industry-standard encryption before storage. Device access information is never 
                  stored in plain text.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Storage Location</h3>
                <p>
                  Data is stored securely using Cloudflare KV storage with global distribution. 
                  All data is hosted in compliance with international data protection standards.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Access Control</h3>
                <p>
                  Access to stored data is strictly controlled and limited to the application's 
                  core functionality. Users can only access their own credentials and can view 
                  activity logs for transparency.
                </p>
              </div>
            </div>
          </section>

          {/* Data Retention */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
              <Clock className="h-6 w-6 text-orange-400" />
              <span>Data Retention</span>
            </h2>
            <div className="space-y-4 text-gray-300">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">PiShock Credentials</h3>
                <p>
                  Your encrypted PiShock credentials are stored until you remove them through 
                  the application settings. You can delete your stored credentials at any time.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Activity Logs</h3>
                <p>
                  Activity logs are retained for safety and accountability purposes. The activity 
                  log maintains up to 5,000 recent entries, with older entries automatically purged. 
                  This typically represents several months of activity history.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Session Data</h3>
                <p>
                  Discord authentication tokens and session data are temporary and expire automatically. 
                  Instance data is maintained for the duration of Discord Activity sessions.
                </p>
              </div>
            </div>
          </section>

          {/* Third-Party Services */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4">Third-Party Services</h2>
            <div className="space-y-4 text-gray-300">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Discord</h3>
                <p>
                  We use Discord's OAuth2 API for user authentication and the Discord SDK for 
                  activity integration. Please review Discord's Privacy Policy for information 
                  about their data practices.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">PiShock</h3>
                <p>
                  Device control is performed through PiShock's official API using your personal 
                  credentials. We do not share your PiShock credentials with any third parties 
                  beyond the necessary API calls.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Cloudflare</h3>
                <p>
                  Our application is hosted on Cloudflare Workers and uses Cloudflare KV for 
                  data storage. All data is processed and stored according to Cloudflare's 
                  security and privacy standards.
                </p>
              </div>
            </div>
          </section>

          {/* Your Rights */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4">Your Rights and Choices</h2>
            <div className="space-y-4 text-gray-300">
              <ul className="space-y-2">
                <li>• <strong className="text-white">Access:</strong> View your stored PiShock connection status and activity history</li>
                <li>• <strong className="text-white">Deletion:</strong> Remove your PiShock credentials at any time through the application</li>
                <li>• <strong className="text-white">Control:</strong> Choose whether to participate in activities and which devices to connect</li>
                <li>• <strong className="text-white">Transparency:</strong> All device actions are logged and visible in the activity feed</li>
                <li>• <strong className="text-white">Consent:</strong> Explicit consent is required for all device interactions</li>
              </ul>
            </div>
          </section>

          {/* Safety Notice */}
          <section className="bg-red-900/20 border border-red-500/30 rounded-xl p-6">
            <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
              <AlertTriangle className="h-6 w-6 text-red-400" />
              <span>Important Safety Notice</span>
            </h2>
            <div className="space-y-4 text-red-200">
              <p>
                This application controls electrical shock devices. All interactions are logged 
                publicly for safety and accountability. By using this application, you acknowledge 
                that:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• You have explicit consent from all participants</li>
                <li>• You understand the risks involved with electrical devices</li>
                <li>• You will follow all safety protocols and start with low intensities</li>
                <li>• You are responsible for safe use and compliance with local laws</li>
              </ul>
            </div>
          </section>

          {/* Contact */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4">Contact and Updates</h2>
            <div className="space-y-4 text-gray-300">
              <p>
                This Privacy Policy may be updated periodically to reflect changes in our 
                practices or legal requirements. We will notify users of significant changes 
                through the application.
              </p>
              <p>
                For questions about this Privacy Policy or data practices, please review 
                our open-source code repository or contact us through appropriate channels.
              </p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-white/10 text-center text-gray-400">
          <p className="text-sm">
            PiShock Discord Activity - Privacy Policy<br />
            This application is provided for educational and consensual use only.
          </p>
        </div>
      </div>
    </div>
  );
}