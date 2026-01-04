import React, { useState, useRef, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, Modality } from "@google/genai";

// --- Data ---
const LOADING_QUOTES = [
  "The mind is like water. When it is agitated, it is difficult to see. When it is calm, everything becomes clear.",
  "Do not dwell in the past, do not dream of the future, concentrate the mind on the present moment.",
  "Peace comes from within. Do not seek it without.",
  "In the end, only three things matter: how much you loved, how gently you lived, and how gracefully you let go of things not meant for you.",
  "Silence is not the absence of sound, but the absence of noise.",
  "To understand everything is to forgive everything.",
  "Breathe. You are exactly where you are meant to be."
];

// --- Audio Utilities ---
const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// Improved Formatter to handle Bold (**text**) and Italics (*text*)
const FormattedText = ({ text }: { text: string }) => {
  if (!text) return null;
  
  // Split by bold (**...**) first
  const boldParts = text.split(/(\*\*.*?\*\*)/g);
  
  return (
    <>
      {boldParts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-bold text-stone-300">{part.slice(2, -2)}</strong>;
        }
        // Then split non-bold parts by italics (*...*)
        const italicParts = part.split(/(\*.*?\*)/g);
        return (
          <span key={i}>
            {italicParts.map((subPart, j) => {
              if (subPart.startsWith('*') && subPart.endsWith('*')) {
                return <em key={j} className="italic text-[#d4af37]/80">{subPart.slice(1, -1)}</em>;
              }
              return subPart;
            })}
          </span>
        );
      })}
    </>
  );
};

const LotusIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#d4af37" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 2C12 2 16 8 16 12C16 16 12 22 12 22C12 22 8 16 8 12C8 8 12 2 12 2Z" />
    <path d="M12 22C12 22 17 18 20 15C23 12 20 8 18 8" />
    <path d="M12 22C12 22 7 18 4 15C1 12 4 8 6 8" />
  </svg>
);

const VolumeControl = ({ isMusic, toggleMusic, isVoice, toggleVoice }: { isMusic: boolean, toggleMusic: () => void, isVoice: boolean, toggleVoice: () => void }) => (
  <div className="absolute top-6 right-6 z-50 flex gap-3 transition-opacity duration-1000 animate-in fade-in zoom-in-95">
    <button 
      onClick={(e) => { e.stopPropagation(); toggleMusic(); }}
      className={`p-3 rounded-full border border-stone-800/50 backdrop-blur-md transition-all duration-300 group ${isMusic ? 'text-[#d4af37] bg-stone-900/40 hover:bg-stone-900/60' : 'text-stone-600 bg-transparent hover:text-stone-400 hover:border-stone-700'}`}
      aria-label={isMusic ? "Mute Ambience" : "Enable Ambience"}
      title="Ambience"
    >
      {isMusic ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
           <path d="M9 18V5l12-2v13" />
           <circle cx="6" cy="18" r="3" />
           <circle cx="18" cy="16" r="3" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
           <path d="M9 18V5l12-2v13" />
           <circle cx="6" cy="18" r="3" />
           <circle cx="18" cy="16" r="3" />
           <line x1="2" y1="2" x2="22" y2="22" className="opacity-70" />
        </svg>
      )}
    </button>
    <button 
      onClick={(e) => { e.stopPropagation(); toggleVoice(); }}
      className={`p-3 rounded-full border border-stone-800/50 backdrop-blur-md transition-all duration-300 group ${isVoice ? 'text-[#d4af37] bg-stone-900/40 hover:bg-stone-900/60' : 'text-stone-600 bg-transparent hover:text-stone-400 hover:border-stone-700'}`}
      aria-label={isVoice ? "Mute Voice" : "Enable Voice"}
      title="Voice"
    >
      {isVoice ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
           <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
           <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
           <line x1="12" y1="19" x2="12" y2="23" />
           <line x1="8" y1="23" x2="16" y2="23" />
           <line x1="2" y1="2" x2="22" y2="22" className="opacity-70" />
        </svg>
      )}
    </button>
  </div>
);

