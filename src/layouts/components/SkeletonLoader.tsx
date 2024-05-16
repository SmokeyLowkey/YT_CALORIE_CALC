import React from 'react'

const Skeleton = ({ className }) => (
    <div className={`animate-pulse ${className}`}>
      <div className="bg-gray-300 h-8 rounded"></div>
    </div>
  );

export default Skeleton;