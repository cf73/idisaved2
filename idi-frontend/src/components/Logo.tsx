import React from 'react';
import { Link } from 'react-router-dom';

const Logo: React.FC = () => {
  return (
    <Link
      to="/"
      state={{ from: 'logo' }}
      className="fixed top-6 left-6 z-40 text-white text-2xl font-light tracking-wider hover:text-slate-300 transition-colors duration-300"
    >
      idi
    </Link>
  );
};

export default Logo;
