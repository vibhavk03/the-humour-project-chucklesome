"use client";

import { useEffect, useState } from "react";
import { redirectIfAuthenticated } from "@/utils/auth";

export function AuthRedirect() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // This ensures the code only runs on the client side
    if (typeof window !== 'undefined') {
      const checkAuth = async () => {
        try {
          await redirectIfAuthenticated();
        } finally {
          setIsLoading(false);
        }
      };
      
      checkAuth();
    } else {
      // We're running during SSR/SSG
      setIsLoading(false);
    }
  }, []);

  // We don't need to render anything, this is just for the redirect logic
  return null;
} 