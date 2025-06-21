import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import './index.css';

// Create a client with optimized settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Data is fresh for 5 minutes
      cacheTime: 1000 * 60 * 30, // Cache persists for 30 minutes
      refetchOnWindowFocus: false,
      retry: 1,
      refetchOnReconnect: 'always',
      refetchOnMount: true,
      suspense: false,
      useErrorBoundary: false,
    },
  },
});

// Performance monitoring
if (process.env.NODE_ENV === 'development') {
  const reportWebVitals = (metric: any) => {
    console.log(metric);
  };
  
  // @ts-ignore
  import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
    getCLS(reportWebVitals);
    getFID(reportWebVitals);
    getFCP(reportWebVitals);
    getLCP(reportWebVitals);
    getTTFB(reportWebVitals);
  });
}

// Preload critical resources
if (typeof window !== 'undefined') {
  // Preload fonts
  const fontUrls = [
    'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
  ];
  
  fontUrls.forEach(url => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'style';
    link.href = url;
    document.head.appendChild(link);
  });
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

// Create root with error handling
try {
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>
  );
} catch (error) {
  console.error('Failed to render application:', error);
  
  // Fallback rendering in case of critical error
  rootElement.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; padding: 20px; text-align: center;">
      <h1 style="margin-bottom: 20px; font-size: 24px; color: #e11d48;">Application Error</h1>
      <p style="margin-bottom: 20px; color: #64748b;">We're sorry, but something went wrong. Please try refreshing the page.</p>
      <button onclick="window.location.reload()" style="padding: 8px 16px; background-color: #0ea5e9; color: white; border: none; border-radius: 4px; cursor: pointer;">
        Refresh Page
      </button>
    </div>
  `;
}