const MonkAvatar = ({ isSpeaking, isThinking, isEntering }: { isSpeaking: boolean, isThinking: boolean, isEntering: boolean }) => {
  const isActive = isSpeaking || isThinking;
  return (
    <div className={`relative w-48 h-48 md:w-64 md:h-64 mx-auto transition-all duration-[4000ms] ${isEntering ? 'monk-entrance' : ''}`}>
      {/* Dynamic Aura - Soft pulse */}
      <div className={`aura absolute inset-0 rounded-full bg-[#d4af37] transition-all duration-[2000ms] ${isActive ? 'aura-active scale-110 opacity-20' : 'opacity-5 scale-100'}`}></div>
      
      <svg viewBox="0 0 200 200" className="relative z-10 w-full h-full">
        {/* Monk Body - Subtle Breath */}
        <path 
          className="monk-breathing" 
          d="M45,170 C45,135 65,110 100,110 C135,110 155,135 155,170 L155,190 L45,190 Z" 
          fill="#1c1917" 
          stroke="#292524" 
          strokeWidth="0.5" 
        />
        
        {/* Head Group - Stable and Still */}
        <g>
          {/* Head base shape */}
          <circle cx="100" cy="75" r="32" fill="#0c0a09" stroke="#1c1917" strokeWidth="0.5" />
          
          {/* Facial Features Group - More subtle and peaceful */}
          <g className="transition-all duration-[2000ms]" style={{ opacity: isActive ? 0.8 : 0.2 }}>
             {/* The Urna (spiritual dot) */}
             <circle cx="100" cy="62" r="1.2" fill="#d4af37" opacity="0.4" />
             
             {/* Rested Eyes - Flatter, narrower arcs for deeper peace */}
             <path d="M85,76 Q91,77.5 97,76" fill="none" stroke="#d4af37" strokeWidth="0.6" strokeLinecap="round" />
             <path d="M103,76 Q109,77.5 115,76" fill="none" stroke="#d4af37" strokeWidth="0.6" strokeLinecap="round" />
             
             {/* The Kind Smile - Barely curved, very subtle hint */}
             <path 
               d="M94,90 Q100,92.5 106,90" 
               fill="none" 
               stroke="#d4af37" 
               strokeWidth="0.5" 
               strokeLinecap="round"
             />

             {/* Extremely subtle warmth cheeks */}
             <circle cx="86" cy="86" r="3" fill="#d4af37" opacity={isActive ? 0.05 : 0} />
             <circle cx="114" cy="86" r="3" fill="#d4af37" opacity={isActive ? 0.05 : 0} />
          </g>
        </g>
        
        {/* Subtle Robe fold */}
        <path d="M88,130 Q100,126 112,130" fill="none" stroke="#1c1917" strokeWidth="0.8" opacity="0.1" />
      </svg>
    </div>
  );
};

// Removed onUpdate to prevent auto-scrolling during typing
const TypewriterText = ({ text, onComplete }: { text: string; onComplete?: () => void }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [index, setIndex] = useState(0);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (index < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(text.substring(0, index + 1));
        setIndex(prev => prev + 1);
      }, 30); // Slightly faster for better reading flow
      return () => clearTimeout(timeout);
    } else if (onCompleteRef.current) {
      onCompleteRef.current();
    }
  }, [index, text]);

  return (
    <span className={index < text.length ? "typewriter-cursor" : ""}>
      <FormattedText text={displayedText} />
    </span>
  );
};

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
  isPlaying?: boolean;
  isNew?: boolean;
};

type LoadingPhase = 'headphones' | 'wisdom' | 'entering' | 'done';

