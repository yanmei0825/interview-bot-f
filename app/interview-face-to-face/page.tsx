'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import FaceToFaceInterview from '@/components/FaceToFaceInterview';
import { Language, DimensionKey, getSession } from '@/lib/api';

export const dynamic = 'force-dynamic';

function FaceToFacePageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSession = async () => {
      try {
        if (!token) {
          setError('No session token provided');
          return;
        }

        const data = await getSession(token);
        if (!data.language) {
          setError('Language not selected');
          return;
        }

        setSession(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load session');
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/70">Loading interview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <a href="/" className="text-blue-400 hover:text-blue-300">
            Back to home
          </a>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <FaceToFaceInterview
      token={token}
      language={session.language as Language}
      initialDimension={session.currentDimension as DimensionKey}
    />
  );
}

export default function FaceToFacePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    }>
      <FaceToFacePageContent />
    </Suspense>
  );
}
