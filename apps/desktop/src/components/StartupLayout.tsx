/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import React, { useEffect, useState } from 'react';

interface StartupLayoutProps {
    onComplete: () => void;
    isAppReady: boolean;
    currentStatus: string;
}

export const StartupLayout: React.FC<StartupLayoutProps> = ({ onComplete, isAppReady, currentStatus }) => {
    const [progress, setProgress] = useState(0);
    const [isExiting, setIsExiting] = useState(false);
    const [version, setVersion] = useState('1.0.0-beta');

    // Dynamic Status Text
    const defaultText = "Initializing secure environment...";
    const targetText = currentStatus || defaultText;

    useEffect(() => {
        // Fetch real app version from Electron
        if (window.electronAPI?.getVersion) {
            window.electronAPI.getVersion().then(setVersion);
        }

        // Progress bar simulation tied to readiness
        const interval = setInterval(() => {
            setProgress(prev => {
                if (!isAppReady && prev >= 88) return 88;
                if (isAppReady && prev >= 88) return Math.min(prev + 1.5, 100);
                const next = prev + Math.random() * 8 + 3;
                return Math.min(next, 88);
            });
        }, 120);

        return () => clearInterval(interval);
    }, [isAppReady]);

    useEffect(() => {
        if (progress === 100) {
            setTimeout(() => {
                setIsExiting(true);
                setTimeout(onComplete, 1000); // Smoother exit
            }, 600);
        }
    }, [progress, onComplete]);

    return (
        <div
            className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#000000] overflow-hidden transition-all duration-1000 ease-[cubic-bezier(0.23,1,0.32,1)] ${isExiting ? 'opacity-0 scale-[1.05] blur-2xl pointer-events-none' : 'opacity-100'}`}
        >
            {/* Ultra-High-End Ambient Background - Dynamic Mesh Gradient Style */}
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-40%] left-[-20%] w-[120%] h-[120%] rounded-full bg-blue-600/5 blur-[160px] animate-pulse" style={{ animationDuration: '12s' }} />
                <div className="absolute bottom-[-30%] right-[-10%] w-[100%] h-[100%] rounded-full bg-purple-600/5 blur-[140px] animate-pulse" style={{ animationDuration: '15s', animationDelay: '3s' }} />
                
                {/* Center subtle glow behind logo */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] rounded-full bg-blue-400/[0.03] blur-[100px]" />
            </div>

            {/* Central Stage */}
            <div className="relative z-10 flex flex-col items-center max-w-sm w-full px-12">
                
                {/* Hero Logo - Floating & Breathing */}
                <div className="mb-16 relative">
                    <div className={`relative w-40 h-40 flex items-center justify-center transition-all duration-[2000ms] cubic-bezier(0.23,1,0.32,1) ${progress > 2 ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-8'}`}>
                        {/* Dynamic Shadow Layer */}
                        <div className="absolute inset-0 bg-blue-500/15 rounded-full blur-[40px] animate-pulse" />
                        
                        {/* Main Logo */}
                        <img 
                            src="/Kalynt.png" 
                            alt="Kalynt" 
                            className="w-32 h-32 object-contain relative z-10 drop-shadow-[0_0_30px_rgba(59,130,246,0.2)] animate-breathe"
                        />
                    </div>
                </div>

                {/* Brand Identity - Precision Spacing */}
                <div className="text-center mb-12 select-none">
                    <h1 className={`text-4xl font-bold text-white tracking-[-0.03em] mb-3 transition-all duration-1000 delay-500 ${progress > 8 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                        Kalynt
                    </h1>
                    <div className={`flex items-center justify-center space-x-2 transition-all duration-1000 delay-700 ${progress > 12 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                        <div className="h-[1px] w-4 bg-white/10" />
                        <p className="text-blue-400/80 text-[10px] font-bold tracking-[0.3em] uppercase">
                            Autonomous Local Intelligence
                        </p>
                        <div className="h-[1px] w-4 bg-white/10" />
                    </div>
                </div>

                {/* Minimal Loading System - Professional Tier */}
                <div className={`w-full max-w-[200px] flex flex-col items-center transition-all duration-1000 delay-1000 ${progress > 20 ? 'opacity-100' : 'opacity-0'}`}>
                    
                    {/* Progress Track */}
                    <div className="w-full h-[2px] bg-white/[0.04] rounded-full overflow-hidden mb-6 relative">
                        {/* Active Shimmer */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent animate-shimmer" style={{ animationDuration: '2s' }} />
                        
                        {/* Progress Indicator */}
                        <div 
                            className="absolute top-0 left-0 h-full bg-white transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] shadow-[0_0_15px_rgba(255,255,255,0.4)]"
                            style={{ width: `${progress}%` }}
                        />
                    </div>

                    {/* Status Feedback - Subtle but informative */}
                    <div className="h-4 flex items-center justify-center overflow-hidden">
                        <p className="text-[10px] text-gray-400 font-medium tracking-wide uppercase transition-all duration-300">
                            {targetText}
                        </p>
                    </div>
                </div>
            </div>

            {/* Premium Footer - Secure Metadata */}
            <div className={`absolute bottom-16 transition-all duration-[1500ms] delay-[1200ms] ${progress > 40 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <div className="flex flex-col items-center space-y-4">
                    <div className="flex items-center space-x-4 bg-white/[0.03] border border-white/[0.06] px-6 py-2 rounded-2xl backdrop-blur-xl">
                        <div className="flex items-center space-x-2">
                            <div className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
                            <span className="text-[10px] text-gray-300 font-semibold tracking-wider uppercase">
                                Build {version}
                            </span>
                        </div>
                        <div className="w-[1px] h-3 bg-white/10" />
                        <span className="text-[10px] text-gray-500 font-medium tracking-wider uppercase">
                            P2P Core Verified
                        </span>
                    </div>
                    <p className="text-[9px] text-gray-600 font-bold tracking-[0.4em] uppercase opacity-40">
                        Privacy Preserving Technology
                    </p>
                </div>
            </div>

            {/* Aesthetic Grain Layer */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.02] mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
        </div>
    );
};


