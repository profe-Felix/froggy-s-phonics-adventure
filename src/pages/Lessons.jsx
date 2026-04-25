import React from 'react';
import { Link } from 'react-router-dom';

const LESSON_TOOLS = [
  {
    path: '/WordSentenceBuilder',
    emoji: '🧩',
    title: 'Word & Sentence Builder',
    description: 'Drag letters, syllables, and words to build sentences.',
    color: 'from-indigo-100 to-blue-50 border-indigo-200 hover:border-indigo-400',
  },
  // Add more lesson tools here
];

export default function Lessons() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Link to="/Dashboard" className="text-blue-600 hover:underline font-bold text-sm">← Dashboard</Link>
          <h1 className="text-3xl font-black text-gray-800">📚 Lessons</h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {LESSON_TOOLS.map(tool => (
            <Link
              key={tool.path}
              to={tool.path}
              className={`bg-gradient-to-br ${tool.color} border-2 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group`}
            >
              <div className="text-4xl mb-3">{tool.emoji}</div>
              <h2 className="text-xl font-black text-gray-800 group-hover:text-indigo-700 transition-colors mb-1">
                {tool.title}
              </h2>
              <p className="text-sm text-gray-500">{tool.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}