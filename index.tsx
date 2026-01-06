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
];

const JOURNAL_ESSAYS = [
  {
    title: "The Empty Cup",
    text: "To fill a cup that is already full is impossible. By releasing these thoughts, you have not lost anything; you have simply poured out the old tea. The space you feel right now is not emptiness—it is potential. It is room for the new moment to enter. Enjoy this lightness. The heavy lifting is done."
  },
  {
    title: "The Heavy Backpack",
    text: "Imagine you have been hiking up a mountain carrying a backpack full of stones. Every worry you just wrote down was a stone. You have just set the bag down on the side of the trail. Your shoulders are lighter. Your breath is deeper. You can walk forward now without that weight pulling you backward. You are free to move."
  },
  {
    title: "Mental RAM",
    text: "Your mind is a processor, not a storage unit. When you hold onto these loops, they run in the background, consuming your energy and slowing you down. By writing them and burning them, you have closed those tabs. The process is terminated. Your system is clear. You have permission to focus only on what is right in front of you."
  },
  {
    title: "The River",
    text: "A river does not try to hold onto the water that flows past it. If it did, it would become a stagnant swamp. You are the riverbed, and these thoughts are just the water. They have rushed past you, and now they are downstream, drifting toward the ocean. Let them go. Watch them disappear around the bend."
  },
  {
    title: "The Storm",
    text: "The sky does not apologize for the storm, and it does not hold onto the clouds after they pass. It simply allows the weather to happen, knowing it is vast enough to handle it. You are the sky, not the weather. The thunder has rumbled, the rain has fallen, and now the clouds are breaking. Enjoy the clear blue that remains."
  },
  {
    title: "The Dead Leaves",
    text: "In a forest, trees do not cling to dead leaves out of nostalgia or fear. They drop them to the forest floor to disintegrate. This shedding is not a loss; it is the only way to survive the winter and prepare for spring. You have just shed a dead leaf. Do not pick it back up. Let it become the soil for your next growth."
  },
  {
    title: "The Clenched Fist",
    text: "Holding onto anger or worry is like grasping a hot coal with the intent of throwing it at someone else; you are the one who gets burned. It requires immense energy to keep your fist clenched tight. By releasing this text, you have opened your hand. Feel the blood return to your fingers. Feel the energy you just saved."
  },
  {
    title: "The Train Station",
    text: "Imagine your mind is a busy train station. Thoughts are simply trains pulling in and out. For a long time, you have been jumping onto every train that arrives, letting it take you miles away from where you want to be. Not this time. You just watched the train arrive, and you watched it leave. You are still standing safely on the platform."
  },
  {
    title: "The Editor",
    text: "We often mistake our anxious thoughts for facts, but they are usually just drafts of a story we are writing in our heads. You are the author, not the character. You just looked at a draft that wasn't working, and you crumpled it up. It is not part of your final story. Turn the page. The next chapter is blank."
  },
  {
    title: "The Glass",
    text: "If you hold a glass of water for a minute, it is light. If you hold it for an hour, your arm aches. If you hold it all day, you become paralyzed. The weight of the glass doesn't change, but the longer you hold it, the heavier it becomes. You have just put the glass down. Rest your arm. The water is no longer your concern."
  }
];

// --- Audio Utilities ---
const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

// Helper to save/load from localStorage to reduce API calls
const CACHE_PREFIX = 'zen_audio_cache_';
const saveAudioToCache = (key: string, base64: string) => {
    try {
        localStorage.setItem(CACHE_PREFIX + key, base64);
    } catch (e) {
        console.warn('LocalStorage full, audio not cached');
    }
};
const loadAudioFromCache = (key: string): string | null => {
    return localStorage.getItem(CACHE_PREFIX + key);
};

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

async function generateSpeech(text: string, ctx: AudioContext, cacheKey?: string): Promise<AudioBuffer> {
  // Try loading from local cache first if key provided
  if (cacheKey) {
      const cachedBase64 = loadAudioFromCache(cacheKey);
      if (cachedBase64) {
          return await decodeAudioData(decodeBase64(cachedBase64), ctx);
      }
  }

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
  if (!base64Audio) throw new Error("Audio generation failed");
  
  // Save to cache if key provided
  if (cacheKey) {
      saveAudioToCache(cacheKey, base64Audio);
  }

  return await decodeAudioData(decodeBase64(base64Audio), ctx);
}

// --- Global Audio Cache (Module Scope) ---
const breathingVoiceCache = new Map<string, AudioBuffer>();
let isBreathingVoicesLoaded = false;
let breathingVoicesLoadingPromise: Promise<void> | null = null;

// --- Icons & Components ---

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

const CameraIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const MicIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const XIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const FireIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.1.2-2.2.6-3.3a1 1 0 0 0 3 2.8z"/>
  </svg>
);

const MeditatingFigureIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="6" r="3.5" />
    <path d="M12 8.5V13" />
    <path d="M5 13c0-2.5 3-4.5 7-4.5s7 2 7 4.5" />
    <path d="M5 13l3.5 4.5L12 19l3.5-1.5L19 13" />
    <path d="M12 19v2" />
  </svg>
);

const ChatIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const HeaderControls = ({ 
  isMusic, toggleMusic, 
  isVoice, toggleVoice, 
  onAboutClick,
  hidden 
}: { 
  isMusic: boolean, toggleMusic: () => void, 
  isVoice: boolean, toggleVoice: () => void, 
  onAboutClick: () => void,
  hidden?: boolean 
}) => (
  <div className={`absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 z-50 flex gap-3 transition-all duration-1000 animate-in fade-in zoom-in-95 ${hidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
    
    <button 
      onClick={(e) => { e.stopPropagation(); onAboutClick(); }}
      className="p-3 rounded-full border border-stone-800/50 backdrop-blur-md transition-all duration-300 group text-stone-600 bg-transparent hover:text-[#d4af37] hover:border-[#d4af37]/50"
      aria-label="About"
    >
        <span className="font-serif italic font-bold text-lg leading-none w-4 h-4 flex items-center justify-center">i</span>
    </button>
    
    <div className="w-[1px] h-10 bg-stone-800/50 mx-1" />

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

const AboutModal = ({ onClose }: { onClose: () => void }) => (
  <div 
    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-xl animate-in fade-in duration-500"
    onClick={onClose}
  >
    <div 
      className="relative w-[90%] md:w-[80%] max-w-2xl max-h-[85vh] overflow-y-auto p-8 md:p-12 bg-[#12100e]/80 border border-stone-800/50 shadow-2xl rounded-sm scrollbar-hide"
      onClick={e => e.stopPropagation()}
    >
      <button 
        onClick={onClose}
        className="absolute top-6 right-6 text-stone-500 hover:text-[#d4af37] transition-colors"
      >
        <XIcon className="w-6 h-6" />
      </button>

      <div className="flex flex-col items-center text-center font-serif text-stone-300 space-y-10">
        
        {/* Heading */}
        <div>
           <div className="w-16 h-16 mx-auto mb-6 text-[#d4af37] opacity-80">
              <LotusIcon size={64} />
           </div>
           <h2 className="text-2xl md:text-3xl text-[#d4af37] tracking-[0.2em] uppercase">The Silent Temple</h2>
        </div>

        {/* Core Features */}
        <div className="space-y-4 w-full border-b border-stone-800/50 pb-8">
           <div>
              <h3 className="text-[#d4af37] text-sm uppercase tracking-widest mb-1 opacity-90">The Chat</h3>
              <p className="text-stone-400 italic font-light">"A mirror for your thoughts. Guided by wisdom."</p>
           </div>
           <div>
              <h3 className="text-[#d4af37] text-sm uppercase tracking-widest mb-1 opacity-90">The Burner Journal</h3>
              <p className="text-stone-400 italic font-light">"An offering to the fire. Write and release."</p>
           </div>
           <div>
              <h3 className="text-[#d4af37] text-sm uppercase tracking-widest mb-1 opacity-90">Privacy</h3>
              <p className="text-stone-400 italic font-light">"The soul is not a data point. Everything remains local."</p>
           </div>
        </div>

        {/* Philosophy */}
        <div className="space-y-6 text-sm md:text-base leading-[1.8] font-light text-stone-300/90 text-justify md:text-center">
            <p>
              In an era of digital permanence, the mind deserves a space for the ephemeral. Most modern tools are built to hoard thought, creating a heavy archive of past selves that anchors the spirit to the yesterday. Zen Monk exists as a necessary rebellion—an architecture of absence designed to return the individual to the stillness that exists before the noise of the world intervenes.
            </p>
            <p>
              The practice begins with the removal of expectation. Anxiety lives in the 'what-if'—the attachment to a specific outcome or a future that has not yet arrived. By entering this space with no demand for a result, the mind is finally free to let go. True clarity is found not by seeking an answer, but by surrendering the need for one.
            </p>
            <p>
              Growth is found in the shedding of burdens, not the collection of them. This space is a digital cloister where thoughts are given to the fire so that the spirit may remain light, unburdened, and entirely present. It is a reminder that while the world is loud, the center is always still.
            </p>
        </div>

        <div className="pt-4 opacity-50">
             <span className="text-xs uppercase tracking-[0.3em]">Yours</span>
        </div>

      </div>
    </div>
  </div>
);

const MonkAvatar = ({ isActive, isEntering }: { isActive: boolean, isEntering: boolean }) => {
  return (
    <div className={`relative w-32 h-32 md:w-64 md:h-64 mx-auto transition-all duration-[4000ms] ${isEntering ? 'monk-entrance' : ''}`}>
      <div className={`aura absolute inset-0 rounded-full bg-[#d4af37] blur-[60px] opacity-10`} />
      <div 
        className={`absolute inset-0 rounded-full bg-[#d4af37] blur-[100px] transform-gpu transition-all
          ${isActive 
            ? 'opacity-20 scale-125 duration-[2500ms] ease-out' 
            : 'opacity-0 scale-100 duration-300 ease-in'
          }`}
      />

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

const TypewriterText = ({ text, isStreaming, onDone }: { text: string; isStreaming?: boolean; onDone?: () => void }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(text.substring(0, index + 1));
        setIndex(prev => prev + 1);
      }, 30);
      return () => clearTimeout(timeout);
    } else {
        if (!isStreaming && onDone) {
            onDone();
        }
    }
  }, [index, text, isStreaming, onDone]);

  return (
    <span className={index < text.length ? "typewriter-cursor" : ""}>
      <FormattedText text={displayedText} />
    </span>
  );
};

// --- View Components ---

