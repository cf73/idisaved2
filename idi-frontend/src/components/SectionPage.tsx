import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface Section {
  id: string;
  title: string;
  slug: string;
  intro_movie: string | null;
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
}

const SectionPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [section, setSection] = useState<Section | null>(null);
  const [indices, setIndices] = useState<Index[]>([]);
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [topLevelPages, setTopLevelPages] = useState<ContentPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">{section.title}</h1>

      {/* Render intro movie if it exists */}
      {section.intro_movie && (
        <div className="mb-8">
          <video controls className="w-full max-w-2xl mx-auto rounded-lg shadow-lg">
            <source src={getPublicUrl(section.intro_movie)} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      )}

      <div className="space-y-6">
        {topLevelPages.length > 0 && (
          <div>
            <h2 className="text-2xl font-semibold mb-2">Pages</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topLevelPages.map(page => (
                <Link
                  key={page.id}
                  to={`/page/${page.slug}`}
                  className="block p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
                >
                  {page.title}
                </Link>
              ))}
            </div>
          </div>
        )}

        {indices.map(index => (
          <div key={index.id}>
            <h2 className="text-2xl font-semibold mb-2">{index.title}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pages.filter(p => p.index_id === index.id).map(page => (
                <Link
                  key={page.id}
                  to={`/page/${page.slug}`}
                  className="block p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
                >
                  {page.title}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SectionPage;
