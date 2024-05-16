import React from 'react'

interface SkeletonProps {
  className?: string;  // '?' makes the className prop optional
}

const Skeleton = ({ className = ''}) => (
    <div className={`animate-pulse ${className}`}>
      <div className="bg-gray-300 h-8 rounded"></div>
    </div>
  );

export default Skeleton;