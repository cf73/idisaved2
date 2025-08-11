import React, { useEffect, useState } from 'react';
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
        const key = (p.thumbnail_image || '').toString();
        if (!key) continue;
        const filename = key.split('/').pop() || key;
        if (filename) filenames.add(filename);
      }
    };
    collect(pages);
    collect(topLevelPages);
    if (filenames.size === 0) return;

    const resolve = async () => {
      const list = Array.from(filenames);
      console.log('SectionPage: Looking up assets for filenames:', list);
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
      console.log('SectionPage: Asset URL mapping:', map);
      setAssetUrlByFilename(prev => ({ ...prev, ...map }));
      setAssetsBucket(detected);
    };
    resolve();
  }, [pages, topLevelPages, section]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  if (!section) {
    return <div>Section not found.</div>;
  }

  const getPublicUrl = (path: string | undefined | null) => {
    if (!path) return '';
    const { data } = supabase.storage.from('assets').getPublicUrl(path);
    return data?.publicUrl || '';
  };

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
    if (mapped) return mapped; // prefer mapped (currently S3 for videos)
    const { data } = supabase.storage.from(assetsBucket).getPublicUrl(`videos/${encodeURIComponent(base)}`);
    return data?.publicUrl || '';
  };

  const buildPublicUrl = (...segments: string[]) => {
    const encoded = segments.map(seg => encodeURIComponent(seg)).join('/');
    return `${SUPABASE_URL}/storage/v1/object/public/${assetsBucket}/${encoded}`;
  };

  const fallbackVideoUrls = (filename: string) => [
    buildPublicUrl(filename),            // root
    buildPublicUrl('videos', filename),  // videos/
  ];

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

  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">{section.title}</h1>
      
      {/* Section Summary */}
      {section.section_summary && (
        <div className="mb-6">
          <p className="text-lg text-gray-700 leading-relaxed">
            {parseBardContent(section.section_summary)}
          </p>
        </div>
      )}

      {/* Render intro movie if it exists */}
      {section.intro_movie && (
        <div className="mb-8">
          {(() => {
            const movieUrl = getMovieUrl(section.intro_movie);
            const fallbackUrls = fallbackVideoUrls(section.intro_movie);
            const hasValidUrl = movieUrl || fallbackUrls.some(url => url);
            
            console.log('SectionPage: Intro movie URLs:', {
              original: section.intro_movie,
              mapped: movieUrl,
              fallbacks: fallbackUrls,
              hasValidUrl
            });
            
            if (!hasValidUrl) {
              return <div className="w-full max-w-2xl mx-auto rounded-lg shadow-lg bg-gray-200 h-64 flex items-center justify-center">Loading video...</div>;
            }
            
            return (
              <video 
                key={`${movieUrl}-${fallbackUrls.join('-')}`}
                controls 
                className="w-full max-w-2xl mx-auto rounded-lg shadow-lg"
              >
                <source src={movieUrl} type="video/mp4" />
                <source src={fallbackUrls[0]} type="video/mp4" />
                <source src={fallbackUrls[1]} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            );
          })()}
        </div>
      )}

      <div className="space-y-6">
        {topLevelPages.length > 0 && (
          <div>
            <h2 className="text-2xl font-semibold mb-2">Pages</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {topLevelPages.map(page => {
                const url = getThumbUrl(page.thumbnail_image);
                return (
                  <Link
                    key={page.id}
                    to={`/page/${page.slug}`}
                    className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow overflow-hidden"
                  >
                    {url && (
                      <img src={url} alt={page.title} className="w-full h-48 object-cover" />
                    )}
                    <div className="p-4">
                      <h3 className="text-lg font-semibold mb-2">{page.title}</h3>
                      {page.thumbnail_caption && (
                        <p className="text-sm text-gray-600">{page.thumbnail_caption}</p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {indices.map(index => (
          <div key={index.id}>
            <h2 className="text-2xl font-semibold mb-2">{index.title}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pages.filter(p => p.index_id === index.id).map(page => {
                const url = getThumbUrl(page.thumbnail_image);
                return (
                  <Link
                    key={page.id}
                    to={`/page/${page.slug}`}
                    className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow overflow-hidden"
                  >
                    {url && (
                      <img src={url} alt={page.title} className="w-full h-48 object-cover" />
                    )}
                    <div className="p-4">
                      <h3 className="text-lg font-semibold mb-2">{page.title}</h3>
                      {page.thumbnail_caption && (
                        <p className="text-sm text-gray-600">{page.thumbnail_caption}</p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SectionPage;
