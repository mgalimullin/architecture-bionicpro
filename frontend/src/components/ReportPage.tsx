import React, { useState } from 'react';

const ReportPage: React.FC = () => {
  console.log("AUTH URL:", process.env.REACT_APP_AUTH_URL);
  console.log("API URL:", process.env.REACT_APP_API_URL);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadReport = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log("📤 Requesting report...");

      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/reports`,
        {
          method: "GET",
          credentials: "include" // IMPORTANT: send session cookie
        }
      );

      console.log("📥 Response status:", response.status);

      if (response.status === 401) {
        console.log("🔐 Not authenticated, redirecting to login");

        window.location.href =
          `http://localhost:4000/login`;

        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();

      console.log("✅ Report data:", data);

    } catch (err) {
      console.error("❌ Report error:", err);
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  const login = () => {
    console.log("🔐 Redirecting to login...");
    window.location.href =
      `http://localhost:4000/login`;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6">Usage Reports</h1>

        <button
          onClick={downloadReport}
          disabled={loading}
          className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 ${
            loading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {loading ? 'Generating Report...' : 'Download Report'}
        </button>

        <button
          onClick={login}
          className="ml-4 px-4 py-2 bg-green-500 text-white rounded"
        >
          Login
        </button>

        {error && (
          <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportPage;