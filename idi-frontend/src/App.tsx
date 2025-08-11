import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import SectionsCarousel from './components/SectionsCarousel';
import SectionPage from './components/SectionPage';
import ContentPage from './components/ContentPage';
import './App.css';

// HomePage now uses the immersive 3D carousel
const HomePage = () => {
  return <SectionsCarousel />;
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
      <div className="min-h-screen text-gray-800">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/section/:slug" element={<SectionPage />} />
          <Route path="/page/:slug" element={<ContentPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