const BreathingView = ({ isActive, setBreathingAudioActive, onImmersiveChange }: { isActive: boolean, setBreathingAudioActive: (active: boolean) => void, onImmersiveChange: (immersive: boolean) => void }) => {
  const [technique, setTechnique] = useState<'calm' | 'balance'>('calm');
  const [phase, setPhase] = useState<'inhale' | 'hold' | 'exhale' | 'idle'>('idle');
  const [guideState, setGuideState] = useState<'idle' | 'preparing' | 'three' | 'two' | 'one' | 'breathing'>('idle');
  const [text, setText] = useState("Begin Practice");
  const [isRunning, setIsRunning] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  
  // Use persistent global cache state for initial loading
  const [isAudioReady, setIsAudioReady] = useState(isBreathingVoicesLoaded);
  
  const currentVoiceSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Notify parent about immersive state changes
  useEffect(() => {
    onImmersiveChange(guideState !== 'idle');
  }, [guideState, onImmersiveChange]);

  // Preload voices (Run once, populate global cache)
  useEffect(() => {
    if (isBreathingVoicesLoaded) {
        setIsAudioReady(true);
        return;
    }

    const loadVoices = async () => {
      const ctx = audioContext;
      const phrases = {
        'prepare': "Let us find stillness. Sit comfortably. Keep your eyes relaxed, half-open, gazing softly at the center. Let go of the day's weight. When you are ready, tap to begin.",
      };

      try {
        const promises = Object.entries(phrases).map(async ([key, phrase]) => {
           try {
             // Use the specific cache key for this breathing instruction
             const buffer = await generateSpeech(phrase, ctx, `breathing_${key}`);
             breathingVoiceCache.set(key, buffer);
           } catch(e) { console.warn("Failed to load voice", key); }
        });
        
        await Promise.all(promises);
        isBreathingVoicesLoaded = true;
        setIsAudioReady(true);
      } catch(e) { console.error(e); }
    };

    if (!breathingVoicesLoadingPromise) {
        breathingVoicesLoadingPromise = loadVoices();
    } else {
        // If already loading elsewhere, just wait for it
        breathingVoicesLoadingPromise.then(() => setIsAudioReady(true));
    }
  }, []);

  const playVoice = (key: string, onEnded?: () => void) => {
    const ctx = audioContext;
    if (!ctx || !breathingVoiceCache.has(key)) {
        console.warn("Audio cache miss or context invalid", key);
        if (onEnded) onEnded();
        return;
    }
    
    // Stop previous voice if overlapping
    if (currentVoiceSourceRef.current) {
        try { currentVoiceSourceRef.current.stop(); } catch(e) {}
    }

    const buffer = breathingVoiceCache.get(key);
    if (buffer) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = 1.0; 
        source.connect(gain).connect(ctx.destination);
        if (onEnded) source.onended = onEnded;
        source.start();
        currentVoiceSourceRef.current = source;
    }
  };
  
  const playBeep = () => {
      const ctx = audioContext;
      if (ctx.state === 'suspended') ctx.resume();
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      // Soft chime-like beep (Sine wave with envelope)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05); // Soft attack
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6); // Gentle decay
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.7);
  };

  useEffect(() => {
    if (!isActive) {
      setIsRunning(false);
      setGuideState('idle');
      setPhase('idle');
      setText("Begin Practice");
      setBreathingAudioActive(false);
      if (currentVoiceSourceRef.current) {
        try { currentVoiceSourceRef.current.stop(); } catch(e) {}
      }
      return;
    }
  }, [isActive]);

  useEffect(() => {
    let timeout: number;

    const runCycle = () => {
      // Inhale
      setPhase('inhale');
      setText("Inhale");
      
      const inhaleTime = technique === 'calm' ? 4000 : 4000;
      
      timeout = window.setTimeout(() => {
        // Hold
        setPhase('hold');
        setText("Hold");
        
        const holdTime = technique === 'calm' ? 7000 : 4000;
        
        timeout = window.setTimeout(() => {
          // Exhale
          setPhase('exhale');
          setText("Exhale");
          
          const exhaleTime = technique === 'calm' ? 8000 : 4000;
          
          timeout = window.setTimeout(() => {
             // For Balance, there is a hold after exhale
             if (technique === 'balance') {
                 setPhase('hold');
                 setText("Hold");
                 timeout = window.setTimeout(() => {
                     if (isRunning) runCycle();
                 }, 4000);
             } else {
                 if (isRunning) runCycle();
             }
          }, exhaleTime);
        }, holdTime);
      }, inhaleTime);
    };

    if (isRunning) {
      // Begin the loop
      runCycle();
    } else {
      setPhase('idle');
      // If we are not running but guideState is idle, reset text
      if (guideState === 'idle') {
          setText("Begin Practice");
          setBreathingAudioActive(false);
      }
    }

    return () => clearTimeout(timeout);
  }, [isRunning, technique]);

  const toggleBreathing = () => {
    if (!isAudioReady) return; // Prevent start if audio not loaded
    
    // Locked during countdown
    if (['three', 'two', 'one'].includes(guideState)) return; 

    // Ensure AudioContext is running on user interaction
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    if (isRunning || guideState === 'breathing') {
        // STOP
        setIsRunning(false);
        setGuideState('idle');
        setBreathingAudioActive(false);
        if (currentVoiceSourceRef.current) {
            try { currentVoiceSourceRef.current.stop(); } catch(e) {}
        }
    } else {
        // START FLOW
        if (guideState === 'idle') {
            setBreathingAudioActive(true);
            setGuideState('preparing');
            setText("Prepare");
            playVoice('prepare');
        } else if (guideState === 'preparing') {
             // START COUNTDOWN
             // Stop prep voice if still playing
             if (currentVoiceSourceRef.current) {
                 try { currentVoiceSourceRef.current.stop(); } catch(e) {}
             }
             
             setGuideState('three');
             setText("3");
             playBeep();
             setTimeout(() => {
                setGuideState('two');
                setText("2");
                playBeep();
                setTimeout(() => {
                    setGuideState('one');
                    setText("1");
                    playBeep();
                    setTimeout(() => {
                        setGuideState('breathing');
                        setIsRunning(true);
                    }, 1000);
                }, 1000);
             }, 1000);
        }
    }
  };

  // Determine if we are in an immersive state where controls should fade
  const isImmersive = guideState !== 'idle';
  // Determine if the visual circle should vanish (during countdown)
  const isCountdown = ['three', 'two', 'one'].includes(guideState);

  return (
    <div className="flex flex-col items-center justify-center h-full w-full relative">
      
      {/* Technique Selector - Fades out in immersive mode */}
      <div className={`flex items-center gap-4 mb-4 md:mb-8 absolute top-0 md:relative z-10 transition-opacity duration-1000 ${isImmersive ? 'opacity-0 pointer-events-none hidden' : 'opacity-100'}`}>
         <button 
           onClick={() => !isRunning && setTechnique('calm')}
           disabled={isRunning}
           className={`px-4 py-2 rounded-full border text-xs tracking-widest uppercase transition-all ${technique === 'calm' ? 'border-[#d4af37] text-[#d4af37] bg-[#d4af37]/10' : 'border-stone-800 text-stone-600 hover:text-stone-400'}`}
         >
            Relax (4-7-8)
         </button>
         <button 
           onClick={() => !isRunning && setTechnique('balance')}
           disabled={isRunning}
           className={`px-4 py-2 rounded-full border text-xs tracking-widest uppercase transition-all ${technique === 'balance' ? 'border-[#d4af37] text-[#d4af37] bg-[#d4af37]/10' : 'border-stone-800 text-stone-600 hover:text-stone-400'}`}
         >
            Balance (Box)
         </button>

         {/* Info Button */}
         <button 
           onClick={() => setShowInfo(true)}
           className="w-6 h-6 rounded-full border border-stone-800 text-stone-600 flex items-center justify-center hover:border-[#d4af37] hover:text-[#d4af37] transition-colors"
           aria-label="Breathing Info"
         >
           <span className="text-[10px] font-serif italic">i</span>
         </button>
      </div>

      <div 
        className={`relative group flex-grow flex items-center justify-center w-full ${isAudioReady ? 'cursor-pointer' : 'cursor-wait opacity-50'}`}
        onClick={toggleBreathing}
      >
        {/* Mandala Visuals - Fades out during countdown */}
        <div className={`relative w-56 h-56 md:w-80 md:h-80 flex items-center justify-center transition-all duration-700 ease-in-out ${isCountdown ? 'opacity-0 scale-50' : 'opacity-100 scale-100'}`}>
            
            {/* Outer Glow */}
            <div className={`absolute inset-0 rounded-full bg-[#d4af37] blur-[60px] transition-all duration-[4000ms] ease-in-out
               ${phase === 'inhale' ? 'scale-125 opacity-30' : 
                 phase === 'hold' ? 'scale-110 opacity-20' : 
                 phase === 'exhale' ? 'scale-75 opacity-10' : 'scale-90 opacity-5'}`} 
            />

            {/* Geometric Rings */}
            {[1, 2, 3].map((i) => (
                <div key={i} 
                    className={`absolute border border-[#d4af37]/20 rounded-full transition-all duration-[4000ms] ease-in-out
                    ${phase === 'inhale' ? `w-${56 + i*8} h-${56 + i*8} scale-110 opacity-60` : 
                      phase === 'exhale' ? `w-${40 + i*4} h-${40 + i*4} scale-90 opacity-30` :
                      `w-${48 + i*6} h-${48 + i*6} scale-100 opacity-40`}`}
                    style={{ width: `${100 + i * 40}px`, height: `${100 + i * 40}px` }} 
                />
            ))}

            {/* Core Circle */}
            <div className={`w-32 h-32 rounded-full border border-[#d4af37]/50 flex items-center justify-center relative z-10 bg-[#12100e] transition-all duration-[4000ms] ease-in-out shadow-[0_0_30px_rgba(212,175,55,0.1)]
              ${phase === 'inhale' ? 'scale-150 border-[#d4af37]/80' : 
                phase === 'hold' ? 'scale-150 border-[#d4af37]/60' : 
                phase === 'exhale' ? 'scale-75 border-[#d4af37]/30' : 'scale-100 hover:border-[#d4af37]/50'}`}
            >
              <div className={`w-3 h-3 rounded-full bg-[#d4af37] transition-all duration-1000 ${guideState !== 'idle' ? 'opacity-100 blur-[2px]' : 'opacity-40'}`} />
            </div>
        </div>
        
        {/* Countdown Overlay - Visible when circle is hidden */}
        {isCountdown && (
            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                <span className="text-6xl text-[#d4af37] font-serif animate-ping-slow">{text}</span>
            </div>
        )}
      </div>

      {/* Instructions / Text - Fades out in immersive mode */}
      <div className={`absolute bottom-4 md:relative h-20 text-center transition-opacity duration-1000 ${isImmersive ? 'opacity-0 hidden' : 'opacity-100'}`}>
        <h3 className={`text-2xl md:text-3xl font-serif text-[#d4af37] tracking-widest transition-all duration-1000 ${phase === 'idle' && guideState === 'idle' ? 'opacity-70' : 'opacity-100 scale-110'}`}>
          {text}
        </h3>
        <p className="text-stone-600 text-[10px] md:text-xs uppercase tracking-[0.2em] mt-4 opacity-60">
            {!isAudioReady && "Initializing audio..."}
            {isAudioReady && guideState === 'idle' && "Tap center to begin"}
            {guideState === 'preparing' && "Tap when you are ready"} 
            {/* Note: The above preparing text won't be seen because opacity is 0 in immersive mode, but kept for structure */}
        </p>
      </div>

       {/* Info Modal */}
      {showInfo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-md p-6 animate-in fade-in duration-300" onClick={() => setShowInfo(false)}>
            <div className="bg-[#12100e] border border-stone-800 p-8 max-w-sm w-full relative shadow-2xl animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                <button onClick={() => setShowInfo(false)} className="absolute top-4 right-4 text-stone-600 hover:text-[#d4af37] transition-colors">
                    <XIcon className="w-5 h-5" />
                </button>
                
                <h3 className="text-[#d4af37] font-serif text-lg tracking-widest uppercase mb-6 text-center border-b border-stone-900 pb-4">Techniques</h3>
                
                <div className="space-y-6">
                    <div>
                        <div className="flex justify-between items-baseline mb-2">
                            <h4 className="text-stone-300 font-serif tracking-wide">Relax</h4>
                            <span className="text-[#d4af37] text-xs opacity-60">4 — 7 — 8</span>
                        </div>
                        <p className="text-stone-500 text-xs leading-relaxed font-light">
                            A natural tranquilizer for the nervous system. Inhale quietly through the nose for 4, hold the breath for 7, and exhale forcefully through the mouth for 8. Best for anxiety and sleep.
                        </p>
                    </div>

                    <div>
                         <div className="flex justify-between items-baseline mb-2">
                            <h4 className="text-stone-300 font-serif tracking-wide">Balance</h4>
                            <span className="text-[#d4af37] text-xs opacity-60">Box Breathing</span>
                        </div>
                        <p className="text-stone-500 text-xs leading-relaxed font-light">
                            Equalizes the breath to heighten performance and concentration. Inhale, hold, exhale, and hold empty for equal counts of4. Used to reset the mind.
                        </p>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

const BurnerJournalView = ({ isAudioEnabled }: { isAudioEnabled: boolean }) => {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<'idle' | 'burning' | 'essay' | 'reflection'>('idle');
  const [currentEssay, setCurrentEssay] = useState<typeof JOURNAL_ESSAYS[0] | null>(null);

  const handleBurn = () => {
    if (!text.trim()) return;
    
    // Select a random essay
    const essay = JOURNAL_ESSAYS[Math.floor(Math.random() * JOURNAL_ESSAYS.length)];
    setCurrentEssay(essay);

    // Skip the 'burning' smoke animation phase as requested
    setMode('essay');
  };

  const playCompletionMelody = () => {
    const ctx = audioContext;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    
    // Ethereal Harp-like Arpeggio (F Major Add9)
    // F4, G4, A4, C5, F5
    const notes = [349.23, 392.00, 440.00, 523.25, 698.46]; 
    
    notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = 'triangle'; // Softer than sine, but pure enough
        
        // Staggered entrance
        const startTime = now + (i * 0.12);
        
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.08, startTime + 0.05); // Gentle attack
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 4); // Long reverb-like tail
        
        // Simple Lowpass for warmth
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1200;

        osc.connect(filter).connect(gain).connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 4.1);
    });
  };

  const handleReady = () => {
    playCompletionMelody();
    setText(""); // Now we clear the text as the user has committed to releasing it.
    setMode('reflection');
  };

  const handleEdit = () => {
    setMode('idle');
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-start pt-12 md:pt-20 p-6 animate-in fade-in slide-in-from-bottom-8 duration-1000">
       
       {/* HEADER */}
       <div className={`text-center mb-8 transition-all duration-700 ${mode === 'reflection' ? 'opacity-0 h-0 overflow-hidden mb-0' : 'opacity-100'}`}>
        <h2 className="text-[#d4af37] font-serif text-xl tracking-[0.2em] uppercase opacity-80 mb-2">The Burner</h2>
        <div className="w-12 h-[1px] bg-stone-800 mx-auto" />
        <p className="text-stone-600 text-xs mt-4 tracking-widest uppercase">
            {mode === 'essay' ? "Insight" : "Release your burdens into the void"}
        </p>
      </div>

      <div className="relative w-full max-w-lg min-h-[400px]">
        
        {/* INPUT STATE */}
        <div className={`transition-all duration-700 ease-in-out w-full
            ${(mode === 'idle' || mode === 'burning') ? 'opacity-100 relative z-10' : 'opacity-0 absolute inset-0 z-0 pointer-events-none translate-y-8'}`}>
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={mode === 'burning'}
                placeholder="Type out what weighs on you..."
                className="w-full h-64 bg-stone-900/30 border border-stone-800/50 rounded-sm p-6 text-stone-400 font-serif text-lg italic focus:outline-none focus:border-[#d4af37]/30 transition-all resize-none placeholder-stone-700"
            />
            
            <div className="mt-8 flex justify-center">
                <button
                    onClick={handleBurn}
                    disabled={!text.trim() || mode === 'burning'}
                    className="px-8 py-3 border border-stone-800 text-stone-500 hover:text-[#d4af37] hover:border-[#d4af37]/50 rounded-full text-xs uppercase tracking-[0.3em] transition-all disabled:opacity-30 disabled:cursor-not-allowed group relative overflow-hidden"
                >
                    <span className="relative z-10">Release</span>
                    <div className="absolute inset-0 bg-[#d4af37]/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500"/>
                </button>
            </div>
        </div>

        {/* ESSAY STATE */}
        <div className={`transition-all duration-1000 ease-in-out flex flex-col items-center justify-center
             ${mode === 'essay' ? 'opacity-100 relative translate-y-0' : 'opacity-0 absolute inset-0 pointer-events-none -translate-y-4'}`}>
             
             {currentEssay && (
                 <>
                    <h3 className="text-stone-400 font-serif text-lg italic mb-6 tracking-wide">
                        "{currentEssay.title}"
                    </h3>
                    <p className="text-stone-300 font-serif text-base md:text-xl leading-loose text-center font-light">
                        {currentEssay.text}
                    </p>
                 </>
             )}

             <div className="flex gap-4 mt-12">
                 <button 
                    onClick={handleEdit}
                    className="px-6 py-3 border border-stone-800 text-stone-600 hover:text-stone-400 text-[10px] uppercase tracking-widest rounded-full transition-colors"
                 >
                     Edit Text
                 </button>
                 <button 
                    onClick={handleReady}
                    className="px-8 py-3 bg-[#d4af37]/10 border border-[#d4af37]/30 text-[#d4af37] hover:bg-[#d4af37]/20 text-[10px] uppercase tracking-widest rounded-full transition-all shadow-[0_0_15px_rgba(212,175,55,0.1)] hover:shadow-[0_0_25px_rgba(212,175,55,0.2)]"
                 >
                     I am ready
                 </button>
             </div>
        </div>

        {/* REFLECTION STATE */}
        <div className={`transition-all duration-1000 ease-in-out flex flex-col items-center justify-center
             ${mode === 'reflection' ? 'opacity-100 relative translate-y-0' : 'opacity-0 absolute inset-0 pointer-events-none translate-y-4'}`}>
             
             <div className="w-16 h-16 rounded-full bg-[#d4af37]/5 flex items-center justify-center mb-8 animate-pulse">
                <div className="w-2 h-2 bg-[#d4af37] rounded-full shadow-[0_0_10px_#d4af37]" />
             </div>
             
             <p className="text-stone-400 font-serif text-xl md:text-2xl text-center leading-relaxed max-w-md">
                 It is time to self reflect.
                 <br />
                 <span className="text-[#d4af37] text-lg opacity-80 mt-4 block">Put the phone away for a few minutes.</span>
             </p>

             <button 
                onClick={handleEdit}
                className="mt-16 text-stone-700 hover:text-stone-500 text-[10px] uppercase tracking-[0.2em] transition-colors"
             >
                 Begin Again
             </button>
        </div>

      </div>
    </div>
  );
};

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string;
  isPlaying?: boolean;
  isNew?: boolean;
};

