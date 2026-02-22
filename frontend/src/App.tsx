import { Download, Github } from 'lucide-react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import EnergyBeam from './components/ui/energy-beam';
import Footer from './components/Footer';
import Navbar from './components/Navbar';
import Features from './components/Features';

function App() {
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"]
  });

  // Scale up as we scroll down the hero section, then back to 1
  const imageScale = useTransform(scrollYProgress, [0, 0.4, 0.8, 1], [1, 1.15, 1, 1]);
  const imageY = useTransform(scrollYProgress, [0, 0.4, 0.8, 1], [0, 50, 0, 0]);

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-orange-500/30 selection:text-orange-200 overflow-x-hidden">

      {/* Navigation */}
      <Navbar />

      {/* Hero Section */}
      <section ref={heroRef} className="relative z-10 pt-32 pb-20 px-6 w-full flex flex-col items-center text-center overflow-hidden min-h-[150vh] justify-start">
        {/* Energy Beam Background - Hero Only */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <EnergyBeam className="opacity-80" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black z-10" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-orange-900/20 via-black/0 to-black/0 z-10" />
        </div>

        <div className="relative z-20 max-w-7xl mx-auto flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-orange-400 text-sm font-medium backdrop-blur-md shadow-[0_0_15px_rgba(234,88,12,0.1)] hover:shadow-[0_0_20px_rgba(234,88,12,0.3)] transition-all cursor-default"
          >
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-[pulse_2s_infinite]" />
            v1.0.0 Now Available
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-6xl md:text-8xl font-black tracking-tighter mb-8 leading-[0.9]"
          >
            Train Models.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-200 to-orange-400">
              On Your Metal.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-white/60 max-w-2xl mb-12"
          >
            A high-performance desktop GUI for training PyTorch Image Classification models.
            No cloud bills. No CLI scripts. Just pure local power.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <button className="group relative px-8 py-4 bg-gradient-to-b from-orange-500 to-orange-700 text-white rounded-full font-bold text-base shadow-[0_0_0_1px_rgba(249,115,22,0.3),0_8px_40px_-12px_rgba(249,115,22,0.5)] hover:shadow-[0_0_0_1px_rgba(249,115,22,0.5),0_12px_50px_-8px_rgba(249,115,22,0.6)] transition-all duration-300 hover:-translate-y-0.5 flex items-center gap-2.5 overflow-hidden">
              <span className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <Download className="w-4 h-4 relative z-10" /> <span className="relative z-10">Download App</span>
            </button>
            <button className="px-8 py-4 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-white/20 text-white/80 hover:text-white rounded-full font-bold text-base backdrop-blur-sm transition-all duration-300 flex items-center gap-2.5">
              <Github className="w-4 h-4" /> Star on GitHub
            </button>
          </motion.div>

          {/* Hero Image/Preview */}
          <motion.div
            initial={{ opacity: 0, y: 100, rotateX: 20 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 1, delay: 0.4 }}
            style={{ scale: imageScale, y: imageY }}
            className="mt-24 w-full max-w-5xl perspective-1000 sticky top-32 z-30"
          >
            <div className="relative rounded-xl border border-white/10 bg-[#0a0a0a] backdrop-blur-xl shadow-[0_0_50px_rgba(234,88,12,0.1)] overflow-hidden group transition-shadow duration-500 hover:shadow-[0_0_80px_rgba(234,88,12,0.2)] flex flex-col m-10 items-center">
              {/* Window Header */}
              <div className="h-10 w-full bg-white/[0.02] border-b border-white/10 flex items-center px-4 gap-2 shrink-0">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              {/* Window Content */}
              <div className="relative aspect-video w-full bg-black">
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-10 opacity-60 pointer-events-none" />
                <img
                  src="/app-interface.png"
                  alt="EPOQ Interface"
                  className="w-full h-full object-cover object-top"
                />
              </div>
            </div>
          </motion.div>

        </div>
      </section>

      {/* Bento Grid Features */}
      <Features />

      {/* Tech Stack Marquee-ish */}
      <section id="stack" className="py-24 border-y border-white/5 bg-neutral-950/50">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-white/40 uppercase tracking-widest text-sm font-bold mb-12">Powered by modern technologies</p>
          <div className="flex flex-wrap justify-center gap-12 sm:gap-20 opacity-70 grayscale transition-all duration-500 hover:grayscale-0 hover:opacity-100">
            {/* Simple Text Logos for calmness */}
            <div className="flex items-center gap-2 text-2xl font-bold text-white"><span className="text-white">Next.js</span></div>
            <div className="flex items-center gap-2 text-2xl font-bold text-orange-500">Rust</div>
            <div className="flex items-center gap-2 text-2xl font-bold text-blue-400">Tauri</div>
            <div className="flex items-center gap-2 text-2xl font-bold text-red-500">PyTorch</div>
            <div className="flex items-center gap-2 text-2xl font-bold text-cyan-400">React</div>
            <div className="flex items-center gap-2 text-2xl font-bold text-yellow-400">Python</div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

export default App;
