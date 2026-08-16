// src/renderer/src/App.tsx
import React, { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { useThemeStore } from './stores/themeStore';
import { useLanguageStore } from './stores/languageStore';
import { ToastProvider } from './components/Toast';

function App() {
  const initTheme = useThemeStore((s) => s.init);
  const initLanguage = useLanguageStore((s) => s.init);

  useEffect(() => {
    initTheme();
    initLanguage();
  }, []);

  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}

export default App;