// Phases for cinematic intro
type LoadingPhase = 'init' | 'logo-waiting' | 'logo-bloom' | 'shift-and-quote' | 'reveal-instruction' | 'entering' | 'done';
type ViewMode = 'chat' | 'breathe' | 'journal';

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
  const [isTyping, setIsTyping] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false); 
  const [isMusicEnabled, setIsMusicEnabled] = useState(true);
  const [currentAudioSource, setCurrentAudioSource] = useState<AudioBufferSourceNode | null>(null);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [isTransitioning, setIsTransitioning] = useState(false);
  // New global state for immersion
  const [isImmersive, setIsImmersive] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  
  const chatRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Audio Refs
  const ambientContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const templeGainRef = useRef<GainNode | null>(null);
  const breathDroneGainRef = useRef<GainNode | null>(null);
  const bowlTimerRef = useRef<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  
  // Swipe Refs
  const touchStart = useRef<{x: number, y: number} | null>(null);
  const touchEnd = useRef<{x: number, y: number} | null>(null);

  // Computed property for visual glow
  const isActive = isSpeaking || isTyping;

  // --- Audio System ---
  
  const initAudio = useCallback(() => {
    if (ambientContextRef.current) return;
    
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    ambientContextRef.current = ctx;
    
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    masterGainRef.current = master;

    // --- Helper: Create ethereal pad layer (Used for Breathing Mode) ---
    const createPadLayer = (freqs: number[], outputNode: GainNode, vol: number = 0.1) => {
       freqs.forEach((f, i) => {
           const osc = ctx.createOscillator();
           const gain = ctx.createGain();
           const pan = ctx.createStereoPanner();
           
           osc.type = 'sine';
           osc.frequency.value = f;
           
           // STATIC DRONE: No LFO modulation, constant steady gain for calming effect
           gain.gain.value = vol * 0.5; 
           pan.pan.value = (i % 2 === 0 ? -1 : 1) * 0.3; 

           osc.connect(gain).connect(pan).connect(outputNode);
           osc.start();
       });
    };

    // --- Channel 1: Temple Ambience (Chat) ---
    // Dynamic, Generative, Endel-style F-Major Pentatonic
    const templeGain = ctx.createGain();
    templeGain.gain.value = 0;
    templeGain.connect(master);
    templeGainRef.current = templeGain;

    // 1. Deep Sub-bass Anchor (F1 ~43.65Hz)
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.value = 43.65;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.3; // Increased volume
    subOsc.connect(subGain).connect(templeGain);
    subOsc.start();

    // 2. Evolving "Cloud" - F Major Pentatonic
    // F3, G3, A3, C4, D4, F4
    const notes = [174.61, 196.00, 220.00, 261.63, 293.66, 349.23];
    
    notes.forEach((freq) => {
        // Create a stereo pair for binaural shimmering
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = freq - (0.5 + Math.random() * 0.5); // Slight flat detune

        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = freq + (0.5 + Math.random() * 0.5); // Slight sharp detune
        
        // Panning LFO - Drifting spatialization
        const panLfo = ctx.createOscillator();
        panLfo.frequency.value = 0.04 + (Math.random() * 0.06); // Slow drift
        const panner = ctx.createStereoPanner();
        // LFO controls panning -1 to 1
        // We can just connect osc to panning gain for simplicity, but AudioParam automation is better
        // Simpler implementation:
        const panSource = ctx.createConstantSource(); // To offset if needed, or just pure LFO
        panSource.start();
        // LFO output connects to panner.pan directly. Oscillator default output is -1 to 1.
        panLfo.connect(panner.pan);
        panLfo.start();

        // Volume LFO - The "Breathing" Cloud
        const ampLfo = ctx.createOscillator();
        ampLfo.frequency.value = 0.02 + (Math.random() * 0.04); // Very slow swell
        const voiceGain = ctx.createGain();
        voiceGain.gain.value = 0;
        
        // Map LFO [-1, 1] to Gain [0, max]
        // We use a gain node to scale LFO output, then connect to Gain.gain
        // But AudioParam values are additive. 
        // Better pattern: LFO -> GainNode(scale) -> GainNode.gain(offset)
        const lfoScale = ctx.createGain();
        lfoScale.gain.value = 0.06; // Increased modulation depth
        // Connect LFO to scaler
        ampLfo.connect(lfoScale);
        // Connect scaler to voice gain (additive to the base value of 0.015)
        lfoScale.connect(voiceGain.gain);
        
        // Set base volume so it never fully dies
        voiceGain.gain.value = 0.03; // Increased base volume

        ampLfo.start();
        
        osc1.connect(panner);
        osc2.connect(panner);
        panner.connect(voiceGain).connect(templeGain);
        
        osc1.start();
        osc2.start();
    });

    // 3. Texture: Organic Vinyl Crackle & Pop
    const vinylBufferSize = ctx.sampleRate * 5; // 5s loop
    const vinylBuffer = ctx.createBuffer(2, vinylBufferSize, ctx.sampleRate); // Stereo
    const left = vinylBuffer.getChannelData(0);
    const right = vinylBuffer.getChannelData(1);
    
    for (let i = 0; i < vinylBufferSize; i++) {
        // Soft static hiss
        const white = Math.random() * 2 - 1;
        const hiss = white * 0.004; // Very quiet base
        
        // Random Pops
        let popL = 0;
        let popR = 0;
        
        if (Math.random() < 0.0003) popL = (Math.random() * 2 - 1) * 0.1;
        if (Math.random() < 0.0003) popR = (Math.random() * 2 - 1) * 0.1;

        left[i] = hiss + popL;
        right[i] = hiss + popR;
    }
    const vinylSource = ctx.createBufferSource();
    vinylSource.buffer = vinylBuffer;
    vinylSource.loop = true;
    
    // Highpass to remove low mud
    const vinylFilter = ctx.createBiquadFilter();
    vinylFilter.type = 'highpass';
    vinylFilter.frequency.value = 700; 

    const vinylGain = ctx.createGain();
    vinylGain.gain.value = 0.05; // Reduced texture volume

    vinylSource.connect(vinylFilter).connect(vinylGain).connect(templeGain);
    vinylSource.start();

    // 4. "Starry" Shimmer Layer (High frequency texture)
    const shimmerOsc = ctx.createOscillator();
    shimmerOsc.type = 'sine';
    shimmerOsc.frequency.value = 523.25; // C5
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0;
    
    const shimmerLfo = ctx.createOscillator();
    shimmerLfo.frequency.value = 0.15;
    const shimmerScale = ctx.createGain();
    shimmerScale.gain.value = 0.02; // Increased shimmer volume
    
    shimmerLfo.connect(shimmerScale).connect(shimmerGain.gain);
    shimmerOsc.connect(shimmerGain).connect(templeGain);
    
    shimmerOsc.start();
    shimmerLfo.start();


    // --- Channel 2: Breathe (Meditation) ---
    // Higher, lighter, "Floating".
    // Frequencies: D Major (D3, A3, F#4) - Ethereal and uplifting
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0;
    breathGain.connect(master);
    breathDroneGainRef.current = breathGain;

    createPadLayer([146.83, 220.00, 369.99], breathGain, 0.25); // Increased volume

    if (ctx.state === 'suspended') ctx.resume();
  }, []);

  const updateAudioMix = useCallback((mode: ViewMode, isBreathingActive: boolean = false) => {
      if (!ambientContextRef.current || !templeGainRef.current || !breathDroneGainRef.current) return;
      const ctx = ambientContextRef.current;
      const now = ctx.currentTime;
      const transitionTime = 3; // Slower, smoother crossfade

      // Handle Master
      if (!isMusicEnabled) {
          masterGainRef.current?.gain.setTargetAtTime(0, now, 0.5);
      } else {
          masterGainRef.current?.gain.setTargetAtTime(0.8, now, 1); // Increased master volume
      }

      if (mode === 'chat') {
          templeGainRef.current.gain.setTargetAtTime(1, now, transitionTime);
          breathDroneGainRef.current.gain.setTargetAtTime(0, now, transitionTime);
      } else if (mode === 'breathe') {
          templeGainRef.current.gain.setTargetAtTime(0, now, transitionTime);
          // Significantly reduced volume for breathing (0.2), and static
          const targetVol = isBreathingActive ? 0.2 : 0.1;
          breathDroneGainRef.current.gain.setTargetAtTime(targetVol, now, transitionTime);
      } else if (mode === 'journal') {
          templeGainRef.current.gain.setTargetAtTime(0.2, now, transitionTime); 
          breathDroneGainRef.current.gain.setTargetAtTime(0, now, transitionTime);
      }

  }, [isMusicEnabled]);

  const strikeZenBell = useCallback((multiplier = 1.0) => {
    if (!isMusicEnabled) return;
    initAudio();
    if (!ambientContextRef.current) return;
    const ctx = ambientContextRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    
    // Reverting to deep fundamental 55Hz and complex ratios for the "Dong" sound
    const fundamental = 55; 
    [1, 1.1, 1.5, 2, 2.7, 3, 4.1].forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(fundamental * ratio, now);
      g.gain.setValueAtTime(0, now);
      
      // Stronger attack for the "Dong"
      const v = (i === 0 ? 0.6 : 0.3 / (i + 1)) * multiplier;
      
      g.gain.linearRampToValueAtTime(v, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 10); // Long decay
      
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 10.1);
    });
  }, [initAudio, isMusicEnabled]);

  const strikeBowl = useCallback(() => {
    if (!ambientContextRef.current || !masterGainRef.current || !isMusicEnabled) return;
    const ctx = ambientContextRef.current;
    const now = ctx.currentTime;
    // Retuned Singing Bowl to match F Major (using F3 harmonic series base)
    // F3 = 174.61Hz. Harmonics: F4(349), C5(523), F5(698)
    const freqs = [174.61, 349.23, 523.25, 698.46]; 
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.2 / (i + 1), now + 0.1); // Increased bowl volume
      g.gain.exponentialRampToValueAtTime(0.0001, now + 12);
      osc.connect(g);
      g.connect(masterGainRef.current!);
      osc.start(now);
      osc.stop(now + 13);
    });
  }, [isMusicEnabled]);

  const startIntroSequence = () => {
    if (loadingPhase !== 'init') return;
    if (audioContext.state === 'suspended') audioContext.resume();
    initAudio();
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
    strikeZenBell(1.0); 
    initAudio();
    
    // Ramp up ambient
    if (ambientContextRef.current && masterGainRef.current) {
        if (ambientContextRef.current.state === 'suspended') ambientContextRef.current.resume();
        updateAudioMix('chat');
        if (!bowlTimerRef.current) {
            strikeBowl();
            bowlTimerRef.current = window.setInterval(strikeBowl, 25000);
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
      setMessages([{ id: 'init', role: 'model', text: "I am here. The noise of the world cannot reach us in this place. Show me your burdens, speak them, or write them into the dust. What is on your mind?", isNew: true }]);
    };
    sequence();
  }, [loadingPhase, initAudio, strikeBowl, strikeZenBell, isMusicEnabled, updateAudioMix]);

  useEffect(() => {
    setLoadingQuote(LOADING_QUOTES[Math.floor(Math.random() * LOADING_QUOTES.length)]);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    chatRef.current = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: `You are an enlightened Buddhist monk. 
        Speak as a human who has transcended the noise. Simple, concise, heart-centered.
        If the user shares an image, look deeply into it for metaphors of impermanence, nature, or the human condition.
        Use **bold** for profound truths. Use *italics* for gentle emphasis.`,
      }
    });

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setInput(prev => (prev ? prev + " " + text : text));
        setIsListening(false);
      };
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, []);

  // --- Trigger audio mix update when music is toggled ---
  useEffect(() => {
    updateAudioMix(viewMode);
  }, [isMusicEnabled, updateAudioMix, viewMode]);

  const playTTS = useCallback(async (text: string, msgId: string, isAuto: boolean = false) => {
    if (isAuto && !isAudioEnabled) {
      setIsSpeaking(false);
      return;
    }
    if (audioContext.state === 'suspended') await audioContext.resume();
    if (currentAudioSource) { try { currentAudioSource.stop(); } catch (e) {} }

    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isPlaying: true } : m));
    setIsSpeaking(true);
    try {
      const buffer = await generateSpeech(text, audioContext);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !attachedImage) || isThinking || !isSettled) return;
    strikeZenBell(1.1);
    
    const userMsg: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      text: input,
      image: attachedImage || undefined
    };
    
    setMessages(prev => {
        const cleaned = prev.map(m => ({ ...m, isNew: false }));
        return [...cleaned, userMsg];
    });
    
    const currentInput = input;
    const currentImage = attachedImage;
    
    setInput("");
    setAttachedImage(null);
    setIsThinking(true);
    setIsTyping(true);

    try {
      let result;
      if (currentImage) {
        const base64Data = currentImage.split(',')[1];
        const imagePart = {
          inlineData: {
            data: base64Data,
            mimeType: 'image/png' 
          }
        };
        const textPart = { text: currentInput || "Reflect on this image." };
        
        result = await chatRef.current.sendMessageStream({ 
          content: { parts: [imagePart, textPart] }
        });
      } else {
        result = await chatRef.current.sendMessageStream({ message: currentInput });
      }

      const modelMsgId = (Date.now() + 1).toString();
      let fullText = "";
      setMessages(prev => [...prev, { id: modelMsgId, role: 'model', text: "", isNew: true }]);
      setIsSpeaking(true);
      
      for await (const chunk of result) {
        fullText += chunk.text;
        setMessages(prev => prev.map(msg => msg.id === modelMsgId ? { ...msg, text: fullText } : msg));
      }
      
      if (isAudioEnabled) {
        await playTTS(fullText, modelMsgId, true);
      } else {
        setIsSpeaking(false);
      }
    } catch (e) {
      console.error(e);
      setIsSpeaking(false);
      setIsTyping(false);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "The path is obscured. Breathe and speak again.", isNew: true }]);
    } finally { 
      setIsThinking(false); 
    }
  };

  const handleModeSwitch = (mode: ViewMode) => {
    if (viewMode === mode) return;
    setIsTransitioning(true);
    updateAudioMix(mode);
    setTimeout(() => {
      setViewMode(mode);
      setIsTransitioning(false);
    }, 500);
  };

  const handleOverlayClick = () => {
    if (loadingPhase === 'init') startIntroSequence();
    else if (loadingPhase === 'reveal-instruction') enterSanctuary();
  };

  // --- Swipe Handling ---
  const onTouchStart = (e: React.TouchEvent) => {
    touchEnd.current = null; 
    touchStart.current = { x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEnd.current = { x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY };
  };

  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current || isTransitioning) return;
    const distanceX = touchStart.current.x - touchEnd.current.x;
    const distanceY = touchStart.current.y - touchEnd.current.y;
    const isLeftSwipe = distanceX > 50;
    const isRightSwipe = distanceX < -50;

    if (Math.abs(distanceX) > Math.abs(distanceY)) {
        if (isLeftSwipe) {
             if (viewMode === 'journal') handleModeSwitch('chat');
             else if (viewMode === 'chat') handleModeSwitch('breathe');
        } else if (isRightSwipe) {
             if (viewMode === 'breathe') handleModeSwitch('chat');
             else if (viewMode === 'chat') handleModeSwitch('journal');
        }
    }
  };

  const isLogoVisible = ['logo-bloom', 'shift-and-quote', 'reveal-instruction', 'entering'].includes(loadingPhase);
  const isQuoteVisible = ['shift-and-quote', 'reveal-instruction', 'entering'].includes(loadingPhase);

  useEffect(() => {
    if (scrollRef.current && viewMode === 'chat') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking, attachedImage, viewMode]);

  return (
    <div 
      className="fixed inset-0 w-full h-full flex flex-col bg-[#12100e] text-stone-300 overflow-hidden site-entrance" 
      onClick={handleOverlayClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      
      {isSettled && (
        <HeaderControls 
          isMusic={isMusicEnabled} 
          toggleMusic={() => setIsMusicEnabled(prev => !prev)}
          isVoice={isAudioEnabled}
          toggleVoice={() => setIsAudioEnabled(prev => !prev)}
          onAboutClick={() => setShowAbout(true)}
          hidden={isImmersive}
        />
      )}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

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
            
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[200px] flex flex-col items-center justify-center transition-all duration-1000 ${loadingPhase === 'entering' ? 'scale-[1.05] opacity-0 blur-md' : 'scale-100 opacity-100 blur-0'}`}>
              <div className="relative mb-8">
                 <div className={`absolute inset-0 bg-[#d4af37] blur-[60px] rounded-full scale-[2.5] transition-opacity duration-1000 ${loadingPhase === 'entering' ? 'opacity-0' : 'opacity-25'}`} />
                 <LotusIcon size={90} className="relative z-10" isErasing={loadingPhase === 'entering'} />
              </div>
              <h1 className="text-[#d4af37] font-serif text-lg sm:text-xl tracking-[0.2em] sm:tracking-[0.5em] uppercase drop-shadow-lg text-center whitespace-nowrap">
                The Silent Temple
              </h1>
            </div>

            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[-20px] w-full max-w-xl px-12 text-center transition-all duration-[2000ms] flex flex-col gap-4 ${isQuoteVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${loadingPhase === 'entering' ? 'opacity-0 scale-105' : ''}`}>
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

      <header className={`flex-shrink-0 relative flex flex-col items-center justify-end transition-all duration-1000 temple-glow border-b border-stone-900/40 pt-[env(safe-area-inset-top)] 
        ${isImmersive ? 'h-0 opacity-0 overflow-hidden' : (viewMode === 'chat' ? 'h-[25vh] md:h-[35vh] pb-2' : 'h-[20vh] md:h-[25vh] pb-2')}`}>
        <div className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-stone-800/20 to-transparent" />
        {(isMonkEntering || isSettled) && (
          <div className="relative flex flex-col items-center">
            {viewMode === 'chat' ? (
               <div className={`transition-opacity duration-500 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
                <MonkAvatar isActive={isActive} isEntering={isMonkEntering} />
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-center w-full">
                   <h2 className="text-[7px] tracking-[0.8em] text-stone-700 uppercase font-light opacity-50">Stillness is Presence</h2>
                </div>
               </div>
            ) : (
                <div className={`mb-2 md:mb-4 text-[#d4af37] opacity-60 transition-opacity duration-500 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
                   {viewMode === 'breathe' && <MeditatingFigureIcon className="w-10 h-10 md:w-16 md:h-16" />}
                   {viewMode === 'journal' && <FireIcon className="w-10 h-10 md:w-16 md:h-16" />}
                </div>
            )}
            
            {/* Mode Switcher Navigation */}
            <div className={`flex items-center gap-6 mt-2 md:mt-4 transition-all duration-700 ${viewMode === 'chat' ? 'translate-y-0' : 'translate-y-2'}`}>
               {/* 1. Journal (Left) */}
               <button 
                 onClick={(e) => { e.stopPropagation(); handleModeSwitch('journal'); }} 
                 className={`p-2 transition-all duration-300 ${viewMode === 'journal' ? 'text-[#d4af37] scale-110' : 'text-stone-700 hover:text-stone-500'}`}
                 title="Burner Journal"
               >
                 <FireIcon className="w-5 h-5" />
               </button>

               {/* 2. Chat (Center) */}
               <button 
                 onClick={(e) => { e.stopPropagation(); handleModeSwitch('chat'); }} 
                 className={`p-2 transition-all duration-300 ${viewMode === 'chat' ? 'text-[#d4af37] scale-110' : 'text-stone-700 hover:text-stone-500'}`}
                 title="Chat"
               >
                 <ChatIcon className="w-5 h-5" />
               </button>

               {/* 3. Breathe (Right) */}
               <button 
                 onClick={(e) => { e.stopPropagation(); handleModeSwitch('breathe'); }} 
                 className={`p-2 transition-all duration-300 ${viewMode === 'breathe' ? 'text-[#d4af37] scale-110' : 'text-stone-700 hover:text-stone-500'}`}
                 title="Breathe"
               >
                 <MeditatingFigureIcon className="w-5 h-5" />
               </button>
            </div>
          </div>
        )}
      </header>

      <main ref={scrollRef} className="flex-1 overflow-y-auto px-6 md:px-12 py-8 md:py-12 w-full max-w-3xl mx-auto temple-floor scroll-smooth relative overscroll-y-contain">
        <div className={`transition-all duration-500 ease-in-out h-full ${isTransitioning ? 'opacity-0 translate-y-4 filter blur-sm' : 'opacity-100 translate-y-0 filter blur-0'}`}>
            {viewMode === 'chat' && (
              <div className="space-y-12 md:space-y-16">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex w-full message-fade-in ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'model' ? (
                      <div className="flex flex-col gap-4 max-w-full">
                        <div className="text-stone-500 font-serif text-base md:text-xl leading-relaxed whitespace-pre-wrap font-light tracking-wide text-left">
                          {msg.isNew ? (
                            <TypewriterText 
                               text={msg.text} 
                               isStreaming={isThinking} 
                               onDone={() => setIsTyping(false)} 
                            />
                          ) : (
                            <FormattedText text={msg.text} />
                          )}
                        </div>
                        {!isThinking && msg.text && (
                          <button onClick={(e) => { e.stopPropagation(); playTTS(msg.text, msg.id); }} className={`self-start px-3 py-1 rounded-full border border-stone-800/30 flex items-center gap-3 text-[7px] uppercase tracking-[0.4em] font-light transition-all ${msg.isPlaying ? 'text-[#d4af37] border-[#d4af37]/20 bg-stone-900/40' : 'text-stone-800 hover:text-stone-600'}`}>
                            {msg.isPlaying ? "Resonating..." : "Listen"}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-2 max-w-[85%]">
                        {msg.image && (
                           <div className="rounded-lg overflow-hidden border border-stone-800/40 opacity-80 mb-2">
                             <img src={msg.image} alt="User attachment" className="max-w-[150px] max-h-[150px] object-cover" />
                           </div>
                        )}
                        <div className="bg-stone-900/5 border border-stone-800/10 text-stone-600 px-6 py-4 italic font-serif text-sm md:text-base tracking-widest leading-relaxed">
                          "{msg.text}"
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {isThinking && <div className="flex justify-start items-center gap-3 opacity-30 text-stone-700 italic font-light text-[9px] tracking-[0.4em] uppercase animate-pulse">Reflecting...</div>}
                <div className="h-20" />
              </div>
            )}

            {viewMode === 'breathe' && (
                <BreathingView 
                    isActive={viewMode === 'breathe' && !isTransitioning} 
                    setBreathingAudioActive={(active) => updateAudioMix('breathe', active)}
                    onImmersiveChange={setIsImmersive}
                />
            )}
            
            {viewMode === 'journal' && <BurnerJournalView isAudioEnabled={isAudioEnabled} />}
        </div>
      </main>

      {/* Chat Input Footer - Only visible in Chat Mode */}
      {viewMode === 'chat' && (
        <footer className={`flex-shrink-0 px-4 pt-4 pb-[env(safe-area-inset-bottom)] md:p-12 bg-gradient-to-t from-[#12100e] via-[#12100e]/98 to-transparent relative z-30 transition-all duration-500 ${isTransitioning ? 'opacity-0 translate-y-10' : 'opacity-100 translate-y-0'}`} onClick={(e) => e.stopPropagation()}>
          
          {/* Attachment Preview */}
          {attachedImage && (
            <div className="absolute top-0 left-12 -translate-y-full mb-4 animate-in fade-in slide-in-from-bottom-4">
              <div className="relative group">
                <img src={attachedImage} alt="Preview" className="w-16 h-16 object-cover rounded-md border border-[#d4af37]/30 shadow-[0_0_15px_rgba(212,175,55,0.1)]" />
                <button 
                  onClick={() => setAttachedImage(null)}
                  className="absolute -top-2 -right-2 bg-stone-900 text-stone-400 rounded-full p-1 border border-stone-700 hover:text-white"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          <div className="max-w-xl mx-auto relative group input-glow-container flex items-center gap-3">
            
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              accept="image/*" 
              className="hidden" 
            />
            
            <div className="relative flex-grow">
               <input 
                type="text" 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
                placeholder={isSettled ? (attachedImage ? "Ask about this image..." : "Exhale your words...") : "Waiting..."} 
                className="w-full bg-stone-900/70 text-stone-300 placeholder-stone-700 pl-12 pr-20 py-5 rounded-full outline-none border border-stone-800/40 backdrop-blur-3xl font-serif text-base tracking-[0.1em] transition-all focus:border-[#d4af37]/30 shadow-2xl" 
                enterKeyHint="send"
                disabled={isThinking || !isSettled} 
              />
              
              {/* Attachment Button */}
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 text-stone-600 hover:text-[#d4af37] transition-colors"
                title="Show image"
              >
                <CameraIcon className="w-5 h-5" />
              </button>

              {/* Voice & Send Buttons */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {input.length === 0 && !attachedImage ? (
                  <button 
                    onClick={toggleListening}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isListening ? 'text-[#d4af37] bg-stone-800/50 animate-pulse' : 'text-stone-600 hover:text-stone-400'}`}
                    title="Speak"
                  >
                    <MicIcon className="w-5 h-5" />
                  </button>
                ) : (
                  <button 
                    onClick={handleSend} 
                    disabled={isThinking || !isSettled} 
                    className="w-10 h-10 text-stone-700 rounded-full flex items-center justify-center transition-all hover:text-[#d4af37] disabled:opacity-0"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
