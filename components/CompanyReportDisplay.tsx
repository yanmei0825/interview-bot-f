"use client";

import React from "react";

interface DimensionAnalysis {
  key: string;
  name: string;
  avgCoveragePercent: number;
  avgDepthScore: number;
  totalRespondents: number;
  topSignals: string[];
  sentimentTrend: "positive" | "negative" | "neutral";
  riskLevel: "low" | "medium" | "high";
}

interface ProjectBreakdown {
  projectId: string;
  projectName: string;
  sessions: number;
  completionRate: number;
  depthScore: number;
}

interface CompanyReport {
  companyId: string;
  companyName: string;
  totalProjects: number;
  totalSessions: number;
  finishedSessions: number;
  overallCompletionRate: number;
  overallDepthScore: number;
  dimensions: DimensionAnalysis[];
  projectBreakdown: ProjectBreakdown[];
  keyInsights: string[];
  generatedAt: number;
}

interface Props {
  report: CompanyReport;
}

const riskColors: Record<string, string> = {
  low: "bg-green-100 text-green-800 border-green-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  high: "bg-red-100 text-red-800 border-red-300",
};

const sentimentIcons: Record<string, string> = {
  positive: "😊",
  negative: "😟",
  neutral: "😐",
};

export default function CompanyReportDisplay({ report }: Props) {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-2xl p-8 mb-8 border border-white/20">
          <h1 className="text-5xl font-bold text-white mb-2">Company Report</h1>
          <p className="text-gray-300 mb-6">
            Generated on {formatDate(report.generatedAt)}
          </p>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-500/20 rounded-lg p-4 border border-blue-400/30">
              <p className="text-sm text-gray-300">Total Projects</p>
              <p className="text-3xl font-bold text-blue-300">{report.totalProjects}</p>
            </div>
            <div className="bg-purple-500/20 rounded-lg p-4 border border-purple-400/30">
              <p className="text-sm text-gray-300">Total Respondents</p>
              <p className="text-3xl font-bold text-purple-300">{report.totalSessions}</p>
            </div>
            <div className="bg-green-500/20 rounded-lg p-4 border border-green-400/30">
              <p className="text-sm text-gray-300">Completion Rate</p>
              <p className="text-3xl font-bold text-green-300">{report.overallCompletionRate}%</p>
            </div>
            <div className="bg-indigo-500/20 rounded-lg p-4 border border-indigo-400/30">
              <p className="text-sm text-gray-300">Overall Depth</p>
              <p className="text-3xl font-bold text-indigo-300">{report.overallDepthScore}/100</p>
            </div>
          </div>
        </div>

        {/* Key Insights */}
        {report.keyInsights.length > 0 && (
          <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-2xl p-8 mb-8 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-4">Key Insights</h2>
            <div className="space-y-3">
              {report.keyInsights.map((insight, idx) => (
                <div
                  key={idx}
                  className="bg-white/5 rounded-lg p-4 border border-white/10 text-gray-200"
                >
                  {insight}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dimension Analysis */}
        <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-2xl p-8 mb-8 border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-6">Dimension Analysis</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {report.dimensions.map((dim) => (
              <div
                key={dim.key}
                className={`rounded-lg p-6 border-2 ${riskColors[dim.riskLevel]}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold">{dim.name}</h3>
                    <p className="text-sm opacity-75 mt-1">
                      {dim.totalRespondents} respondents
                    </p>
                  </div>
                  <span className="text-2xl">{sentimentIcons[dim.sentimentTrend]}</span>
                </div>

                {/* Coverage Bar */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-semibold">Coverage</span>
                    <span className="text-sm font-bold">{dim.avgCoveragePercent}%</span>
                  </div>
                  <div className="w-full bg-black/30 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-blue-400 to-purple-400 h-2 rounded-full transition-all"
                      style={{ width: `${dim.avgCoveragePercent}%` }}
                    ></div>
                  </div>
                </div>

                {/* Depth Bar */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-semibold">Depth Score</span>
                    <span className="text-sm font-bold">{dim.avgDepthScore}/100</span>
                  </div>
                  <div className="w-full bg-black/30 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-green-400 to-emerald-400 h-2 rounded-full transition-all"
                      style={{ width: `${dim.avgDepthScore}%` }}
                    ></div>
                  </div>
                </div>

                {/* Top Signals */}
                {dim.topSignals.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold mb-2">Top Signals</p>
                    <div className="flex flex-wrap gap-2">
                      {dim.topSignals.map((signal, idx) => (
                        <span
                          key={idx}
                          className="bg-white/10 px-2 py-1 rounded text-xs font-medium"
                        >
                          {signal}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Project Breakdown */}
        <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-2xl p-8 border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-6">Project Breakdown</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left py-3 px-4 text-gray-300 font-semibold">Project</th>
                  <th className="text-center py-3 px-4 text-gray-300 font-semibold">Sessions</th>
                  <th className="text-center py-3 px-4 text-gray-300 font-semibold">
                    Completion
                  </th>
                  <th className="text-center py-3 px-4 text-gray-300 font-semibold">Depth</th>
                </tr>
              </thead>
              <tbody>
                {report.projectBreakdown.map((project, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-white/10 hover:bg-white/5 transition"
                  >
                    <td className="py-3 px-4 text-white font-medium">{project.projectName}</td>
                    <td className="py-3 px-4 text-center text-gray-300">{project.sessions}</td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          project.completionRate >= 80
                            ? "bg-green-500/20 text-green-300"
                            : project.completionRate >= 50
                            ? "bg-yellow-500/20 text-yellow-300"
                            : "bg-red-500/20 text-red-300"
                        }`}
                      >
                        {project.completionRate}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          project.depthScore >= 70
                            ? "bg-green-500/20 text-green-300"
                            : project.depthScore >= 50
                            ? "bg-yellow-500/20 text-yellow-300"
                            : "bg-red-500/20 text-red-300"
                        }`}
                      >
                        {project.depthScore}/100
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-gray-400 text-sm">
            Company ID: {report.companyId}
          </p>
          <button
            onClick={() => window.print()}
            className="mt-4 bg-purple-500 hover:bg-purple-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Print Report
          </button>
        </div>
      </div>
    </div>
  );
}
