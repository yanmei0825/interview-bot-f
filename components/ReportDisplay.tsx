"use client";

import React from "react";

interface DimensionReport {
  key: string;
  name: string;
  focus: string;
  turnCount: number;
  coverageScore: number;
  depthLevel: number;
  signals: string[];
  status: "deep" | "moderate" | "light" | "skipped";
}

interface Report {
  token: string;
  projectId: string;
  language: string;
  demographics: Record<string, any> | null;
  completedAt: number;
  totalTurns: number;
  totalQuestions: number;
  dimensions: DimensionReport[];
  summary: {
    overallCoverage: number;
    strongDimensions: string[];
    weakDimensions: string[];
    keyThemes: string[];
  };
}

interface Props {
  report: Report;
}

const statusColors: Record<string, string> = {
  deep: "bg-green-100 text-green-800",
  moderate: "bg-yellow-100 text-yellow-800",
  light: "bg-orange-100 text-orange-800",
  skipped: "bg-gray-100 text-gray-800",
};

const statusLabels: Record<string, string> = {
  deep: "Deep Coverage",
  moderate: "Moderate Coverage",
  light: "Light Coverage",
  skipped: "Not Covered",
};

export default function ReportDisplay({ report }: Props) {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getCoveragePercentage = (score: number) => {
    return Math.round(score * 100);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Interview Report</h1>
          <p className="text-gray-600 mb-6">
            Completed on {formatDate(report.completedAt)}
          </p>

          {/* Demographics */}
          {report.demographics && (
            <div className="bg-gray-50 rounded p-4 mb-6">
              <h2 className="text-lg font-semibold text-gray-700 mb-3">Participant Information</h2>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(report.demographics).map(([key, value]) => (
                  <div key={key}>
                    <p className="text-sm text-gray-600 capitalize">{key}</p>
                    <p className="text-gray-800 font-medium">{String(value)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded p-4">
              <p className="text-sm text-gray-600">Total Turns</p>
              <p className="text-3xl font-bold text-blue-600">{report.totalTurns}</p>
            </div>
            <div className="bg-indigo-50 rounded p-4">
              <p className="text-sm text-gray-600">Questions Asked</p>
              <p className="text-3xl font-bold text-indigo-600">{report.totalQuestions}</p>
            </div>
            <div className="bg-green-50 rounded p-4">
              <p className="text-sm text-gray-600">Overall Coverage</p>
              <p className="text-3xl font-bold text-green-600">
                {getCoveragePercentage(report.summary.overallCoverage)}%
              </p>
            </div>
            <div className="bg-purple-50 rounded p-4">
              <p className="text-sm text-gray-600">Dimensions Covered</p>
              <p className="text-3xl font-bold text-purple-600">
                {report.dimensions.filter((d) => d.status !== "skipped").length}/10
              </p>
            </div>
          </div>
        </div>

        {/* Key Themes */}
        {report.summary.keyThemes.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Key Themes</h2>
            <div className="flex flex-wrap gap-2">
              {report.summary.keyThemes.map((theme, idx) => (
                <span
                  key={idx}
                  className="bg-blue-100 text-blue-800 px-4 py-2 rounded-full text-sm font-medium"
                >
                  {theme}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Strong & Weak Dimensions */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          {report.summary.strongDimensions.length > 0 && (
            <div className="bg-white rounded-lg shadow-lg p-8">
              <h2 className="text-xl font-bold text-green-700 mb-4">Strong Areas</h2>
              <ul className="space-y-2">
                {report.summary.strongDimensions.map((dim, idx) => (
                  <li key={idx} className="flex items-center text-gray-700">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                    {dim}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.summary.weakDimensions.length > 0 && (
            <div className="bg-white rounded-lg shadow-lg p-8">
              <h2 className="text-xl font-bold text-orange-700 mb-4">Areas for Attention</h2>
              <ul className="space-y-2">
                {report.summary.weakDimensions.map((dim, idx) => (
                  <li key={idx} className="flex items-center text-gray-700">
                    <span className="w-2 h-2 bg-orange-500 rounded-full mr-3"></span>
                    {dim}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Dimension Details */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Dimension Analysis</h2>
          <div className="space-y-6">
            {report.dimensions.map((dim) => (
              <div key={dim.key} className="border-l-4 border-blue-500 pl-6 py-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">{dim.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">{dim.focus}</p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      statusColors[dim.status]
                    }`}
                  >
                    {statusLabels[dim.status]}
                  </span>
                </div>

                {/* Coverage Bar */}
                <div className="mb-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-gray-600">Coverage</span>
                    <span className="text-sm font-semibold text-gray-700">
                      {getCoveragePercentage(dim.coverageScore)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${getCoveragePercentage(dim.coverageScore)}%` }}
                    ></div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <p className="text-xs text-gray-600">Turns</p>
                    <p className="text-lg font-semibold text-gray-800">{dim.turnCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Depth Level</p>
                    <p className="text-lg font-semibold text-gray-800">{dim.depthLevel}/3</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Signals</p>
                    <p className="text-lg font-semibold text-gray-800">{dim.signals.length}</p>
                  </div>
                </div>

                {/* Signals */}
                {dim.signals.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-2">Key Signals</p>
                    <div className="flex flex-wrap gap-2">
                      {dim.signals.slice(0, 5).map((signal, idx) => (
                        <span
                          key={idx}
                          className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs"
                        >
                          {signal}
                        </span>
                      ))}
                      {dim.signals.length > 5 && (
                        <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">
                          +{dim.signals.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-gray-600 text-sm">
            Report ID: {report.token}
          </p>
          <button
            onClick={() => window.print()}
            className="mt-4 bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Print Report
          </button>
        </div>
      </div>
    </div>
  );
}
