# React Frontend Setup for IDI Migration

## Overview
This guide will help you set up a React frontend to replace the current Statamic CMS and consume data from Supabase after the S3 migration.

## Prerequisites
- Node.js 18+ installed
- Supabase project created
- S3 migration completed

## 1. Create React App

```bash
# Create new React app with TypeScript
npx create-react-app idi-frontend --template typescript
cd idi-frontend

# Install necessary dependencies
npm install @supabase/supabase-js
npm install react-router-dom
npm install @types/react-router-dom
npm install tailwindcss @tailwindcss/typography
npm install lucide-react
npm install framer-motion
```

## 2. Supabase Configuration

Create `src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types
export interface Asset {
  id: string
  filename: string
  original_key: string
  file_type: 'video' | 'image' | 'document' | 'other'
  file_size: number
  file_url: string
  metadata: {
    extension: string
    year?: number
    category?: string
    duration_seconds?: number
    resolution?: string
    last_modified: string
    size_mb: number
  }
  created_at: string
  updated_at: string
}

export interface Collection {
  id: string
  name: string
  type: string
  content: any
  created_at: string
  updated_at: string
}
```

## 3. Environment Variables

Create `.env.local`:

```env
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 4. App Structure

```
src/
├── components/
│   ├── Layout/
│   │   ├── Header.tsx
│   │   ├── Navigation.tsx
│   │   └── Footer.tsx
│   ├── Assets/
│   │   ├── AssetGrid.tsx
│   │   ├── AssetCard.tsx
│   │   ├── VideoPlayer.tsx
│   │   └── ImageViewer.tsx
│   ├── Collections/
│   │   ├── CollectionList.tsx
│   │   └── CollectionDetail.tsx
│   └── UI/
│       ├── Button.tsx
│       ├── Modal.tsx
│       └── Loading.tsx
├── pages/
│   ├── Home.tsx
│   ├── Gallery.tsx
│   ├── Collections.tsx
│   └── AssetDetail.tsx
├── hooks/
│   ├── useAssets.ts
│   ├── useCollections.ts
│   └── useSupabase.ts
├── lib/
│   ├── supabase.ts
│   └── utils.ts
└── App.tsx
```

## 5. Key Components

### Asset Grid Component
```typescript
// src/components/Assets/AssetGrid.tsx
import React, { useEffect, useState } from 'react'
import { supabase, Asset } from '../../lib/supabase'
import AssetCard from './AssetCard'

export default function AssetGrid({ category, fileType }: { category?: string, fileType?: string }) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAssets()
  }, [category, fileType])

  async function fetchAssets() {
    try {
      let query = supabase.from('assets').select('*')
      
      if (category) {
        query = query.contains('metadata', { category })
      }
      
      if (fileType) {
        query = query.eq('file_type', fileType)
      }
      
      const { data, error } = await query
      
      if (error) throw error
      setAssets(data || [])
    } catch (error) {
      console.error('Error fetching assets:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div>Loading...</div>

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {assets.map((asset) => (
        <AssetCard key={asset.id} asset={asset} />
      ))}
    </div>
  )
}
```

### Asset Card Component
```typescript
// src/components/Assets/AssetCard.tsx
import React from 'react'
import { Asset } from '../../lib/supabase'
import { Play, Image, FileText } from 'lucide-react'

interface AssetCardProps {
  asset: Asset
  onClick?: () => void
}

export default function AssetCard({ asset, onClick }: AssetCardProps) {
  const getIcon = () => {
    switch (asset.file_type) {
      case 'video':
        return <Play className="w-6 h-6" />
      case 'image':
        return <Image className="w-6 h-6" />
      case 'document':
        return <FileText className="w-6 h-6" />
      default:
        return <FileText className="w-6 h-6" />
    }
  }

  return (
    <div 
      className="bg-white rounded-lg shadow-md overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
      onClick={onClick}
    >
      <div className="aspect-video bg-gray-100 flex items-center justify-center">
        {asset.file_type === 'image' ? (
          <img 
            src={asset.file_url} 
            alt={asset.filename}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-gray-400">
            {getIcon()}
          </div>
        )}
      </div>
      
      <div className="p-4">
        <h3 className="font-semibold text-sm truncate">{asset.filename}</h3>
        <p className="text-xs text-gray-500 mt-1">
          {asset.metadata.size_mb} MB • {asset.metadata.extension.toUpperCase()}
        </p>
        {asset.metadata.category && (
          <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mt-2">
            {asset.metadata.category.replace('_', ' ')}
          </span>
        )}
      </div>
    </div>
  )
}
```

## 6. Routing Setup

```typescript
// src/App.tsx
import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import Home from './pages/Home'
import Gallery from './pages/Gallery'
import Collections from './pages/Collections'
import AssetDetail from './pages/AssetDetail'

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/collections" element={<Collections />} />
          <Route path="/asset/:id" element={<AssetDetail />} />
        </Routes>
      </Layout>
    </Router>
  )
}

export default App
```

## 7. Data Fetching Hooks

```typescript
// src/hooks/useAssets.ts
import { useState, useEffect } from 'react'
import { supabase, Asset } from '../lib/supabase'

export function useAssets(filters?: { category?: string, fileType?: string }) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAssets()
  }, [filters])

  async function fetchAssets() {
    try {
      setLoading(true)
      let query = supabase.from('assets').select('*')
      
      if (filters?.category) {
        query = query.contains('metadata', { category: filters.category })
      }
      
      if (filters?.fileType) {
        query = query.eq('file_type', filters.fileType)
      }
      
      const { data, error } = await query
      
      if (error) throw error
      setAssets(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return { assets, loading, error, refetch: fetchAssets }
}
```

## 8. Styling with Tailwind

Configure `tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'idi': {
          50: '#f0f9ff',
          500: '#3b82f6',
          900: '#1e3a8a',
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
```

## 9. Build and Deploy

```bash
# Build for production
npm run build

# Deploy to your hosting service (Vercel, Netlify, etc.)
```

## 10. Migration Workflow

1. **Complete S3 to Supabase migration** using the PHP script
2. **Set up React frontend** following this guide
3. **Test data consumption** from Supabase
4. **Deploy React app** to production
5. **Update DNS** to point to new React frontend
6. **Decommission Statamic** (optional)

## Benefits of This Approach

- **No SSL issues** - Direct Supabase connection
- **Modern tech stack** - React + TypeScript + Tailwind
- **Scalable** - Supabase handles database and storage
- **Fast** - Static assets served from CDN
- **Maintainable** - Clean separation of concerns

## Next Steps

1. Run the full migration: `php migrate-to-supabase.php --full`
2. Create Supabase project and get credentials
3. Set up React frontend following this guide
4. Test with migrated data
5. Deploy and switch over
