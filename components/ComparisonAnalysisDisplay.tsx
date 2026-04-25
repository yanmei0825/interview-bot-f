"use client";

import { useState } from "react";

interface DimensionComparison {
  key: string;
  name: string;
  avgDepthScore: number;
  minDepthScore: number;
  maxDepthScore: number;
  depthVariance: number;
  avgTurns: number;
  topSignals: string[];
  sentimentDistribution: { positive: number; negative: number; neutral: number };
}

interface RespondentProfile {
  token: string;
  demographics: Record<string, any> | null;
  strongDimensions: string[];
  weakDimensions: string[];
  overallScore: number;
}

interface ComparisonAnalysis {
  projectId: string;
  projectName: string;
  totalInterviews: number;
  aggregatedMetrics: {
    avgTurns: number;
    avgDepthScore: number;
    avgQuestionsPerInterview: number;
  };
  dimensionComparison: DimensionComparison[];
  respondentProfiles: RespondentProfile[];
  patterns: {
    consistentStrengths: string[];
    consistentWeaknesses: string[];
    highVarianceDimensions: string[];
    sentimentPatterns: string;
  };
  generatedAt: number;
}

interface Props {
  analysis: ComparisonAnalysis;
}

export default function ComparisonAnalysisDisplay({ analysis }: Props) {
  const [expandedRespondent, setExpandedRespondent] = useState<string | null>(null);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getVarianceColor = (variance: number) => {
    if (variance < 20) return "bg-green-100 text-green-800";
    if (variance < 40) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  const getSentimentColor = (sentiment: string) => {
    if (sentiment.includes("Positive")) return "text-green-400";
    if (sentiment.includes("Negative")) return "text-red-400";
    return "text-gray-400";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-2xl p-8 mb-8 border border-white/20">
          <h1 className="text-5xl font-bold text-white mb-2">Multi-Interview Comparison</h1>
          <p className="text-gray-300 mb-6">
            Generated on {formatDate(analysis.generatedAt)}
          </p>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-500/20 rounded-lg p-4 border border-blue-400/30">
              <p className="text-sm text-gray-300">Total Interviews</p>
              <p className="text-3xl font-bold text-blue-300">{analysis.totalInterviews}</p>
            </div>
            <div className="bg-purple-500/20 rounded-lg p-4 border border-purple-400/30">
              <p className="text-sm text-gray-300">Avg Depth Score</p>
              <p className="text-3xl font-bold text-purple-300">{analysis.aggregatedMetrics.avgDepthScore}/100</p>
            </div>
            <div className="bg-green-500/20 rounded-lg p-4 border border-green-400/30">
              <p className="text-sm text-gray-300">Avg Turns</p>
              <p className="text-3xl font-bold text-green-300">{analysis.aggregatedMetrics.avgTurns}</p>
            </div>
            <div className="bg-indigo-500/20 rounded-lg p-4 border border-indigo-400/30">
              <p className="text-sm text-gray-300">Avg Questions</p>
              <p className="text-3xl font-bold text-indigo-300">{analysis.aggregatedMetrics.avgQuestionsPerInterview}</p>
            </div>
          </div>
        </div>

        {/* Patterns & Insights */}
        <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-2xl p-8 mb-8 border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-6">Patterns & Insights</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Consistent Strengths */}
            <div className="bg-green-500/10 rounded-lg p-6 border border-green-400/30">
              <h3 className="text-lg font-bold text-green-300 mb-3">Consistent Strengths</h3>
              {analysis.patterns.consistentStrengths.length > 0 ? (
                <ul className="space-y-2">
                  {analysis.patterns.consistentStrengths.map((dim, idx) => (
                    <li key={idx} className="flex items-center text-gray-200">
                      <span className="w-2 h-2 bg-green-400 rounded-full mr-3"></span>
                      {dim}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-400">No consistent strengths identified</p>
              )}
            </div>

            {/* Consistent Weaknesses */}
            <div className="bg-red-500/10 rounded-lg p-6 border border-red-400/30">
              <h3 className="text-lg font-bold text-red-300 mb-3">Consistent Weaknesses</h3>
              {analysis.patterns.consistentWeaknesses.length > 0 ? (
                <ul className="space-y-2">
                  {analysis.patterns.consistentWeaknesses.map((dim, idx) => (
                    <li key={idx} className="flex items-center text-gray-200">
                      <span className="w-2 h-2 bg-red-400 rounded-full mr-3"></span>
                      {dim}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-400">No consistent weaknesses identified</p>
              )}
            </div>

            {/* High Variance Dimensions */}
            <div className="bg-yellow-500/10 rounded-lg p-6 border border-yellow-400/30">
              <h3 className="text-lg font-bold text-yellow-300 mb-3">High Variance Dimensions</h3>
              {analysis.patterns.highVarianceDimensions.length > 0 ? (
                <ul className="space-y-2">
                  {analysis.patterns.highVarianceDimensions.map((dim, idx) => (
                    <li key={idx} className="flex items-center text-gray-200">
                      <span className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></span>
                      {dim}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-400">No high variance dimensions</p>
              )}
            </div>

            {/* Sentiment Pattern */}
            <div className="bg-blue-500/10 rounded-lg p-6 border border-blue-400/30">
              <h3 className="text-lg font-bold text-blue-300 mb-3">Overall Sentiment</h3>
              <p className={`text-lg font-semibold ${getSentimentColor(analysis.patterns.sentimentPatterns)}`}>
                {analysis.patterns.sentimentPatterns}
              </p>
            </div>
          </div>
        </div>

        {/* Dimension Comparison */}
        <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-2xl p-8 mb-8 border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-6">Dimension Comparison</h2>
          <div className="space-y-6">
            {analysis.dimensionComparison.map((dim) => (
              <div key={dim.key} className="bg-white/5 rounded-lg p-6 border border-white/10">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">{dim.name}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getVarianceColor(dim.depthVariance)}`}>
                    Variance: {dim.depthVariance}
                  </span>
                </div>

                {/* Depth Score Range */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-300">Depth Score Range</span>
                    <span className="text-sm font-semibold text-gray-200">
                      {dim.minDepthScore} - {dim.maxDepthScore} (Avg: {dim.avgDepthScore})
                    </span>
                  </div>
                  <div className="w-full bg-black/30 rounded-full h-2 flex">
                    <div
                      className="bg-gradient-to-r from-red-400 to-yellow-400 h-2 rounded-full"
                      style={{ width: `${dim.minDepthScore}%` }}
                    ></div>
                    <div
                      className="bg-gradient-to-r from-yellow-400 to-green-400 h-2"
                      style={{ width: `${dim.maxDepthScore - dim.minDepthScore}%` }}
                    ></div>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-gray-400">Avg Turns</p>
                    <p className="text-lg font-bold text-gray-200">{dim.avgTurns}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Sentiment</p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded">
                        +{dim.sentimentDistribution.positive}
                      </span>
                      <span className="text-xs bg-red-500/20 text-red-300 px-2 py-1 rounded">
                        -{dim.sentimentDistribution.negative}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Top Signals</p>
                    <p className="text-xs text-gray-300 mt-1">{dim.topSignals.slice(0, 2).join(", ")}</p>
                  </div>
                </div>

                {/* All Signals */}
                {dim.topSignals.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-2">All Signals</p>
                    <div className="flex flex-wrap gap-2">
                      {dim.topSignals.map((signal, idx) => (
                        <span key={idx} className="bg-white/10 text-gray-300 px-2 py-1 rounded text-xs">
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

        {/* Respondent Profiles */}
        <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-2xl p-8 border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-6">Respondent Profiles</h2>
          <div className="space-y-4">
            {analysis.respondentProfiles.map((profile, idx) => (
              <div key={idx} className="bg-white/5 rounded-lg p-4 border border-white/10">
                <button
                  onClick={() => setExpandedRespondent(expandedRespondent === profile.token ? null : profile.token)}
                  className="w-full text-left flex items-center justify-between hover:bg-white/5 transition p-2 rounded"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white font-bold">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="text-white font-semibold">Respondent {idx + 1}</p>
                      <p className="text-sm text-gray-400">Score: {profile.overallScore}/100</p>
                    </div>
                  </div>
                  <span className="text-gray-400">{expandedRespondent === profile.token ? "▼" : "▶"}</span>
                </button>

                {expandedRespondent === profile.token && (
                  <div className="mt-4 pl-16 space-y-3 border-t border-white/10 pt-4">
                    {profile.demographics && Object.keys(profile.demographics).length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-2">Demographics</p>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(profile.demographics).map(([key, value]) => (
                            <div key={key} className="text-xs">
                              <p className="text-gray-500">{key}</p>
                              <p className="text-gray-300">{String(value)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {profile.strongDimensions.length > 0 && (
                      <div>
                        <p className="text-xs text-green-400 font-semibold mb-2">Strong Dimensions</p>
                        <div className="flex flex-wrap gap-2">
                          {profile.strongDimensions.map((dim, i) => (
                            <span key={i} className="bg-green-500/20 text-green-300 px-2 py-1 rounded text-xs">
                              {dim}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {profile.weakDimensions.length > 0 && (
                      <div>
                        <p className="text-xs text-red-400 font-semibold mb-2">Weak Dimensions</p>
                        <div className="flex flex-wrap gap-2">
                          {profile.weakDimensions.map((dim, i) => (
                            <span key={i} className="bg-red-500/20 text-red-300 px-2 py-1 rounded text-xs">
                              {dim}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-gray-400 text-sm">
            Project ID: {analysis.projectId}
          </p>
          <button
            onClick={() => window.print()}
            className="mt-4 bg-purple-500 hover:bg-purple-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Print Analysis
          </button>
        </div>
      </div>
    </div>
  );
}
