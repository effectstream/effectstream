import React from 'react';
import { Logo3D } from '../Logo3D';

interface LoadingOverlayProps {
  message: string;
  subtitle?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message, subtitle = 'This may take a moment...' }) => (
  <div className="loading-overlay">
    <Logo3D size={140} rotationSpeed={0.025} interactive={false} />
    <p className="loading-message">{message}</p>
    <p className="loading-sub">{subtitle}</p>
  </div>
);
