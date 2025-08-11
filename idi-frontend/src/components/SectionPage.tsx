import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase, SUPABASE_URL } from '../lib/supabase';

interface Section {
  id: string;
  title: string;
  slug: string;
  intro_movie: string | null;
  section_summary: string | null;
}

interface Index {
  id: string;
  title: string;
  slug: string;
}

interface ContentPage {
  id: string;
  title: string;
  slug: string;
  index_id: string;
  thumbnail_image?: string | null;
  thumbnail_caption?: string | null;
  intro_movie?: string | null;
}

interface FloatingNode {
  id: string;
  title: string;
  slug: string;
  type: 'page' | 'index';
  thumbnail_image?: string | null;
  thumbnail_caption?: string | null;
  intro_movie?: string | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  opacity: number;
  blur: number;
  scale: number;
  zIndex: number;
  isActivated?: boolean;
  isLocked?: boolean; // New: node is locked in active state
  lockPosition?: { x: number; y: number }; // Position when locked
  // Sci-fi animation states
  lineProgress?: number; // 0-1 for line drawing animation
  textOpacity?: number; // 0-1 for text fade in
  textOffset?: number; // 0-1 for text slide up animation
}

const SectionPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [section, setSection] = useState<Section | null>(null);
  const [indices, setIndices] = useState<Index[]>([]);
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [topLevelPages, setTopLevelPages] = useState<ContentPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assetUrlByFilename, setAssetUrlByFilename] = useState<Record<string, string>>({});
  const [assetsBucket, setAssetsBucket] = useState<string>('assets');
  
  // Mystical interface state
  const [floatingNodes, setFloatingNodes] = useState<FloatingNode[]>([]);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const [lockedNodeId, setLockedNodeId] = useState<string | null>(null); // Track which node is locked
  const [currentWinnerId, setCurrentWinnerId] = useState<string | null>(null); // Prevent flickering
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | undefined>(undefined);

     // Initialize floating nodes with safe zone clustering
   const initializeFloatingNodes = useCallback((indices: Index[], pages: ContentPage[], topLevelPages: ContentPage[]) => {
     const nodes: FloatingNode[] = [];
     
     // Define safe zone (galaxy-like clustering)
     const centerX = window.innerWidth / 2;
     const centerY = window.innerHeight / 2;
     const safeRadius = Math.min(window.innerWidth, window.innerHeight) * 0.35; // 35% of screen
     
     // Add indices as larger, more prominent nodes
     indices.forEach((index, i) => {
       const angle = (i / indices.length) * Math.PI * 2;
       const radius = 100 + Math.random() * 150; // Closer to center
       const x = Math.cos(angle) * radius + centerX;
       const y = Math.sin(angle) * radius + centerY;
       
       nodes.push({
         id: index.id,
         title: index.title,
         slug: index.slug,
         type: 'index',
         x,
         y,
         vx: (Math.random() - 0.5) * 0.3,
         vy: (Math.random() - 0.5) * 0.3,
         baseX: x,
         baseY: y,
         opacity: 0.15,
         blur: 12,
         scale: 0.9,
         zIndex: 20
       });
     });

     // Add pages as smaller, more numerous nodes
     const allPages = [...pages, ...topLevelPages];
     allPages.forEach((page, i) => {
       // Create galaxy-like distribution
       const angle = Math.random() * Math.PI * 2;
       const radius = 50 + Math.random() * safeRadius; // More clustered
       const x = Math.cos(angle) * radius + centerX;
       const y = Math.sin(angle) * radius + centerY;
       
               nodes.push({
          id: page.id,
          title: page.title,
          slug: page.slug,
          type: 'page',
          thumbnail_image: page.thumbnail_image,
          thumbnail_caption: page.thumbnail_caption,
          intro_movie: page.intro_movie,
          x,
          y,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.2,
          baseX: x,
          baseY: y,
          opacity: 0.1,
          blur: 10,
          scale: 0.7,
          zIndex: 15
        });
     });

     setFloatingNodes(nodes);
   }, []);

           // Animation loop with state-based activation system
    const animateNodes = useCallback(() => {
      setFloatingNodes(prevNodes => {
        // First pass: calculate all distances and update positions
        const nodesWithDistances = prevNodes.map(node => {
          const dx = node.baseX - node.x;
          const dy = node.baseY - node.y;
          const vx = node.vx + dx * 0.001;
          const vy = node.vy + dy * 0.001;
          
          // Damping
          const newVx = vx * 0.99;
          const newVy = vy * 0.99;
          
          // Update position
          const newX = node.x + newVx;
          const newY = node.y + newVy;
          
                     // Calculate distance from mouse to center of node
           const nodeWidth = node.type === 'index' ? 192 : 128; // w-48 = 192px, w-32 = 128px
           const nodeHeight = node.type === 'index' ? 128 : 96; // h-32 = 128px, h-24 = 96px
           const nodeCenterX = newX + (nodeWidth * node.scale) / 2;
           const nodeCenterY = newY + (nodeHeight * node.scale) / 2;
           
           const mouseDistance = Math.sqrt(
             Math.pow(mousePosition.x - nodeCenterX, 2) + 
             Math.pow(mousePosition.y - nodeCenterY, 2)
           );
          
          return {
            ...node,
            x: newX,
            y: newY,
            vx: newVx,
            vy: newVy,
            mouseDistance
          };
        });
        
        if (nodesWithDistances.length === 0) {
          return prevNodes;
        }
        
                 // Check if we have a locked node
         if (lockedNodeId) {
           const lockedNode = nodesWithDistances.find(n => n.id === lockedNodeId);
           if (lockedNode && lockedNode.lockPosition) {
             // Check if cursor has moved too far from locked node
             const distanceFromLocked = Math.sqrt(
               Math.pow(mousePosition.x - lockedNode.lockPosition.x, 2) + 
               Math.pow(mousePosition.y - lockedNode.lockPosition.y, 2)
             );
            
                         // If cursor is too far, unlock the node
             if (distanceFromLocked > 250) { // Reduced threshold for easier navigation
               setLockedNodeId(null);
               return nodesWithDistances.map(node => ({
                 ...node,
                 isLocked: false,
                 isActivated: false,
                 lockPosition: undefined
               }));
             }
             
             // Locked node stays fully active, others are frozen
             return nodesWithDistances.map(node => {
               if (node.id === lockedNodeId) {
                 return {
                   ...node,
                   opacity: 1.0, // Full opacity
                   blur: 0, // No blur
                   scale: 3.0, // Full scale
                   zIndex: node.type === 'index' ? 30 : 25,
                   isActivated: true, // Always show text
                   isLocked: true,
                   lineProgress: 1.0, // Full line
                   textOpacity: 1.0, // Full text opacity
                   textOffset: 0 // Text in final position
                 };
               } else {
                 // Other nodes are frozen in their current state
                 return {
                   ...node,
                   opacity: 0.1, // Dimmed
                   blur: 15, // Blurred
                   scale: 0.5, // Small
                   zIndex: node.type === 'index' ? 20 : 15,
                   isActivated: false,
                   isLocked: false,
                   lineProgress: 0, // No line
                   textOpacity: 0, // No text
                   textOffset: 1 // Text hidden
                 };
               }
             });
           } else {
             // Locked node found but no lockPosition - reset the lock
             setLockedNodeId(null);
             return nodesWithDistances.map(node => ({
               ...node,
               isLocked: false,
               isActivated: false,
               lockPosition: undefined
             }));
           }
         }
        
                 // No locked node - find potential winner with hysteresis
         const maxDistance = 200;
         const closestNode = nodesWithDistances.reduce((closest, current) => 
           current.mouseDistance < closest.mouseDistance ? current : closest
         );
         
         const proximity = Math.max(0, 1 - closestNode.mouseDistance / maxDistance);
         
         // Hysteresis: only change winner if significantly closer or if no current winner
         let newWinnerId = currentWinnerId;
         if (!currentWinnerId || proximity > 0.6) {
           // Check if the closest node is significantly closer than current winner
           if (!currentWinnerId) {
             newWinnerId = closestNode.id;
           } else {
             const currentWinner = nodesWithDistances.find(n => n.id === currentWinnerId);
             if (currentWinner) {
               const currentProximity = Math.max(0, 1 - currentWinner.mouseDistance / maxDistance);
               // Only switch if new node is 20% closer
               if (proximity > currentProximity + 0.2) {
                 newWinnerId = closestNode.id;
               }
             }
           }
         }
         
         // Update winner if changed
         if (newWinnerId !== currentWinnerId) {
           setCurrentWinnerId(newWinnerId);
         }
         
         // Check if closest node should be locked (high proximity)
         if (proximity > 0.7 && !lockedNodeId) {
           setLockedNodeId(closestNode.id);
           return nodesWithDistances.map(node => {
             if (node.id === closestNode.id) {
               return {
                 ...node,
                 opacity: 1.0,
                 blur: 0,
                 scale: 3.0,
                 zIndex: node.type === 'index' ? 30 : 25,
                 isActivated: true,
                 isLocked: true,
                 lockPosition: { x: mousePosition.x, y: mousePosition.y }
               };
             } else {
               return {
                 ...node,
                 opacity: 0.1,
                 blur: 15,
                 scale: 0.5,
                 zIndex: node.type === 'index' ? 20 : 15,
                 isActivated: false,
                 isLocked: false
               };
             }
           });
         }
         

        
                 // Normal proximity-based effects (no locked node) - use stable winner
         return nodesWithDistances.map(node => {
           const isWinner = node.id === newWinnerId;
           const nodeProximity = Math.max(0, 1 - node.mouseDistance / maxDistance);
           
           if (isWinner) {
             const winnerProximity = Math.pow(nodeProximity, 0.4);
             const isActivated = winnerProximity > 0.8;
             
             return {
               ...node,
               opacity: 0.15 + winnerProximity * 0.85,
               blur: 8 - winnerProximity * 8,
               scale: 0.8 + winnerProximity * 2.2,
               zIndex: node.type === 'index' ? 30 : 25,
               isActivated,
               isLocked: false,
               lineProgress: 0,
               textOpacity: 0,
               textOffset: 1
             };
           } else {
             const neighborProximity = Math.pow(nodeProximity, 0.6) * 0.4;
             return {
               ...node,
               opacity: 0.1 + neighborProximity * 0.4,
               blur: 12 - neighborProximity * 8,
               scale: 0.7 + neighborProximity * 1.0,
               zIndex: node.type === 'index' ? 20 : 15,
               isActivated: false,
               isLocked: false,
               lineProgress: 0,
               textOpacity: 0,
               textOffset: 1
             };
           }
         });
      });
      
      animationRef.current = requestAnimationFrame(animateNodes);
    }, [mousePosition, lockedNodeId]);

  // Mouse/touch event handlers
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMousePosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (containerRef.current && e.touches[0]) {
      const rect = containerRef.current.getBoundingClientRect();
      setMousePosition({
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      });
    }
  }, []);

  // Responsive design
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Start animation loop with performance optimization
  useEffect(() => {
    let lastTime = 0;
    const targetFPS = 30; // Reduce from 60fps to 30fps for better performance
    const frameInterval = 1000 / targetFPS;

    const animate = (currentTime: number) => {
      if (currentTime - lastTime >= frameInterval) {
        animateNodes();
        lastTime = currentTime;
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animateNodes]);

  useEffect(() => {
    const fetchSectionData = async () => {
      if (!slug) return;

      try {
        // Fetch the section details
        const { data: sectionData, error: sectionError } = await supabase
          .from('sections')
          .select('*')
          .eq('slug', slug)
          .single();

        if (sectionError) throw sectionError;
        setSection(sectionData);

        if (sectionData) {
          // Fetch indices belonging to this section
          const { data: indicesData, error: indicesError } = await supabase
            .from('indices')
            .select('*')
            .eq('section_id', sectionData.id)
            .order('sort_order', { ascending: true });

          if (indicesError) throw indicesError;
          setIndices(indicesData || []);

          // Fetch content pages belonging to this section (directly or via indices)
          const indexIds = (indicesData || []).map(i => i.id);
          const { data: pagesData, error: pagesError } = await supabase
            .from('content_pages')
            .select('*')
            .in('index_id', indexIds.length ? indexIds : ['00000000-0000-0000-0000-000000000000'])
            .order('sort_order', { ascending: true });

          if (pagesError) throw pagesError;
          setPages(pagesData || []);

          // Fetch pages that are direct children of the section (no index)
          const { data: directPages, error: directErr } = await supabase
            .from('content_pages')
            .select('*')
            .eq('section_id', sectionData.id)
            .is('index_id', null)
            .order('sort_order', { ascending: true });

          if (directErr) throw directErr;
          setTopLevelPages(directPages || []);
        }

      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSectionData();
  }, [slug]);

  // Initialize floating nodes when data is loaded
  useEffect(() => {
    if (!loading && indices.length > 0 || pages.length > 0 || topLevelPages.length > 0) {
      initializeFloatingNodes(indices, pages, topLevelPages);
    }
  }, [loading, indices, pages, topLevelPages, initializeFloatingNodes]);

  // Build a map of filename -> public URL using `assets` table when possible
  useEffect(() => {
    const filenames = new Set<string>();
    
    // Collect intro movie filename
    if (section?.intro_movie) {
      const filename = section.intro_movie.split('/').pop() || section.intro_movie;
      filenames.add(filename);
    }
    
         const collect = (list: ContentPage[]) => {
       for (const p of list) {
         // Collect thumbnail images
         const imageKey = (p.thumbnail_image || '').toString();
         if (imageKey) {
           const filename = imageKey.split('/').pop() || imageKey;
           if (filename) filenames.add(filename);
         }
         
         // Collect intro movies
         const movieKey = (p.intro_movie || '').toString();
         if (movieKey) {
           const filename = movieKey.split('/').pop() || movieKey;
           if (filename) filenames.add(filename);
         }
       }
     };
    collect(pages);
    collect(topLevelPages);
    if (filenames.size === 0) return;

    const resolve = async () => {
      const list = Array.from(filenames);
      const { data, error } = await supabase
        .from('assets')
        .select('filename, file_url')
        .in('filename', list);
      if (error) return;
      const map: Record<string, string> = {};
      let detected = assetsBucket;
      for (const row of data || []) {
        if (row.file_url) {
          map[row.filename] = row.file_url;
          if (row.file_url.includes('supabase.co/storage')) {
            const m = String(row.file_url).match(/\/storage\/v1\/object\/public\/([^/]+)\//);
            if (m && m[1]) detected = m[1];
          }
        }
      }
      setAssetUrlByFilename(prev => ({ ...prev, ...map }));
      setAssetsBucket(detected);
    };
    resolve();
  }, [pages, topLevelPages, section, assetsBucket]);

          const getThumbUrl = (filename?: string | null) => {
      if (!filename) return '';
      const base = filename.split('/').pop() || filename;
      const mapped = assetUrlByFilename[base];
      if (mapped && mapped.includes('supabase.co/storage')) return mapped;
      const { data } = supabase.storage.from(assetsBucket).getPublicUrl(`images/${encodeURIComponent(base)}`);
      return data?.publicUrl || '';
    };

    const getMovieUrl = (filename?: string | null) => {
      if (!filename) return '';
      const base = filename.split('/').pop() || filename;
      const mapped = assetUrlByFilename[base];
      if (mapped && mapped.includes('supabase.co/storage')) return mapped;
      const { data } = supabase.storage.from(assetsBucket).getPublicUrl(`movies/${encodeURIComponent(base)}`);
      return data?.publicUrl || '';
    };

   // Parse Statamic Bard content to readable text
   const parseBardContent = (content: string | any): string => {
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
   };

     if (loading) {
     return (
       <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
         <div className="text-white text-xl">Loading {slug}...</div>
       </div>
     );
   }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (!section) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white">Section not found.</div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden relative"
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
    >
                   {/* Section Header */}
      <div className="absolute top-8 left-24 z-10">
        <h1 className="text-4xl font-light text-white mb-2">{section.title}</h1>
        <Link 
          to="/" 
          className="text-white/60 hover:text-white transition-colors duration-300 text-lg"
        >
          ← Back to main sections
        </Link>
        {section.section_summary && (
          <p className="text-white/70 text-lg max-w-2xl leading-relaxed mt-4">
            {parseBardContent(section.section_summary)}
          </p>
        )}
      </div>

                                         {/* Floating Content Nodes */}
                   {floatingNodes.map(node => {
            // Simple caption positioning - always on right side for now
            const nodeWidth = node.type === 'index' ? 192 : 128;
            const nodeHeight = node.type === 'index' ? 128 : 96;
            const scaledWidth = nodeWidth * node.scale;
            const scaledHeight = nodeHeight * node.scale;
           
           return (
             <React.Fragment key={node.id}>
               {/* Scaled Node Container */}
               <div
                 className="absolute cursor-pointer transition-all duration-1000 ease-out"
                 style={{
                   left: node.x,
                   top: node.y,
                   opacity: node.opacity,
                   filter: `blur(${node.blur}px)`,
                   transform: `scale(${node.scale})`,
                   zIndex: node.zIndex,
                 }}
               >
                 <Link
                   to={node.type === 'index' ? `/index/${node.slug}` : `/page/${node.slug}`}
                   className={`
                     block rounded-2xl overflow-hidden border border-white/20
                     transition-all duration-500 ease-out relative
                     ${node.type === 'index' 
                       ? 'w-48 h-32 bg-white/10 hover:bg-white/20' 
                       : 'w-32 h-24 bg-white/5 hover:bg-white/15'
                     }
                   `}
                 >
                                                           {/* Full-size background image */}
                     {node.thumbnail_image ? (
                       <div className="absolute inset-0">
                         <img 
                           src={getThumbUrl(node.thumbnail_image)} 
                           alt={node.title}
                           className="w-full h-full object-cover"
                         />
                         <div className="absolute inset-0 bg-black/40" />
                       </div>
                     ) : (
                       <div className="absolute inset-0 bg-white/10" />
                     )}
                   
                   {/* Title overlay */}
                   <div className="absolute inset-0 flex items-end p-3">
                     <h3 className={`
                       text-white font-light leading-tight drop-shadow-lg
                       ${node.type === 'index' ? 'text-sm' : 'text-xs'}
                     `}>
                       {node.title}
                     </h3>
                   </div>
                 </Link>
               </div>
               
               
             </React.Fragment>
           );
         })}

                     {/* Mystical Instructions */}
        <div className="absolute bottom-8 left-8 text-white/40 text-sm">
          {lockedNodeId 
            ? 'Move cursor away to release node' 
            : (isMobile ? 'Touch to reveal content' : 'Move cursor near nodes to explore, then hover to select')
          }
        </div>
    </div>
  );
};

export default SectionPage;
