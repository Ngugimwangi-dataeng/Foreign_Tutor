import React from 'react';
import { ArrowLeft, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { UserProfile } from '../types';

interface TutorAdminGateProps {
  currentUser: UserProfile | null;
  onAdminLoginSuccess: (adminUser: UserProfile) => void;
  onLogSecurityEvent: (params: {
    actorEmail: string;
    actorRole: string;
    action: string;
    httpStatus: number;
    details: string;
  }) => void;
  onBackToLanding: () => void;
  onOpenLogin: () => void;
}

export const TutorAdminGate: React.FC<TutorAdminGateProps> = ({
  currentUser,
  onAdminLoginSuccess,
  onLogSecurityEvent,
  onBackToLanding,
  onOpenLogin,
}) => {
  if (currentUser?.role === 'student') {
    return (
      <div className="max-w-xl mx-auto px-4 py-20">
        <div className="bg-white border border-red-200 rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="text-xs font-mono font-semibold text-red-600">
            403 UNAUTHORIZED - ACCESS DENIED
          </div>
          <h1 className="font-display text-2xl font-semibold text-[#18181B]">
            Restricted Tutor & Administrator Area
          </h1>
          <p className="text-sm text-[#52525B] leading-relaxed">
            Student accounts do not have permission to access the Tutor & Admin portal.
          </p>
          <button
            onClick={onBackToLanding}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#18181B] text-white text-xs font-semibold rounded-xl"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Landing Page</span>
          </button>
        </div>
      </div>
    );
  }

  if (currentUser?.role === 'tutor' && currentUser.isAdmin) {
    const enterConsole = () => {
      onLogSecurityEvent({
        actorEmail: currentUser.email,
        actorRole: 'tutor_admin',
        action: 'ADMIN_CONSOLE_ENTRY',
        httpStatus: 200,
        details: `Authorized Tutor & Administrator (${currentUser.fullName}) entered the console.`,
      });
      onAdminLoginSuccess(currentUser);
    };

    return (
      <div className="min-h-[78vh] flex items-center justify-center px-4 py-12">
        <div className="bg-white border border-[#E5E3DC] rounded-2xl shadow-lg max-w-md w-full p-6 text-center space-y-4">
          <ShieldCheck className="w-8 h-8 mx-auto text-[#0F6B4B]" />
          <h1 className="font-display text-xl font-semibold">Authorized Tutor Console</h1>
          <p className="text-sm text-[#52525B]">Your authenticated tutor account is authorized to continue.</p>
          <button
            type="button"
            onClick={enterConsole}
            className="w-full py-3 bg-[#18181B] text-white font-semibold rounded-xl"
          >
            Enter Tutor Workspace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[78vh] flex items-center justify-center px-4 py-12">
      <div className="bg-white border border-[#E5E3DC] rounded-2xl shadow-lg max-w-md w-full overflow-hidden">
        <div className="px-6 py-5 bg-[#18181B] text-white">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#6EE7B7]">
            <Lock className="w-3.5 h-3.5" />
            <span>RESTRICTED TUTOR GATEWAY</span>
          </div>
          <h1 className="font-display text-xl font-semibold mt-1">Tutor Sign In Required</h1>
        </div>
        <div className="p-6 space-y-4 text-sm text-[#52525B]">
          <p>Sign in with an authorized tutor account to continue.</p>
          <button
            type="button"
            onClick={onOpenLogin}
            className="w-full py-3 bg-[#18181B] text-white font-semibold rounded-xl"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={onBackToLanding}
            className="w-full py-2 text-[#52525B] flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Public Landing Page</span>
          </button>
        </div>
      </div>
    </div>
  );
};
