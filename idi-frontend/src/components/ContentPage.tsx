import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase, SUPABASE_URL } from '../lib/supabase';

// Define types for the content page and its blocks
interface ContentPageRec {
  id: string;
  title: string;
  intro_movie?: string | null;
  [key: string]: any;
}

interface ContentBlockRec {
  id: string;
  type: string;
  json_content: any;
  sort_order: number;
}

interface RelatedPage {
  id: string;
  title: string;
  slug: string;
  thumbnail_image?: string | null;
  relevance_score: number;
}

const ContentPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<ContentPageRec | null>(null);
  const [blocks, setBlocks] = useState<ContentBlockRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assetUrlByFilename, setAssetUrlByFilename] = useState<Record<string, string>>({});
  const [assetsBucket, setAssetsBucket] = useState<string>('assets');
  const [relatedPages, setRelatedPages] = useState<RelatedPage[]>([]);
  const [showRelated, setShowRelated] = useState(false);
  const [extractedKeywords, setExtractedKeywords] = useState<string[]>([]);
  
  const contentRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Extract keywords from content for related page matching
  const extractKeywords = (text: string): string[] => {
    if (!text) return [];
    
    // Remove HTML tags and normalize
    const cleanText = text.replace(/<[^>]*>/g, ' ').toLowerCase();
    
    // Common stop words to filter out
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
      'my', 'your', 'his', 'her', 'its', 'our', 'their', 'mine', 'yours', 'his', 'hers', 'ours', 'theirs'
    ]);
    
    // Extract words and filter
    const words = cleanText.match(/\b[a-z]{3,}\b/g) || [];
    const filteredWords = words.filter(word => !stopWords.has(word));
    
    // Count frequency and get top keywords
    const wordCount: Record<string, number> = {};
    filteredWords.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });
    
    // Sort by frequency and return top 10
    return Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  };

  // Find related pages based on keywords
  const findRelatedPages = async (keywords: string[]) => {
    if (keywords.length === 0) return;
    
    try {
      // Get all content pages with their content blocks for better matching
      const { data: allPages, error } = await supabase
        .from('content_pages')
        .select(`
          id, 
          title, 
          slug, 
          thumbnail_image,
          content_blocks!inner(id, type, json_content)
        `)
        .neq('slug', slug); // Exclude current page
      
      if (error) throw error;
      
      // Score pages based on keyword matches in both title and content
      const scoredPages = (allPages || []).map(page => {
        const pageText = page.title.toLowerCase();
        let score = 0;
        
        // Extract content text from blocks for this page
        let contentText = '';
        if (page.content_blocks && Array.isArray(page.content_blocks)) {
          page.content_blocks.forEach((block: any) => {
            if (block.type === 'text' && block.json_content) {
              const jc = block.json_content;
              if (jc.text && Array.isArray(jc.text)) {
                jc.text.forEach((node: any) => {
                  if (node.type === 'paragraph' && node.content) {
                    node.content.forEach((item: any) => {
                      if (item.type === 'text' && item.text) {
                        contentText += item.text.toLowerCase() + ' ';
                      }
                    });
                  }
                });
              } else if (jc.text && typeof jc.text === 'string') {
                contentText += jc.text.toLowerCase() + ' ';
              }
            }
          });
        }
        
        // Score based on title matches (higher weight)
        keywords.forEach(keyword => {
          if (pageText.includes(keyword)) {
            score += 3; // Title matches are worth more
          }
        });
        
        // Score based on content matches (lower weight but more opportunities)
        keywords.forEach(keyword => {
          if (contentText.includes(keyword)) {
            score += 1; // Content matches add to score
          }
        });
        
        return { ...page, relevance_score: score };
      });
      
      // Sort by relevance and take top 6, but be less conservative
      const topRelated = scoredPages
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .slice(0, 6);
      
      setRelatedPages(topRelated);
    } catch (err) {
      console.error('Error finding related pages:', err);
    }
  };

  useEffect(() => {
    const fetchPageData = async () => {
      if (!slug) return;
      
      // Scroll to top when page loads
      window.scrollTo(0, 0);
      
      try {
        console.log('Fetching page with slug:', slug);
        const { data: pageData, error: pageError } = await supabase
          .from('content_pages')
          .select('*')
          .eq('slug', slug)
          .single();
        
        console.log('Page query result:', { pageData, pageError });
        
        if (pageError) throw pageError;
        setPage(pageData as ContentPageRec);

        const { data: blocksData, error: blocksError } = await supabase
          .from('content_blocks')
          .select('id, type, json_content, sort_order')
          .eq('page_id', (pageData as any).id)
          .order('sort_order', { ascending: true });
        
        console.log('Blocks query result:', { blocksData, blocksError });
        
        if (blocksError) throw blocksError;
        setBlocks((blocksData as ContentBlockRec[]) || []);
      } catch (err: any) {
        console.error('Error fetching page data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPageData();
  }, [slug]);

  // Extract keywords from content and find related pages
  useEffect(() => {
    if (!page || blocks.length === 0) return;
    
    // Extract text content from blocks
    let allText = page.title + ' ';
    blocks.forEach(block => {
      const jc = block.json_content;
      if (jc && typeof jc === 'object') {
        if (jc.text && Array.isArray(jc.text)) {
          jc.text.forEach((node: any) => {
            if (node.type === 'paragraph' && node.content) {
              node.content.forEach((item: any) => {
                if (item.type === 'text' && item.text) {
                  allText += item.text + ' ';
                }
              });
            }
          });
        } else if (jc.text && typeof jc.text === 'string') {
          allText += jc.text + ' ';
        }
      }
    });
    
    const keywords = extractKeywords(allText);
    setExtractedKeywords(keywords);
    findRelatedPages(keywords);
  }, [page, blocks, slug]);

  // Map filenames -> file_url (prefer Supabase URLs); detect bucket
  useEffect(() => {
    const filenames = new Set<string>();
    const safeParse = (v: any) => {
      if (v && typeof v === 'string') {
        try { return JSON.parse(v); } catch { return v; }
      }
      return v;
    };
    
    // Collect intro movie filename
    if (page?.intro_movie) {
      const filename = page.intro_movie.split('/').pop() || page.intro_movie;
      filenames.add(filename);
    }
    
    for (const b of blocks) {
      const t = (b.type || '').toLowerCase();
      const jc = safeParse(b.json_content) || {};
      const pick = () => jc.image || jc.src || jc.path || jc.key || jc.file || jc.filename;
      if (t === 'image') {
        let candidate = pick();
        if (!candidate && Array.isArray(jc.photo)) candidate = jc.photo[0];
        if (typeof candidate === 'string') filenames.add(candidate.split('/').pop() || candidate);
      }
      if (t === 'movie') {
        const candidate = jc.movie || jc.src || jc.path || jc.key || jc.file || jc.filename;
        if (typeof candidate === 'string') filenames.add(candidate.split('/').pop() || candidate);
      }
    }
    
    // Add related page thumbnails
    relatedPages.forEach(relatedPage => {
      if (relatedPage.thumbnail_image) {
        const filename = relatedPage.thumbnail_image.split('/').pop() || relatedPage.thumbnail_image;
        filenames.add(filename);
      }
    });
    
    if (filenames.size === 0) return;

    const resolve = async () => {
      const list = Array.from(filenames);
      console.log('Looking up assets for filenames:', list);
      const { data } = await supabase
        .from('assets')
        .select('filename, file_url')
        .in('filename', list);

      console.log('Asset lookup result:', data);

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
      console.log('Asset URL mapping:', map);
      setAssetUrlByFilename((prev) => ({ ...prev, ...map }));
      setAssetsBucket(detected);
    };
    resolve();
  }, [blocks, page, relatedPages]);

  const getAssetUrl = (filename?: string | null, type: 'images' | 'movies' = 'images') => {
    if (!filename) return '';
    const base = filename.split('/').pop() || filename;
    const mapped = assetUrlByFilename[base];
    
    // For movies, prefer S3 URLs (which are already mapped)
    if (type === 'movies' && mapped) {
      return mapped; // This will be S3 URL for videos
    }
    
    // For images, prefer Supabase URLs
    if (type === 'images') {
      if (mapped && mapped.includes('supabase.co/storage')) return mapped;
      const { data } = supabase.storage.from(assetsBucket).getPublicUrl(`images/${encodeURIComponent(base)}`);
      return data?.publicUrl || '';
    }
    
    // Fallback for movies to Supabase if no S3 URL found
    const { data } = supabase.storage.from(assetsBucket).getPublicUrl(`movies/${encodeURIComponent(base)}`);
    return data?.publicUrl || '';
  };

  const firstNonEmpty = (obj: any, keys: string[]): any => {
    for (const k of keys) {
      const v = obj?.[k];
      if (v !== undefined && v !== null && String(v).length > 0) return v;
    }
    return undefined;
  };

  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');

  const renderInlineWithMarks = (node: any): string => {
    if (node.type !== 'text') return '';
    let text = escapeHtml(node.text ?? '');
    const marks = node.marks || [];
    for (const m of marks) {
      if (m.type === 'bold' || m.type === 'strong') text = `<strong>${text}</strong>`;
      if (m.type === 'italic' || m.type === 'em') text = `<em>${text}</em>`;
      if (m.type === 'underline') text = `<u>${text}</u>`;
    }
    return text;
  };

  const renderRichTextArrayToHtml = (nodes: any[]): string => {
    const htmlParts: string[] = [];
    for (const n of nodes) {
      if (n.type === 'paragraph') {
        const inner = (n.content || []).map(renderInlineWithMarks).join('');
        htmlParts.push(`<p class="text-lg leading-relaxed mb-6 text-gray-200">${inner}</p>`);
      }
    }
    return htmlParts.join('');
  };

  const renderBlock = (block: ContentBlockRec) => {
    const type = (block.type || '').toLowerCase();
    let jc: any = block.json_content || {};
    if (typeof jc === 'string') {
      try { jc = JSON.parse(jc); } catch { /* leave as string */ }
    }
    if (jc && jc.enabled === false) return null;

    switch (type) {
      case 'text': {
        if (Array.isArray(jc.text)) {
          const html = renderRichTextArrayToHtml(jc.text);
          if (html) return <div className="animate-fadeInUp" dangerouslySetInnerHTML={{ __html: html }} />;
        }
        const html = firstNonEmpty(jc, ['html', 'text', 'content']);
        const markdown = firstNonEmpty(jc, ['markdown', 'md']);
        if (html) return <div className="animate-fadeInUp prose prose-invert lg:prose-xl max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
        if (markdown) return <pre className="animate-fadeInUp whitespace-pre-wrap leading-relaxed text-gray-200 text-lg">{markdown}</pre>;
        return null;
      }
      case 'image': {
        let key = firstNonEmpty(jc, ['image', 'src', 'path', 'key', 'original_key', 'file', 'filename']);
        if (!key && Array.isArray(jc.photo)) key = jc.photo[0];
        if (typeof key !== 'string') return null;
        const filename = (key.split('/').pop() || key);
        const url = getAssetUrl(filename, 'images');
        return (
          <figure className="animate-fadeInUp my-12">
            <div className="relative group">
              <img 
                src={url} 
                alt={firstNonEmpty(jc, ['caption', 'alt', 'description']) || ''} 
                className="w-full rounded-2xl shadow-2xl transition-transform duration-700 group-hover:scale-105" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </div>
            {firstNonEmpty(jc, ['caption', 'alt', 'description']) && (
              <figcaption className="text-center text-sm text-gray-400 mt-4 italic">
                {firstNonEmpty(jc, ['caption', 'alt', 'description'])}
              </figcaption>
            )}
          </figure>
        );
      }
             case 'movie': {
         const key = firstNonEmpty(jc, ['movie', 'src', 'path', 'key', 'original_key', 'file', 'filename']);
         if (typeof key !== 'string') return null;
         const filename = (key.split('/').pop() || key);
         const url = getAssetUrl(filename, 'movies');
         return (
           <div className="animate-fadeInUp my-12">
             <video 
               autoPlay
               loop
               muted
               playsInline
               preload="metadata" 
               className="w-full rounded-2xl shadow-2xl transition-transform duration-700 hover:scale-105"
             >
               <source src={url} type="video/mp4" />
               <a href={url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300">Open video</a>
             </video>
           </div>
         );
       }
      case 'quote': {
        const textVal = firstNonEmpty(jc, ['text', 'quote', 'content']);
        const author = firstNonEmpty(jc, ['author', 'attribution']);
        if (!textVal) return null;
        return (
          <blockquote className="animate-fadeInUp my-12 p-8 border-l-4 border-blue-400 bg-gradient-to-r from-blue-900/20 to-transparent rounded-r-2xl">
            <p className="text-2xl italic text-gray-200 leading-relaxed">"{textVal}"</p>
            {author && <footer className="mt-4 text-right text-gray-400">— {author}</footer>}
          </blockquote>
        );
      }
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">Loading content...</div>
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
  
  if (!page) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white">Page not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="pt-20 px-8">
        <Link 
          to="/" 
          className="text-white/60 hover:text-white transition-colors duration-300 text-lg mb-4 inline-block"
        >
          ← Back to main sections
        </Link>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-8 pb-20">
        <article ref={contentRef} className="animate-fadeInUp">
          {/* Title */}
          <h1 className="text-6xl font-light text-white mb-8 leading-tight tracking-wide">
            {page.title}
          </h1>
          
                     {/* Intro Movie */}
           {page.intro_movie && (
             <div className="mb-16 animate-fadeInUp">
               <video 
                 ref={videoRef}
                 src={getAssetUrl(page.intro_movie, 'movies')}
                 className="w-full rounded-2xl shadow-2xl transition-transform duration-700 hover:scale-105"
                 autoPlay
                 loop
                 muted
                 playsInline
                 preload="metadata"
               />
             </div>
           )}
          
          {/* Content Blocks */}
          <div className="space-y-8">
            {blocks.map((block, index) => (
              <div key={block.id} style={{ animationDelay: `${index * 200}ms` }}>
                {renderBlock(block)}
              </div>
            ))}
          </div>
        </article>

        {/* Related Content Section */}
        {relatedPages.length > 0 && (
          <div className="mt-20 pt-16 border-t border-white/10">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-light text-white">Related Explorations</h2>
              <button
                onClick={() => setShowRelated(!showRelated)}
                className="text-blue-400 hover:text-blue-300 transition-colors duration-300"
              >
                {showRelated ? 'Hide' : 'Show'} Related Content
              </button>
            </div>
            
            {showRelated && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeInUp">
                {relatedPages.map((relatedPage, index) => (
                  <Link
                    key={relatedPage.id}
                    to={`/page/${relatedPage.slug}`}
                    className="group block"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="bg-white/5 rounded-xl overflow-hidden border border-white/10 hover:border-white/30 transition-all duration-500 hover:bg-white/10">
                      {relatedPage.thumbnail_image ? (
                        <div className="relative h-48 overflow-hidden">
                          <img 
                            src={getAssetUrl(relatedPage.thumbnail_image, 'images')}
                            alt={relatedPage.title}
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        </div>
                      ) : (
                        <div className="h-48 bg-gradient-to-br from-blue-900/20 to-purple-900/20 flex items-center justify-center">
                          <span className="text-white/40 text-sm">No image</span>
                        </div>
                      )}
                      
                      <div className="p-6">
                        <h3 className="text-white font-light text-lg group-hover:text-blue-300 transition-colors duration-300 leading-tight">
                          {relatedPage.title}
                        </h3>
                        <div className="mt-2 text-blue-400 text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          Explore →
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContentPage;
