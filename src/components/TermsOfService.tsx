import React, { useEffect } from 'react';
import { FileText, ArrowLeft, AlertTriangle, Shield, Zap, Users, Scale, Clock } from 'lucide-react';

interface TermsOfServiceProps {
  onBack: () => void;
}

export function TermsOfService({ onBack }: TermsOfServiceProps) {
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
            <div className="p-3 bg-purple-500/20 rounded-lg">
              <FileText className="h-8 w-8 text-purple-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Terms of Service</h1>
              <p className="text-gray-300">PiShock Discord Activity</p>
            </div>
          </div>
          
          <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4">
            <p className="text-purple-200 text-sm">
              <strong>Last Updated:</strong> {new Date().toLocaleDateString()}<br />
              <strong>Effective Date:</strong> {new Date().toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Critical Safety Warning */}
        <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-6 mb-8">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-8 w-8 text-red-400 flex-shrink-0 mt-1" />
            <div>
              <h2 className="text-xl font-bold text-red-300 mb-2">⚠️ CRITICAL SAFETY WARNING ⚠️</h2>
              <div className="text-red-200 space-y-2 text-sm">
                <p><strong>This application controls electrical shock devices that can cause physical harm, injury, or death if misused.</strong></p>
                <p>By using this application, you acknowledge that you understand the serious risks involved and agree to:</p>
                <ul className="ml-4 space-y-1">
                  <li>• Use only with explicit, informed consent from all participants</li>
                  <li>• Follow all safety protocols and start with lowest settings</li>
                  <li>• Take full responsibility for safe use and any consequences</li>
                  <li>• Comply with all applicable laws in your jurisdiction</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-8">
          {/* Acceptance */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
              <Scale className="h-6 w-6 text-blue-400" />
              <span>Acceptance of Terms</span>
            </h2>
            <div className="space-y-4 text-gray-300">
              <p>
                By accessing or using the PiShock Discord Activity application ("the Service"), 
                you agree to be bound by these Terms of Service ("Terms"). If you do not agree 
                to these Terms, you must not use the Service.
              </p>
              <p>
                <strong className="text-white">You must be at least 18 years of age</strong> to use this Service. 
                By using the Service, you represent and warrant that you are at least 18 years old 
                and have the legal capacity to enter into these Terms.
              </p>
            </div>
          </section>

          {/* Service Description */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
              <Zap className="h-6 w-6 text-yellow-400" />
              <span>Service Description</span>
            </h2>
            <div className="space-y-4 text-gray-300">
              <p>
                PiShock Discord Activity is a Discord Activity application that enables users to:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Connect their PiShock devices to a multiplayer Discord environment</li>
                <li>• Control electrical shock devices (shock, vibrate, beep functions)</li>
                <li>• Participate in consensual activities with other users</li>
                <li>• Monitor device interactions through activity logging</li>
                <li>• Configure safety limits and device parameters</li>
              </ul>
              <p>
                The Service is designed for <strong className="text-white">educational, experimental, and consensual adult use only</strong>.
              </p>
            </div>
          </section>

          {/* User Responsibilities */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
              <Users className="h-6 w-6 text-green-400" />
              <span>User Responsibilities</span>
            </h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Safety Requirements</h3>
                <ul className="space-y-2 text-gray-300 ml-4">
                  <li>• <strong>Explicit Consent:</strong> Obtain clear, informed consent from all participants before any device interaction</li>
                  <li>• <strong>Safety Protocols:</strong> Always start with the lowest intensity and duration settings</li>
                  <li>• <strong>Emergency Procedures:</strong> Establish safe words and emergency stop procedures before use</li>
                  <li>• <strong>Medical Considerations:</strong> Do not use with individuals who have heart conditions, pacemakers, or other medical devices</li>
                  <li>• <strong>Physical Safety:</strong> Ensure proper device placement and avoid sensitive areas</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Account Security</h3>
                <ul className="space-y-2 text-gray-300 ml-4">
                  <li>• Keep your PiShock API credentials secure and do not share them</li>
                  <li>• Use strong, unique passwords for your PiShock account</li>
                  <li>• Regularly review your device share codes and regenerate them if needed</li>
                  <li>• Monitor activity logs for unauthorized access</li>
                </ul>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Legal Compliance</h3>
                <ul className="space-y-2 text-gray-300 ml-4">
                  <li>• Comply with all applicable local, state, and federal laws</li>
                  <li>• Respect the laws and regulations of your jurisdiction regarding such devices</li>
                  <li>• Do not use the Service for any illegal or unauthorized purposes</li>
                  <li>• Report any suspected abuse or non-consensual use immediately</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Prohibited Uses */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
              <AlertTriangle className="h-6 w-6 text-red-400" />
              <span>Prohibited Uses</span>
            </h2>
            <div className="space-y-4 text-gray-300">
              <p>You agree not to use the Service for any of the following prohibited activities:</p>
              <ul className="space-y-2 ml-4">
                <li>• <strong>Non-consensual use:</strong> Using devices without explicit consent from the target</li>
                <li>• <strong>Harassment or abuse:</strong> Using the Service to harass, threaten, or harm others</li>
                <li>• <strong>Minors:</strong> Any interaction involving individuals under 18 years of age</li>
                <li>• <strong>Unsafe practices:</strong> Ignoring safety protocols or device limitations</li>
                <li>• <strong>Unauthorized access:</strong> Attempting to control devices without proper authorization</li>
                <li>• <strong>System abuse:</strong> Attempting to circumvent safety measures or exploit the Service</li>
                <li>• <strong>Commercial use:</strong> Using the Service for commercial purposes without authorization</li>
                <li>• <strong>Illegal activities:</strong> Any use that violates applicable laws or regulations</li>
              </ul>
            </div>
          </section>

          {/* Data and Privacy */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
              <Shield className="h-6 w-6 text-blue-400" />
              <span>Data and Privacy</span>
            </h2>
            <div className="space-y-4 text-gray-300">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Activity Logging</h3>
                <p>
                  All device interactions are logged for safety and accountability purposes. 
                  These logs include timestamps, user information, and command details. 
                  Activity logs are visible to all participants in the session.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Data Security</h3>
                <p>
                  Your PiShock credentials are encrypted and stored securely. However, you 
                  acknowledge that no system is completely secure, and you use the Service 
                  at your own risk.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Privacy Policy</h3>
                <p>
                  Our collection and use of your information is governed by our Privacy Policy, 
                  which is incorporated into these Terms by reference.
                </p>
              </div>
            </div>
          </section>

          {/* Disclaimers and Limitations */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4">Disclaimers and Limitations of Liability</h2>
            <div className="space-y-4 text-gray-300">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">No Warranty</h3>
                <p>
                  THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND. 
                  WE DISCLAIM ALL WARRANTIES, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING 
                  WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Limitation of Liability</h3>
                <p>
                  TO THE FULLEST EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY DIRECT, 
                  INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING 
                  BUT NOT LIMITED TO PERSONAL INJURY, PROPERTY DAMAGE, OR DEATH, ARISING FROM 
                  YOUR USE OF THE SERVICE.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium text-white mb-2">Your Assumption of Risk</h3>
                <p>
                  YOU EXPRESSLY ACKNOWLEDGE AND AGREE THAT USE OF ELECTRICAL SHOCK DEVICES CARRIES 
                  INHERENT RISKS OF PHYSICAL HARM, INJURY, OR DEATH. YOU VOLUNTARILY ASSUME ALL 
                  SUCH RISKS AND AGREE TO HOLD US HARMLESS FROM ANY CLAIMS ARISING FROM YOUR USE 
                  OF THE SERVICE.
                </p>
              </div>
            </div>
          </section>

          {/* Indemnification */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4">Indemnification</h2>
            <div className="space-y-4 text-gray-300">
              <p>
                You agree to defend, indemnify, and hold harmless the Service, its developers, 
                and affiliated parties from and against any and all claims, damages, obligations, 
                losses, liabilities, costs, or debt, and expenses (including attorney's fees) 
                arising from:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Your use or misuse of the Service</li>
                <li>• Your violation of these Terms</li>
                <li>• Your violation of the rights of any third party</li>
                <li>• Any harm, injury, or damage resulting from your use of electrical devices</li>
                <li>• Any non-consensual use of the Service</li>
              </ul>
            </div>
          </section>

          {/* Termination */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4 flex items-center space-x-2">
              <Clock className="h-6 w-6 text-orange-400" />
              <span>Termination</span>
            </h2>
            <div className="space-y-4 text-gray-300">
              <p>
                We reserve the right to terminate or suspend your access to the Service immediately, 
                without prior notice or liability, for any reason, including if you breach these Terms.
              </p>
              <p>
                You may terminate your use of the Service at any time by removing your stored 
                credentials and ceasing to use the application.
              </p>
              <p>
                Upon termination, your stored credentials will be deleted, but activity logs 
                may be retained for safety and legal compliance purposes.
              </p>
            </div>
          </section>

          {/* Governing Law */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4">Governing Law and Jurisdiction</h2>
            <div className="space-y-4 text-gray-300">
              <p>
                These Terms shall be governed by and construed in accordance with applicable 
                international laws and the laws of the jurisdiction where the Service is operated.
              </p>
              <p>
                Any disputes arising under these Terms shall be resolved through appropriate 
                legal channels in the applicable jurisdiction.
              </p>
            </div>
          </section>

          {/* Changes to Terms */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4">Changes to Terms</h2>
            <div className="space-y-4 text-gray-300">
              <p>
                We reserve the right to modify these Terms at any time. We will notify users 
                of significant changes through the application. Your continued use of the Service 
                after changes become effective constitutes acceptance of the new Terms.
              </p>
              <p>
                If you do not agree to the modified Terms, you must stop using the Service.
              </p>
            </div>
          </section>

          {/* Contact Information */}
          <section className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-2xl font-semibold mb-4">Contact Information</h2>
            <div className="space-y-4 text-gray-300">
              <p>
                If you have any questions about these Terms of Service, please review our 
                open-source code repository or contact us through appropriate channels.
              </p>
              <p>
                For emergency situations or safety concerns, immediately discontinue use 
                and contact appropriate emergency services if needed.
              </p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-white/10">
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-4">
            <p className="text-red-200 text-sm text-center">
              <strong>By using this Service, you acknowledge that you have read, understood, 
              and agree to be bound by these Terms of Service and understand the serious 
              risks involved with electrical shock devices.</strong>
            </p>
          </div>
          
          <div className="text-center text-gray-400">
            <p className="text-sm">
              PiShock Discord Activity - Terms of Service<br />
              This application is provided for educational and consensual use only.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}