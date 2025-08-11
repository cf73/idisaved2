import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import SectionsCarousel from './components/SectionsCarousel';
import SectionPage from './components/SectionPage';
import ContentPage from './components/ContentPage';
import IntroSequence from './components/IntroSequence';
import Logo from './components/Logo';
import './App.css';

// HomePage with intro sequence logic
const HomePage = () => {
  const location = useLocation();
  const [showIntro, setShowIntro] = useState(false);
  const [shouldStartEmerging, setShouldStartEmerging] = useState(false);

  useEffect(() => {
    // Check if this is a fresh visit or hard navigation to root
    const hasSeenIntro = sessionStorage.getItem('introSeen');
    const isHardNavigation = location.state?.from === 'logo' || !hasSeenIntro;
    
    if (isHardNavigation) {
      setShowIntro(true);
      sessionStorage.setItem('introSeen', 'true');
    }
  }, [location]);

  const handleIntroComplete = () => {
    setShowIntro(false);
  };

  const handleStartEmerging = () => {
    setShouldStartEmerging(true);
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Carousel always loads in background */}
      <SectionsCarousel shouldStartEmerging={shouldStartEmerging || !showIntro} />
      
      {/* Intro sequence */}
      {showIntro && <IntroSequence onComplete={handleIntroComplete} onStartEmerging={handleStartEmerging} />}
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
      <div className="min-h-screen text-gray-800">
        <Logo />
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
