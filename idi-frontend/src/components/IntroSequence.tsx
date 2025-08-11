import React, { useState, useEffect } from 'react';

interface IntroSequenceProps {
  onComplete: () => void;
  onStartEmerging?: () => void;
}

const IntroSequence: React.FC<IntroSequenceProps> = ({ onComplete, onStartEmerging }) => {
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [isFading, setIsFading] = useState(false);

  const words = [
    { text: 'incite', color: 'text-white' },
    { text: 'design', color: 'text-red-400' },
    { text: 'insight', color: 'text-emerald-400' }
  ];

  useEffect(() => {
    // Start the sequence after a brief pause
    const startSequence = setTimeout(() => {
      setCurrentWordIndex(0);
    }, 500);

    return () => clearTimeout(startSequence);
  }, []);

  useEffect(() => {
    if (currentWordIndex >= 0 && currentWordIndex < words.length) {
      // Show each word for 1.5 seconds, then move to next
      const timer = setTimeout(() => {
        if (currentWordIndex === words.length - 1) {
          // Last word shown, start carousel emergence immediately
          if (onStartEmerging) {
            onStartEmerging();
          }
          // Then start fade sequence after a brief delay
          setTimeout(() => {
            setIsFading(true);
            // Complete intro after fade animation
            setTimeout(() => {
              onComplete();
            }, 1500);
          }, 500);
        } else {
          setCurrentWordIndex(currentWordIndex + 1);
        }
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [currentWordIndex, words.length, onComplete]);

  return (
    <div className={`
      fixed inset-0 z-[60] flex items-center justify-center
      transition-all duration-1500 ease-out
      ${isFading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
    `}>
      <div className="text-center">
        {words.map((word, index) => (
          <div
            key={word.text}
            className={`
              text-8xl font-light tracking-wider
              transition-all duration-1000 ease-out
              ${word.color}
              ${currentWordIndex >= index 
                ? 'opacity-100 translate-y-0' 
                : 'opacity-0 translate-y-8'
              }
              ${index === currentWordIndex ? 'scale-110' : 'scale-100'}
            `}
            style={{
              textShadow: '0 0 30px rgba(255, 255, 255, 0.3)',
              filter: index === currentWordIndex ? 'blur(0px)' : 'blur(1px)'
            }}
          >
            {word.text}
          </div>
        ))}
      </div>
    </div>
  );
};

export default IntroSequence;
