
import React, { useState, useRef, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, Modality } from "@google/genai";

// --- Data ---
const LOADING_QUOTES = [
  { text: "Whatever a mother, father, or other relative might do for you, a well-directed mind does better.", source: "Buddha, Dhammapada, Verse 43" },
  { text: "Drop by drop is the water pot filled. Likewise, the wise man, gathering it little by little, fills himself with good.", source: "Buddha, Dhammapada, Verse 122" },
  { text: "Irrigators channel waters; fletchers straighten arrows; carpenters bend wood; the wise master themselves.", source: "Buddha, Dhammapada, Verse 80" },
  { text: "Just as a solid rock is not shaken by the storm, even so the wise are not affected by praise or blame.", source: "Buddha, Dhammapada, Verse 81" },
  { text: "There is no fear for one whose mind is not filled with desires.", source: "Buddha, Dhammapada, Verse 39" },
  { text: "Mind precedes all mental states. Mind is their chief; they are all mind-wrought.", source: "Buddha, Dhammapada, Verse 1" },
  { text: "Hatred does not cease by hatred, but only by love; this is the eternal rule.", source: "Buddha, Dhammapada, Verse 5" },
  { text: "Conquer anger with non-anger. Conquer badness with goodness. Conquer meanness with generosity. Conquer dishonesty with truth.", source: "Buddha, Dhammapada, Verse 223" },
  { text: "Just as a mother would protect her only child with her life, even so let one cultivate a boundless love towards all beings.", source: "Buddha, Sutta Nipata, Verse 149" },
  { text: "Speak the truth; do not yield to anger; give, if asked for little. By these three steps, you will go near the gods.", source: "Buddha, Dhammapada, Verse 224" },
  { text: "Full of love for all things in the world, practicing virtue in order to benefit others, this man alone is happy.", source: "Buddha, Dhammapada, Verse 368" },
  { text: "Look upon the world as a bubble, look upon it as a mirage: the king of death does not see him who thus looks down upon the world.", source: "Buddha, Dhammapada, Verse 170" },
  { text: "All conditioned things are impermanent—when one sees this with wisdom, one turns away from suffering.", source: "Buddha, Dhammapada, Verse 277" },
  { text: "From attachment springs grief, from attachment springs fear. For him who is wholly free from attachment, there is no grief, much less fear.", source: "Buddha, Dhammapada, Verse 212" },
  { text: "Let go of the past, let go of the future, let go of the present, and cross over to the farther shore of existence.", source: "Buddha, Dhammapada, Verse 348" },
  { text: "There are those who do not realize that one day we all must die. But those who do realize this settle their quarrels.", source: "Buddha, Dhammapada, Verse 6" },
  { text: "You yourself must strive. The Buddhas only point the way.", source: "Buddha, Dhammapada, Verse 276" },
  { text: "If you find no one to support you on the spiritual path, walk alone.", source: "Buddha, Dhammapada, Verse 61" },
  { text: "It is easy to do what is wrong and harmful to oneself. It is very difficult to do what is beneficial and good.", source: "Buddha, Dhammapada, Verse 163" },
  { text: "Better it is to live one day seeing the rise and fall of things, than a hundred years without ever seeing it.", source: "Buddha, Dhammapada, Verse 113" },
  { text: "Do not disregard small good deeds, thinking they will not matter.", source: "Buddha, Dhammapada, Verse 122" },
  { text: "Arise! Do not be negligent! Lead a righteous life. The righteous live happily both in this world and the next.", source: "Buddha, Dhammapada, Verse 168" },
  { text: "The sun shines by day, the moon by night. The warrior shines in armor, the brahmin shines in meditation. But the Awakened One shines in glory all day and night.", source: "Buddha, Dhammapada, Verse 387" },
  { text: "Purity and impurity depend on oneself; no one can purify another.", source: "Buddha, Dhammapada, Verse 165" },
  { text: "Fools wait for a lucky day, but every day is a lucky day for an industrious man.", source: "Buddha, Jataka, Vol I, 49" },
  { text: "One is not a wise man because he talks a lot. He who is peaceful, friendly, and fearless is called wise.", source: "Buddha, Dhammapada, Verse 258" },
  { text: "Better than a thousand hollow words is one word that brings peace.", source: "Buddha, Dhammapada, Verse 100" },
  { text: "There is no happiness greater than peace.", source: "Buddha, Dhammapada, Verse 202" },
  { text: "He who has tasted the flavor of solitude and tranquility becomes free from fear and sin.", source: "Buddha, Dhammapada, Verse 205" },
  { text: "Like a beautiful flower, full of color but without scent, are the fine but fruitless words of him who does not act in accordance with them.", source: "Buddha, Dhammapada, Verse 51" }
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

const FormattedText = ({ text }: { text: string }) => {
  if (!text) return null;
  const boldParts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <>
      {boldParts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-bold text-stone-300">{part.slice(2, -2)}</strong>;
        }
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

const LotusIcon = ({ size = 24, className = "", isErasing = false }: { size?: number, className?: string, isErasing?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#d4af37" strokeWidth="0.75" strokeLinecap="round" strokeLinejoin="round" className={`${className} ${isErasing ? 'erasing' : ''}`}>
    <path className="erase-path p1" d="M12 2C12 2 16 8 16 12C16 16 12 22 12 22C12 22 8 16 8 12C8 8 12 2 12 2Z" />
    <path className="erase-path p2" d="M12 22C12 22 17 18 20 15C23 12 20 8 18 8" />
    <path className="erase-path p3" d="M12 22C12 22 7 18 4 15C1 12 4 8 6 8" />
  </svg>
);

const HeadphoneIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.75" strokeLinecap="round" className={className}>
    <path d="M4 14c0-4.418 3.582-8 8-8s8 3.582 8 8v3.5a2.5 2.5 0 0 1-5 0V15a2.5 2.5 0 0 1 5 0M4 14v3.5a2.5 2.5 0 0 0 5 0V15a2.5 2.5 0 0 0-5 0" />
    <path d="M12 6V3" />
  </svg>
);

const VolumeControl = ({ isMusic, toggleMusic, isVoice, toggleVoice }: { isMusic: boolean, toggleMusic: () => void, isVoice: boolean, toggleVoice: () => void }) => (
  <div className="absolute top-6 right-6 z-50 flex gap-3 transition-opacity duration-1000 animate-in fade-in zoom-in-95">
    <button 
      onClick={(e) => { e.stopPropagation(); toggleMusic(); }}
      className={`p-3 rounded-full border border-stone-800/50 backdrop-blur-md transition-all duration-300 group ${isMusic ? 'text-[#d4af37] bg-stone-900/40 hover:bg-stone-900/60' : 'text-stone-600 bg-transparent hover:text-stone-400 hover:border-stone-700'}`}
      aria-label={isMusic ? "Mute Ambience" : "Enable Ambience"}
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
      <div className={`aura absolute inset-0 rounded-full bg-[#d4af37] transition-all duration-[2000ms] ${isActive ? 'aura-active scale-110 opacity-20' : 'opacity-5 scale-100'}`}></div>
      <svg viewBox="0 0 200 200" className="relative z-10 w-full h-full">
        <path className="monk-breathing" d="M45,170 C45,135 65,110 100,110 C135,110 155,135 155,170 L155,190 L45,190 Z" fill="#1c1917" stroke="#292524" strokeWidth="0.5" />
        <g>
          <circle cx="100" cy="75" r="32" fill="#0c0a09" stroke="#1c1917" strokeWidth="0.5" />
          <g className="transition-all duration-[2000ms]" style={{ opacity: isActive ? 0.8 : 0.2 }}>
             <circle cx="100" cy="62" r="1.2" fill="#d4af37" opacity="0.4" />
             <path d="M85,76 Q91,77.5 97,76" fill="none" stroke="#d4af37" strokeWidth="0.6" strokeLinecap="round" />
             <path d="M103,76 Q109,77.5 115,76" fill="none" stroke="#d4af37" strokeWidth="0.6" strokeLinecap="round" />
             <path d="M94,90 Q100,92.5 106,90" fill="none" stroke="#d4af37" strokeWidth="0.5" strokeLinecap="round" />
             <circle cx="86" cy="86" r="3" fill="#d4af37" opacity={isActive ? 0.05 : 0} />
             <circle cx="114" cy="86" r="3" fill="#d4af37" opacity={isActive ? 0.05 : 0} />
          </g>
        </g>
        <path d="M88,130 Q100,126 112,130" fill="none" stroke="#1c1917" strokeWidth="0.8" opacity="0.1" />
      </svg>
    </div>
  );
};

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
      }, 30);
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

