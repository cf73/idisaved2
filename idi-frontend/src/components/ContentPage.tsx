import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase, SUPABASE_URL } from '../lib/supabase';

// Define types for the content page and its blocks
interface ContentPageRec {
  id: string;
  title: string;
  [key: string]: any;
}

interface ContentBlockRec {
  id: string;
  type: string;
  json_content: any;
  sort_order: number;
}

const ContentPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<ContentPageRec | null>(null);
  const [blocks, setBlocks] = useState<ContentBlockRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assetUrlByFilename, setAssetUrlByFilename] = useState<Record<string, string>>({});
  const [assetsBucket, setAssetsBucket] = useState<string>('assets');

  useEffect(() => {
    const fetchPageData = async () => {
      if (!slug) return;
      try {
        const { data: pageData, error: pageError } = await supabase
          .from('content_pages')
          .select('*')
          .eq('slug', slug)
          .single();
        if (pageError) throw pageError;
        setPage(pageData as ContentPageRec);

        const { data: blocksData, error: blocksError } = await supabase
          .from('content_blocks')
          .select('id, type, json_content, sort_order')
          .eq('page_id', (pageData as any).id)
          .order('sort_order', { ascending: true });
        if (blocksError) throw blocksError;
        setBlocks((blocksData as ContentBlockRec[]) || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPageData();
  }, [slug]);

  // Map filenames -> file_url (prefer Supabase URLs); detect bucket
  useEffect(() => {
    const filenames = new Set<string>();
    const safeParse = (v: any) => {
      if (v && typeof v === 'string') {
        try { return JSON.parse(v); } catch { return v; }
      }
      return v;
    };
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
    if (filenames.size === 0) return;

    const resolve = async () => {
      const list = Array.from(filenames);
      const { data } = await supabase
        .from('assets')
        .select('filename, file_url')
        .in('filename', list);

      const map: Record<string, string> = {};
      let detected = assetsBucket;
      for (const row of data || []) {
        if (row.file_url) {
          map[row.filename] = row.file_url; // include S3 or Supabase
          if (row.file_url.includes('supabase.co/storage')) {
            const m = String(row.file_url).match(/\/storage\/v1\/object\/public\/([^/]+)\//);
            if (m && m[1]) detected = m[1];
          }
        }
      }
      setAssetUrlByFilename((prev) => ({ ...prev, ...map }));
      setAssetsBucket(detected);
    };
    resolve();
  }, [blocks]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="text-red-500">Error: {error}</div>;
  if (!page) return <div>Page not found.</div>;

  const getPublicUrl = (path?: string) => {
    if (!path) return '';
    const { data } = supabase.storage.from(assetsBucket).getPublicUrl(path);
    return data?.publicUrl || '';
  };

  const buildPublicUrl = (...segments: string[]) => {
    const encoded = segments.map(seg => encodeURIComponent(seg)).join('/');
    return `${SUPABASE_URL}/storage/v1/object/public/${assetsBucket}/${encoded}`;
  };

  const fallbackImageUrl = (filename: string) => buildPublicUrl('images', filename);
  const fallbackVideoUrls = (filename: string) => [
    buildPublicUrl(filename),            // root
    buildPublicUrl('videos', filename),  // videos/
  ];

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
        htmlParts.push(`<p>${inner}</p>`);
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
          if (html) return <div className="prose lg:prose-xl max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
        }
        const html = firstNonEmpty(jc, ['html', 'text', 'content']);
        const markdown = firstNonEmpty(jc, ['markdown', 'md']);
        if (html) return <div className="prose lg:prose-xl max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
        if (markdown) return <pre className="whitespace-pre-wrap leading-relaxed">{markdown}</pre>;
        return null;
      }
      case 'image': {
        let key = firstNonEmpty(jc, ['image', 'src', 'path', 'key', 'original_key', 'file', 'filename']);
        if (!key && Array.isArray(jc.photo)) key = jc.photo[0];
        if (typeof key !== 'string') return null;
        const filename = (key.split('/').pop() || key);
        let url = assetUrlByFilename[filename];
        if (!url || !url.includes('supabase.co/storage')) {
          url = fallbackImageUrl(filename);
        }
        return (
          <figure className="my-4">
            <img src={url} alt={firstNonEmpty(jc, ['caption', 'alt', 'description']) || ''} className="rounded-lg shadow-md" />
            {firstNonEmpty(jc, ['caption', 'alt', 'description']) && (
              <figcaption className="text-center text-sm text-gray-600 mt-2">{firstNonEmpty(jc, ['caption', 'alt', 'description'])}</figcaption>
            )}
          </figure>
        );
      }
      case 'movie': {
        const key = firstNonEmpty(jc, ['movie', 'src', 'path', 'key', 'original_key', 'file', 'filename']);
        if (typeof key !== 'string') return null;
        const filename = (key.split('/').pop() || key);
        const candidates: string[] = [];
        const mapped = assetUrlByFilename[filename];
        if (mapped) candidates.push(mapped); // prefer mapped (currently S3) for expedience
        candidates.push(...fallbackVideoUrls(filename)); // Supabase fallbacks remain
        const unique = Array.from(new Set(candidates.filter(Boolean)));
        const ext = (filename.split('.').pop() || '').toLowerCase();
        const mime = ext === 'mov' ? 'video/quicktime' : ext === 'm4v' ? 'video/x-m4v' : 'video/mp4';
        return (
          <video key={unique.join('|')} controls preload="metadata" className="my-4 w-full max-w-2xl mx-auto rounded-lg shadow-lg">
            {unique.map((src) => (
              <source key={src} src={src} type={mime} />
            ))}
            <a href={unique[0]} target="_blank" rel="noreferrer">Open video</a>
          </video>
        );
      }
      case 'quote': {
        const textVal = firstNonEmpty(jc, ['text', 'quote', 'content']);
        const author = firstNonEmpty(jc, ['author', 'attribution']);
        if (!textVal) return null;
        return (
          <blockquote className="my-4 p-4 border-l-4 border-gray-300 bg-gray-100">
            <p className="italic">"{textVal}"</p>
            {author && <footer className="mt-2 text-right">- {author}</footer>}
          </blockquote>
        );
      }
      default:
        return null;
    }
  };

  const bodyHtml = (page as any)['body_html'] || (page as any)['body'];

  return (
    <article>
      <h1 className="text-4xl font-bold mb-6">{page.title}</h1>
      {bodyHtml && (
        <div className="prose lg:prose-xl max-w-none mb-8" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
      )}
      <div className="space-y-6">
        {blocks.map((block) => (
          <div key={block.id}>{renderBlock(block)}</div>
        ))}
      </div>
    </article>
  );
};

export default ContentPage;
