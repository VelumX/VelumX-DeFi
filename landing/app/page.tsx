'use client';

import React, { useState, useEffect } from 'react';
import { ArrowUpRight, LayoutGrid, Globe, Shield, Terminal, Zap, ExternalLink, ChevronDown, Activity, Cpu, Layers, Code } from 'lucide-react';
import Image from 'next/image';

const GithubIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

export default function EliteLandingPage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <main className="min-h-screen bg-bg-primary text-text-primary relative flex flex-col font-inter overflow-x-hidden">
      {/* Dynamic Mesh Background */}
      <div className="mesh-glow" />

      {/* Navigation Overlay */}
      <header className={`fixed top-0 w-full z-50 px-8 py-6 transition-all duration-500 ${scrolled ? 'bg-bg-primary/80 backdrop-blur-2xl border-b border-white/[0.03] py-4' : ''}`}>
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4 group">
            <div className="relative w-9 h-9">
               <Image 
                  src="/velumx-icon.svg" 
                  alt="VelumX Icon" 
                  width={36} 
                  height={36} 
                  className="object-contain filter drop-shadow-[0_0_8px_rgba(233,30,99,0.3)] transition-transform group-hover:scale-110"
                  style={{ height: 'auto' }}
               />
            </div>
            <div className="flex flex-col">
               <span className="font-bungee text-2xl leading-none tracking-tighter">VelumX</span>
               <span className="text-[9px] uppercase font-bold tracking-[0.4em] text-white/20 mt-1">Infrastructure</span>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-12">
            <div className="flex items-center gap-8 text-[10px] uppercase font-bold tracking-[0.25em] text-white/40">
              <a href="https://doc.velumx.xyz" className="hover:text-white transition-colors">Protocol Docs</a>
              <a href="https://github.com/InnoOkeke/VelumX" className="hover:text-white transition-colors">SDK Core</a>
              <a href="#" className="hover:text-white transition-colors">Ecosystem</a>
            </div>
            
            <a 
              href="https://dashboard.velumx.xyz" 
              className="px-6 py-2.5 rounded-full border border-white/5 bg-white/[0.03] text-[10px] uppercase font-bold tracking-[0.15em] text-white hover:bg-white/[0.08] hover:border-white/10 transition-all backdrop-blur-md"
            >
              Sign In to Console
            </a>
          </nav>

          <button className="lg:hidden p-2 text-white/60">
             <LayoutGrid className="h-6 w-6" />
          </button>
        </div>
      </header>

      {/* Elite Hero Section */}
      <section className="relative px-6 pt-52 pb-32 flex flex-col items-center">
        {/* HUD Component */}
        <div className="mb-14 hud-badge animate-float-slow">
           <div className="w-2 h-2 rounded-full dot-green animate-pulse-dot" />
           <span className="text-[10px] uppercase font-bold tracking-[0.35em] text-white/30 whitespace-nowrap">Mainnet Operational // Bitcoin Settlement Active</span>
        </div>

        <div className="max-w-[1200px] text-center space-y-12 relative z-10">
          <h1 className="hero-headline">
             The <span className="neon-text-magenta">Settlement</span> <br/>
             <span className="text-white/90">Layer</span> For <br/>
             Gasless DeFi
          </h1>

          <div className="max-w-2xl mx-auto space-y-8">
             <p className="text-lg md:text-xl text-text-secondary font-light leading-relaxed tracking-tight">
                VelumX is the high-performance abstraction protocol for the Bitcoin economy. 
                Deploy modular gasless infrastructure on Stacks L2 with intent-based settlement and production-grade SDKs.
             </p>

             <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-4">
                <a href="https://app.velumx.xyz" className="btn-elite btn-primary group">
                   <span className="flex items-center gap-3">
                      Enter Protocol
                      <ArrowUpRight className="h-4 w-4 group-hover:rotate-45 transition-transform" />
                   </span>
                </a>

                <a href="https://dashboard.velumx.xyz" className="btn-elite btn-secondary group">
                   <span className="flex items-center gap-3">
                      <Terminal className="h-4 w-4" />
                      Developer Portal
                   </span>
                </a>
             </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="mt-32 flex flex-col items-center gap-4 animate-scroll opacity-20">
           <span className="text-[10px] uppercase font-bold tracking-[0.4em]">Scroll for Architecture</span>
           <ChevronDown className="h-4 w-4" />
        </div>
      </section>

      {/* Infrastructure Specs (Elite Cards) */}
      <section className="px-8 py-40 max-w-[1400px] mx-auto w-full">
         <div className="grid lg:grid-cols-3 gap-10">
            <div className="elite-card group p-10 space-y-8">
               <div className="flex justify-between items-start">
                  <div className="w-14 h-14 bg-magenta/10 rounded-2xl flex items-center justify-center border border-magenta/20 shadow-[0_0_20px_rgba(233,30,99,0.1)]">
                     <Layers className="h-7 w-7 text-magenta" />
                  </div>
                  <div className="flex gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
                     <div className="system-dot dot-red" />
                     <div className="system-dot dot-purple" />
                     <div className="system-dot dot-green" />
                  </div>
               </div>
               <div className="space-y-4">
                  <h3 className="font-bungee text-2xl tracking-tighter">Intent Settlement</h3>
                  <p className="text-sm text-text-secondary leading-relaxed font-light">
                     Experience sub-block finality with our intent-based relayer architecture. 
                     VelumX abstracts Bitcoin L2 complexity into simple, signed user intentions.
                  </p>
               </div>
               <div className="pt-4 border-t border-white/[0.03] flex items-center gap-2 text-[10px] font-bold text-white/20 uppercase tracking-widest">
                  <Activity className="h-3 w-3" />
                  Latency: ~2.4s // Mainnet
               </div>
            </div>

            <div className="elite-card group p-10 space-y-8 lg:translate-y-12">
               <div className="flex justify-between items-start">
                  <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20 shadow-[0_0_20px_rgba(0,210,255,0.1)]">
                     <Cpu className="h-7 w-7 text-blue-400" />
                  </div>
                  <div className="flex gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
                     <div className="system-dot dot-red" />
                     <div className="system-dot dot-purple" />
                     <div className="system-dot dot-green" />
                  </div>
               </div>
               <div className="space-y-4">
                  <h3 className="font-bungee text-2xl tracking-tighter">Universal SDK</h3>
                  <p className="text-sm text-text-secondary leading-relaxed font-light">
                     Production-ready SDKs for React, Node, and Mobile. 
                     Integrate gasless swaps, bridging, and transfers with less than 20 lines of code.
                  </p>
               </div>
               <div className="pt-4 border-t border-white/[0.03] flex items-center gap-2 text-[10px] font-bold text-white/20 uppercase tracking-widest">
                  <Code className="h-3 w-3" />
                  Stability: 99.99% // Uptime
               </div>
            </div>

            <div className="elite-card group p-10 space-y-8">
               <div className="flex justify-between items-start">
                  <div className="w-14 h-14 bg-magenta/10 rounded-2xl flex items-center justify-center border border-magenta/20 shadow-[0_0_20px_rgba(233,30,99,0.1)]">
                     <Shield className="h-7 w-7 text-magenta" />
                  </div>
                  <div className="flex gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
                     <div className="system-dot dot-red" />
                     <div className="system-dot dot-purple" />
                     <div className="system-dot dot-green" />
                  </div>
               </div>
               <div className="space-y-4">
                  <h3 className="font-bungee text-2xl tracking-tighter">Native Finality</h3>
                  <p className="text-sm text-text-secondary leading-relaxed font-light">
                     Secured by the Bitcoin Network. All sponsored transactions are settled 
                     directly on the Stacks L1 anchor with non-custodial Clarity smart contracts.
                  </p>
               </div>
               <div className="pt-4 border-t border-white/[0.03] flex items-center gap-2 text-[10px] font-bold text-white/20 uppercase tracking-widest">
                  <Globe className="h-3 w-3" />
                   Network: Stacks // Nakamoto
               </div>
            </div>
         </div>
      </section>

      {/* Ecosystem Pulse (Elite Trust Logos - Simulated) */}
      <section className="px-8 py-32 border-t border-white/[0.03] bg-black/40">
         <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-16">
            <div className="space-y-4">
               <h4 className="font-bungee text-3xl tracking-tighter">Ecosystem Core</h4>
               <p className="text-xs uppercase font-bold tracking-[0.4em] text-white/20">The Foundation of Bitcoin DeFi</p>
            </div>
            
            <div className="flex flex-wrap justify-center gap-16 opacity-30 grayscale hover:grayscale-0 transition-all duration-1000">
               <div className="flex flex-col items-center gap-3">
                  <span className="font-bungee text-2xl">BITCOIN</span>
                  <span className="text-[8px] uppercase tracking-widest font-bold">Security Layer</span>
               </div>
               <div className="flex flex-col items-center gap-3">
                  <span className="font-bungee text-2xl">STACKS</span>
                  <span className="text-[8px] uppercase tracking-widest font-bold">Execution Layer</span>
               </div>
               <div className="flex flex-col items-center gap-3">
                  <span className="font-bungee text-2xl">HIRO</span>
                  <span className="text-[8px] uppercase tracking-widest font-bold">Infrastructure</span>
               </div>
               <div className="flex flex-col items-center gap-3">
                  <span className="font-bungee text-2xl">ALEX</span>
                  <span className="text-[8px] uppercase tracking-widest font-bold">Liquidity Partner</span>
               </div>
            </div>
         </div>
      </section>

      {/* Footer Elite */}
      <footer className="px-10 py-24 border-t border-white/[0.03] relative z-10">
        <div className="max-w-[1400px] mx-auto grid lg:grid-cols-4 gap-20">
             <div className="flex flex-col gap-2">
                <Image src="/velumx-logo.svg" alt="VelumX Logo" width={80} height={20} className="object-contain opacity-80" style={{ height: 'auto' }} />
                <p className="text-[10px] uppercase font-bold tracking-[0.5em] text-white/40 mt-4 leading-relaxed">
                   The settlement protocol <br/> for gas-free liquidity <br/> and abstraction.
                </p>
              </div>
           
           <div className="space-y-8">
              <h5 className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/70">Protocol</h5>
              <ul className="text-xs space-y-4 text-text-secondary font-medium uppercase tracking-widest leading-relaxed">
                 <li><a href="https://doc.velumx.xyz" className="hover:text-white transition-colors">Documentation</a></li>
                 <li><a href="#" className="hover:text-white transition-colors">Core Relayer</a></li>
                 <li><a href="#" className="hover:text-white transition-colors">Ecosystem Stats</a></li>
                 <li><a href="#" className="hover:text-white transition-colors">Governance</a></li>
              </ul>
           </div>

           <div className="space-y-8">
              <h5 className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/70">Network</h5>
              <ul className="text-xs space-y-4 text-text-secondary font-medium uppercase tracking-widest leading-relaxed">
                 <li className="flex items-center gap-2 hover:text-white cursor-pointer"><GithubIcon className="h-3 w-3" /> GitHub</li>
                 <li className="flex items-center gap-2 hover:text-white cursor-pointer">Follow Protocol</li>
                 <li className="flex items-center gap-2 hover:text-white cursor-pointer"><ExternalLink className="h-3 w-3" /> Brand Resources</li>
              </ul>
           </div>
        </div>
        
        <div className="max-w-[1400px] mx-auto mt-32 pt-12 border-t border-white/[0.03] flex flex-col md:flex-row items-center justify-between gap-10">
           <p className="text-[9px] uppercase font-bold tracking-[0.6em] text-white/40">© 2024 VelumX Lab // Advanced Infrastructure For Stacks L2</p>
           <div className="flex gap-16 text-[9px] uppercase font-bold tracking-[0.4em] text-white/50">
              <a href="#" className="hover:text-white transition-colors">Mainnet</a>
              <a href="#" className="hover:text-white transition-colors">Safety</a>
              <a href="#" className="hover:text-white transition-colors">Status</a>
           </div>
        </div>
      </footer>
    </main>
  );
}