// Phases for cinematic intro
type LoadingPhase = 'init' | 'logo-waiting' | 'logo-bloom' | 'shift-and-quote' | 'reveal-instruction' | 'entering' | 'done';

const App = () => {
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('init');
  const [isOverlayFading, setIsOverlayFading] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState<{ text: string, source: string } | null>(null);
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
    const baseFreq = 82.41;
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

  const startIntroSequence = () => {
    if (loadingPhase !== 'init') return;
    if (audioContext.state === 'suspended') audioContext.resume();
    setupAmbientMusic();
    strikeZenBell(0.8);
    setLoadingPhase('logo-waiting');
    
    setTimeout(() => {
      setLoadingPhase('logo-bloom');
      setTimeout(() => {
        setLoadingPhase('shift-and-quote');
        setTimeout(() => {
          setLoadingPhase('reveal-instruction');
        }, 5000);
      }, 2000);
    }, 1200); 
  };

  const enterSanctuary = useCallback(() => {
    if (loadingPhase !== 'reveal-instruction') return;
    setLoadingPhase('entering');
    if (audioContext.state === 'suspended') audioContext.resume();
    strikeZenBell(1.2); 
    playMonasticChant();
    setupAmbientMusic();
    if (ambientContextRef.current && ambientGainRef.current) {
      if (ambientContextRef.current.state === 'suspended') ambientContextRef.current.resume();
      const targetGain = isMusicEnabled ? 0.4 : 0;
      ambientGainRef.current.gain.setTargetAtTime(targetGain, ambientContextRef.current.currentTime, 4);
      if (!bowlTimerRef.current) {
        strikeBowl();
        bowlTimerRef.current = window.setInterval(strikeBowl, 20000);
      }
    }
    const sequence = async () => {
      await new Promise(r => setTimeout(r, 1500));
      setIsOverlayFading(true);
      await new Promise(r => setTimeout(r, 800));
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

  useEffect(() => {
    setLoadingQuote(LOADING_QUOTES[Math.floor(Math.random() * LOADING_QUOTES.length)]);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    chatRef.current = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: `You are an enlightened Buddhist monk. 
        Speak as a human who has transcended the noise. Simple, concise, heart-centered.
        Use **bold** for profound truths. Use *italics* for gentle emphasis.`,
      }
    });
  }, []);

  const playTTS = useCallback(async (text: string, msgId: string, isAuto: boolean = false) => {
    if (isAuto && !isAudioEnabled) return;
    if (audioContext.state === 'suspended') await audioContext.resume();
    if (currentAudioSource) { try { currentAudioSource.stop(); } catch (e) {} }

    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isPlaying: true } : m));
    setIsSpeaking(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) throw new Error("Audio failed");
      const audioBuffer = await decodeAudioData(decodeBase64(base64Audio), audioContext);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      const bassFilter = audioContext.createBiquadFilter();
      bassFilter.type = 'lowshelf';
      bassFilter.frequency.value = 200;
      bassFilter.gain.value = 8;
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
  }, [isAudioEnabled, currentAudioSource]);

  const handleSend = async () => {
    if (!input.trim() || isThinking || !isSettled) return;
    strikeZenBell(1.1);
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);
    try {
      const result = await chatRef.current.sendMessageStream({ message: input });
      const modelMsgId = (Date.now() + 1).toString();
      let fullText = "";
      setMessages(prev => [...prev, { id: modelMsgId, role: 'model', text: "", isNew: true }]);
      setIsSpeaking(true);
      for await (const chunk of result) {
        fullText += chunk.text;
        setMessages(prev => prev.map(msg => msg.id === modelMsgId ? { ...msg, text: fullText } : msg));
      }
      if (isAudioEnabled) playTTS(fullText, modelMsgId, true);
      else setIsSpeaking(false);
    } catch (e) {
      console.error(e);
      setIsSpeaking(false);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "The path is obscured. Breathe and speak again." }]);
    } finally { 
      setIsThinking(false); 
    }
  };

  const handleOverlayClick = () => {
    if (loadingPhase === 'init') startIntroSequence();
    else if (loadingPhase === 'reveal-instruction') enterSanctuary();
  };

  const isLogoVisible = ['logo-bloom', 'shift-and-quote', 'reveal-instruction', 'entering'].includes(loadingPhase);
  const isQuoteVisible = ['shift-and-quote', 'reveal-instruction', 'entering'].includes(loadingPhase);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-[#12100e] relative overflow-hidden site-entrance" onClick={handleOverlayClick}>
      
      {isSettled && (
        <VolumeControl 
          isMusic={isMusicEnabled} 
          toggleMusic={() => setIsMusicEnabled(prev => !prev)}
          isVoice={isAudioEnabled}
          toggleVoice={() => setIsAudioEnabled(prev => !prev)}
        />
      )}

      {loadingPhase !== 'done' && (
        <div className={`fixed inset-0 z-[100] bg-[#12100e] flex flex-col items-center justify-center overflow-hidden transition-opacity duration-[2000ms] ${isOverlayFading ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <div className="absolute inset-0 bg-radial-glow opacity-10 pointer-events-none" />
          
          <div className={`flex flex-col items-center justify-center w-full h-full px-8 transition-opacity duration-[1000ms] ${loadingPhase === 'init' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
             <div className="headphones-visual mb-12 flex items-center justify-center">
                <div className="ripple ripple-1" />
                <div className="ripple ripple-2" />
                <div className="ripple ripple-3" />
                <div className="ripple ripple-4" />
                <div className="relative z-10 w-20 h-20 text-[#d4af37] opacity-60">
                   <HeadphoneIcon className="w-full h-full" />
                </div>
             </div>
             <p className="text-stone-400 text-[10px] sm:text-xs uppercase tracking-[0.2em] font-light mb-16 opacity-80 text-center">Please wear headphones for the best experience</p>
             <button className="px-12 py-4 border border-stone-800 text-stone-300 text-[10px] uppercase tracking-[0.4em] rounded-full hover:border-[#d4af37]/40 hover:text-stone-100 transition-all duration-700 bg-stone-900/40 backdrop-blur-md shadow-2xl">
               Begin
             </button>
          </div>

          <div className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-1000 ${isLogoVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            
            <div className={`absolute flex flex-col items-center justify-center translate-y-[-140px] transition-all duration-1000 ${loadingPhase === 'entering' ? 'scale-[1.05] opacity-0' : ''}`}>
              <div className="relative mb-8">
                 <div className={`absolute inset-0 bg-[#d4af37] blur-[60px] rounded-full scale-[2.5] transition-opacity duration-1000 ${loadingPhase === 'entering' ? 'opacity-0' : 'opacity-25'}`} />
                 <LotusIcon size={90} className="relative z-10" isErasing={loadingPhase === 'entering'} />
              </div>
              <h1 className={`text-[#d4af37] font-serif text-lg sm:text-xl tracking-[0.2em] sm:tracking-[0.5em] uppercase drop-shadow-lg text-center whitespace-nowrap transition-all duration-[1500ms] ease-out ${loadingPhase === 'entering' ? 'opacity-0 scale-[1.05] blur-sm' : 'opacity-100 scale-100 blur-0'}`}>
                The Silent Temple
              </h1>
            </div>

            <div className={`max-w-xl px-12 text-center transition-all duration-[2000ms] mt-32 flex flex-col gap-4 ${isQuoteVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${loadingPhase === 'entering' ? 'opacity-0 scale-105' : ''}`}>
               <p className="text-stone-500 font-serif text-lg md:text-xl italic tracking-wide leading-relaxed">
                 "{loadingQuote?.text}"
               </p>
               <span className="text-stone-700 font-serif text-sm tracking-[0.1em] opacity-80">
                 — {loadingQuote?.source}
               </span>
            </div>

            <div className={`absolute bottom-24 transition-all duration-[1000ms] ${loadingPhase === 'reveal-instruction' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
               <span className="text-[10px] uppercase tracking-[0.6em] text-[#d4af37] font-medium animate-pulse cursor-pointer">
                 Tap to step inside
               </span>
            </div>
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
        <div className="h-20" />
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
