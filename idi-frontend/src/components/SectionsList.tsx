import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface Section {
  id: string;
  title: string;
  slug: string;
}

const SectionsList: React.FC = () => {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSections = async () => {
      try {
        const { data, error } = await supabase
          .from('sections')
          .select('id, title, slug')
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

  if (loading) {
    return <div>Loading sections...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Sections</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((section) => (
          <Link
            key={section.id}
            to={`/section/${section.slug}`}
            className="block p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
          >
            <h3 className="text-xl font-semibold">{section.title}</h3>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default SectionsList;
