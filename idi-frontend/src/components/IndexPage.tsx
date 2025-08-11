import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface Index {
  id: string;
  title: string;
  slug: string;
  intro_movie?: string | null;
}

interface ContentPage {
  id: string;
  title: string;
  slug: string;
  intro_movie?: string | null;
  thumbnail_image?: string | null;
}

const IndexPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [index, setIndex] = useState<Index | null>(null);
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assetUrlByFilename, setAssetUrlByFilename] = useState<Record<string, string>>({});
  const [assetsBucket, setAssetsBucket] = useState<string>('assets');

  useEffect(() => {
    const fetchIndexData = async () => {
      if (!slug) return;

      try {
        // Fetch the index details
        const { data: indexData, error: indexError } = await supabase
          .from('indices')
          .select('*')
          .eq('slug', slug)
          .single();

        if (indexError) throw indexError;
        setIndex(indexData);

        if (indexData) {
          // Fetch content pages belonging to this index
          const { data: pagesData, error: pagesError } = await supabase
            .from('content_pages')
            .select('*')
            .eq('index_id', indexData.id)
            .order('sort_order', { ascending: true });

          if (pagesError) throw pagesError;
          setPages(pagesData || []);
        }

      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchIndexData();
  }, [slug]);

  // Build asset URL map
  useEffect(() => {
    const filenames = new Set<string>();
    
    // Collect intro movie filename
    if (index?.intro_movie) {
      const filename = index.intro_movie.split('/').pop() || index.intro_movie;
      filenames.add(filename);
    }
    
    // Collect page assets
    pages.forEach(page => {
      if (page.intro_movie) {
        const filename = page.intro_movie.split('/').pop() || page.intro_movie;
        filenames.add(filename);
      }
      if (page.thumbnail_image) {
        const filename = page.thumbnail_image.split('/').pop() || page.thumbnail_image;
        filenames.add(filename);
      }
    });

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
  }, [pages, index, assetsBucket]);

  const getAssetUrl = (filename?: string | null, type: 'images' | 'movies' = 'images') => {
    if (!filename) return '';
    const base = filename.split('/').pop() || filename;
    const mapped = assetUrlByFilename[base];
    if (mapped && mapped.includes('supabase.co/storage')) return mapped;
    const { data } = supabase.storage.from(assetsBucket).getPublicUrl(`${type}/${encodeURIComponent(base)}`);
    return data?.publicUrl || '';
  };



  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading index...</div>
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

  if (!index) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white">Index not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="pt-20 px-8">
        <Link 
          to="/" 
          className="text-white/60 hover:text-white transition-colors duration-300 text-lg"
        >
          ← Back to main sections
        </Link>
        <h1 className="text-4xl font-light text-white mt-4 mb-2">{index.title}</h1>
      </div>

      {/* Intro Movie */}
      {index.intro_movie && (
        <div className="w-2/3 mx-auto mt-8">
          <video 
            src={getAssetUrl(index.intro_movie, 'movies')}
            className="w-full rounded-lg"
            autoPlay 
            loop 
            muted 
            playsInline
          />
        </div>
      )}



      {/* Content Pages Grid */}
      {pages.length > 0 && (
        <div className="max-w-6xl mx-auto mt-12 px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {pages.map(page => (
              <Link 
                key={page.id} 
                to={`/page/${page.slug}`}
                className="group block"
              >
                <div className="bg-white/5 rounded-lg overflow-hidden border border-white/20 hover:border-white/40 transition-all duration-300">
                  {/* Thumbnail or Movie */}
                  {page.intro_movie ? (
                    <video 
                      src={getAssetUrl(page.intro_movie, 'movies')}
                      className="w-full h-48 object-cover"
                      autoPlay 
                      loop 
                      muted 
                      playsInline
                    />
                  ) : page.thumbnail_image ? (
                    <img 
                      src={getAssetUrl(page.thumbnail_image, 'images')}
                      alt={page.title}
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="w-full h-48 bg-white/10 flex items-center justify-center">
                      <span className="text-white/40">No image</span>
                    </div>
                  )}
                  
                  {/* Title */}
                  <div className="p-4">
                    <h3 className="text-white font-light text-lg group-hover:text-white/80 transition-colors">
                      {page.title}
                    </h3>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default IndexPage;