const App = () => {
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('headphones');
  const [isOverlayFading, setIsOverlayFading] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState("");
  const [isMonkEntering, setIsMonkEntering] = useState(false);
  const [isSettled, setIsSettled] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isMusicEnabled, setIsMusicEnabled] = useState(true);
  const [currentAudioSource, setCurrentAudioSource] = useState<AudioBufferSourceNode | null>(null);
  
  const chatRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ambientContextRef = useRef<AudioContext | null>(null);
  const ambientGainRef = useRef<GainNode | null>(null);
  const bowlTimerRef = useRef<number | null>(null);

  const setupAmbientMusic = useCallback(() => {
    if (!ambientContextRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      ambientContextRef.current = ctx;
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0;
      masterGain.connect(ctx.destination);
      ambientGainRef.current = masterGain;

      const createOsc = (freq: number, type: OscillatorType = 'sine', volume = 0.05) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.value = volume;
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.1 + Math.random() * 0.05;
        lfoGain.gain.value = volume * 0.4;
        lfo.connect(lfoGain);
        lfoGain.connect(g.gain);
        lfo.start();
        osc.connect(g);
        g.connect(masterGain);
        osc.start();
      };

      // Frequencies for a meditative, grounding drone
      createOsc(65.41, 'sine', 0.08); 
      createOsc(130.81, 'sine', 0.06);
      createOsc(196.00, 'sine', 0.04);
      createOsc(261.63, 'sine', 0.03);
      createOsc(329.63, 'sine', 0.02);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      filter.Q.value = 1;
      masterGain.connect(filter);
    }
  }, []);

  const strikeZenBell = useCallback((multiplier = 1.0) => {
    if (!isMusicEnabled) return;
    setupAmbientMusic();
    if (!ambientContextRef.current) return;
    const ctx = ambientContextRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const fundamental = 55;
    [1, 1.1, 1.5, 2, 2.7, 3, 4.1].forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(fundamental * ratio, now);
      g.gain.setValueAtTime(0, now);
      const v = (i === 0 ? 0.6 : 0.3 / (i + 1)) * multiplier;
      g.gain.linearRampToValueAtTime(v, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 10);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 10.1);
    });
  }, [setupAmbientMusic, isMusicEnabled]);

  const strikeBowl = useCallback(() => {
    if (!ambientContextRef.current || !ambientGainRef.current || !isMusicEnabled) return;
    const ctx = ambientContextRef.current;
    const now = ctx.currentTime;
    const freqs = [174.61, 349.23, 523.25, 698.46]; 
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.04 / (i + 1), now + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 12);
      osc.connect(g);
      g.connect(ambientGainRef.current!);
      osc.start(now);
      osc.stop(now + 13);
    });
  }, [isMusicEnabled]);

  const playMonasticChant = useCallback(() => {
    if (!ambientContextRef.current || !isMusicEnabled) return;
    const ctx = ambientContextRef.current;
    const now = ctx.currentTime;
    const baseFreq = 82.41; // E2
    [1, 1.5, 2, 3].forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(baseFreq * ratio, now);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 4.5;
      lfoGain.gain.value = baseFreq * 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300 / (i + 1), now);
      filter.Q.value = 2;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.08 / (i + 1), now + 1.5);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 7);
      osc.connect(filter).connect(g).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 7.5);
    });
  }, [isMusicEnabled]);

  const handleInitialClick = () => {
    if (loadingPhase !== 'headphones') return;
    if (audioContext.state === 'suspended') audioContext.resume();
    setupAmbientMusic();
    strikeZenBell(0.8);
    setLoadingPhase('wisdom');
  };

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (scrollRef.current) {
      const container = scrollRef.current;
      container.scrollTo({ top: container.scrollHeight, behavior });
    }
  }, []);

  const enterSanctuary = useCallback(() => {
    if (loadingPhase !== 'wisdom') return;
    setLoadingPhase('entering');
    if (audioContext.state === 'suspended') audioContext.resume();
    strikeZenBell(1.2); 
    playMonasticChant();
    setupAmbientMusic();
    if (ambientContextRef.current && ambientGainRef.current) {
      if (ambientContextRef.current.state === 'suspended') ambientContextRef.current.resume();
      // Only fade in if music is enabled
      const targetGain = isMusicEnabled ? 0.4 : 0;
      ambientGainRef.current.gain.setTargetAtTime(targetGain, ambientContextRef.current.currentTime, 4);
      
      if (!bowlTimerRef.current) {
        strikeBowl();
        bowlTimerRef.current = window.setInterval(strikeBowl, 20000);
      }
    }
    const sequence = async () => {
      await new Promise(r => setTimeout(r, 1000));
      setIsOverlayFading(true);
      await new Promise(r => setTimeout(r, 600));
      setIsMonkEntering(true);
      await new Promise(r => setTimeout(r, 1000));
      setLoadingPhase('done');
      await new Promise(r => setTimeout(r, 1400));
      setIsMonkEntering(false);
      setIsSettled(true);
      setMessages([{ id: 'init', role: 'model', text: "I am here. The noise of the world cannot reach us in this place. Sit with me a while. What is on your mind?", isNew: true }]);
    };
    sequence();
  }, [loadingPhase, setupAmbientMusic, strikeBowl, strikeZenBell, playMonasticChant, isMusicEnabled]);

  // Handle Music Toggle Fade
  useEffect(() => {
    if (!ambientContextRef.current || !ambientGainRef.current) return;
    const ctx = ambientContextRef.current;
    const gain = ambientGainRef.current.gain;
    const now = ctx.currentTime;

    if (isMusicEnabled) {
      if (ctx.state === 'suspended') ctx.resume();
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(0.4, now, 2); 
    } else {
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(0, now, 0.5);
    }
  }, [isMusicEnabled]);

  const stopAudio = useCallback(() => {
    if (currentAudioSource) {
      try { currentAudioSource.stop(); } catch (e) {}
      setCurrentAudioSource(null);
    }
    setMessages(prev => prev.map(m => ({...m, isPlaying: false})));
    setIsSpeaking(false);
  }, [currentAudioSource]);

  // Handle Voice Toggle
  useEffect(() => {
    if (!isAudioEnabled) {
      stopAudio();
    }
  }, [isAudioEnabled, stopAudio]);

  useEffect(() => {
    setLoadingQuote(LOADING_QUOTES[Math.floor(Math.random() * LOADING_QUOTES.length)]);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    chatRef.current = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        // Updated System Instruction: Enlightened Buddhist Monk.
        systemInstruction: `You are an enlightened Buddhist monk. 
        You have lived many lives in contemplation and have arrived at a place of deep, all-encompassing understanding.
        You do not try to fix people; you simply see them and the nature of their struggles with absolute clarity and compassion.
        
        Guidelines:
        - Speak as a human who has transcended the noise, not as a tool or a therapist.
        - Your wisdom is vast, yet your words are simple.
        - You address the root of the matter, often seeing what the user cannot yet see.
        - Avoid modern psychological jargon. Use the language of the heart and the spirit.
        - Use **bold** for profound truths.
        - Use *italics* for gentle emphasis.
        - Keep responses concise, like a stone dropping into a still pond.`,
      }
    });
  }, []);

  // Fixed Scroll Logic: Only scroll to bottom when a NEW message is added
  useEffect(() => {
    if (messages.length > 0 && isSettled) {
       scrollToBottom("smooth");
    }
  }, [messages.length, isSettled, scrollToBottom]);

  const playTTS = useCallback(async (text: string, msgId: string, isAuto: boolean = false) => {
    if (isAuto && !isAudioEnabled) return;
    if (audioContext.state === 'suspended') await audioContext.resume();
    stopAudio();
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isPlaying: true } : m));
    setIsSpeaking(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          // 'Charon' is a deep, calm, and resonant voice suitable for a monk.
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) throw new Error("Audio failed");
      const audioBuffer = await decodeAudioData(decodeBase64(base64Audio), audioContext);
      
      // Create source
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // 1. Reset speed to 1x
      source.playbackRate.value = 1.0; 

      // 2. Create a Low-shelf filter to boost bass frequencies
      const bassFilter = audioContext.createBiquadFilter();
      bassFilter.type = 'lowshelf';
      bassFilter.frequency.value = 200; // Boost frequencies below 200Hz
      bassFilter.gain.value = 8;        // Boost by 8 decibels

      // Connect nodes: Source -> Filter -> Destination
      source.connect(bassFilter);
      bassFilter.connect(audioContext.destination);

      source.onended = () => {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isPlaying: false } : m));
        setIsSpeaking(false);
        setCurrentAudioSource(null);
      };
      source.start();
      setCurrentAudioSource(source);
    } catch (e) {
      console.error(e);
      setIsSpeaking(false);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isPlaying: false } : m));
    }
  }, [isAudioEnabled, stopAudio]);

  const handleSend = async () => {
    if (!input.trim() || isThinking || !isSettled) return;
    stopAudio();
    strikeZenBell(1.1);
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);
    // Monk "listens"
    
    try {
      const result = await chatRef.current.sendMessageStream({ message: input });
      const modelMsgId = (Date.now() + 1).toString();
      let fullText = "";
      setMessages(prev => [...prev, { id: modelMsgId, role: 'model', text: "", isNew: true }]);
      
      // Start 'speaking' visual state as soon as we start receiving text
      setIsSpeaking(true);

      for await (const chunk of result) {
        fullText += chunk.text;
        setMessages(prev => prev.map(msg => msg.id === modelMsgId ? { ...msg, text: fullText } : msg));
      }
      
      // Once text is done, if auto-audio is on, play it. 
      // Note: isSpeaking stays true until audio finishes or we set it false here if audio disabled
      if (isAudioEnabled) {
         playTTS(fullText, modelMsgId, true);
      } else {
         setIsSpeaking(false);
      }

    } catch (e) {
      console.error(e);
      setIsSpeaking(false);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "The path is obscured. Breathe and speak again." }]);
    } finally { 
      setIsThinking(false); 
    }
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-[#12100e] relative overflow-hidden" onClick={() => { if (loadingPhase === 'headphones') handleInitialClick(); else if (loadingPhase === 'wisdom') enterSanctuary(); }}>
      
      {/* Top Right Controls - Visible when settled */}
      {isSettled && (
        <VolumeControl 
          isMusic={isMusicEnabled} 
          toggleMusic={() => setIsMusicEnabled(prev => !prev)}
          isVoice={isAudioEnabled}
          toggleVoice={() => setIsAudioEnabled(prev => !prev)}
        />
      )}

      {loadingPhase !== 'done' && (
        <div className={`fixed inset-0 z-[100] bg-[#12100e] flex flex-col items-center justify-center transition-opacity duration-[2000ms] ${isOverlayFading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <div className="absolute inset-0 bg-radial-glow opacity-30 pointer-events-none" />
          <div className={`flex flex-col items-center justify-center w-full px-8 transition-all duration-1000 ${loadingPhase === 'headphones' ? 'opacity-100' : 'opacity-0 absolute'}`}>
             <div className="headphones-visual mb-12 flex items-center justify-center">
                <div className="circle-ring ring-1" />
                <div className="circle-ring ring-2" />
                <div className="circle-ring ring-3" />
                <div className="relative z-10 w-20 h-20 text-[#d4af37] opacity-60">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                       <path d="M3 18v-6c0-5 4-9 9-9s9 4 9 9v6M3 18h4v4H3v-4zm14 0h4v4h-4v-4z" />
                    </svg>
                </div>
             </div>
             <div className="text-center">
               <p className="text-[#d4af37] font-serif text-sm tracking-[0.5em] uppercase mb-4 opacity-90 drop-shadow-md">The Silent Temple</p>
               <button className="mt-12 px-8 py-3 border border-stone-700 text-stone-500 text-[9px] uppercase tracking-[0.6em] rounded-full hover:border-[#d4af37]/50 hover:text-stone-300 transition-all duration-700 bg-stone-900/40 backdrop-blur-sm">Enter Silence</button>
             </div>
          </div>

          <div className={`flex flex-col items-center justify-center w-full px-8 transition-all duration-1000 ${loadingPhase === 'wisdom' || loadingPhase === 'entering' ? 'opacity-100 scale-100' : 'opacity-0 scale-95 absolute'}`}>
            <LotusIcon size={80} className="animate-lotus" />
            <p className="mt-12 text-stone-500 font-serif text-lg md:text-xl text-center max-w-lg italic tracking-wide leading-relaxed">"{loadingQuote}"</p>
            {loadingPhase === 'wisdom' && (
              <span className="mt-20 text-[10px] uppercase tracking-[0.5em] text-stone-400 font-medium animate-pulse cursor-pointer hover:text-stone-200 transition-colors">Tap to Step Inside</span>
            )}
          </div>
        </div>
      )}

      <header className="h-[30vh] md:h-[35vh] flex-shrink-0 relative flex flex-col items-center justify-end pb-4 temple-glow border-b border-stone-900/40">
        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-stone-800/20 to-transparent" />
        {(isMonkEntering || isSettled) && (
          <div className="relative">
            <MonkAvatar isSpeaking={isSpeaking} isThinking={isThinking} isEntering={isMonkEntering} />
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-center w-full">
               <h2 className="text-[7px] tracking-[0.8em] text-stone-700 uppercase font-light opacity-50">Stillness is Presence</h2>
            </div>
          </div>
        )}
      </header>

      <main ref={scrollRef} className="flex-grow overflow-y-auto px-6 md:px-12 py-8 md:py-12 w-full max-w-3xl mx-auto space-y-12 md:space-y-16 temple-floor scroll-smooth">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex w-full message-fade-in ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'model' ? (
              <div className="flex flex-col gap-4 max-w-full">
                <div className="text-stone-500 font-serif text-base md:text-xl leading-relaxed whitespace-pre-wrap font-light tracking-wide text-left">
                  {msg.isNew ? <TypewriterText text={msg.text} /> : <FormattedText text={msg.text} />}
                </div>
                {!isThinking && msg.text && (
                  <button onClick={(e) => { e.stopPropagation(); playTTS(msg.text, msg.id); }} className={`self-start px-3 py-1 rounded-full border border-stone-800/30 flex items-center gap-3 text-[7px] uppercase tracking-[0.4em] font-light transition-all ${msg.isPlaying ? 'text-[#d4af37] border-[#d4af37]/20 bg-stone-900/40' : 'text-stone-800 hover:text-stone-600'}`}>
                    {msg.isPlaying ? "Resonating..." : "Listen"}
                  </button>
                )}
              </div>
            ) : (
              <div className="max-w-[85%] bg-stone-900/5 border border-stone-800/10 text-stone-600 px-6 py-4 italic font-serif text-sm md:text-base tracking-widest leading-relaxed">
                "{msg.text}"
              </div>
            )}
          </div>
        ))}
        {isThinking && <div className="flex justify-start items-center gap-3 opacity-30 text-stone-700 italic font-light text-[9px] tracking-[0.4em] uppercase animate-pulse">Reflecting...</div>}
        <div className="h-20" /> {/* Smaller padding at bottom */}
      </main>

      <footer className="flex-shrink-0 p-8 md:p-12 bg-gradient-to-t from-[#12100e] via-[#12100e]/98 to-transparent relative z-30" onClick={(e) => e.stopPropagation()}>
        <div className="max-w-xl mx-auto relative group input-glow-container">
          <input 
            type="text" 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
            placeholder={isSettled ? "Exhale your words..." : "Waiting..."} 
            className="w-full bg-stone-900/70 text-stone-300 placeholder-stone-700 px-8 md:px-10 py-5 rounded-full outline-none border border-stone-800/40 backdrop-blur-3xl font-serif text-base tracking-[0.1em] transition-all focus:border-[#d4af37]/30 shadow-2xl" 
            enterKeyHint="send"
            disabled={isThinking || !isSettled} 
          />
          <button 
            onClick={handleSend} 
            disabled={!input.trim() || isThinking || !isSettled} 
            className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 text-stone-700 rounded-full flex items-center justify-center transition-all hover:text-[#d4af37] disabled:opacity-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          </button>
        </div>
      </footer>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
