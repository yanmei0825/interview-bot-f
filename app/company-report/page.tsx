"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BACKEND_URL } from "../../lib/api";
import CompanyReportDisplay from "../../components/CompanyReportDisplay";

function CompanyReportPageContent() {
  const searchParams = useSearchParams();
  const companyId = searchParams.get("companyId");
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setError("No company ID provided");
      setLoading(false);
      return;
    }

    const fetchReport = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/companies/${companyId}/report`);
        if (!response.ok) {
          throw new Error("Failed to fetch company report");
        }
        const data = await response.json();
        setReport(data);
      } catch (err: any) {
        setError(err.message || "Failed to load report");
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [companyId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading company report...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <a href="/" className="text-purple-400 hover:text-purple-300 underline">
            Back to home
          </a>
        </div>
      </div>
    );
  }

  return <CompanyReportDisplay report={report} />;
}

export default function CompanyReportPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CompanyReportPageContent />
    </Suspense>
  );
}
