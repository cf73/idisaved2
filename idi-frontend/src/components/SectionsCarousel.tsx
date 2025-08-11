import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase, SUPABASE_URL } from '../lib/supabase';

interface Section {
  id: string;
  title: string;
  slug: string;
  intro_movie: string | null;
  section_summary: string | null;
}

interface SectionsCarouselProps {
  shouldStartEmerging?: boolean;
}

const SectionsCarousel: React.FC<SectionsCarouselProps> = ({ shouldStartEmerging = false }) => {
  const location = useLocation();
  const [sections, setSections] = useState<Section[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assetUrlByFilename, setAssetUrlByFilename] = useState<Record<string, string>>({});
  const carouselRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [currentX, setCurrentX] = useState(0);
         const [isMobile, setIsMobile] = useState(false);
    const [transitionsEnabled, setTransitionsEnabled] = useState(true);
         const [isEmerging, setIsEmerging] = useState(true); // Start hidden
     const [hasStartedEmerging, setHasStartedEmerging] = useState(false);
    const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  // Restore carousel position from location state or sessionStorage
  useEffect(() => {
    if (sections.length > 0) {
      // Try location state first, then sessionStorage
      const savedIndex = location.state?.carouselIndex ?? 
                        sessionStorage.getItem('carouselIndex');
      
      if (savedIndex !== null && savedIndex !== undefined) {
        const index = parseInt(savedIndex.toString());
        if (!isNaN(index) && index >= 0 && index < sections.length) {
          // Disable transitions for instant positioning
          setTransitionsEnabled(false);
          setCurrentIndex(index);
          // Re-enable transitions after a brief delay
          setTimeout(() => {
            setTransitionsEnabled(true);
          }, 100);
        }
      }
    }
  }, [location.state?.carouselIndex, sections.length]);

  // Fetch sections with intro_movie and section_summary
  useEffect(() => {
    const fetchSections = async () => {
      try {
        const { data, error } = await supabase
          .from('sections')
          .select('id, title, slug, intro_movie, section_summary')
          .order('sort_order', { ascending: true });

        if (error) {
          throw error;
        }

        setSections(data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSections();
  }, []);

  // Fetch asset URLs for intro movies
  useEffect(() => {
    const filenames = sections
      .map(s => s.intro_movie)
      .filter(Boolean)
      .map(movie => movie!.split('/').pop() || movie!);

    if (filenames.length === 0) return;

    const resolveAssets = async () => {
      const { data } = await supabase
        .from('assets')
        .select('filename, file_url')
        .in('filename', filenames);

      const map: Record<string, string> = {};
      for (const row of data || []) {
        if (row.file_url) {
          map[row.filename] = row.file_url;
        }
      }
      setAssetUrlByFilename(map);
    };

    resolveAssets();
  }, [sections]);

     const getMovieUrl = useCallback((filename?: string | null) => {
     if (!filename) return '';
     const base = filename.split('/').pop() || filename;
     return assetUrlByFilename[base] || '';
   }, [assetUrlByFilename]);

   // Control video playback based on active state
   const controlVideoPlayback = useCallback((sectionId: string, shouldPlay: boolean) => {
     const video = videoRefs.current[sectionId];
     if (video) {
       if (shouldPlay) {
         video.play().catch(() => {
           // Ignore autoplay errors
         });
       } else {
         video.pause();
       }
     }
   }, []);

  // Parse Statamic Bard content to readable text
  const parseBardContent = useCallback((content: string | any): string => {
    if (!content) return '';

    let parsedContent: any;
    if (typeof content === 'string') {
      try {
        parsedContent = JSON.parse(content);
      } catch (e) {
        // If parsing fails, it's just a plain string, return it
        return content;
      }
    } else {
      parsedContent = content;
    }

    // If it's an array (Bard format), parse it
    if (Array.isArray(parsedContent)) {
      return parsedContent
        .map((node: any) => {
          if (node.type === 'paragraph' && Array.isArray(node.content)) {
            return node.content
              .map((item: any) => {
                if (item.type === 'text') {
                  return item.text || '';
                }
                return '';
              })
              .join('');
          }
          return '';
        })
        .join(' ')
        .trim();
    }

    // Fallback for any other unexpected format, or if it was a simple string initially
    return typeof parsedContent === 'string' ? parsedContent : '';
  }, []);

  const nextSection = useCallback(() => {
    setCurrentIndex(prev => {
      const newIndex = (prev + 1) % sections.length;
      sessionStorage.setItem('carouselIndex', newIndex.toString());
      return newIndex;
    });
  }, [sections.length]);

  const prevSection = useCallback(() => {
    setCurrentIndex(prev => {
      const newIndex = (prev - 1 + sections.length) % sections.length;
      sessionStorage.setItem('carouselIndex', newIndex.toString());
      return newIndex;
    });
  }, [sections.length]);

  // Touch/Mouse handlers for carousel interaction
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartX(e.clientX);
    setCurrentX(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setCurrentX(e.clientX);
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    
    const diff = startX - currentX;
    const threshold = 50; // minimum distance to trigger rotation
    
    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        nextSection();
      } else {
        prevSection();
      }
    }
    
    setIsDragging(false);
  };

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setStartX(e.touches[0].clientX);
    setCurrentX(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    e.preventDefault(); // Prevent scrolling while dragging
    setCurrentX(e.touches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    
    const diff = startX - currentX;
    const threshold = 50; // minimum distance to trigger rotation
    
    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        nextSection();
      } else {
        prevSection();
      }
    }
    
    setIsDragging(false);
  };

  // Responsive design
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    handleResize(); // Set initial value
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               // Handle emerging from mist effect
         useEffect(() => {
           if (!loading && sections.length > 0 && shouldStartEmerging && !hasStartedEmerging) {
             // Start emerging animation immediately when intro completes
             setHasStartedEmerging(true);
             setIsEmerging(false);
           }
         }, [loading, sections.length, shouldStartEmerging, hasStartedEmerging]);

   // Control video playback when currentIndex changes
   useEffect(() => {
     sections.forEach((section, index) => {
       const isActive = index === currentIndex;
       controlVideoPlayback(section.id, isActive);
     });
   }, [currentIndex, sections, controlVideoPlayback]);

   // Keyboard navigation
   useEffect(() => {
     const handleKeyDown = (e: KeyboardEvent) => {
       if (e.key === 'ArrowLeft') {
         prevSection();
       } else if (e.key === 'ArrowRight') {
         nextSection();
       }
     };

     window.addEventListener('keydown', handleKeyDown);
     return () => window.removeEventListener('keydown', handleKeyDown);
   }, [nextSection, prevSection]);

  if (loading) {
    return null; // Don't show loading state when carousel is hidden
  }

  if (error) {
    return null; // Don't show error state when carousel is hidden
  }

  if (sections.length === 0) {
    return null; // Don't show empty state when carousel is hidden
  }

  const totalSections = sections.length;

  return (
                                       <div 
                className={`
            min-h-screen overflow-hidden relative
            ${isEmerging ? 'pointer-events-none' : 'pointer-events-auto'}
          `}
                   style={{
            transition: 'all 12s ease-out',
            opacity: isEmerging ? 0 : 1,
            transform: isEmerging ? 'scale(0.3)' : 'scale(1)',
            filter: isEmerging ? 'blur(20px) brightness(0.3)' : 'blur(0px) brightness(1)',
          }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
             {/* Subtle navigation hints - only visible on hover */}
       {!isMobile && (
         <>
           <button
             onClick={prevSection}
             className="absolute left-4 top-1/2 transform -translate-y-1/2 z-20 bg-black/10 backdrop-blur-sm rounded-full p-2 text-slate-300 hover:bg-black/20 hover:text-white transition-all duration-500 opacity-0 hover:opacity-100"
             aria-label="Previous section"
           >
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
             </svg>
           </button>
 
           <button
             onClick={nextSection}
             className="absolute right-4 top-1/2 transform -translate-y-1/2 z-20 bg-black/10 backdrop-blur-sm rounded-full p-2 text-slate-300 hover:bg-black/20 hover:text-white transition-all duration-500 opacity-0 hover:opacity-100"
             aria-label="Next section"
           >
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
             </svg>
           </button>
         </>
       )}

             {/* Glass Pane Container */}
       <div className="relative w-full h-screen flex items-center justify-center">
         <div
           ref={carouselRef}
           className="relative w-full h-full flex items-center justify-center"
         >
          {sections.map((section, index) => {
                         // Calculate position relative to current index
             let relativeIndex = index - currentIndex;
             
             // Handle circular wrapping
             if (relativeIndex > sections.length / 2) {
               relativeIndex -= sections.length;
             } else if (relativeIndex < -sections.length / 2) {
               relativeIndex += sections.length;
             }
             
             const isActive = index === currentIndex;
             const isVisible = Math.abs(relativeIndex) <= 1; // Show current and immediate neighbors
             
             // Calculate positioning to show edges of adjacent sections with proper spacing
             const paneWidth = isMobile ? 384 : 896; // max-w-md = 384px, max-w-4xl = 896px
             const viewportWidth = window.innerWidth;
             const gap = 40; // Gap between sections
             const centerOffset = (viewportWidth - paneWidth) / 2;
             
             // Position adjacent sections so their edges are just visible with gap
             let xOffset;
             if (relativeIndex === 0) {
               // Current section - centered
               xOffset = 0;
             } else if (relativeIndex === -1) {
               // Previous section - right edge visible with gap
               xOffset = -(paneWidth + gap - centerOffset);
             } else if (relativeIndex === 1) {
               // Next section - left edge visible with gap
               xOffset = paneWidth + gap - centerOffset;
             } else {
               // Other sections - off screen
               xOffset = relativeIndex * viewportWidth;
             }
             
             const opacity = isActive ? 1 : (isVisible ? 0.8 : 0); // Keep adjacent sections visible
             const scale = isActive ? 1 : 0.85; // More scale difference for better layering
             const zIndex = isActive ? 10 : (isVisible ? 5 : 0); // Proper z-index layering

                                                                                                                                                           return (
                                <div
                    key={section.id}
                    className={`absolute cursor-pointer ${
                      transitionsEnabled ? 'transition-all duration-1000 ease-out' : ''
                    } ${
                      isVisible ? 'opacity-100' : 'opacity-0'
                    } ${isMobile ? 'w-full max-w-md h-96' : 'w-full max-w-4xl h-[80vh]'}`}
                                    style={{
                      transform: `
                        translateX(${xOffset}px)
                        scale(${scale})
                      `,
                      opacity: opacity,
                      zIndex: zIndex,
                    }}
                   onClick={() => {
                     if (!isActive) {
                       setCurrentIndex(index);
                       sessionStorage.setItem('carouselIndex', index.toString());
                     }
                   }}
               >
                                                  {/* Glass Pane */}
                 <div className={`
                   w-full h-full rounded-lg overflow-hidden relative
                   transition-all duration-1000 ease-out
                   ${isActive 
                     ? 'bg-black/20 backdrop-blur-md border border-white/10 shadow-2xl' 
                     : 'bg-black/10 backdrop-blur-sm border border-white/5 hover:bg-black/15 hover:border-white/15'
                   }
                 `}>
                   {/* Full-screen Movie Background */}
                   {section.intro_movie && isVisible && (
                     <div className="absolute inset-0">
                     {(() => {
                       const movieUrl = getMovieUrl(section.intro_movie);
                       
                                              if (!movieUrl) {
                         return (
                           <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                             <div className="text-slate-400 text-sm">Loading video...</div>
                           </div>
                         );
                       }
                       
                       return (
                         <>
                           <video
                             ref={(el) => {
                               videoRefs.current[section.id] = el;
                             }}
                             autoPlay={isActive}
                             muted
                             loop
                             playsInline
                             className="w-full h-full object-cover"
                             style={{ filter: 'brightness(0.7) contrast(1.2)' }}
                           >
                             <source src={movieUrl} type="video/mp4" />
                           </video>
                           <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/40" />
                         </>
                       );
                     })()}
                   </div>
                 )}

                   {/* Overlay Content */}
                   <div className={`
                     absolute inset-0 p-8 flex flex-col justify-end
                     transition-all duration-1000 ease-out
                     ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
                   `}>
                     <h2 className={`
                       text-4xl font-light mb-6 transition-all duration-1000
                       ${isActive ? 'text-white' : 'text-slate-300'}
                     `}>
                       {section.title}
                     </h2>
                     
                                          {section.section_summary && isActive && (
                       <p className="text-slate-200 text-lg leading-relaxed mb-8 line-clamp-4">
                         {parseBardContent(section.section_summary)}
                       </p>
                     )}

                     {isActive && (
                         <Link
                           to={`/section/${section.slug}`}
                           state={{ carouselIndex: currentIndex }}
                           onClick={(e) => {
                             e.stopPropagation(); // Prevent triggering the pane click
                             sessionStorage.setItem('carouselIndex', currentIndex.toString());
                           }}
                           className="inline-flex items-center px-6 py-3 bg-white/20 backdrop-blur-md text-white rounded-lg hover:bg-white/30 border border-white/30 transition-all duration-300 text-lg"
                         >
                         Explore
                         <svg className="ml-3 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                         </svg>
                       </Link>
                     )}
                   </div>
                 </div>
              </div>
            );
          })}
        </div>
      </div>

             {/* Minimal section indicator - only visible on hover */}
       <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 opacity-0 hover:opacity-100 transition-opacity duration-500 z-20">
         <div className="flex space-x-1">
                      {sections.map((_, index) => (
              <button
                key={index}
                onClick={() => {
                  setCurrentIndex(index);
                  sessionStorage.setItem('carouselIndex', index.toString());
                }}
                className={`
                  rounded-full transition-all duration-300
                  w-2 h-2
                  ${index === currentIndex 
                    ? 'bg-white scale-125' 
                    : 'bg-white/30 hover:bg-white/60'
                  }
                `}
                aria-label={`Go to section ${index + 1}`}
              />
            ))}
         </div>
       </div>
    </div>
  );
};

export default SectionsCarousel;
