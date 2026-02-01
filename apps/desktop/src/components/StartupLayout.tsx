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

    // Typewriter State
    const [displayedText, setDisplayedText] = useState("");
    const defaultText = "Initializing...";
    const targetText = currentStatus || defaultText;

    // Particle State
    const [particles] = useState(() => Array.from({ length: 20 }).map((_, i) => ({
        id: i,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        size: Math.random() * 4 + 1,
        delay: Math.random() * 5,
        duration: Math.random() * 3 + 2
    })));

    // Typewriter Effect
    useEffect(() => {
        let currentIndex = 0;
        setDisplayedText(""); // Reset on new status

        const typeInterval = setInterval(() => {
            if (currentIndex < targetText.length) {
                setDisplayedText(targetText.slice(0, currentIndex + 1));
                currentIndex++;
            } else {
                clearInterval(typeInterval);
            }
        }, 30); // Typing speed

        return () => clearInterval(typeInterval);
    }, [targetText]);

    useEffect(() => {
        // Progress bar simulation (but tied to real status roughly)
        const interval = setInterval(() => {
            setProgress(prev => {
                // If not ready, cap at 90%
                if (!isAppReady && prev >= 90) {
                    return 90;
                }

                // If ready, allow to go to 100%
                if (isAppReady && prev >= 90) {
                    return Math.min(prev + 2, 100);
                }

                const next = prev + Math.random() * 10 + 5; // Faster, more responsive load
                return Math.min(next, 90);
            });
        }, 50);

        return () => clearInterval(interval);
    }, [isAppReady]);

    useEffect(() => {
        if (progress === 100) {
            // Trigger exit animation
            setTimeout(() => {
                setIsExiting(true);
                // Wait for exit animation (700ms) then unmount
                setTimeout(onComplete, 500);
            }, 50);
        }
    }, [progress, onComplete]);

    return (
        <div
            className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${isExiting ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100'}`}
        >
            {/* Background Particles */}
            <div className="absolute inset-0 z-0 opacity-40">
                {particles.map(p => (
                    <div
                        key={p.id}
                        className="absolute rounded-full bg-blue-400 animate-twinkle"
                        style={{
                            top: p.top,
                            left: p.left,
                            width: `${p.size}px`,
                            height: `${p.size}px`,
                            animationDelay: `${p.delay}s`,
                            animationDuration: `${p.duration}s`
                        }}
                    />
                ))}
            </div>

            {/* Background Ambient Glows */}
            <div className={`absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full mix-blend-screen filter blur-[100px] opacity-20 bg-blue-600 animate-float`} style={{ animationDuration: '10s' }} />
            <div className={`absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full mix-blend-screen filter blur-[100px] opacity-15 bg-purple-600 animate-float`} style={{ animationDuration: '12s', animationDelay: '2s' }} />

            {/* Glass Container with Shimmer */}
            <div className={`relative z-10 flex flex-col items-center p-12 rounded-3xl startup-glass animate-reveal-up overflow-hidden ${isExiting ? 'scale-95 blur-sm' : 'scale-100'} transition-all duration-700`}>

                {/* Shimmer Overlay */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 translate-x-[-100%] animate-shimmer" />
                </div>

                {/* Logo Area */}
                <div className="mb-8 relative z-10 animate-breathe">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg transform rotate-3 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent" />
                        <img src="/Kalynt_48x48.ico" alt="Kalynt Logo" className="w-12 h-12 drop-shadow-md" />
                    </div>
                </div>

                {/* Brand Name */}
                <h1 className="text-3xl font-bold text-white tracking-tight mb-2 animate-reveal-up delay-100 z-10">
                    Kalynt
                </h1>
                <p className="text-gray-400 text-sm font-medium tracking-wide animate-reveal-up delay-200 mb-8 z-10">
                    LOCAL INTELLIGENCE PLATFORM
                </p>

                {/* Progress Bar */}
                <div className="animate-reveal-up delay-300 flex flex-col items-center w-full z-10">
                    <div className="loading-bar-container mb-4 relative overflow-hidden bg-white/5">
                        <div
                            className="loading-bar-fill shadow-[0_0_15px_rgba(59,130,246,0.6)]"
                            style={{ width: `${progress}%` }}
                        />
                    </div>

                    {/* Dynamic Text - Typewriter */}
                    <div className="h-6 overflow-hidden flex items-center">
                        <p className="text-xs text-gray-500 font-mono tracking-wider text-center min-w-[240px] transition-colors duration-300">
                            {displayedText}
                        </p>
                    </div>
                </div>
            </div>

            {/* Footer Version */}
            <div className="absolute bottom-8 text-center animate-reveal-up delay-500 z-10">
                <p className="text-[10px] text-gray-600 font-mono">v1.0 beta // SECURE CORE ACTIVE</p>
            </div>

            {/* Scanline Overlay */}
            <div className="absolute inset-0 pointer-events-none scanline-overlay opacity-30"></div>
        </div>
    );
};
