"use client";

import { useEffect, useState } from "react";
import { redirectIfNotAuthenticated } from "@/utils/auth";

export function RequireAuth() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await redirectIfNotAuthenticated();
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, []);

  // We don't need to render anything, this is just for the redirect logic
  return null;
} 