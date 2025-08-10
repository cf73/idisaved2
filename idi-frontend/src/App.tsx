import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import SectionsList from './components/SectionsList';
import SectionPage from './components/SectionPage';
import ContentPage from './components/ContentPage';
import './App.css';

// Placeholder components - we will create these properly later
const HomePage = () => {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">IDI Frontend</h1>
      <p className="mb-8">Welcome to the new frontend for the IDI project.</p>
      <SectionsList />
    </div>
  );
};

const SectionPagePlaceholder = () => {
  return <div>Section Page</div>;
};

const NotFoundPage = () => {
  return (
    <div className="text-center py-10">
      <h1 className="text-3xl font-bold">404 - Not Found</h1>
      <p className="mt-4">The page you are looking for does not exist.</p>
      <Link to="/" className="text-blue-500 hover:underline mt-4 inline-block">Go Home</Link>
    </div>
  );
};


function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 text-gray-800">
        <header className="bg-white shadow-sm">
          <nav className="container mx-auto px-4 py-4 flex justify-between items-center">
            <Link to="/" className="text-xl font-bold">IDI</Link>
            <div>
              {/* Navigation links will go here */}
            </div>
          </nav>
        </header>
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/section/:slug" element={<SectionPage />} />
            <Route path="/page/:slug" element={<ContentPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
